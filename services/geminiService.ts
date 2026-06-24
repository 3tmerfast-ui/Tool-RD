
import { GoogleGenAI, Type } from "@google/genai";
import { ProductAnalysis, DesignMode, RopeType, AppTab, RetentionLevel } from "../types";

const stripBase64Prefix = (base64: string) => {
  return base64.replace(/^data:image\/[a-z]+;base64,/, "").replace(/^data:[^;]+;base64,/, "");
};

export const cleanJsonString = (text: string) => {
    if (!text) return "{}";
    try {
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) return jsonMatch[0].trim();
        return text.replace(/```json\s*|\s*```/g, "").trim();
    } catch (e) {
        return "{}";
    }
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

/**
 * Hàm thực thi với cơ chế thử lại nâng cao cho API Trả phí.
 * Tăng dần thời gian chờ để tránh bị Google khóa do gửi yêu cầu quá nhanh.
 */
async function executeWithRetry<T>(operation: () => Promise<T>, retries = 5, initialDelay = 5000): Promise<T> {
    let currentDelay = initialDelay;
    for (let i = 0; i < retries; i++) {
        try {
            return await operation();
        } catch (error: any) {
            const message = (error?.message || "").toLowerCase();
            const status = error?.status || 0;
            const errorStr = JSON.stringify(error).toLowerCase();
            
            const isRateLimit = status === 429 || error?.code === 429 || 
                               message.includes('429') || 
                               message.includes('quota') ||
                               message.includes('resource_exhausted') ||
                               errorStr.includes('quota');
            
            if (isRateLimit && i < retries - 1) {
                const jitter = Math.random() * 1000;
                const waitTime = currentDelay + jitter;
                console.warn(`[Gemini Pay-as-you-go] Quota hit. Retrying in ${Math.round(waitTime/1000)}s...`);
                await sleep(waitTime);
                currentDelay *= 2; // Tăng dần thời gian chờ
                continue;
            }
            
            if (isRateLimit) {
                throw new Error("LỖI QUOTA: Ngay cả tài khoản TRẢ PHÍ cũng có hạn mức (RPM/TPM). Hãy kiểm tra 'Quotas & System Limits' trong Google Cloud Console để nâng giới hạn, hoặc thêm nhiều Key hơn vào Panel.");
            }
            throw error;
        }
    }
    throw new Error("Không thể kết nối API Gemini sau nhiều lần thử.");
}

export const cleanupProductImage = async (imageBase64: string): Promise<string> => {
  return executeWithRetry(async () => {
    const ai = getAiClient();
    const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
    
    const prompt = "CRITICAL ACTION: ISOLATE SUBJECT. Remove ALL background elements, clothes, hangers, and ropes. Keep ONLY the product graphic. Place on 100% PURE WHITE background (#FFFFFF). High-fidelity restoration.";

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: stripBase64Prefix(imageBase64) } },
          { text: prompt }
        ]
      }
    });

    const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (part && part.inlineData && part.inlineData.data) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
    return imageBase64;
  });
};

export const analyzeProductDesign = async (
    imageBase64: string, 
    productType: string,
    designMode: DesignMode,
    activeTab: AppTab = AppTab.POD,
    retention: RetentionLevel = '40%'
  ): Promise<ProductAnalysis> => {
    
    return executeWithRetry(async () => {
        const ai = getAiClient();
        const mimeMatch = imageBase64.match(/^data:([^;]+);base64,/);
        const mimeType = mimeMatch ? mimeMatch[1] : "image/png";
        
        const systemInstruction = `You are a Master Etsy Boutique Designer. Analyze designs for high-end boutique standards. PILLAR layout focus. Hand-painted textures. Material realism. Return JSON.`;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: {
                parts: [
                    { inlineData: { mimeType: mimeType, data: stripBase64Prefix(imageBase64) } },
                    { text: `Perform structural and aesthetic analysis. Return JSON with description, designCritique, detectedComponents, redesignPrompt.` }
                ]
            },
            config: { 
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        description: { type: Type.STRING },
                        designCritique: { type: Type.STRING },
                        detectedComponents: { type: Type.ARRAY, items: { type: Type.STRING } },
                        redesignPrompt: { type: Type.STRING }
                    },
                    required: ["description", "designCritique", "detectedComponents", "redesignPrompt"]
                }
            }
        });

        const rawResult = JSON.parse(cleanJsonString(response.text || "{}"));
        return { 
            description: rawResult.description || "Premium boutique design.", 
            designCritique: rawResult.designCritique || "Maintaining original logic.", 
            detectedComponents: rawResult.detectedComponents || ["Main Design"],
            redesignPrompt: rawResult.redesignPrompt || "Professional restoration."
        };
    });
};

export const generateProductRedesigns = async (
    baseAiPrompt: string,
    ropeType: RopeType,
    selectedComponents: string[],
    userAddition: string,
    productType: string,
    useUltraFlag: boolean,
    activeTab: AppTab = AppTab.POD,
    originalImage?: string,
    retention: RetentionLevel = '40%'
  ): Promise<string[]> => {
    
    return executeWithRetry(async () => {
        const ai = getAiClient();
        const finalPrompt = `ETSY BOUTIQUE DESIGN PROTOCOL. CORE: ${baseAiPrompt}. NOTES: ${userAddition}. PILLAR layout lock. 8k high-fidelity. Pure white background. Remove ropes/hangers.`;
        
        const results: string[] = [];
        for(let i=0; i<3; i++) {
            if (i > 0) await sleep(2000); 
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash-image',
                contents: { parts: [{ text: finalPrompt }] },
                config: { imageConfig: { aspectRatio: '1:1' } }
            });
            
            const part = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (part && part.inlineData && part.inlineData.data) {
                results.push(`data:image/png;base64,${part.inlineData.data}`);
            }
        }
        return results;
    });
};

export const validateToken = async (tokenInput?: string): Promise<boolean> => {
  try {
    const ai = new GoogleGenAI({ apiKey: (tokenInput || "").split(/[\n\r,;]+/)[0].trim() });
    await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: "ping" });
    return true;
  } catch (err: any) { throw err; }
};

export const extractDesignElements = async (imageBase64: string): Promise<string[]> => {
  const ai = getAiClient();
  const mimeType = imageBase64.match(/^data:([^;]+);base64,/)?.[1] || "image/png";
  const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
          parts: [
              { inlineData: { mimeType, data: stripBase64Prefix(imageBase64) } },
              { text: "Isolate subject on pure white. Maintain colors." }
          ]
      }
  });
  const data = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
  return data ? [`data:image/png;base64,${data}`] : [];
};

export const remixProductImage = async (imageBase64: string, instruction: string): Promise<string> => { return ""; };
