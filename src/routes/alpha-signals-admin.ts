import { Router } from "express";
import { db } from "@workspace/db";
import { alphaSignalRequestsTable, usersTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireAuth } from "../lib/authMiddleware";
import { NotificationEngine } from "../services/core/NotificationEngine";

const router = Router();
const founderEmails = ["divyashekhar1922@gmail.com", "divyashhekhar1922@gmail.com", "shanjha25@gmail.com"];

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
