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

export const cleanJsonString = _cleanJson;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  const prompt =
    "CRITICAL ACTION: ISOLATE SUBJECT. Remove ALL background elements, clothes, hangers, and ropes. " +
    "Keep ONLY the product graphic. Place on 100% PURE WHITE background (#FFFFFF). High-fidelity restoration.";
  try {
    return await generateFlowImage({ prompt, aspectRatio: "1:1", referenceImage: imageBase64 });
  } catch {
    // Nếu extension lỗi, trả ảnh gốc để luồng không vỡ.
    return imageBase64;
  }
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
  const finalPrompt =
    `ETSY T-SHIRT DESIGN PROTOCOL. CORE: ${baseAiPrompt}. NOTES: ${userAddition}. ` +
    "Clean vector-style print, centered layout, transparent/pure white background, 8k high-fidelity.";

  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(1500);
    try {
      const img = await generateFlowImage({ prompt: finalPrompt, aspectRatio: "1:1", referenceImage: originalImage });
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
