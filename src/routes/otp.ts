import { Router } from "express";
import { db } from "@workspace/db";
import { otpVerificationsTable, usersTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { randomInt } from "crypto";
import { logger } from "../lib/logger";

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

function buildOtpEmailHtml(otp: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GlobalPulse Verification</title>
</head>
<body style="margin:0;padding:0;background-color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#000000;min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" width="100%" max-width="480" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;border:1px solid #1f2937;border-radius:16px;max-width:480px;margin:0 auto;">
          
          <!-- Header Accent -->
          <tr>
            <td style="height:4px;background-color:#06b6d4;border-top-left-radius:16px;border-top-right-radius:16px;"></td>
          </tr>

          <!-- Header -->
          <tr>
            <td align="center" style="padding:40px 40px 0;">
              <div style="font-size:24px;font-weight:bold;color:#ffffff;letter-spacing:-0.5px;">GlobalPulse</div>
              <div style="font-size:12px;color:#9ca3af;letter-spacing:2px;text-transform:uppercase;margin-top:6px;">Financial Intelligence</div>
            </td>
          </tr>

          <!-- Body Text -->
          <tr>
            <td align="center" style="padding:32px 40px 8px;">
              <h1 style="margin:0;font-size:22px;font-weight:600;color:#ffffff;">Verify your email</h1>
              <p style="margin:12px 0 0;font-size:15px;color:#9ca3af;line-height:1.6;">Enter the verification code below to confirm your identity and access your trading dashboard.</p>
            </td>
          </tr>

          <!-- OTP Box -->
          <tr>
            <td align="center" style="padding:32px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td align="center" style="background-color:#111827;border:1px solid #374151;border-radius:12px;padding:24px;">
                    <div style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#06b6d4;font-family:monospace;">${otp}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Expiry -->
          <tr>
            <td align="center" style="padding:0 40px 16px;">
              <p style="margin:0;font-size:13px;color:#6b7280;">This code expires in <strong style="color:#06b6d4;">10 minutes</strong>.</p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:16px 40px;">
              <div style="height:1px;background-color:#1f2937;width:100%;"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:16px 40px 32px;">
              <p style="margin:0;font-size:12px;color:#4b5563;line-height:1.5;">If you didn't request this code, you can safely ignore this email.</p>
              <p style="margin:16px 0 0;font-size:11px;color:#374151;">&copy; ${new Date().getFullYear()} GlobalPulse. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
