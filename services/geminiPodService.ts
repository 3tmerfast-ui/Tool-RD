
import { GoogleGenAI } from "@google/genai";
import { ProductAnalysis, DesignMode, RopeType, PRODUCT_MATERIALS } from "../types";

const prepareImagePart = (imageBase64: string) => {
  const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
  const data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "").replace(/^data:[^;]+;base64,/, "");
  return { inlineData: { mimeType, data } };
};

export const cleanJsonString = (text: string) => {
    if (!text) return "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0].trim();
    return text.replace(/```json\s*|\s*```/g, "").trim();
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const getAiClient = () => {
  const localKey = localStorage.getItem('app_system_key') || "";
  const envKey = process.env.API_KEY || "";
  
  const allKeys = `${localKey}\n${envKey}`
    .split(/[\n\r,;]+/)
    .map(k => k.trim())
    .filter(k => k.length > 10);

  const randomKey = allKeys.length > 0 ? allKeys[Math.floor(Math.random() * allKeys.length)] : "";
  return new GoogleGenAI({ apiKey: randomKey });
};

async function executeWithRetry<T>(operation: () => Promise<T>, retries = 6, initialDelay = 8000): Promise<T> {
    let currentDelay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            const message = (error?.message || "").toLowerCase();
            const errorStr = JSON.stringify(error).toLowerCase();
            
            const isRateLimit = error?.status === 429 || error?.code === 429 || 
                               message.includes('429') || 
                               message.includes('quota') ||
                               message.includes('resource_exhausted') ||
                               message.includes('limit exceeded') ||
                               errorStr.includes('429') || 
                               errorStr.includes('quota');
            
            if (isRateLimit && i < retries - 1) {
                const jitter = Math.random() * 2000;
                const waitTime = currentDelay + jitter;
                
                console.warn(`[Gemini API POD] Quota Exceeded. Retrying in ${Math.round(waitTime)}ms... (Attempt ${i + 1}/${retries})`);
                await sleep(waitTime);
                currentDelay *= 3;
                continue;
            }
            
            if (isRateLimit) {
                throw new Error("Hệ thống (POD) báo hết lượt sử dụng (Quota Exceeded). Vui lòng thêm thêm API Key trong Panel để duy trì hoạt động.");
            }
            throw error;
        }
    }
    throw new Error("Không thể kết nối API Gemini sau nhiều lần thử lại.");
}

export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  return executeWithRetry(async () => {
      const ai = getAiClient();
      const imagePart = prepareImagePart(imageBase64);
      const prompt = "TASK: SUBJECT ISOLATION. Remove all ropes, wires, hangers, and backgrounds. Keep the original hand-drawn line character. Place on 100% PURE WHITE background.";
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, { text: prompt }] }
      });
      for (const part of response.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData && part.inlineData.data) return `data:image/png;base64,${part.inlineData.data}`;
      }
      return imageBase64;
  });
};

export const analyzeProductDesign = async (
    imageBase64: string, 
    productType: string,
    designMode: DesignMode
  ): Promise<ProductAnalysis> => {
    return executeWithRetry(async () => {
        const ai = getAiClient();
        const imagePart = prepareImagePart(imageBase64);
        const prompt = `Act as an Etsy Boutique Master Designer. Analyze this design for restoration. Identify the 'Premium Handcrafted Soul': variable line weights, hand-painted textures, and strict PILLAR layout hierarchy. Return JSON: description, designCritique (strategy to keep PILLAR layout lock and boutique aesthetic), detectedComponents, redesignPrompt (restoration instructions with high-end commercial constraints).`;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: { parts: [imagePart, { text: prompt }] },
                config: { responseMimeType: "application/json" }
            });
            const rawResult = JSON.parse(cleanJsonString(response.text || "{}"));
            return {
                description: rawResult.description || "Premium handcrafted boutique illustration DNA.",
                designCritique: rawResult.designCritique || "Preserving PILLAR layout and high-end material textures for commercial standards.",
                detectedComponents: rawResult.detectedComponents || ["Main Artwork"],
                redesignPrompt: rawResult.redesignPrompt || "Professional restoration with hand-painted quality and structural lock."
            };
        } catch (e) {
            return {
                description: "Thiết kế gốc có phong cách vẽ tay chuyên nghiệp.",
                designCritique: "Hệ thống sẽ khóa bố cục PILLAR (trụ) và phục chế trung thực các nét vẽ thanh đậm cùng texture sáp màu cao cấp.",
                detectedComponents: ["Main Subject"],
                redesignPrompt: "Etsy Boutique Restoration. STRICT PILLAR LAYOUT LOCK. Maintain original object hierarchy. Use tapered line weights and organic hand-drawn jitter. Simulate realistic crayon/marker textures. Pure white background."
            };
        }
    });
};

export const generateProductRedesigns = async (
    basePrompt: string,
    ropeType: RopeType,
    selectedComponents: string[],
    userNotes: string,
    productType: string
  ): Promise<string[]> => {
    const ai = getAiClient();
    let finalPrompt = `ETSY BOUTIQUE DESIGN ENGINE - PROTOCOL "PREMIUM PILLAR":
    CORE CONCEPT: ${basePrompt}. 
    ADJUSTMENTS: ${userNotes || 'Enhance while strictly maintaining original layout and hand-drawn spirit'}.
    
    STRICT REQUIREMENTS:
    - PILLAR LAYOUT LOCK: Keep the exact vertical/horizontal arrangement. Do not rearrange or misinterpret objects.
    - OBJECT LOGIC: Realistic fabric folds in bows, recognizable crayon wrappers and tips.
    - RETRO GROOVY VIBES: Use soft rounded bubble typography and playful organic shapes.
    - TEXTURE: Simulate crayon wax interaction with paper grain. Seamless leopard pattern integration with ink-bleed effects.
    - FINISH: 8k High-fidelity restoration. NO white die-cut border. Subtle vintage distressing.
    - BACKGROUND: 100% PURE WHITE (#FFFFFF). 
    - NO CLUTTER: Zero ropes, zero hangers. Only isolated artwork.`;

    const results: string[] = [];
    for(let i=0; i<3; i++) {
        if (i > 0) await sleep(5000); 
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: finalPrompt }] },
                config: { imageConfig: { aspectRatio: '1:1' } }
            });
            const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            if (data) results.push(`data:image/png;base64,${data}`);
        } catch (e) {}
    }
    return results;
};

export const extractDesignElements = async (imageBase64: string): Promise<string[]> => {
    const ai = getAiClient();
    const imagePart = prepareImagePart(imageBase64);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, { text: "Isolate main subject on pure white. Maintain colors and organic handcrafted textures." }] }
    });
    const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    return data ? [`data:image/png;base64,${data}`] : [];
};

export const remixProductImage = async (imageBase64: string, instruction: string): Promise<string> => {
    const ai = getAiClient();
    const imagePart = prepareImagePart(imageBase64);
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, { text: `Modify: ${instruction}. Keep original PILLAR layout, hand-painted textures and colors. White background.` }] }
    });
    const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
    return data ? `data:image/png;base64,${data}` : imageBase64;
};

export const detectAndSplitCharacters = async (imageBase64: string): Promise<string[]> => { return []; };
