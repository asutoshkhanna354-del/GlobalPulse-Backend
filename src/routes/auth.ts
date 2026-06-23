import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable, userSessionsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
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
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(or(eq(usersTable.email, email.toLowerCase()), eq(usersTable.username, username)))
      .limit(1);

    if (existing.length > 0) {
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
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email } });
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

    logger.info(`[auth] User logged in: ${user.username} (id=${user.id})`);
    res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    logger.error({ err }, "[auth] Login failed");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, (req, res) => {
  res.json({ user: req.authUser });
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
