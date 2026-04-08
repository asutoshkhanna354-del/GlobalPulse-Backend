import OpenAI from "openai";

const apiKey = process.env["OPENAI_API_KEY"];

export const openai = apiKey
  ? new OpenAI({ apiKey })
  : null;

if (!apiKey) {
  console.warn("[openai] OPENAI_API_KEY not set — AI predictions will use fallback rule-based analysis");
}
