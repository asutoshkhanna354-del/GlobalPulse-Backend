import { Router } from "express";
import { db } from "@workspace/db";
import { alphaSignalRequestsTable, usersTable, subscriptionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../lib/authMiddleware";
import { NotificationEngine } from "../services/core/NotificationEngine";

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

    // Must be PRO
    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(1);

    if (!sub || sub.planName !== "pro") {
      return res.status(403).json({ error: "Only Pro users can request Alpha Signals." });
    }

    const [existing] = await db
      .select()
      .from(alphaSignalRequestsTable)
      .where(eq(alphaSignalRequestsTable.userId, userId))
      .limit(1);

    if (existing) {
      return res.json({ success: false, message: "Interest already submitted." });
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

// ── GET /alpha-signals/admin/requests ─────────────────────────────────────
router.get("/alpha-signals/admin/requests", requireAuth, async (req, res) => {
  try {
    const email = req.authUser!.email.toLowerCase();
    if (!founderEmails.includes(email)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const requests = await db
      .select({
        id: alphaSignalRequestsTable.id,
        status: alphaSignalRequestsTable.status,
        createdAt: alphaSignalRequestsTable.createdAt,
        userId: usersTable.id,
        username: usersTable.username,
        email: usersTable.email,
      })
      .from(alphaSignalRequestsTable)
      .innerJoin(usersTable, eq(alphaSignalRequestsTable.userId, usersTable.id))
      .orderBy(desc(alphaSignalRequestsTable.createdAt));

    res.json(requests);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch requests." });
  }
});

// ── POST /alpha-signals/admin/update ──────────────────────────────────────
router.post("/alpha-signals/admin/update", requireAuth, async (req, res) => {
  try {
    const email = req.authUser!.email.toLowerCase();
    if (!founderEmails.includes(email)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const { requestId, status } = req.body;
    if (!["approved", "rejected", "pending"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const [updated] = await db
      .update(alphaSignalRequestsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(alphaSignalRequestsTable.id, requestId))
      .returning();

    if (updated && (status === "approved" || status === "rejected")) {
      const subject = `Alpha Signals Request ${status === "approved" ? "Approved" : "Rejected"}`;
      const msg = status === "approved" 
        ? "Congratulations! Your request for GlobalPulse Alpha Signals has been approved. You can now access Alpha Signals from your trading chart."
        : "We regret to inform you that your request for GlobalPulse Alpha Signals could not be approved at this time.";
      
      await NotificationEngine.notifyUser(updated.userId, subject, msg, "SYSTEM");
    }

    res.json({ success: true, updated });
  } catch (err) {
    res.status(500).json({ error: "Failed to update request." });
  }
});

export default router;
