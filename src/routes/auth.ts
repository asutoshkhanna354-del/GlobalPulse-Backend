import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable, subscriptionsTable } from "@workspace/db";
import { eq, or, and, desc } from "drizzle-orm";
import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { requireAuth } from "../lib/authMiddleware";
import { logger } from "../lib/logger";
import { ensureUserBotSettings } from "../lib/botEngine";

const router = Router();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  try {
    const newHash = scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(hash, "hex");
    return timingSafeEqual(newHash, storedBuf);
  } catch {
    return false;
  }
}

function generateToken(): string {
  return randomBytes(32).toString("hex");
}

function sessionExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

router.post("/auth/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: "username, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: "Username must be at least 3 characters" });
    }

    const existing = await db
      .select({ id: usersTable.id, emailVerified: usersTable.emailVerified })
      .from(usersTable)
      .where(or(eq(usersTable.email, email.toLowerCase()), eq(usersTable.username, username)))
      .limit(1);

    if (existing.length > 0) {
      if (!existing[0].emailVerified) {
        // Update unverified user instead of failing
        await db.update(usersTable).set({
          passwordHash: hashPassword(password),
          username: username,
          email: email.toLowerCase()
        }).where(eq(usersTable.id, existing[0].id));

        return res.json({ success: true, user: { id: existing[0].id, username, email: email.toLowerCase() }, requireOtp: true });
      }
      return res.status(409).json({ error: "Email or username already in use" });
    }

    const [user] = await db.insert(usersTable).values({
      username,
      email: email.toLowerCase(),
      passwordHash: hashPassword(password),
    }).returning({ id: usersTable.id, username: usersTable.username, email: usersTable.email });

    const token = generateToken();
    await db.insert(userSessionsTable).values({
      userId: user.id,
      token,
      expiresAt: sessionExpiry(),
    });

    await ensureUserBotSettings(user.id).catch(() => {});

    logger.info(`[auth] New user registered: ${username} (id=${user.id})`);
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email }, requireOtp: true });
  } catch (err) {
    logger.error({ err }, "[auth] Register failed");
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.email, email.toLowerCase()), eq(usersTable.username, email)))
      .limit(1);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = generateToken();
    await db.insert(userSessionsTable).values({
      userId: user.id,
      token,
      expiresAt: sessionExpiry(),
    });

    await ensureUserBotSettings(user.id).catch(() => {});

    // Get subscription status
    const [sub] = await db
      .select()
      .from(subscriptionsTable)
      .where(and(eq(subscriptionsTable.userId, user.id), eq(subscriptionsTable.status, "active")))
      .orderBy(desc(subscriptionsTable.createdAt))
      .limit(1);

    // Check if subscription is expired
    let subscription = null;
    if (sub) {
      if (sub.endDate && new Date() > sub.endDate) {
        await db.update(subscriptionsTable).set({ status: "expired" }).where(eq(subscriptionsTable.id, sub.id));
      } else {
        subscription = { planName: sub.planName, billingCycle: sub.billingCycle, status: sub.status, endDate: sub.endDate };
      }
    }

    logger.info(`[auth] User logged in: ${user.username} (id=${user.id})`);
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email }, subscription });
  } catch (err) {
    logger.error({ err }, "[auth] Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, async (req, res) => {
  const userId = req.authUser!.id;

  // Get subscription
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(and(eq(subscriptionsTable.userId, userId), eq(subscriptionsTable.status, "active")))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  let subscription = null;
  if (sub) {
    if (sub.endDate && new Date() > sub.endDate) {
      await db.update(subscriptionsTable).set({ status: "expired" }).where(eq(subscriptionsTable.id, sub.id));
    } else {
      subscription = { planName: sub.planName, billingCycle: sub.billingCycle, status: sub.status, endDate: sub.endDate };
    }
  }

  res.json({ user: req.authUser, subscription });
});

router.post("/auth/logout", requireAuth, async (req, res) => {
  try {
    const token = req.headers.authorization!.slice(7);
    await db.delete(userSessionsTable).where(eq(userSessionsTable.token, token));
    res.json({ success: true });
  } catch {
    res.json({ success: true });
  }
});

export default router;
