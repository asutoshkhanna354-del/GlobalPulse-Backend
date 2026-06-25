import { Router, type IRouter } from "express";
import { getNiftyApiMode, setNiftyApiMode } from "../lib/openaiClient.js";

const router: IRouter = Router();

router.get("/nifty-api-mode", (req, res) => {
  res.json({ mode: getNiftyApiMode() });
});

router.post("/nifty-api-mode", (req, res) => {
  const { mode } = req.body;
  if (mode === "cerebras" || mode === "gemini") {
    setNiftyApiMode(mode);
    res.json({ success: true, mode });
  } else {
    res.status(400).json({ error: "Invalid mode" });
  }
});

router.get("/test-nifty-apis", async (req, res): Promise<void> => {
  res.json({ results: [] });
});

export default router;
