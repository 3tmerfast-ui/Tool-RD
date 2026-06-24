/**
 * Mindesk image generation via Book's BE queue (app.3tify.com).
 *
 * Flow: (optional) upload base64 ref → S3 URL
 *   → POST /api/mindesk-jobs (Supabase JWT auth) → session_id + job_ids
 *   → poll GET /api/mindesk-jobs/session/{id} every 2s
 *   → return result_url (public S3 URL) when done.
 *
 * Config (in .env.local):
 *   VITE_BOOK_BE_URL=https://app.3tify.com
 *   VITE_BOOK_AUTH_TOKEN=<10-year Supabase JWT>
 */

const BE_URL = ((import.meta as any).env?.VITE_BOOK_BE_URL as string | undefined ?? '')
  .trim().replace(/\/$/, '');
const AUTH_TOKEN = ((import.meta as any).env?.VITE_BOOK_AUTH_TOKEN as string | undefined ?? '').trim();

const PROJECT_ID = 'tool-rd-pod-project';
const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_MS  = 600_000; // 10 min

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function isMindeskConfigured(): boolean {
  return !!(BE_URL && AUTH_TOKEN);
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AUTH_TOKEN}` };
}

/** Upload a base64 data URL to S3 via Book's storage API. Returns a public S3 URL. */
async function uploadBase64ToS3(dataUrl: string): Promise<string> {
  const res = await fetch(`${BE_URL}/api/storage/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ project_id: PROJECT_ID, kind: 'pod-ref', base64: dataUrl }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`/api/storage/upload HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json() as { url: string };
  if (!data.url) throw new Error('storage/upload: no url in response');
  return data.url;
}

interface SubmitOut { session_id: string; job_ids: string[]; queued: number }

async function submitJob(opts: {
  sessionId: string;
  prompt: string;
  refImageUrl: string | null;
  aspectRatio: string;
}): Promise<SubmitOut> {
  const res = await fetch(`${BE_URL}/api/mindesk-jobs`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      session_id:   opts.sessionId,
      project_id:   PROJECT_ID,
      prompts:      [opts.prompt],
      ref_image_url: opts.refImageUrl,
      aspect_ratio: opts.aspectRatio,
      model_tier:   'NARWHAL',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`/api/mindesk-jobs HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.json() as Promise<SubmitOut>;
}

interface JobStatus { job_id: string; status: string; result_url?: string | null; error_msg?: string | null }
interface SessionStatus { session_id: string; total: number; pending: number; processing: number; done: number; failed: number; jobs: JobStatus[] }

async function pollSession(sessionId: string): Promise<string> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);

    let st: SessionStatus;
    try {
      const res = await fetch(`${BE_URL}/api/mindesk-jobs/session/${sessionId}`, {
        cache: 'no-store',
        headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` },
      });
      if (!res.ok) continue;
      st = await res.json() as SessionStatus;
    } catch {
      continue;
    }

    const job = st.jobs[0];
    if (!job) continue;

    if (job.status === 'done' && job.result_url) return job.result_url;
    if (job.status === 'failed') throw new Error(`Mindesk job failed: ${job.error_msg ?? 'unknown'}`);
  }

  throw new Error(`Mindesk: timeout sau ${POLL_TIMEOUT_MS / 1000}s chờ ảnh`);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate an image via Book's BE queue. Returns a public S3 URL.
 * Compatible with <img src> and usable as referenceImage for subsequent calls.
 */
export async function generateMindeskImage(opts: {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
  tier?: string;
}): Promise<string> {
  if (!BE_URL || !AUTH_TOKEN) throw new Error('VITE_BOOK_BE_URL / VITE_BOOK_AUTH_TOKEN chưa được cấu hình trong .env.local');

  // 1. Resolve reference image → S3 URL if it's base64
  let refImageUrl: string | null = null;
  if (opts.referenceImage) {
    const ref = opts.referenceImage;
    if (ref.startsWith('data:')) {
      try {
        refImageUrl = await uploadBase64ToS3(ref);
      } catch (e) {
        console.warn('[Mindesk] ref upload failed — generating without reference:', e);
      }
    } else if (ref.startsWith('http')) {
      refImageUrl = ref;
    }
  }

  // 2. Submit job
  const sessionId = crypto.randomUUID();
  await submitJob({
    sessionId,
    prompt: opts.prompt,
    refImageUrl,
    aspectRatio: opts.aspectRatio ?? '1:1',
  });

  // 3. Poll until done
  return pollSession(sessionId);
}
