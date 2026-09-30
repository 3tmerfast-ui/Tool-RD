/**
 * Tạo ảnh / video qua MuseAI Bridge on-prem (máy Windows 3090, chạy 24/7).
 *
 * Flow: POST /v1/batch/async {items:[{prompt, files}], concurrency}
 *   → poll GET /v1/batch/status?id=... mỗi 3s
 *   → mỗi item xong trả media "/media/xxx.png|mp4" → tải về (ảnh → dataURL).
 *
 * SONG SONG: bridge mở nhiều tab worker cùng lúc (concurrency 1–5, mặc định 3),
 * nên cả lô 3–6 ảnh chạy 1 lần thay vì tuần tự từng ảnh như Flow.
 * Item lỗi 503 / "service busy" được tự retry 1 lần sau 30s.
 *
 * Bridge chưa bật CORS → frontend gọi qua proxy `/muse` của Vite (xem vite.config.ts,
 * target = MUSE_API_URL). Chỉ chạy được khi máy chạy app nằm trong Tailnet.
 *
 * Config (.env.local):
 *   MUSE_API_URL=http://100.126.145.3:8770   # target của proxy (dev server)
 *   VITE_MUSE_BASE_URL=/muse                  # hoặc URL đầy đủ nếu bridge có CORS
 *   VITE_MUSE_API_KEY=                        # nếu bridge bật MUSE_API_KEY
 *   VITE_MUSE_CONCURRENCY=3                   # số luồng song song (1–5)
 */

const BASE_URL = (((import.meta as any).env?.VITE_MUSE_BASE_URL as string | undefined) || '/muse')
  .trim().replace(/\/$/, '');
const API_KEY = ((import.meta as any).env?.VITE_MUSE_API_KEY as string | undefined ?? '').trim();
const CONCURRENCY = Math.min(Math.max(
  parseInt((import.meta as any).env?.VITE_MUSE_CONCURRENCY ?? '3', 10) || 3, 1), 5);

const POLL_INTERVAL_MS = 3_000;
const IMAGE_TIMEOUT_MS = 180_000;
const VIDEO_TIMEOUT_MS = 300_000;
const BUSY_RETRY_DELAY_MS = 30_000;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export interface MuseItem { prompt: string; referenceImage?: string }

interface MuseResult { ok: boolean; media?: string[]; error?: string; content?: string }
interface BatchStatus { status: string; results: (MuseResult | null)[] }

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (API_KEY) h['X-API-Key'] = API_KEY;
  return h;
}

export async function pingMuse(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/v1/status`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json();
    return !!(data.ok && data.bridge_ready);
  } catch {
    return false;
  }
}

async function submitBatch(items: MuseItem[], timeoutMs: number): Promise<string> {
  const res = await fetch(`${BASE_URL}/v1/batch/async`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({
      items: items.map(it => ({ prompt: it.prompt, files: it.referenceImage ? [it.referenceImage] : [] })),
      concurrency: Math.min(CONCURRENCY, items.length),
      timeout_ms: timeoutMs,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`MuseAI /v1/batch/async HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.ok || !data.batch_id) throw new Error(`MuseAI: không tạo được batch (${data.error ?? 'unknown'})`);
  return data.batch_id;
}

/**
 * Chạy 1 batch song song, gọi onItem(index, result) ngay khi từng item xong.
 * Trả mảng kết quả theo đúng thứ tự items (null = item không xong).
 */
async function runBatch(
  items: MuseItem[],
  timeoutMs: number,
  onItem: (index: number, res: MuseResult) => void,
): Promise<(MuseResult | null)[]> {
  const batchId = await submitBatch(items, timeoutMs);
  const seen = new Set<number>();
  // Bridge chạy tối đa CONCURRENCY item cùng lúc → ước lượng deadline theo số "đợt".
  const waves = Math.ceil(items.length / Math.min(CONCURRENCY, items.length));
  const deadline = Date.now() + waves * timeoutMs + 60_000;
  let last: BatchStatus | null = null;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const res = await fetch(`${BASE_URL}/v1/batch/status?id=${encodeURIComponent(batchId)}`, {
        headers: headers(), cache: 'no-store',
      });
      if (!res.ok) continue;
      last = await res.json() as BatchStatus;
    } catch {
      continue;
    }
    (last.results || []).forEach((r, i) => {
      if (r && !seen.has(i)) { seen.add(i); onItem(i, r); }
    });
    if (last.status === 'completed') return last.results;
  }
  return last?.results ?? items.map(() => null);
}

const isBusy = (r: MuseResult | null) =>
  !r || /503|busy|bận/i.test(`${r.error ?? ''} ${r.content ?? ''}`);

/** Batch + retry 1 lần cho các item lỗi do cụm GPU Muse quá tải. */
async function runBatchWithRetry(
  items: MuseItem[],
  timeoutMs: number,
  pick: (r: MuseResult) => string | null,
  onDone: (index: number, value: string) => void,
): Promise<{ values: (string | null)[]; lastError: string }> {
  const values: (string | null)[] = items.map(() => null);
  let lastError = '';
  const handle = (index: number, r: MuseResult) => {
    const v = r.ok ? pick(r) : null;
    if (v) { values[index] = v; onDone(index, v); }
    else lastError = r.error || r.content || 'MuseAI không trả media';
  };

  const first = await runBatch(items, timeoutMs, handle);
  const retryIdx = items.map((_, i) => i).filter(i => !values[i] && isBusy(first[i]));
  if (retryIdx.length) {
    await sleep(BUSY_RETRY_DELAY_MS);
    await runBatch(retryIdx.map(i => items[i]), timeoutMs, (j, r) => handle(retryIdx[j], r));
  }
  return { values, lastError };
}

const mediaUrl = (m: string) => (m.startsWith('http') ? m : `${BASE_URL}${m}`);

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
};

/** Bridge trả application/octet-stream → gắn lại MIME theo đuôi file cho <img>/<video>. */
async function fetchMedia(m: string): Promise<Blob> {
  const res = await fetch(mediaUrl(m), { headers: headers() });
  if (!res.ok) throw new Error(`MuseAI tải media HTTP ${res.status}`);
  const ext = (m.split('?')[0].split('.').pop() || '').toLowerCase();
  const blob = await res.blob();
  return MIME_BY_EXT[ext] ? new Blob([blob], { type: MIME_BY_EXT[ext] }) : blob;
}

async function mediaToDataUrl(m: string): Promise<string> {
  const blob = await fetchMedia(m);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const IMAGE_RE = /\.(png|jpe?g|webp)(\?|$)/i;
const VIDEO_RE = /\.(mp4|webm|mov)(\?|$)/i;

const imagePrompt = (prompt: string, aspectRatio: string) =>
  `Tạo 1 ẢNH tĩnh (image, KHÔNG phải video), tỉ lệ khung hình ${aspectRatio}. ` +
  `Nếu có ảnh đính kèm, dùng nó làm ảnh tham chiếu.\n\n${prompt}`;

/**
 * Tạo nhiều ảnh song song. Trả mảng dataURL theo thứ tự (null = item lỗi).
 * onImage gọi ngay khi từng ảnh xong (thứ tự hoàn thành).
 */
export async function generateMuseImages(
  items: { prompt: string; aspectRatio?: string; referenceImage?: string }[],
  onImage?: (index: number, img: string) => void,
): Promise<(string | null)[]> {
  const out: (string | null)[] = items.map(() => null);
  const pending: Promise<void>[] = [];
  const { lastError } = await runBatchWithRetry(
    items.map(it => ({ prompt: imagePrompt(it.prompt, it.aspectRatio ?? '1:1'), referenceImage: it.referenceImage })),
    IMAGE_TIMEOUT_MS,
    r => (r.media || []).find(m => IMAGE_RE.test(m)) ?? null,
    (i, m) => {
      pending.push(mediaToDataUrl(m).then(img => { out[i] = img; onImage?.(i, img); }).catch(() => {}));
    },
  );
  await Promise.all(pending);
  if (out.every(v => !v)) throw new Error(`MuseAI không tạo được ảnh nào: ${lastError.slice(0, 200)}`);
  return out;
}

export async function generateMuseImage(opts: {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
}): Promise<string> {
  const [img] = await generateMuseImages([opts]);
  return img!;
}

/** Tải MP4 về thành blob URL (kèm API key, dùng được cho <video> và nút tải xuống). */
async function mediaToBlobUrl(m: string): Promise<string> {
  return URL.createObjectURL(await fetchMedia(m));
}

/** Tạo video (song song nếu nhiều prompt). Trả blob URL MP4 theo thứ tự (null = lỗi). */
export async function generateMuseVideos(
  items: MuseItem[],
  onVideo?: (index: number, url: string) => void,
): Promise<(string | null)[]> {
  const out: (string | null)[] = items.map(() => null);
  const pending: Promise<void>[] = [];
  const { lastError } = await runBatchWithRetry(
    items,
    VIDEO_TIMEOUT_MS,
    r => (r.media || []).find(x => VIDEO_RE.test(x)) ?? null,
    (i, m) => {
      pending.push(mediaToBlobUrl(m).then(url => { out[i] = url; onVideo?.(i, url); }).catch(() => {}));
    },
  );
  await Promise.all(pending);
  if (out.every(v => !v)) throw new Error(`MuseAI không tạo được video nào: ${lastError.slice(0, 200)}`);
  return out;
}
