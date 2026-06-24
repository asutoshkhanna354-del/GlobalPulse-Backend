import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { niftyKeys } from "../lib/openaiClient.js";

const router: IRouter = Router();

router.get("/test-nifty-apis", async (req, res): Promise<void> => {
  const results = [];
  
  if (niftyKeys.length === 0) {
    res.json({ error: "No Nifty API keys configured." });
    return;
  }

  for (let i = 0; i < niftyKeys.length; i++) {
    const key = niftyKeys[i];
    const client = new OpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1" });
    
    try {
      // Send a demo question
      const completion = await client.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Say 'OK' if you can read this." }],
        max_tokens: 5,
        temperature: 0.1,
      });
      
      const text = completion.choices[0]?.message?.content?.trim() || "No response";
      results.push({ keyIndex: i + 1, status: "OK", response: text });
    } catch (err: any) {
      results.push({ keyIndex: i + 1, status: "Failed", error: err.message, code: err.status });
    }
  }

  res.json({ results });
});

export default router;
