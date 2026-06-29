import { Router, type IRouter } from "express";
import { getNiftyApiMode, setNiftyApiMode } from "../lib/openaiClient.js";
import { refreshNiftyComprehensive } from "../lib/niftyAnalysisRefresh.js";

const router: IRouter = Router();

router.get("/nifty-api-mode", (req, res) => {
  res.json({ mode: getNiftyApiMode() });
});

router.post("/nifty-api-mode", (req, res) => {
  const { mode } = req.body;
  if (mode === "gpt-oss" || mode === "glm" || mode === "gemini") {
    setNiftyApiMode(mode);
    res.json({ success: true, mode });
  } else {
    res.status(400).json({ error: "Invalid mode" });
  }
});

router.post("/nifty-refresh", async (req, res) => {
  const { type } = req.body;
  if (type === "comprehensive") {
    const data = await refreshNiftyComprehensive();
    res.json({ message: "Nifty comprehensive manual refresh started.", data });
  } else {
    res.status(400).json({ error: "Invalid type. Must be comprehensive." });
  }
});

router.get("/test-nifty-apis", async (req, res): Promise<void> => {
  res.json({ results: [] });
});

export default router;
