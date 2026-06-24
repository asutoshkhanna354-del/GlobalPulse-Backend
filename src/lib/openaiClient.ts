import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";

function makeClient(envVar: string, label: string): OpenAI | null {
  const apiKey = process.env[envVar];
  if (!apiKey) {
    console.warn(`[groq] ${envVar} not set — ${label} will use rule-based fallback`);
    return null;
  }
  return new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
}

// ── Dedicated clients per domain ────────────────────────────────────────────
// ── Dedicated clients per domain ────────────────────────────────────────────
// Nifty analysis keys (fallback support)
export const niftyKeys = [
  process.env.GROQ_API_KEY_NIFTY,
  process.env.GROQ_API_KEY_NIFTY_2,
  process.env.GROQ_API_KEY_NIFTY_3,
  process.env.GROQ_API_KEY_NIFTY_4,
].filter(Boolean) as string[];

const niftyClients = niftyKeys.map(k => new OpenAI({ apiKey: k, baseURL: "https://api.groq.com/openai/v1" }));

const geminiNiftyKey = process.env.GEMINI_API_KEY_NIFTY;
const geminiClient = geminiNiftyKey ? new GoogleGenAI({ apiKey: geminiNiftyKey }) : null;

export const openaiNifty = (niftyClients.length > 0 || geminiClient) ? {
  chat: {
    completions: {
      create: async (params: any) => {
        let lastErr: any;
        for (let i = 0; i < niftyClients.length; i++) {
          try {
            return await niftyClients[i].chat.completions.create(params);
          } catch (err: any) {
            lastErr = err;
            if (err?.status === 429) {
              console.warn(`[groq] Nifty API Key ${i + 1} Limit Reached, falling back to next key if available...`);
              continue;
            }
            throw err;
          }
        }
        
        if (geminiClient) {
          console.warn(`[gemini] Falling back to Gemini API for Nifty Analysis...`);
          try {
            const sysMsg = params.messages?.find((m: any) => m.role === "system")?.content || "";
            const userMsg = params.messages?.find((m: any) => m.role === "user")?.content || "";
            const combinedPrompt = `${sysMsg}\n\n${userMsg}`;
            
            const response = await geminiClient.interactions.create({
              model: "gemini-3.5-flash",
              input: combinedPrompt
            });
            
            let text = "";
            response.steps?.forEach((step: any) => {
               if (step.modelOutput?.content) {
                  step.modelOutput.content.forEach((c: any) => {
                     if (c.text?.text) text += c.text.text;
                  });
               }
            });

            return {
              choices: [{
                message: { content: text }
              }]
            };
          } catch (err: any) {
            lastErr = err;
            throw err;
          }
        }

        throw lastErr;
      }
    }
  }
} as unknown as OpenAI : null;

// Key 4 → USD signal + AI Signals (~55K tokens/day)
export const openaiUsd     = makeClient("GROQ_API_KEY_USD", "USD signal");
export const openaiSignals = makeClient("GROQ_API_KEY_USD", "AI Signals") ?? makeClient("GROQ_API_KEY_NIFTY", "AI Signals fallback");

// Keys 2 + 3 → BTC round-robin, alternating every call (~66K each/day)
const btcClientA = makeClient("GROQ_API_KEY_BTC",  "BTC primary");
const btcClientB = makeClient("GROQ_API_KEY_BTC2", "BTC secondary");

let _btcCounter = 0;
export function getOpenAiBtc(): OpenAI | null {
  if (btcClientA && btcClientB) {
    _btcCounter++;
    return _btcCounter % 2 === 0 ? btcClientA : btcClientB;
  }
  return btcClientA ?? btcClientB ?? openaiNifty ?? openaiUsd ?? null;
}

// ── Legacy export (fallback for any unported call) ───────────────────────────
export const openai =
  makeClient("GROQ_API_KEY", "legacy") ??
  openaiNifty ??
  openaiUsd ??
  btcClientA ??
  null;

if (!openaiNifty && !openaiUsd && !btcClientA && !btcClientB) {
  console.warn("[groq] No Groq API keys configured — all AI analysis will use rule-based fallback");
}
