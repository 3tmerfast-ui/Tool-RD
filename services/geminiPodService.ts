/**
 * Service luồng POD / Ornament.
 *
 * ĐÃ THAY GEMINI API:
 *   - Tạo/sửa ảnh  -> Flow extension (Nano Banana, miễn phí)  [flowExtensionService]
 *   - Phân tích ảnh -> OpenRouter (vision -> JSON)             [openRouterService]
 *
 * Chữ ký các hàm export giữ NGUYÊN để App.tsx không phải sửa.
 */

import { ProductAnalysis, DesignMode, RopeType, AppTab, PRODUCT_MATERIALS } from "../types";
import { generateFlowImage } from "./flowExtensionService";
import { analyzeProductDesign as analyzeViaOpenRouter, cleanJsonString as _cleanJson } from "./openRouterService";
import { cutoutBackground } from "./imageUtils";

export const cleanJsonString = _cleanJson;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  // CẮT NỀN THẬT trên ảnh gốc: giữ nguyên 100% chi tiết (móc treo, chữ, design),
  // chỉ xoá phông nền -> PNG trong suốt. KHÔNG dùng AI sinh ảnh ở bước này.
  return cutoutBackground(imageBase64);
};

export const analyzeProductDesign = async (
  imageBase64: string,
  productType: string,
  designMode: DesignMode
): Promise<ProductAnalysis> => {
  return analyzeViaOpenRouter(imageBase64, productType, designMode, AppTab.POD, "40%");
};

export const generateProductRedesigns = async (
  basePrompt: string,
  ropeType: RopeType,
  _selectedComponents: string[],
  userNotes: string,
  productType: string,
  referenceImage?: string
): Promise<string[]> => {
  const ropeNote = ropeType && ropeType !== RopeType.NONE ? `Hanging hardware style: ${ropeType}.` : "";
  const material = PRODUCT_MATERIALS[productType] || "";
  const materialNote = material ? `MATERIAL REALISM (${productType}): ${material}` : "";
  const refNote = referenceImage
    ? "Use the REFERENCE IMAGE only as loose THEME inspiration (same subject & mood). Do NOT copy it — produce a clearly different, upgraded design."
    : "";

  // 3 hướng sáng tạo KHÁC NHAU để ra 3 mẫu phân biệt, không trùng lặp.
  const VARIATIONS = [
    "VARIATION A: richer, more luminous color palette with deeper landscape detail and elegant refined linework; the most premium boutique feel.",
    "VARIATION B: rework the COMPOSITION (different moon orientation / subject pose angle / element placement) and add tasteful extra celestial accents (stars, glow, sparkles) while keeping the same theme.",
    "VARIATION C: a cleaner, more modern minimalist take — bolder silhouette, more negative space and sophisticated color harmony.",
  ];

  const buildPrompt = (variation: string) => `PROFESSIONAL ETSY BOUTIQUE REDESIGN — create a NEW, MORE BEAUTIFUL version (NOT a copy).
  SAME CONCEPT & SUBJECT: ${basePrompt}.
  REDESIGN GOAL: Keep the recognizable subject, theme and mood, but genuinely REDESIGN it — improve and CHANGE composition, color harmony, lighting and decorative details so the result looks clearly upgraded and distinct from the original. It must NOT look identical to the source.
  ${variation}
  ${refNote}
  ADJUSTMENTS: ${userNotes || "elevate to high-end boutique quality"}.
  ${materialNote}
  REQUIREMENTS: 8k high-fidelity, professional commercial design, clean edges, NO white die-cut border, 100% PURE WHITE (#FFFFFF) background. ${ropeNote}`;

  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(2000);
    try {
      // referenceImage chỉ truyền cho mẫu đầu (giữ nét chủ đề); 2 mẫu sau bỏ ref để biến tấu mạnh hơn.
      const img = await generateFlowImage({
        prompt: buildPrompt(VARIATIONS[i] || VARIATIONS[0]),
        aspectRatio: "1:1",
        referenceImage: i === 0 ? referenceImage : undefined,
      });
      results.push(img);
    } catch (e) {
      if (results.length === 0 && i === 2) throw e;
    }
  }
  return results;
};

export const extractDesignElements = async (imageBase64: string): Promise<string[]> => {
  try {
    const img = await generateFlowImage({
      prompt: "Isolate main subject on pure white. Maintain colors and organic handcrafted textures.",
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
    return await generateFlowImage({
      prompt: `Modify: ${instruction}. Keep original PILLAR layout, hand-painted textures and colors. Pure white background.`,
      aspectRatio: "1:1",
      referenceImage: imageBase64,
    });
  } catch {
    return imageBase64;
  }
};

export const detectAndSplitCharacters = async (_imageBase64: string): Promise<string[]> => {
  return [];
};
