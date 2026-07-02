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
import { getTshirtStyleGuide } from "./productKnowledge";

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
  tshirtStyle: string,
  _useUltraFlag: boolean,
  _activeTab: AppTab = AppTab.TSHIRT,
  originalImage?: string,
  _retention: RetentionLevel = "40%",
  onPartial?: (images: string[]) => void
): Promise<string[]> => {
  const guide = getTshirtStyleGuide(tshirtStyle);
  const guideNote = guide ? `GARMENT STYLE GUIDE (${tshirtStyle}): ${guide}` : "";
  const VARIATIONS = [
    "Layout A: original composition, elegant serif typography, refined premium linework.",
    "Layout B: reworked focal balance & placement, flowing script typography, warm palette.",
    "Layout C: clean modern minimalist arrangement, bold sans-serif typography, sophisticated palette.",
  ];
  const isJersey = tshirtStyle === "Baseball Jersey";
  const outputSpec = isJersey
    ? "⚠️ OUTPUT FORMAT (critical, override anything above that implies a photo): a FLAT 2D print-ready TEMPLATE graphic — NOT a photograph, NOT a garment render, NOT worn by a person, NOT hung on a hook/cord/hanger, NO room/background scenery, NO fabric texture/lighting simulation. Show the FRONT flat panel and the BACK flat panel side by side within the same square frame, like a technical spec sheet, each panel as clean flat vector-style artwork on a plain white background, following the FRONT/BACK layout rules above exactly. 8k high-fidelity, sharp clean edges, ready for direct print/sublimation."
    : "⚠️ OUTPUT FORMAT (critical, override anything above that implies a photo): a FLAT 2D print-ready graphic — NOT a photograph, NOT worn by a person, NOT a garment render, NO room/background scenery. Single centered motif on a plain white background, clean vector-style edges, 8k high-fidelity, ready for direct print.";
  const buildPrompt = (variation: string) =>
    `PROFESSIONAL ${tshirtStyle.toUpperCase()} DESIGN — ORIGINAL artwork inspired by the concept, NOT a copy of any existing listing. ` +
    `CONCEPT & PURPOSE (keep niche/theme — this already locks the detected sport/team identity, keep it EXACTLY as stated, never substitute a different sport): ${baseAiPrompt}. ` +
    "⚠️ ORIGINALITY (avoid copyright/report): do NOT reproduce any source's exact wording, font or layout. REPHRASE any quote into fresh original wording (same sentiment), use a DIFFERENT font, and REWORK the composition so it is clearly distinct. Keep only name/date/number placeholders. " +
    `${variation} NOTES: ${userAddition}. ` +
    `${guideNote} ` +
    outputSpec;

  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(1500);
    try {
      // KHÔNG truyền reference -> tránh copy y nguyên chữ/font/bố cục.
      const img = await generateFlowImage({
        prompt: buildPrompt(VARIATIONS[i] || VARIATIONS[0]),
        aspectRatio: "1:1",
      });
      results.push(img);
      onPartial?.([...results]);
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
