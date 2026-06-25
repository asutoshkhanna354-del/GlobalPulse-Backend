import { Router } from "express";
import { db } from "@workspace/db";
import { subscriptionsTable, paymentsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { createHmac } from "crypto";
import { requireAuth } from "../lib/authMiddleware";
import { logger } from "../lib/logger";

const router = Router();

const RZP_KEY = process.env.RZP_KEY || "";
const RZP_SECRET = process.env.RZP_SECRET || "";

// Plan pricing in paise (INR)
const PLAN_PRICING: Record<string, Record<string, { amount: number; label: string }>> = {
  plus: {
    monthly: { amount: 99900, label: "Plus Monthly" },   // ₹999
    yearly:  { amount: 999900, label: "Plus Yearly" },    // ₹9,999
  },
  pro: {
    monthly: { amount: 199900, label: "Pro Monthly" },        // ₹1,999
    yearly:  { amount: 1999900, label: "Pro Yearly" },        // ₹19,999
  },
};

function getEndDate(billingCycle: string): Date {
  const d = new Date();
  if (billingCycle === "yearly") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}

// ── Check & expire subscriptions ─────────────────────────────────────────
async function checkExpiry(userId: number) {
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  if (sub && sub.endDate && new Date() > sub.endDate) {
    await db
      .update(subscriptionsTable)
      .set({ status: "expired" })
      .where(eq(subscriptionsTable.id, sub.id));
    logger.info(`[sub] Subscription ${sub.id} expired for user ${userId}`);
    return null;
  }
  return sub || null;
}

// ── GET /subscription/status ─────────────────────────────────────────────
router.get("/subscription/status", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const sub = await checkExpiry(userId);

    if (!sub) {
      return res.json({ subscription: null });
    }

    res.json({
      subscription: {
        id: sub.id,
        planName: sub.planName,
        billingCycle: sub.billingCycle,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
      },
    });
  } catch (err) {
    logger.error({ err }, "[sub] Status check failed");
    res.status(500).json({ error: "Failed to check subscription status" });
  }
});

// ── POST /subscription/activate-free ─────────────────────────────────────
router.post("/subscription/activate-free", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;

    // Check if already has active subscription
    const existing = await checkExpiry(userId);
    if (existing) {
      return res.json({ success: true, subscription: existing });
    }

    const [sub] = await db.insert(subscriptionsTable).values({
      userId,
      planName: "free",
      billingCycle: null,
      status: "active",
      amount: 0,
      endDate: null, // free plan never expires
    }).returning();

    logger.info(`[sub] Free plan activated for user ${userId}`);
    res.json({ success: true, subscription: sub });
  } catch (err) {
    logger.error({ err }, "[sub] Activate free failed");
    res.status(500).json({ error: "Failed to activate free plan" });
  }
});

// ── POST /subscription/create-order ──────────────────────────────────────
router.post("/subscription/create-order", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const { planName, billingCycle } = req.body;

    if (!planName || !billingCycle) {
      return res.status(400).json({ error: "planName and billingCycle are required" });
    }

    const pricing = PLAN_PRICING[planName]?.[billingCycle];
    if (!pricing) {
      return res.status(400).json({ error: "Invalid plan or billing cycle" });
    }

    if (!RZP_KEY || !RZP_SECRET) {
      return res.status(500).json({ error: "Payment gateway not configured" });
    }

    // Create Razorpay order
    const auth = Buffer.from(`${RZP_KEY}:${RZP_SECRET}`).toString("base64");
    const rzpRes = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: pricing.amount,
        currency: "INR",
        receipt: `gp_${userId}_${Date.now()}`,
        notes: {
          userId: userId.toString(),
          planName,
          billingCycle,
        },
      }),
    });

    if (!rzpRes.ok) {
      const errBody = await rzpRes.text();
      logger.error(`[sub] Razorpay order create failed: ${rzpRes.status} ${errBody}`);
      return res.status(500).json({ error: "Failed to create payment order" });
    }

    const order = await rzpRes.json() as { id: string; amount: number; currency: string };

    // Store payment record
    await db.insert(paymentsTable).values({
      userId,
      razorpayOrderId: order.id,
      amount: pricing.amount,
      currency: "INR",
      status: "created",
    });

    logger.info(`[sub] Order created: ${order.id} for user ${userId}, plan ${planName} ${billingCycle}`);
    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
      },
      rzpKey: RZP_KEY,
      planLabel: pricing.label,
    });
  } catch (err) {
    logger.error({ err }, "[sub] Create order failed");
    res.status(500).json({ error: "Failed to create order" });
  }
});

// ── POST /subscription/verify-payment ────────────────────────────────────
router.post("/subscription/verify-payment", requireAuth, async (req, res) => {
  try {
    const userId = req.authUser!.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planName, billingCycle } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details" });
    }

    // Verify signature
    const expectedSig = createHmac("sha256", RZP_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSig !== razorpay_signature) {
      logger.warn(`[sub] Invalid payment signature for order ${razorpay_order_id}`);
      return res.status(400).json({ error: "Invalid payment signature" });
    }

    // Update payment record
    await db
      .update(paymentsTable)
      .set({
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        status: "captured",
      })
      .where(eq(paymentsTable.razorpayOrderId, razorpay_order_id));

    // Expire any old active subscriptions
    await db
      .update(subscriptionsTable)
      .set({ status: "expired" })
      .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")));

    // Get pricing for amount
    const pricing = PLAN_PRICING[planName]?.[billingCycle];

    // Create new subscription
    const [sub] = await db.insert(subscriptionsTable).values({
      userId,
      planName,
      billingCycle,
      status: "active",
      amount: pricing?.amount ?? 0,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      startDate: new Date(),
      endDate: getEndDate(billingCycle),
    }).returning();

    logger.info(`[sub] Payment verified & subscription activated: ${sub.id} for user ${userId}`);
    res.json({
      success: true,
      subscription: {
        id: sub.id,
        planName: sub.planName,
        billingCycle: sub.billingCycle,
        status: sub.status,
        startDate: sub.startDate,
        endDate: sub.endDate,
      },
    });
  } catch (err) {
    logger.error({ err }, "[sub] Verify payment failed");
    res.status(500).json({ error: "Payment verification failed" });
  }
});

export default router;
