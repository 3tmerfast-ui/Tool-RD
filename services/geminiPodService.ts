/**
 * Service luồng POD / Ornament.
 *
 * ĐÃ THAY GEMINI API:
 *   - Tạo/sửa ảnh  -> Flow extension (Nano Banana, miễn phí)  [flowExtensionService]
 *   - Phân tích ảnh -> OpenRouter (vision -> JSON)             [openRouterService]
 *
 * Chữ ký các hàm export giữ NGUYÊN để App.tsx không phải sửa.
 */

import { ProductAnalysis, DesignMode, RopeType, AppTab } from "../types";
import { generateFlowImage } from "./flowExtensionService";
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
    return imageBase64;
  }
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
  _productType: string
): Promise<string[]> => {
  const ropeNote = ropeType && ropeType !== RopeType.NONE ? `Add hanging rope style: ${ropeType}.` : "Zero ropes, zero hangers.";
  const finalPrompt = `ETSY BOUTIQUE DESIGN ENGINE - PROTOCOL "PREMIUM PILLAR":
  CORE CONCEPT: ${basePrompt}.
  ADJUSTMENTS: ${userNotes || "Enhance while strictly maintaining original layout and hand-drawn spirit"}.

  STRICT REQUIREMENTS:
  - PILLAR LAYOUT LOCK: Keep the exact vertical/horizontal arrangement. Do not rearrange or misinterpret objects.
  - OBJECT LOGIC: Realistic fabric folds in bows, recognizable crayon wrappers and tips.
  - RETRO GROOVY VIBES: Soft rounded bubble typography and playful organic shapes.
  - TEXTURE: Crayon wax interaction with paper grain. Seamless pattern integration with ink-bleed effects.
  - FINISH: 8k High-fidelity restoration. NO white die-cut border. Subtle vintage distressing.
  - BACKGROUND: 100% PURE WHITE (#FFFFFF).
  - ${ropeNote}`;

  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(2000);
    try {
      const img = await generateFlowImage({ prompt: finalPrompt, aspectRatio: "1:1" });
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
