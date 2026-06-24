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

// Số mẫu tạo ra (khớp nút "Generate 6 Options").
export const NUM_REDESIGNS = 6;

export const generateProductRedesigns = async (
  basePrompt: string,
  ropeType: RopeType,
  selectedComponents: string[],
  userNotes: string,
  productType: string,
  referenceImage?: string
): Promise<string[]> => {
  const ropeNote = ropeType && ropeType !== RopeType.NONE ? `Hanging hardware: ${ropeType}.` : "";
  const material = PRODUCT_MATERIALS[productType] || "";
  const materialNote = material ? `MATERIAL REALISM (${productType}): ${material}` : "";
  const keepNote = selectedComponents && selectedComponents.length
    ? `MUST KEEP these elements (do not remove): ${selectedComponents.join(", ")}.`
    : "";

  // 6 biến thể TINH TẾ, CÙNG bố cục & phong cách — chỉ đổi màu/chi tiết, không vẽ lại sản phẩm khác.
  const VARIATIONS = [
    "Faithful premium enhancement: keep the exact same composition and style, just refine quality, sharpen details and richen colors. Closest to the original.",
    "Warm palette variation: same layout, shift to a warmer harmonious color story (ambers, roses, golds) while keeping every element.",
    "Cool jewel-tone variation: same layout, deep jewel tones (sapphire, emerald, amethyst) with luminous backlit glow.",
    "Ornate variation: same layout, add tasteful extra fine detailing and a more decorative refined border.",
    "Soft pastel elegant variation: same layout, lighter airy pastel palette with delicate linework, premium boutique feel.",
    "Bold focal variation: same layout, stronger contrast and one clear focal highlight, crisp clean leaded lines.",
  ];

  const buildPrompt = (variation: string) => `HIGH-END ETSY ${productType.toUpperCase()} DESIGN — premium, salable, professional quality for the US Etsy market.
  CONCEPT (keep faithfully): ${basePrompt}.
  GOAL: Keep the SAME composition, subject, layout and overall style as the reference — this is a refined VARIATION of the same product, NOT a different design and NOT a plain copy. Elevate craftsmanship and polish to top-seller Etsy quality.
  STYLE LOCK: clean symmetrical layout, crisp stained-glass / hand-painted linework, balanced floral/decor arrangement, vibrant but harmonious colors, gallery-grade finish.
  ${variation}
  ${keepNote}
  ADJUSTMENTS (user): ${userNotes || "none — just elevate quality"}.
  ${materialNote}
  OUTPUT: single centered product design, 8k high-fidelity, clean edges, NO white die-cut border, 100% PURE WHITE (#FFFFFF) background. ${ropeNote}`;

  const results: string[] = [];
  for (let i = 0; i < NUM_REDESIGNS; i++) {
    if (i > 0) await sleep(2000);
    try {
      // GIỮ reference ở MỌI mẫu để khoá đúng phong cách/bố cục (gu Etsy).
      const img = await generateFlowImage({
        prompt: buildPrompt(VARIATIONS[i] || VARIATIONS[0]),
        aspectRatio: "1:1",
        referenceImage,
      });
      results.push(img);
    } catch (e) {
      if (results.length === 0 && i === NUM_REDESIGNS - 1) throw e;
    }
  }
  return results;
};

/**
 * Tạo MOCKUP sản phẩm thật từ artwork: ghép design vào bối cảnh bán hàng Etsy
 * (vd suncatcher treo cửa sổ, ánh sáng xuyên qua). Dùng artwork làm reference.
 */
export const generateProductMockup = async (
  designImage: string,
  productType: string
): Promise<string> => {
  const material = PRODUCT_MATERIALS[productType] || "";
  const prompt = `Create a PHOTOREALISTIC ETSY PRODUCT MOCKUP of this exact design as a real ${productType}.
  Use the REFERENCE IMAGE as the printed artwork — keep it identical, do not redraw it.
  Material: ${material}
  Scene: the finished product professionally hung in a bright window with soft natural daylight passing through it, cozy tasteful home interior softly blurred in the background (bokeh), gentle colored light reflections, realistic hanging cord/chain and metal loop.
  Style: premium lifestyle e-commerce photography, sharp focus on the product, warm inviting mood, magazine quality, vertical 4:5 framing.`;
  return generateFlowImage({ prompt, aspectRatio: "3:4", referenceImage: designImage });
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
