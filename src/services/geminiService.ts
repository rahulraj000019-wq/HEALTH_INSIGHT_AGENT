import { GoogleGenAI, Type } from "@google/genai";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

export async function analyzeBloodReport(text: string) {
  const ai = getAI();
  const prompt = `Analyze the following blood test report text and provide a simplified explanation for a non-medical user.
  Extract the key parameters, their values, units, reference ranges, and determine if they are normal, abnormal, or concerning.
  Provide a brief, simple explanation for each parameter.
  Finally, provide a summary and general lifestyle recommendations (with a strong disclaimer that this is NOT a medical diagnosis and the user MUST consult a doctor).

  REPORT TEXT:
  ${text}`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        required: ["summary", "parameters", "recommendations", "disclaimer"],
        properties: {
          summary: { type: Type.STRING },
          parameters: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              required: ["name", "value", "unit", "range", "status", "explanation"],
              properties: {
                name: { type: Type.STRING },
                value: { type: Type.STRING },
                unit: { type: Type.STRING },
                range: { type: Type.STRING },
                status: { 
                  type: Type.STRING, 
                  enum: ["normal", "abnormal", "concerning", "unknown"] 
                },
                explanation: { type: Type.STRING }
              }
            }
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          disclaimer: { type: Type.STRING }
        }
      }
    }
  });

  const resultText = response.text || "";
  // Clean potential markdown formatting if Gemini didn't respect application/json fully
  const cleanedText = resultText.replace(/^```json/, '').replace(/```$/, '').trim();
  
  if (!cleanedText) {
    throw new Error('The AI returned an empty response.');
  }

  try {
    return JSON.parse(cleanedText);
  } catch (err) {
    console.error('Failed to parse Gemini JSON:', cleanedText);
    throw new Error('The AI response was not in a valid format. Please try again.');
  }
}
