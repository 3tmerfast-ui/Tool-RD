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
import { generateMindeskImage, isMindeskConfigured } from "./mindeskService";
import { analyzeProductDesign as analyzeViaOpenRouter, cleanJsonString as _cleanJson } from "./openRouterService";
import { cutoutBackground } from "./imageUtils";
import { getDesignGuide } from "./productKnowledge";

/** Sinh ảnh qua MindeskAPI (on-prem) hoặc Flow extension tuỳ cấu hình. */
const generateImage = (opts: {
  prompt: string;
  aspectRatio?: string;
  referenceImage?: string;
  model?: string;
}): Promise<string> =>
  isMindeskConfigured()
    ? generateMindeskImage(opts)
    : generateFlowImage(opts);

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
    "Rearrange the bouquet/elements into a fresh composition; vary the specific flowers slightly. SAME art style & palette.",
    "Different floral arrangement and a slightly varied border motif. KEEP identical line-work & rendering.",
    "Alternate composition with a different focal flower; subtly shift emphasis within the SAME palette family.",
    "Mirror/rebalance the layout; swap a couple of flower types. SAME delicacy & leading thickness.",
    "Fuller, more abundant arrangement of the same-style flowers; SAME palette and technique.",
    "Slightly airier/minimal arrangement; SAME exact rendering style, leading and color mood.",
  ];

  const buildPrompt = (variation: string) => `HIGH-END ETSY ${productType.toUpperCase()} — a refined ORIGINAL VARIATION in the SAME art style as the reference.
  CONCEPT (keep): ${basePrompt}.
  STYLE LOCK (match the REFERENCE image EXACTLY — top priority):
  - Keep the SAME art style, rendering technique, line-work & leading thickness, level of delicacy, and SAME color palette/mood as the reference.
  - Do NOT switch to a different art style (e.g. do NOT turn a soft pastel watercolor stained-glass into a bold heavy-leaded Tiffany style).
  CONTENT CHANGE (moderate, to stay original & avoid copyright/report on Etsy):
  - Rearrange the composition and vary the specific flowers/elements.
  - REPHRASE any quote into FRESH wording (never verbatim) and use a DIFFERENT font.
  - Keep ONLY personalization placeholders (name/year).
  ${variation}
  ${keepNote}
  ADJUSTMENTS (user): ${userNotes || "none — keep the original style, just refine"}.
  ${materialNote}
  ${guideNote}
  OUTPUT: single centered product design, 8k high-fidelity, clean edges, NO white die-cut border, 100% PURE WHITE (#FFFFFF) background. ${ropeNote}`;

  const results: string[] = [];
  for (let i = 0; i < NUM_REDESIGNS; i++) {
    if (i > 0) await sleep(2000);
    try {
      // GIỮ reference image làm STYLE ANCHOR -> bám đúng đường nét/phong cách vẽ; nội dung đổi qua prompt.
      const img = await generateImage({
        prompt: buildPrompt(VARIATIONS[i] || VARIATIONS[0]),
        aspectRatio: "1:1",
        referenceImage,
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
// 6 bối cảnh mockup khác nhau để ra 6 ảnh đa dạng.
const MOCKUP_SCENES = [
  "hung in a bright sunlit window, daylight passing through it, cozy living room softly blurred (bokeh), colored light cast on the sill",
  "hung in a cozy bedroom window with sheer white curtains, soft morning light, warm calm mood",
  "hung in a kitchen window surrounded by potted green plants, fresh bright natural light",
  "a close-up hero product shot on a clean neutral light-gray background, soft studio lighting showing material detail",
  "hanging on a rustic wall hook next to a window, warm farmhouse interior, gentle side light",
  "hung on a glass door/porch with a green garden visible outside, airy outdoor daylight",
];

const buildMockupPrompt = (productType: string, material: string, scene: string) =>
  `Create a PHOTOREALISTIC ETSY PRODUCT MOCKUP of this exact design as a real ${productType}.
  Use the REFERENCE IMAGE as the printed artwork — keep it IDENTICAL, do not redraw or alter the design.
  Material: ${material}
  Scene: the finished product professionally ${scene}; realistic hanging cord/chain and metal loop.
  Style: premium lifestyle e-commerce photography, sharp focus on the product, magazine quality, SQUARE 1:1 framing, product centered.`;

/** Tạo 1 mockup (giữ tương thích cũ). */
export const generateProductMockup = async (designImage: string, productType: string): Promise<string> => {
  const material = PRODUCT_MATERIALS[productType] || "";
  return generateImage({ prompt: buildMockupPrompt(productType, material, MOCKUP_SCENES[0]), aspectRatio: "1:1", referenceImage: designImage });
};

/** Tạo NHIỀU mockup (mặc định 6 bối cảnh khác nhau), stream từng ảnh qua onPartial. */
export const generateProductMockups = async (
  designImage: string,
  productType: string,
  count: number = 6,
  onPartial?: (images: string[]) => void
): Promise<string[]> => {
  const material = PRODUCT_MATERIALS[productType] || "";
  const results: string[] = [];
  for (let i = 0; i < count; i++) {
    if (i > 0) await sleep(2000);
    try {
      const img = await generateImage({
        prompt: buildMockupPrompt(productType, material, MOCKUP_SCENES[i % MOCKUP_SCENES.length]),
        aspectRatio: "1:1",
        referenceImage: designImage,
      });
      results.push(img);
      onPartial?.([...results]);
    } catch (e) {
      if (results.length === 0 && i === count - 1) throw e;
    }
  }
  return results;
};

export const extractDesignElements = async (imageBase64: string): Promise<string[]> => {
  try {
    const img = await generateImage({
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
  // KHÔNG nuốt lỗi: để lỗi nổi lên cho UI báo (tránh tình trạng "bấm mà không chạy").
  const out = await generateImage({
    prompt: `Edit the reference image: ${instruction}. Keep the SAME art style, layout, colors and everything else unchanged — only apply the requested edit. Pure white background.`,
    aspectRatio: "1:1",
    referenceImage: imageBase64,
  });
  if (!out) throw new Error("Không nhận được ảnh từ engine tạo ảnh.");
  return out;
};

export const detectAndSplitCharacters = async (_imageBase64: string): Promise<string[]> => {
  return [];
};
