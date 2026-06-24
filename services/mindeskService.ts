/**
 * MindeskAPI bridge — tạo ảnh on-prem thay thế Chrome extension.
 *
 * Khi VITE_MINDESK_URL được cấu hình, Tool-RD gọi trực tiếp đến server
 * MindeskAPI (FastAPI + Python) để sinh ảnh qua Google Labs Flow với
 * tài khoản Google quản lý sẵn — không cần cài Chrome extension.
 *
 * Endpoint: POST {VITE_MINDESK_URL}/api/generate-image
 * Response: { success, image_b64, image_url, duration_ms }
 */

const MINDESK_URL = ((import.meta as any).env?.VITE_MINDESK_URL as string | undefined ?? '')
  .trim()
  .replace(/\/$/, '');

/** True khi VITE_MINDESK_URL đã được cấu hình trong .env.local */
export function isMindeskConfigured(): boolean {
  return !!MINDESK_URL;
}

/**
 * Tạo ảnh qua MindeskAPI — cùng chữ ký với generateFlowImage().
 * @returns data URL: "data:image/jpeg;base64,..."
 */
export async function generateMindeskImage(opts: {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
  tier?: string;
}): Promise<string> {
  if (!MINDESK_URL) {
    throw new Error('VITE_MINDESK_URL chưa được cấu hình — thêm vào .env.local');
  }

  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio ?? '1:1',
    tier: opts.tier ?? 'NARWHAL',
  };
  if (opts.referenceImage) {
    body.reference_image_b64 = opts.referenceImage;
  }

  const res = await fetch(`${MINDESK_URL}/api/generate-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    let detail = errText;
    try {
      const parsed = JSON.parse(errText) as { detail?: string };
      if (parsed.detail) detail = parsed.detail;
    } catch { /* raw text is fine */ }
    throw new Error(`MindeskAPI ${res.status}: ${detail.slice(0, 300)}`);
  }

  const data = await res.json() as {
    success: boolean;
    image_b64?: string;
    image_url?: string;
    duration_ms?: number;
    error?: string;
  };

  if (!data.success) {
    throw new Error(data.error ?? 'MindeskAPI trả về success=false');
  }
  if (!data.image_b64) {
    throw new Error('MindeskAPI không trả về image_b64');
  }

  return data.image_b64.startsWith('data:')
    ? data.image_b64
    : `data:image/jpeg;base64,${data.image_b64}`;
}
