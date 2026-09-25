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

export type BtcApiMode = "round-robin" | "clientA" | "clientB" | "nifty" | "usd";
export let btcApiMode: BtcApiMode = "round-robin";

export function setBtcApiMode(mode: BtcApiMode) {
  btcApiMode = mode;
  console.log(`[btc] API Mode switched to ${mode}`);
}

export function getBtcApiMode(): BtcApiMode {
  return btcApiMode;
}

let _btcCounter = 0;
export function getOpenAiBtc(): OpenAI | null {
  if (btcApiMode === "clientA") return btcClientA;
  if (btcApiMode === "clientB") return btcClientB;
  if (btcApiMode === "nifty") return openaiNifty as any;
  if (btcApiMode === "usd") return openaiUsd;

  if (btcClientA && btcClientB) {
    _btcCounter++;
    return _btcCounter % 2 === 0 ? btcClientA : btcClientB;
  }
  return btcClientA ?? btcClientB ?? (openaiNifty as any) ?? openaiUsd ?? null;
}

export async function testBtcModels(): Promise<{ results: Record<string, string>, active: string }> {
  const clients = [
    { id: "clientA", client: btcClientA, model: "llama-3.3-70b-versatile" },
    { id: "clientB", client: btcClientB, model: "llama-3.3-70b-versatile" },
    { id: "usd", client: openaiUsd, model: "llama-3.3-70b-versatile" },
    { id: "nifty", client: openaiNifty as any, model: "N/A" }
  ];

  const results: Record<string, string> = {};
  let workingId = "";

  for (const c of clients) {
    if (!c.client) {
      results[c.id] = "Skipped (not configured)";
      continue;
    }
    try {
      await c.client.chat.completions.create({
        model: c.model,
        messages: [{ role: "user", content: "Test ping" }],
        max_tokens: 5
      });
      results[c.id] = "OK";
      if (!workingId) workingId = c.id;
    } catch (err: any) {
      results[c.id] = `Failed: ${err.message}`;
    }
  }

  if (workingId) {
    setBtcApiMode(workingId as BtcApiMode);
  } else {
    setBtcApiMode("round-robin");
  }

  return { results, active: getBtcApiMode() };
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
