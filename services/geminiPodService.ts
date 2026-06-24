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
import { whiteToTransparent } from "./imageUtils";

export const cleanJsonString = _cleanJson;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  const prompt =
    "Extract the main printable DESIGN / ILLUSTRATION from this product photo as a CLEAN FLAT GRAPHIC. " +
    "REMOVE completely: the real-world photographic background, the physical product 3D frame, glass/acrylic " +
    "reflections and photo lighting, hangers, ropes, hands, AND any watermark, signature, logo or text overlay. " +
    "Keep ONLY the artwork with its original colors, line work and details, sharp clean edges. " +
    "Output the isolated design on a fully TRANSPARENT background (alpha); if transparency is unavailable use 100% PURE WHITE (#FFFFFF). " +
    "High resolution, no clutter, no border.";
  try {
    const generated = await generateFlowImage({ prompt, aspectRatio: "1:1", referenceImage: imageBase64 });
    // Tách nền trắng -> trong suốt phía client (Flow thường xuất nền trắng, không alpha).
    return await whiteToTransparent(generated);
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
  productType: string,
  referenceImage?: string
): Promise<string[]> => {
  const ropeNote = ropeType && ropeType !== RopeType.NONE ? `Add hanging rope style: ${ropeType}.` : "Zero ropes, zero hangers.";
  const material = PRODUCT_MATERIALS[productType] || "";
  const materialNote = material ? `MATERIAL REALISM (${productType}): ${material}` : "";
  const refNote = referenceImage
    ? "Use the REFERENCE IMAGE as the ground-truth subject: keep the same characters, objects, composition and color identity; only restore/enhance quality. Do NOT invent a different scene."
    : "";
  const finalPrompt = `ETSY BOUTIQUE DESIGN ENGINE - PROTOCOL "PREMIUM PILLAR":
  CORE CONCEPT: ${basePrompt}.
  ADJUSTMENTS: ${userNotes || "Enhance while strictly maintaining original layout and hand-drawn spirit"}.
  ${refNote}

  STRICT REQUIREMENTS:
  - SUBJECT FIDELITY: Preserve the exact subject, characters and layout from the reference. No new/extra objects.
  - PILLAR LAYOUT LOCK: Keep the exact vertical/horizontal arrangement.
  - ${materialNote}
  - TEXTURE: Realistic hand-crafted textures appropriate to the material above.
  - FINISH: 8k high-fidelity. NO white die-cut border. Clean professional product design.
  - BACKGROUND: 100% PURE WHITE (#FFFFFF).
  - ${ropeNote}`;

  const results: string[] = [];
  for (let i = 0; i < 3; i++) {
    if (i > 0) await sleep(2000);
    try {
      const img = await generateFlowImage({ prompt: finalPrompt, aspectRatio: "1:1", referenceImage });
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
