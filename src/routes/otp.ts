import { Router } from "express";
import { db } from "@workspace/db";
import { otpVerificationsTable, usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { randomInt } from "crypto";
import { logger } from "../lib/logger";
import { buildOtpEmailHtml } from "../lib/otpTemplate";

const router = Router();

const BREVO_API_KEY = process.env.BREVO_API_KEY || "";

function generateOTP(): string {
  return randomInt(100000, 999999).toString();
}

function otpExpiry(): Date {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 10); // 10 min expiry
  return d;
}

function buildOtpTextContent(otp: string): string {
  return `GlobalPulse Verification\n\nYour verification code is: ${otp}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this code, you can safely ignore this email.`;
}

const BREVO_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL || "noreply@globalpulse.app";
const BREVO_SENDER_NAME = process.env.BREVO_SENDER_NAME || "GlobalPulse";

async function sendBrevoEmail(to: string, otp: string): Promise<boolean> {
  if (!BREVO_API_KEY) {
    logger.error("[otp] BREVO_API_KEY not set");
    throw new Error("BREVO_API_KEY environment variable is missing.");
  }

  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "api-key": BREVO_API_KEY,
      },
      body: JSON.stringify({
        sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
        to: [{ email: to }],
        subject: `${otp} — Your GlobalPulse Verification Code`,
        htmlContent: buildOtpEmailHtml(otp),
        textContent: buildOtpTextContent(otp),
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      logger.error(`[otp] Brevo send failed: ${res.status} ${errBody}. Ensure ${BREVO_SENDER_EMAIL} is a verified sender in your Brevo account!`);
      throw new Error(`Brevo API Error (${res.status}): ${errBody}. (Sender was ${BREVO_SENDER_EMAIL})`);
    }

    logger.info(`[otp] OTP sent to ${to}`);
    return true;
  } catch (err: any) {
    logger.error({ err }, "[otp] Brevo request error");
    throw new Error(err.message || "Failed to contact Brevo API.");
  }
}

// ── Send OTP ────────────────────────────────────────────────────────────────
router.post("/auth/send-otp", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const code = generateOTP();
    
    // Store OTP in DB
    await db.insert(otpVerificationsTable).values({
      email: email.toLowerCase(),
      code,
      expiresAt: otpExpiry(),
    });

    // Send via Brevo
    await sendBrevoEmail(email.toLowerCase(), code);

    res.json({ success: true, message: "OTP sent to your email" });
  } catch (err: any) {
    logger.error({ err }, "[otp] Send OTP failed");
    res.status(500).json({ error: err.message || "Failed to send OTP" });
  }
});

// ── Verify OTP ──────────────────────────────────────────────────────────────
router.post("/auth/verify-otp", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return res.status(400).json({ error: "Email and code are required" });
    }

    const [otp] = await db
      .select()
      .from(otpVerificationsTable)
      .where(
        and(
          eq(otpVerificationsTable.email, email.toLowerCase()),
          eq(otpVerificationsTable.code, code),
          eq(otpVerificationsTable.verified, false),
          gt(otpVerificationsTable.expiresAt, new Date())
        )
      )
      .orderBy(otpVerificationsTable.createdAt)
      .limit(1);

    if (!otp) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    // Mark OTP as verified
    await db
      .update(otpVerificationsTable)
      .set({ verified: true })
      .where(eq(otpVerificationsTable.id, otp.id));

    // Mark user email as verified
    await db
      .update(usersTable)
      .set({ emailVerified: true })
      .where(eq(usersTable.email, email.toLowerCase()));

    logger.info(`[otp] Email verified: ${email}`);
    res.json({ success: true, verified: true });
  } catch (err) {
    logger.error({ err }, "[otp] Verify OTP failed");
    res.status(500).json({ error: "Verification failed" });
  }
});

export default router;
