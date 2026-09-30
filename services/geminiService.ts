/**
 * Service luồng T-SHIRT.
 *
 * ĐÃ THAY GEMINI API:
 *   - Tạo/sửa ảnh  -> Flow extension (Nano Banana, miễn phí)  [flowExtensionService]
 *   - Phân tích ảnh -> OpenRouter (vision -> JSON)             [openRouterService]
 *
 * Chữ ký các hàm export giữ NGUYÊN để App.tsx không phải sửa.
 */

import { ProductAnalysis, DesignMode, RopeType, AppTab, RetentionLevel } from "../types";
import { pingFlowExtension } from "./flowExtensionService";
import { generateImage, generateImages, getImageProvider } from "./imageEngine";
import { pingMuse } from "./museService";
import { analyzeProductDesign as analyzeViaOpenRouter, cleanJsonString as _cleanJson } from "./openRouterService";
import { cutoutBackground } from "./imageUtils";
import { getTshirtStyleGuide } from "./productKnowledge";

export const cleanJsonString = _cleanJson;

export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  // CẮT NỀN THẬT trên ảnh gốc: giữ nguyên 100% chi tiết, chỉ xoá phông nền -> PNG trong suốt.
  return cutoutBackground(imageBase64);
};

export const analyzeProductDesign = async (
  imageBase64: string,
  productType: string,
  designMode: DesignMode,
  activeTab: AppTab = AppTab.TSHIRT,
  retention: RetentionLevel = "40%"
): Promise<ProductAnalysis> => {
  return analyzeViaOpenRouter(imageBase64, productType, designMode, activeTab, retention);
};

export const generateProductRedesigns = async (
  baseAiPrompt: string,
  _ropeType: RopeType,
  _selectedComponents: string[],
  userAddition: string,
  tshirtStyle: string,
  _useUltraFlag: boolean,
  _activeTab: AppTab = AppTab.TSHIRT,
  originalImage?: string,
  _retention: RetentionLevel = "40%",
  onPartial?: (images: string[]) => void
): Promise<{ fronts: string[]; backs: string[] | null }> => {
  const guide = getTshirtStyleGuide(tshirtStyle);
  const guideNote = guide ? `GARMENT STYLE GUIDE (${tshirtStyle}): ${guide}` : "";
  const VARIATIONS = [
    "Layout A: original composition, elegant serif typography, refined premium linework.",
    "Layout B: reworked focal balance & placement, flowing script typography, warm palette.",
    "Layout C: clean modern minimalist arrangement, bold sans-serif typography, sophisticated palette.",
  ];
  const isJersey = tshirtStyle === "Baseball Jersey";
  const originalityNote =
    "⚠️ ORIGINALITY (avoid copyright/report): do NOT reproduce any source's exact wording, font or layout. REPHRASE any quote into fresh original wording (same sentiment), use a DIFFERENT font, and REWORK the composition so it is clearly distinct. Keep only name/date/number placeholders. ";
  const conceptNote =
    `CONCEPT & PURPOSE (keep niche/theme — this already locks the detected sport/team identity, keep it EXACTLY as stated, never substitute a different sport): ${baseAiPrompt}. `;

  // Standard T-Shirt: 1 ảnh/variation như cũ, không có mặt sau riêng.
  const buildStandardPrompt = (variation: string) =>
    `PROFESSIONAL ${tshirtStyle.toUpperCase()} DESIGN — ORIGINAL artwork inspired by the concept, NOT a copy of any existing listing. ` +
    conceptNote +
    originalityNote +
    `${variation} NOTES: ${userAddition}. ` +
    `${guideNote} ` +
    "⚠️ OUTPUT FORMAT (critical, override anything above that implies a photo): a FLAT 2D print-ready graphic — NOT a photograph, NOT worn by a person, NOT a garment render, NO room/background scenery. Single centered motif on a plain white background, clean vector-style edges, 8k high-fidelity, ready for direct print.";

  // Baseball Jersey: sinh RIÊNG 2 file in — front.png (đồ hoạ mặt trước, tách rời)
  // và back.png (chữ+số mặt sau) — không vẽ hình dáng áo bao quanh, đúng chuẩn file gửi xưởng in.
  const buildJerseyFrontPrompt = (variation: string) =>
    "PROFESSIONAL BASEBALL JERSEY — FRONT PRINT FILE — ORIGINAL artwork inspired by the concept, NOT a copy of any existing listing. " +
    conceptNote +
    originalityNote +
    `${variation} NOTES: ${userAddition}. ` +
    `${guideNote} ` +
    "⚠️ OUTPUT FORMAT (critical): produce ONLY the FRONT-side print graphic, isolated on a plain white background — NOT the full garment shape, NO sleeves/collar drawn around it, NOT a photo, NOT worn by a person. Ready-to-print FRONT FILE only: the mascot/logo/graphic on ONE side and the vertical team-name text (if any) on the OTHER side per the BUTTON PLACKET RULE above, with the center strip left completely empty. 8k high-fidelity, clean vector edges, ready for direct print.";

  const buildJerseyBackPrompt = (variation: string) =>
    "PROFESSIONAL BASEBALL JERSEY — BACK PRINT FILE — companion back-side file for the same design, SAME art style/colors as the front. " +
    conceptNote +
    originalityNote +
    `${variation} NOTES: ${userAddition}. ` +
    `${guideNote} ` +
    "⚠️ OUTPUT FORMAT (critical): produce ONLY the BACK-side print graphic, isolated on a plain white background — NOT the full garment shape, NO sleeves/collar drawn around it, NOT a photo. Ready-to-print BACK FILE only: ALL-CAPS name arched above a large number, centered, per the layout rules above. 8k high-fidelity, clean vector edges, ready for direct print.";

  // KHÔNG truyền reference -> tránh copy y nguyên chữ/font/bố cục.
  // Jersey: xếp front/back xen kẽ [f0,b0,f1,b1,...]. MuseAI chạy song song cả lô; engine khác tuần tự.
  const requests = VARIATIONS.flatMap((variation) => isJersey
    ? [
        { prompt: buildJerseyFrontPrompt(variation), aspectRatio: "3:4" },
        { prompt: buildJerseyBackPrompt(variation), aspectRatio: "3:4" },
      ]
    : [{ prompt: buildStandardPrompt(variation), aspectRatio: "1:1" }]);
  const step = isJersey ? 2 : 1;

  const partial: string[] = [];
  const all = await generateImages(
    requests,
    (i, img) => { if (i % step === 0) { partial.push(img); onPartial?.([...partial]); } },
    1500,
  );

  // Giữ back khớp index với front (back lỗi -> "" để modal bỏ qua mặt sau).
  const fronts: string[] = [];
  const backs: string[] = [];
  for (let i = 0; i < all.length; i += step) {
    if (!all[i]) continue;
    fronts.push(all[i]!);
    if (isJersey) backs.push(all[i + 1] || "");
  }
  if (!fronts.length) throw new Error("Không tạo được mẫu thiết kế nào.");
  return { fronts, backs: isJersey ? backs : null };
};

export const validateToken = async (_tokenInput?: string): Promise<boolean> => {
  if (getImageProvider() === "muse") {
    if (!(await pingMuse())) throw new Error("Không kết nối được MuseAI on-prem. Kiểm tra Tailscale và bridge (MUSE_API_URL).");
    return true;
  }
  const ok = await pingFlowExtension();
  if (!ok) throw new Error("Không kết nối được Flow extension. Cài & bật extension, đăng nhập labs.google rồi thử lại.");
  return true;
};

export const extractDesignElements = async (imageBase64: string): Promise<string[]> => {
  try {
    const img = await generateImage({
      prompt: "Isolate the subject on a pure white background. Maintain original colors and details.",
      aspectRatio: "1:1",
      referenceImage: imageBase64,
    });
    return img ? [img] : [];
  } catch {
    return [];
  }
};

export const remixProductImage = async (imageBase64: string, instruction: string): Promise<string> => {
  try {
    return await generateImage({
      prompt: `Edit the reference image as follows: ${instruction}. Keep product on pure white background, high-fidelity.`,
      aspectRatio: "1:1",
      referenceImage: imageBase64,
    });
  } catch {
    return imageBase64;
  }
};
