/**
 * Flow Image Bridge — client wrapper for th-tool.
 *
 * Tạo ảnh "Nano Banana / Imagen" MIỄN PHÍ qua Chrome extension điều khiển
 * Google Labs Flow, thay cho việc gọi Gemini API tốn phí.
 *
 * Extension ID được tự phát hiện lúc runtime qua beacon mà content script
 * (extension/content_app_bridge.js) postMessage lên trang. Người dùng chỉ cần
 * Load unpacked thư mục `extension/` trong chrome://extensions.
 *
 * YÊU CẦU: mở app bằng Chrome có cài extension + đã đăng nhập labs.google.
 */

const LS_EXT_ID_KEY = 'flow_ext_id';

let discoveredId: string | null = null;

function bootstrapDiscovery() {
  if (typeof window === 'undefined') return;
  // 1. ID đã lưu từ phiên trước (dùng được ngay)
  try { discoveredId = localStorage.getItem(LS_EXT_ID_KEY); } catch { /* localStorage blocked */ }
  // 2. Fallback env var (nếu cấu hình thủ công)
  if (!discoveredId) {
    const envId = ((import.meta as any).env?.VITE_FLOW_EXTENSION_ID as string | undefined ?? '').trim();
    if (envId) discoveredId = envId;
  }
  // 3. Nghe beacon từ content script
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;
    const d: any = e.data;
    if (d && d.__flowExtBeacon && typeof d.extensionId === 'string') {
      if (discoveredId !== d.extensionId) {
        discoveredId = d.extensionId;
        try { localStorage.setItem(LS_EXT_ID_KEY, d.extensionId); } catch { /* ignore */ }
        window.dispatchEvent(new Event('flow-ext-discovered'));
      }
    }
  });
  // 4. Kích beacon phòng khi extension load trước listener
  try { window.postMessage({ __flowExtPing: true }, location.origin); } catch { /* ignore */ }
}
bootstrapDiscovery();

type ChromePort = { disconnect: () => void };
type ChromeRuntimeAPI = {
  sendMessage: (extId: string, message: unknown, callback: (response: unknown) => void) => void;
  connect: (extId: string, info?: { name?: string }) => ChromePort;
  lastError?: { message?: string };
};
function getChromeRuntime(): ChromeRuntimeAPI | null {
  const c = (globalThis as { chrome?: { runtime?: ChromeRuntimeAPI } }).chrome;
  return c?.runtime ?? null;
}

/** True khi đã phát hiện extension ID VÀ chrome.runtime gọi được từ origin này. */
export function isFlowExtensionAvailable(): boolean {
  return !!discoveredId && !!getChromeRuntime()?.sendMessage;
}

/** Giải thích VÌ SAO không dùng được extension — show cho người dùng. */
export function diagnoseExtensionUnavailable(): string {
  if (!discoveredId) {
    return 'Chưa phát hiện extension trên máy này. Vào chrome://extensions → Load unpacked → chọn thư mục "extension/" rồi reload trang.';
  }
  const runtime = getChromeRuntime();
  if (!runtime) {
    return 'chrome.runtime undefined — hãy mở bằng Chrome/Chromium và bật extension trong chrome://extensions.';
  }
  if (!runtime.sendMessage) {
    return 'chrome.runtime không có sendMessage từ origin này — domain chưa được khai trong manifest externally_connectable.matches. Thêm domain rồi reload extension.';
  }
  return `Đã thấy extension ID ${discoveredId} nhưng không phản hồi — kiểm tra extension còn ENABLED không.`;
}

export function getFlowExtensionId(): string {
  return discoveredId ?? '';
}

interface FlowGenerateResponse {
  ok: boolean;
  image?: string;            // data:image/png;base64,...
  referenceUsed?: boolean;
  error?: string;
}

const stripPrefix = (b64: string) =>
  b64.replace(/^data:image\/[a-z]+;base64,/, '').replace(/^data:[^;]+;base64,/, '');

/**
 * Gửi lệnh `flow-generate` tới extension và chờ ảnh base64 trả về.
 * @param prompt        Nội dung mô tả ảnh
 * @param aspectRatio   '1:1' | '3:4' | ...
 * @param referenceImage (tuỳ chọn) ảnh tham chiếu — chấp nhận cả dataURL lẫn base64 thô
 * @param model         'banana2' (mặc định) | 'banana-pro' | 'imagen4'
 */
export function generateFlowImage(opts: {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
  model?: string;
}): Promise<string> {
  const runtime = getChromeRuntime();
  const id = discoveredId;
  if (!runtime || !id) {
    return Promise.reject(new Error(diagnoseExtensionUnavailable()));
  }

  // Mở port giữ service worker MV3 sống suốt request (tránh bị Chrome kill sau ~30s).
  let keepalivePort: ChromePort | null = null;
  try { keepalivePort = runtime.connect(id, { name: 'flow-gen-keepalive' }); } catch { /* non-fatal */ }

  const GEN_TIMEOUT_MS = 180_000;
  const inner = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Flow extension timed out sau ${GEN_TIMEOUT_MS / 1000}s — reload extension rồi thử lại.`));
    }, GEN_TIMEOUT_MS);

    const msg: Record<string, unknown> = {
      type: 'flow-generate',
      prompt: opts.prompt,
      model: opts.model ?? 'banana2',
      aspectRatio: opts.aspectRatio ?? '1:1',
    };
    if (opts.referenceImage) {
      msg.referenceImage = stripPrefix(opts.referenceImage);
      msg.referenceMimeType = 'image/png';
    }

    runtime.sendMessage(id, msg, (response: unknown) => {
      clearTimeout(timer);
      if (runtime.lastError) {
        reject(new Error(runtime.lastError.message ?? 'extension messaging failed'));
        return;
      }
      const r = response as FlowGenerateResponse | undefined;
      if (!r?.ok || !r.image) {
        reject(new Error(r?.error ?? 'extension trả về not-ok'));
        return;
      }
      resolve(r.image);
    });
  });

  return inner.finally(() => {
    try { keepalivePort?.disconnect(); } catch { /* ignore */ }
  });
}

/** Ping extension để kiểm tra kết nối (dùng cho validateToken). */
export function pingFlowExtension(): Promise<boolean> {
  const runtime = getChromeRuntime();
  const id = discoveredId;
  if (!runtime || !id) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      runtime.sendMessage(id, { type: 'ping' }, (response: unknown) => {
        if (runtime.lastError) { resolve(false); return; }
        resolve(!!(response as { ok?: boolean } | undefined)?.ok);
      });
    } catch { resolve(false); }
  });
}
