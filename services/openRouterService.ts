/**
 * OpenRouter — phân tích ảnh sản phẩm (vision -> JSON), thay cho Gemini.
 *
 * Dùng chuẩn OpenAI Chat Completions với model vision (mặc định gpt-4o-mini).
 * Key đọc từ import.meta.env.VITE_OPENROUTER_API_KEY.
 *
 * CẢNH BÁO: VITE_ => key bị nhúng vào bundle frontend. Chỉ dùng cho tool nội bộ.
 */

import { ProductAnalysis, DesignMode, AppTab, RetentionLevel, PRODUCT_MATERIALS } from "../types";
import { ETSY_DESIGN_PRINCIPLES, getDesignGuide } from "./productKnowledge";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openai/gpt-4o-mini"; // vision-capable, rẻ
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
    "STEP 1 — UNDERSTAND: First fully grasp WHAT this design is. Identify the exact main subject, the core THEME/concept (its design DNA), the art style, layout, and any personalization (names/dates/quotes). Do not propose changes yet.\n" +
    "STEP 2 — REDESIGN: ONLY after understanding, write a redesign prompt that PRESERVES that exact core theme & subject and elevates it to top-seller Etsy quality (a refined variation — NOT a copy, NOT a different concept).\n" +
    `PRODUCT TYPE: ${productType}.\n` +
    (material ? `MATERIAL & SPECS: ${material}\n` : "") +
    (guide ? `DESIGN GUIDE: ${guide}\n` : "") +
    `MARKET PRINCIPLES: ${ETSY_DESIGN_PRINCIPLES}\n` +
    `Design mode: ${designMode}. Retention target: ${retention}.\n` +
    'Return ONLY a JSON object with keys (in this order): ' +
    '"coreTheme" (1 sentence: WHAT this design is — exact main subject + theme + art style, e.g. "A crescent-moon stained-glass suncatcher with a sitting dog silhouette over an aurora landscape, personalized with a name"), ' +
    '"description" (1-2 sentences expanding on the depiction), ' +
    '"detectedComponents" (string[]: 3-7 concrete elements that define this design and must be preserved), ' +
    '"designCritique" (concrete Etsy redesign strategy grounded in the coreTheme: what to keep, what to elevate — composition, color, linework, personalization, material realism), ' +
    '"redesignPrompt" (ONE rich English image-gen prompt that MUST begin by restating the coreTheme/subject explicitly, keep the same composition & subject, encode the material realism + niche conventions above, and end with: "8k high-fidelity, professional commercial design, clean edges, no white die-cut border, 100% pure white (#FFFFFF) background").';

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
    description: raw.description || "Premium boutique design.",
    designCritique: raw.designCritique || "Maintaining original logic.",
    detectedComponents: Array.isArray(raw.detectedComponents) && raw.detectedComponents.length
      ? raw.detectedComponents
      : ["Main Design"],
    redesignPrompt: raw.redesignPrompt || "Professional restoration on pure white background.",
  };
};
