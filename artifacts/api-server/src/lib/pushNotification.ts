import webpush from "web-push";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger.js";

const VAPID_PUBLIC_KEY = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"];
const VAPID_CONTACT_EMAIL = process.env["VAPID_CONTACT_EMAIL"] ?? "admin@globalpulse.app";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${VAPID_CONTACT_EMAIL}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY ?? "";
}

export interface PushPayload {
  title: string;
  body: string;
  symbol: string;
  url: string;
  icon?: string;
  badge?: string;
}

export async function sendPushNotification(
  endpoint: string,
  p256dhKey: string,
  authKey: string,
  payload: PushPayload,
): Promise<boolean> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    logger.warn("VAPID keys not configured, skipping push notification");
    return false;
  }

  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh: p256dhKey, auth: authKey } },
      JSON.stringify(payload),
      { TTL: 60 * 60 },
    );
    return true;
  } catch (err: any) {
    if (err?.statusCode === 410 || err?.statusCode === 404) {
      await db
        .delete(pushSubscriptionsTable)
        .where(eq(pushSubscriptionsTable.endpoint, endpoint));
      logger.info({ endpoint }, "Removed expired push subscription");
    } else {
      logger.warn({ err: err?.message, statusCode: err?.statusCode }, "Push notification send failed");
    }
    return false;
  }
}

export async function sendSignalNotification(
  signalType: "buy" | "sell",
  symbolKey: string,
  symbolLabel: string,
  confidence: number,
  price: number,
  currency: string = "USD",
): Promise<number> {
  const subs = await db
    .select()
    .from(pushSubscriptionsTable)
    .where(eq(pushSubscriptionsTable.symbol, symbolKey));

  if (subs.length === 0) return 0;

  const sign = signalType === "buy" ? "BUY" : "SELL";
  const priceStr = currency === "INR"
    ? `₹${price.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`
    : `${price.toFixed(price >= 100 ? 2 : 4)}`;

  const payload: PushPayload = {
    title: `${sign} Signal: ${symbolLabel}`,
    body: `${confidence}% confidence at ${priceStr}`,
    symbol: symbolKey,
    url: `/?symbol=${encodeURIComponent(symbolKey)}`,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
  };

  let sent = 0;
  const now = new Date();

  for (const sub of subs) {
    const ok = await sendPushNotification(sub.endpoint, sub.p256dhKey, sub.authKey, payload);
    if (ok) {
      sent++;
      await db
        .update(pushSubscriptionsTable)
        .set({ lastNotifiedAt: now })
        .where(eq(pushSubscriptionsTable.id, sub.id));
    }
  }

  return sent;
}
