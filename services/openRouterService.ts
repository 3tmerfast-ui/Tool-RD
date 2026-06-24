/**
 * OpenRouter — phân tích ảnh sản phẩm (vision -> JSON), thay cho Gemini.
 *
 * Dùng chuẩn OpenAI Chat Completions với model vision (mặc định gpt-4o-mini).
 * Key đọc từ import.meta.env.VITE_OPENROUTER_API_KEY.
 *
 * CẢNH BÁO: VITE_ => key bị nhúng vào bundle frontend. Chỉ dùng cho tool nội bộ.
 */

import { ProductAnalysis, DesignMode, AppTab, RetentionLevel } from "../types";

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

  const systemInstruction =
    "You are a Master Etsy Boutique Designer. Analyze product designs for high-end boutique standards. " +
    "Focus on PILLAR layout, hand-painted textures, material realism. " +
    `Product type: ${productType}. Design mode: ${designMode}. Tab: ${activeTab}. Retention target: ${retention}. ` +
    'Return ONLY a JSON object with keys: "description" (string), "designCritique" (string), ' +
    '"detectedComponents" (string[]), "redesignPrompt" (string — a detailed prompt to regenerate an improved version).';

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
    description: raw.description || "Premium boutique design.",
    designCritique: raw.designCritique || "Maintaining original logic.",
    detectedComponents: Array.isArray(raw.detectedComponents) && raw.detectedComponents.length
      ? raw.detectedComponents
      : ["Main Design"],
    redesignPrompt: raw.redesignPrompt || "Professional restoration on pure white background.",
  };
};
