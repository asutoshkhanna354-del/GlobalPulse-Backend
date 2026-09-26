import { Router } from "express";
import { db } from "@workspace/db";
import { alphaSignalRequestsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/authMiddleware";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────
const founderEmails = ["divyashekhar1922@gmail.com", "divyashhekhar1922@gmail.com", "shanjha25@gmail.com"];

// ── GET /alpha-signals/status ─────────────────────────────────────────────
router.get("/alpha-signals/status", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const email = req.authUser!.email.toLowerCase();

    if (founderEmails.includes(email)) {
      return res.json({ hasAccess: true, status: "approved" });
    }

    const [request] = await db
      .select()
      .from(alphaSignalRequestsTable)
      .where(eq(alphaSignalRequestsTable.userId, userId))
      .limit(1);

    if (request && request.status === "approved") {
      return res.json({ hasAccess: true, status: "approved" });
    }
    
    return res.json({ hasAccess: false, status: request?.status || "none" });
  } catch (err) {
    res.status(500).json({ error: "Failed to check status" });
  }
});

// ── POST /alpha-signals/apply ─────────────────────────────────────────────
router.post("/alpha-signals/apply", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const email = req.authUser!.email.toLowerCase();

    if (founderEmails.includes(email)) {
      return res.json({ success: true, message: "Founders already have access." });
    }

    const [existing] = await db
      .select()
      .from(alphaSignalRequestsTable)
      .where(eq(alphaSignalRequestsTable.userId, userId))
      .limit(1);

    if (existing) {
      return res.json({ success: true, message: "Interest already submitted." });
    }

    await db.insert(alphaSignalRequestsTable).values({
      userId,
      status: "pending",
    });

    res.json({ success: true, message: "Interest submitted successfully." });
  } catch (err) {
    res.status(500).json({ error: "Failed to apply." });
  }
});

export default router;
