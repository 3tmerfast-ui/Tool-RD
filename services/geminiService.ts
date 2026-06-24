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
import { generateFlowImage, pingFlowExtension } from "./flowExtensionService";
import { analyzeProductDesign as analyzeViaOpenRouter, cleanJsonString as _cleanJson } from "./openRouterService";
import { cutoutBackground } from "./imageUtils";

export const cleanJsonString = _cleanJson;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  _productType: string,
  _useUltraFlag: boolean,
  _activeTab: AppTab = AppTab.TSHIRT,
  originalImage?: string,
  _retention: RetentionLevel = "40%"
): Promise<string[]> => {
  const refNote = originalImage
    ? "Use the reference image only as loose THEME inspiration. Do NOT copy it — produce a clearly different, upgraded design."
    : "";
  const VARIATIONS = [
    "VARIATION A: richer detail and refined premium linework, the most polished take.",
    "VARIATION B: rework the COMPOSITION and add tasteful new accents while keeping the same theme.",
    "VARIATION C: a cleaner modern minimalist take — bolder shapes, more negative space, sophisticated palette.",
  ];
  const buildPrompt = (variation: string) =>
    `PROFESSIONAL T-SHIRT REDESIGN — create a NEW, MORE BEAUTIFUL version (NOT a copy). ` +
    `SAME CONCEPT: ${baseAiPrompt}. Keep the theme & subject but genuinely REDESIGN — change composition, colors and details so it looks clearly upgraded and distinct. ` +
    `${variation} ${refNote} NOTES: ${userAddition}. ` +
    "Clean vector-style print, centered layout, transparent/pure white background, 8k high-fidelity.";

  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(1500);
    try {
      const img = await generateFlowImage({
        prompt: buildPrompt(VARIATIONS[i] || VARIATIONS[0]),
        aspectRatio: "1:1",
        referenceImage: i === 0 ? originalImage : undefined,
      });
      results.push(img);
    } catch (e) {
      if (results.length === 0 && i === 2) throw e; // không tạo được ảnh nào -> báo lỗi
    }
  }
  return results;
};

export const validateToken = async (_tokenInput?: string): Promise<boolean> => {
  const ok = await pingFlowExtension();
  if (!ok) throw new Error("Không kết nối được Flow extension. Cài & bật extension, đăng nhập labs.google rồi thử lại.");
  return true;
};

export const extractDesignElements = async (imageBase64: string): Promise<string[]> => {
  try {
    const img = await generateFlowImage({
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
    return await generateFlowImage({
      prompt: `Edit the reference image as follows: ${instruction}. Keep product on pure white background, high-fidelity.`,
      aspectRatio: "1:1",
      referenceImage: imageBase64,
    });
  } catch {
    return imageBase64;
  }
};
