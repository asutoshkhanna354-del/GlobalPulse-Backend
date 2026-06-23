import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { userSessionsTable, usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      authUser?: { id: number; username: string; email: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const token = header.slice(7);
  try {
    const now = new Date();
    const [session] = await db
      .select({ userId: userSessionsTable.userId })
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.token, token), gt(userSessionsTable.expiresAt, now)))
      .limit(1);

    if (!session) return res.status(401).json({ error: "Session expired or invalid" });

    const [user] = await db
      .select({ id: usersTable.id, username: usersTable.username, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.id, session.userId))
      .limit(1);

    if (!user) return res.status(401).json({ error: "User not found" });

    req.userId = user.id;
    req.authUser = user;
    next();
  } catch {
    return res.status(401).json({ error: "Auth check failed" });
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  const token = header.slice(7);
  try {
    const now = new Date();
    const [session] = await db
      .select({ userId: userSessionsTable.userId })
      .from(userSessionsTable)
      .where(and(eq(userSessionsTable.token, token), gt(userSessionsTable.expiresAt, now)))
      .limit(1);
    if (session) {
      req.userId = session.userId;
    }
  } catch {}
  next();
}
