import OpenAI from "openai";
import { GoogleGenAI } from "@google/genai";
import Cerebras from '@cerebras/cerebras_cloud_sdk';

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
export type NiftyApiMode = "gpt-oss" | "glm" | "gemini";
export let niftyApiMode: NiftyApiMode = "gpt-oss";

export function setNiftyApiMode(mode: NiftyApiMode) {
  niftyApiMode = mode;
  console.log(`[nifty] API Mode switched to ${mode}`);
}

export function getNiftyApiMode(): NiftyApiMode {
  return niftyApiMode;
}

const cerebrasNiftyKey = process.env.CEREBRAS_API_KEY;
const cerebrasClient = cerebrasNiftyKey ? new Cerebras({ apiKey: cerebrasNiftyKey }) : null;

const geminiNiftyKey = process.env.GEMINI_API_KEY_NIFTY;
const geminiClient = geminiNiftyKey ? new GoogleGenAI({ apiKey: geminiNiftyKey }) : null;

export const openaiNifty = (cerebrasClient || geminiClient) ? {
  chat: {
    completions: {
      create: async (params: any) => {
        let lastErr: any;
        // 1. Try Cerebras for gpt-oss or glm
        if ((niftyApiMode === "gpt-oss" || niftyApiMode === "glm") && cerebrasClient) {
          try {
            const modelName = niftyApiMode === "gpt-oss" ? "gpt-oss-120b" : "zai-glm-4.7";
            const cerebrasParams = { ...params, model: modelName };
            const res = await cerebrasClient.chat.completions.create(cerebrasParams as any);
            if (res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content) {
              return res;
            }
            throw new Error(`Cerebras (${modelName}) returned empty content or invalid format`);
          } catch (err: any) {
            lastErr = err;
            console.warn(`[cerebras] Failed: ${err.message}. Falling back to Gemini...`);
            setNiftyApiMode("gemini");
            // Fall through to the gemini block below
          }
        }
        
        // 2. Try Gemini if mode is gemini (or if fell back from cerebras)
        if (niftyApiMode === "gemini" && geminiClient) {
          console.warn(`[gemini] Using Gemini API for Nifty Analysis...`);
          try {
            const sysMsg = params.messages?.find((m: any) => m.role === "system")?.content || "";
            const userMsg = params.messages?.find((m: any) => m.role === "user")?.content || "";
            const combinedPrompt = `${sysMsg}\n\n${userMsg}`;
            
            const response = await geminiClient.models.generateContent({
              model: "gemini-3.5-pro", 
              contents: combinedPrompt
            });
            
            const text = response.text || "";

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

        throw lastErr || new Error("No Nifty API configured");
      }
    }
  }
} as unknown as OpenAI : null;

// Key 4 → USD signal + AI Signals (~55K tokens/day)
export const openaiUsd     = makeClient("GROQ_API_KEY_USD", "USD signal");
export const openaiSignals = makeClient("GROQ_API_KEY_USD", "AI Signals");

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
