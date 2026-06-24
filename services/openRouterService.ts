/**
 * OpenRouter — phân tích ảnh sản phẩm (vision -> JSON), thay cho Gemini.
 *
 * Dùng chuẩn OpenAI Chat Completions với model vision (mặc định gpt-4o-mini).
 * Key đọc từ import.meta.env.VITE_OPENROUTER_API_KEY.
 *
 * CẢNH BÁO: VITE_ => key bị nhúng vào bundle frontend. Chỉ dùng cho tool nội bộ.
 */

import { ProductAnalysis, DesignMode, AppTab, RetentionLevel, PRODUCT_MATERIALS, PRODUCT_TYPES } from "../types";
import { ETSY_DESIGN_PRINCIPLES, getDesignGuide } from "./productKnowledge";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "google/gemini-2.5-flash"; // vision mạnh, rẻ ($0.30/$2.50 per 1M)
const getKey = () => ((import.meta as any).env?.VITE_OPENROUTER_API_KEY as string | undefined) || "";

export const cleanJsonString = (text: string) => {
  if (!text) return "{}";
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0].trim();
    return text.replace(/```json\s*|\s*```/g, "").trim();
  } catch {
    return "{}";
  }
};

const ensureDataUrl = (imageBase64: string) =>
  imageBase64.startsWith("data:") ? imageBase64 : `data:image/png;base64,${imageBase64}`;

/**
 * Phân tích cấu trúc & thẩm mỹ thiết kế, trả về ProductAnalysis.
 * Chữ ký giữ giống hàm Gemini cũ để App.tsx không phải đổi.
 */
export const analyzeProductDesign = async (
  imageBase64: string,
  productType: string,
  designMode: DesignMode,
  activeTab: AppTab = AppTab.POD,
  retention: RetentionLevel = "40%"
): Promise<ProductAnalysis> => {
  const apiKey = getKey();
  if (!apiKey) throw new Error("Chưa cấu hình VITE_OPENROUTER_API_KEY trong môi trường.");

  const material = PRODUCT_MATERIALS[productType] || "";
  const guide = getDesignGuide(productType);

  const systemInstruction =
    "You are a Master Etsy POD Designer for the US market, specialized in suncatcher & ornament products.\n" +
    "Work in this STRICT ORDER (think step by step, then output JSON):\n" +
    "STEP 1 — UNDERSTAND THE DESIGN: First fully grasp WHAT this design is. Identify the exact main subject, the core THEME/concept (its design DNA), the art style, layout, and any personalization (names/dates/quotes).\n" +
    "STEP 2 — UNDERSTAND THE MATERIAL: Identify the physical MATERIAL & construction from the image (e.g. translucent stained glass, clear acrylic, opaque glazed ceramic, matte wood, layered wood). Pick the closest product type from this exact list:\n" +
    `[${PRODUCT_TYPES.filter(t => t !== PRODUCT_TYPES[0]).join(" | ")}]\n` +
    (productType && productType !== PRODUCT_TYPES[0] ? `(The user selected "${productType}" — prefer it unless the image clearly shows a different material.)\n` : "") +
    "STEP 3 — REDESIGN: ONLY after understanding the design AND material, write a redesign prompt that PRESERVES the exact core theme & subject AND renders it in the CORRECT material (right transparency/finish/edges/light behavior), elevated to top-seller Etsy quality (a refined variation — NOT a copy, NOT a different concept).\n" +
    (material ? `MATERIAL & SPECS (selected type): ${material}\n` : "") +
    (guide ? `DESIGN GUIDE (selected type): ${guide}\n` : "") +
    `MARKET PRINCIPLES: ${ETSY_DESIGN_PRINCIPLES}\n` +
    `Design mode: ${designMode}. Retention target: ${retention}.\n` +
    'Return ONLY a JSON object with keys (in this order): ' +
    '"coreTheme" (1 sentence: WHAT this design is — exact main subject + theme + art style), ' +
    '"detectedProductType" (EXACTLY one value from the list above that best matches the material seen), ' +
    '"detectedMaterial" (1 sentence: the physical material/construction + how light/finish behaves), ' +
    '"description" (1-2 sentences expanding on the depiction), ' +
    '"detectedComponents" (string[]: 3-7 concrete elements that define this design and must be preserved), ' +
    '"designCritique" (concrete Etsy redesign strategy grounded in the coreTheme AND material), ' +
    '"redesignPrompt" (ONE rich English image-gen prompt that MUST begin by restating the coreTheme/subject, render it in the detected MATERIAL with correct realism, keep the same composition & subject, and end with: "8k high-fidelity, professional commercial design, clean edges, no white die-cut border, 100% pure white (#FFFFFF) background").';

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.4,
      messages: [
        { role: "system", content: systemInstruction },
        {
          role: "user",
          content: [
            { type: "text", text: "Perform structural and aesthetic analysis. Return the JSON object as specified." },
            { type: "image_url", image_url: { url: ensureDataUrl(imageBase64) } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = JSON.parse(cleanJsonString(json.choices?.[0]?.message?.content || "{}"));

  return {
    coreTheme: raw.coreTheme || "",
    detectedProductType: raw.detectedProductType || "",
    detectedMaterial: raw.detectedMaterial || "",
    description: raw.description || "Premium boutique design.",
    designCritique: raw.designCritique || "Maintaining original logic.",
    detectedComponents: Array.isArray(raw.detectedComponents) && raw.detectedComponents.length
      ? raw.detectedComponents
      : ["Main Design"],
    redesignPrompt: raw.redesignPrompt || "Professional restoration on pure white background.",
  };
};
