import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketDataRouter from "./market-data";
import economicRouter from "./economic";
import geopoliticalRouter from "./geopolitical";
import newsRouter from "./news";
import dashboardRouter from "./dashboard";
import watchlistRouter from "./watchlist";
import stocksRouter from "./stocks";
import socialRouter from "./social";
import ipoRouter from "./ipo";
import usdSignalRouter from "./usd-signal";
import forexCalendarRouter from "./forex-calendar";
import indicatorRouter from "./indicator";
import niftyAnalysisRouter from "./nifty-analysis";
import bitcoinAnalysisRouter from "./bitcoin-analysis";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(marketDataRouter);
router.use(economicRouter);
router.use(geopoliticalRouter);
router.use(newsRouter);
router.use(dashboardRouter);
router.use(watchlistRouter);
router.use(stocksRouter);
router.use(socialRouter);
router.use(ipoRouter);
router.use(usdSignalRouter);
router.use(forexCalendarRouter);
router.use("/indicator", indicatorRouter);
router.use(niftyAnalysisRouter);
router.use(bitcoinAnalysisRouter);
router.use("/push", pushRouter);

export default router;
