/**
 * Tách nền trắng -> trong suốt (alpha) phía client.
 *
 * Dùng FLOOD-FILL từ 4 viền ảnh: chỉ xoá vùng trắng NỐI LIỀN với mép ngoài,
 * nên không đục lỗ vào các mảng trắng bên trong artwork. Có feather mép để
 * tránh viền răng cưa.
 */

const blobToDataURL = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * CẮT NỀN THẬT (không AI sinh ảnh): dùng @imgly/background-removal segment chủ thể
 * ngay trên trình duyệt, GIỮ NGUYÊN mọi pixel gốc (móc treo, chữ, chi tiết) và chỉ
 * xoá phông nền -> PNG trong suốt. Model tải lần đầu (~vài MB) rồi được cache.
 *
 * Lỗi/không hỗ trợ -> trả lại ảnh gốc để luồng không vỡ.
 */
export async function cutoutBackground(imageSrc: string): Promise<string> {
  if (typeof document === "undefined") return imageSrc;
  try {
    const { removeBackground } = await import("@imgly/background-removal");
    const blob = await removeBackground(imageSrc, { output: { format: "image/png" } });
    return await blobToDataURL(blob);
  } catch (e) {
    console.warn("[cutoutBackground] fallback -> ảnh gốc:", e);
    return imageSrc;
  }
}

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export interface WhiteToTransparentOptions {
  /** Ngưỡng coi là "trắng": kênh RGB tối thiểu (0-255). Mặc định 240. */
  threshold?: number;
  /** Làm mềm mép: số lượt nở vùng trong suốt 1px. Mặc định 1. */
  feather?: number;
}

/**
 * Nhận dataURL/URL ảnh, trả về dataURL PNG đã xoá nền trắng (trong suốt).
 * Nếu không chạy được canvas (SSR) hoặc lỗi -> trả lại ảnh gốc.
 */
export async function whiteToTransparent(
  imageSrc: string,
  opts: WhiteToTransparentOptions = {}
): Promise<string> {
  if (typeof document === "undefined") return imageSrc;
  const threshold = opts.threshold ?? 240;
  const feather = opts.feather ?? 1;

  try {
    const img = await loadImage(imageSrc);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return imageSrc;

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return imageSrc;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const total = w * h;

    const isWhite = (i: number) => {
      const o = i * 4;
      return data[o] >= threshold && data[o + 1] >= threshold && data[o + 2] >= threshold && data[o + 3] > 0;
    };

    // Flood-fill từ mọi pixel viền là trắng.
    const visited = new Uint8Array(total);
    const stack: number[] = [];
    const pushIfBorder = (i: number) => { if (!visited[i] && isWhite(i)) { visited[i] = 1; stack.push(i); } };
    for (let x = 0; x < w; x++) { pushIfBorder(x); pushIfBorder((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { pushIfBorder(y * w); pushIfBorder(y * w + (w - 1)); }

    while (stack.length) {
      const i = stack.pop()!;
      data[i * 4 + 3] = 0; // trong suốt
      const x = i % w;
      const y = (i - x) / w;
      if (x > 0)     { const n = i - 1; if (!visited[n] && isWhite(n)) { visited[n] = 1; stack.push(n); } }
      if (x < w - 1) { const n = i + 1; if (!visited[n] && isWhite(n)) { visited[n] = 1; stack.push(n); } }
      if (y > 0)     { const n = i - w; if (!visited[n] && isWhite(n)) { visited[n] = 1; stack.push(n); } }
      if (y < h - 1) { const n = i + w; if (!visited[n] && isWhite(n)) { visited[n] = 1; stack.push(n); } }
    }

    // Feather: nở vùng trong suốt thêm `feather` px để mép mượt.
    for (let pass = 0; pass < feather; pass++) {
      const clear: number[] = [];
      for (let i = 0; i < total; i++) {
        if (data[i * 4 + 3] !== 0) continue;
        const x = i % w;
        const y = (i - x) / w;
        const neigh = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const n of neigh) if (n >= 0 && data[n * 4 + 3] > 0) clear.push(n);
      }
      for (const n of clear) data[n * 4 + 3] = 0;
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return imageSrc;
  }
}
