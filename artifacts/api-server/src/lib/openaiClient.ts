import OpenAI from "openai";

function makeClient(envVar: string, label: string): OpenAI | null {
  const apiKey = process.env[envVar];
  if (!apiKey) {
    console.warn(`[groq] ${envVar} not set — ${label} will use rule-based fallback`);
    return null;
  }
  return new OpenAI({ apiKey, baseURL: "https://api.groq.com/openai/v1" });
}

// ── Dedicated clients per domain ────────────────────────────────────────────
// Key 1 → Nifty analysis          (~75K tokens/day)
export const openaiNifty = makeClient("GROQ_API_KEY_NIFTY", "Nifty analysis");

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
