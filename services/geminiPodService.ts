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
import { getDesignGuide } from "./productKnowledge";

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
  referenceImage?: string,
  onPartial?: (images: string[]) => void
): Promise<string[]> => {
  const ropeNote = ropeType && ropeType !== RopeType.NONE ? `Hanging hardware: ${ropeType}.` : "";
  const material = PRODUCT_MATERIALS[productType] || "";
  const materialNote = material ? `MATERIAL REALISM (${productType}): ${material}` : "";
  const guide = getDesignGuide(productType);
  const guideNote = guide ? `ETSY DESIGN GUIDE: ${guide}` : "";
  const keepNote = selectedComponents && selectedComponents.length
    ? `Keep these ELEMENT TYPES but REDRAW them originally (different shapes/arrangement): ${selectedComponents.join(", ")}.`
    : "";

  // 6 biến thể — mỗi cái ĐỔI bố cục + font + cách diễn đạt chữ để KHÔNG trùng đối thủ (tránh bị report).
  const VARIATIONS = [
    "Layout A: rearrange the main motif into a fresh original composition; elegant serif typography for any text; original decorative border.",
    "Layout B: shift the focal balance and element placement; flowing script typography; warm harmonious palette (ambers, roses, golds).",
    "Layout C: a more symmetrical centered arrangement different from the source; clean modern sans-serif typography; cool jewel tones (sapphire, emerald, amethyst).",
    "Layout D: asymmetric / off-center artistic composition; refined hand-lettered style typography; richer ornate detailing.",
    "Layout E: airy minimalist arrangement with more negative space; delicate light typography; soft pastel palette.",
    "Layout F: bold dramatic composition with a strong focal point; condensed elegant typography; high-contrast vivid colors.",
  ];

  const buildPrompt = (variation: string) => `HIGH-END ETSY ${productType.toUpperCase()} — ORIGINAL artwork inspired by the concept, NOT a copy of any existing listing.
  CONCEPT & PURPOSE (keep the niche/theme/gift intent): ${basePrompt}.
  ⚠️ ORIGINALITY (CRITICAL — must avoid copyright/report on Etsy):
  - Do NOT reproduce any source's EXACT wording, font, or element-by-element layout.
  - If there is a quote/saying, REPHRASE it into FRESH original wording with the same sentiment (different sentence). Do NOT copy the quote verbatim.
  - Use a DIFFERENT typography/font style than typical listings.
  - Rework the COMPOSITION, arrangement and color distribution so the result is clearly DISTINCT from competitors while serving the same gift purpose.
  - Keep ONLY personalization placeholders (name/year) as plain editable text.
  STYLE: crisp ${productType} craftsmanship, vibrant harmonious colors, balanced gallery-grade finish.
  ${variation}
  ${keepNote}
  ADJUSTMENTS (user): ${userNotes || "none — just make it original & premium"}.
  ${materialNote}
  ${guideNote}
  OUTPUT: single centered original product design, 8k high-fidelity, clean edges, NO white die-cut border, 100% PURE WHITE (#FFFFFF) background. ${ropeNote}`;

  const results: string[] = [];
  for (let i = 0; i < NUM_REDESIGNS; i++) {
    if (i > 0) await sleep(2000);
    try {
      // KHÔNG truyền reference image -> tránh AI copy y nguyên chữ/font/bố cục của đối thủ.
      // Chủ đề được giữ qua coreTheme + redesignPrompt (text). referenceImage chỉ dùng cho cleanup.
      const img = await generateFlowImage({
        prompt: buildPrompt(VARIATIONS[i] || VARIATIONS[0]),
        aspectRatio: "1:1",
      });
      results.push(img);
      onPartial?.([...results]); // hiện ngay mẫu vừa xong
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
