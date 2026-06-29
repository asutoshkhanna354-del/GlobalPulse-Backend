import { Router, type IRouter } from "express";
import { getNiftyApiMode, setNiftyApiMode } from "../lib/openaiClient.js";
import { refreshNiftyComprehensive, refreshNiftyCandle30m } from "../lib/niftyAnalysisRefresh.js";

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

router.post("/nifty-refresh", async (req, res) => {
  try {
    const comp = await refreshNiftyComprehensive();
    const candle = await refreshNiftyCandle30m();
    res.json({ success: true, comp, candle });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get("/test-nifty-apis", async (req, res): Promise<void> => {
  res.json({ results: [] });
});

export default router;
