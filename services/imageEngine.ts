/**
 * Chọn engine tạo ảnh/video: Flow extension | Mindesk (Book BE) | MuseAI on-prem.
 *
 * Thứ tự ưu tiên:
 *   1. localStorage('image_provider') — chọn trên Header (mỗi máy tự chọn)
 *   2. VITE_IMAGE_PROVIDER trong .env.local ('flow' | 'mindesk' | 'muse')
 *   3. Mindesk nếu đã cấu hình, ngược lại Flow (hành vi cũ)
 *
 * Video hiện chỉ MuseAI hỗ trợ.
 */

import { generateFlowImage } from "./flowExtensionService";
import { generateMindeskImage, isMindeskConfigured } from "./mindeskService";
import { generateMuseImages, generateMuseVideos } from "./museService";

export type ImageProvider = "flow" | "mindesk" | "muse";

export const IMAGE_PROVIDERS: { value: ImageProvider; label: string }[] = [
  { value: "flow", label: "Flow (extension)" },
  { value: "mindesk", label: "Mindesk (BE)" },
  { value: "muse", label: "MuseAI (on-prem)" },
];

const STORAGE_KEY = "image_provider";
const isProvider = (v: unknown): v is ImageProvider => v === "flow" || v === "mindesk" || v === "muse";

export function getImageProvider(): ImageProvider {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isProvider(saved)) return saved;
  } catch { /* ignore */ }
  const env = ((import.meta as any).env?.VITE_IMAGE_PROVIDER as string | undefined ?? "").trim();
  if (isProvider(env)) return env;
  return isMindeskConfigured() ? "mindesk" : "flow";
}

export function setImageProvider(p: ImageProvider): void {
  try { localStorage.setItem(STORAGE_KEY, p); } catch { /* ignore */ }
}

export interface ImageRequest {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
  model?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const generateImage = (opts: ImageRequest): Promise<string> => {
  switch (getImageProvider()) {
    case "muse": return generateMuseImages([opts]).then(([img]) => img!);
    case "mindesk": return generateMindeskImage(opts);
    default: return generateFlowImage(opts);
  }
};

/**
 * Tạo nhiều ảnh. MuseAI: 1 batch chạy SONG SONG trên bridge.
 * Engine khác: tuần tự, nghỉ `gapMs` giữa các ảnh (tránh rate-limit như trước).
 * onImage gọi ngay khi từng ảnh xong. Trả mảng theo thứ tự request (null = lỗi);
 * ném lỗi nếu không ảnh nào thành công.
 */
export async function generateImages(
  requests: ImageRequest[],
  onImage?: (index: number, img: string) => void,
  gapMs = 2000,
): Promise<(string | null)[]> {
  if (getImageProvider() === "muse") return generateMuseImages(requests, onImage);

  const out: (string | null)[] = requests.map(() => null);
  let lastErr: unknown;
  for (let i = 0; i < requests.length; i++) {
    if (i > 0) await sleep(gapMs);
    try {
      const img = await generateImage(requests[i]);
      out[i] = img;
      onImage?.(i, img);
    } catch (e) {
      lastErr = e;
    }
  }
  if (out.every((v) => !v)) throw lastErr ?? new Error("Không tạo được ảnh nào.");
  return out;
}

/** Tạo video từ ảnh (chỉ MuseAI). Trả blob URL MP4. */
export async function generateVideo(prompt: string, referenceImage?: string): Promise<string> {
  const [url] = await generateMuseVideos([{ prompt, referenceImage }]);
  return url!;
}
