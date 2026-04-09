import OpenAI from "openai";

const apiKey = process.env["GROQ_API_KEY"];

export const openai = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: "https://api.groq.com/openai/v1",
    })
  : null;

if (!apiKey) {
  console.warn("[groq] GROQ_API_KEY not set — AI predictions will use fallback rule-based analysis");
}
