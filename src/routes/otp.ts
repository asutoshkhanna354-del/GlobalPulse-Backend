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
<body style="margin:0;padding:0;background:#08090d;font-family:-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08090d;min-height:100vh;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(14,16,20,0.95),rgba(11,37,81,0.4));border:1px solid rgba(164,244,253,0.15);border-radius:24px;overflow:hidden;">
          
          <!-- Header Glow -->
          <tr>
            <td style="height:4px;background:linear-gradient(90deg,transparent,#00d2ff,#A4F4FD,#00d2ff,transparent);"></td>
          </tr>

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:40px 40px 0;">
              <div style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">GlobalPulse</div>
              <div style="font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:0.12em;text-transform:uppercase;margin-top:4px;">Financial Intelligence Platform</div>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td align="center" style="padding:32px 40px 8px;">
              <h1 style="margin:0;font-size:26px;font-weight:600;color:#ffffff;letter-spacing:-0.02em;">Verify your email</h1>
              <p style="margin:12px 0 0;font-size:14px;color:rgba(255,255,255,0.5);line-height:1.6;">Enter the code below to complete your registration and unlock market intelligence.</p>
            </td>
          </tr>

          <!-- OTP Code -->
          <tr>
            <td align="center" style="padding:28px 40px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,rgba(0,210,255,0.08),rgba(164,244,253,0.04));border:1px solid rgba(0,210,255,0.25);border-radius:16px;padding:24px 48px;">
                    <div style="font-size:40px;font-weight:700;letter-spacing:12px;color:#A4F4FD;font-family:'JetBrains Mono',monospace;">${otp}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Expiry Notice -->
          <tr>
            <td align="center" style="padding:0 40px 8px;">
              <p style="margin:0;font-size:12px;color:rgba(255,255,255,0.3);">This code expires in <strong style="color:rgba(0,210,255,0.7);">10 minutes</strong></p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:24px 40px 0;">
              <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent);"></div>
            </td>
          </tr>

          <!-- Security Note -->
          <tr>
            <td align="center" style="padding:20px 40px 36px;">
              <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.6;">If you didn't request this code, please ignore this email. Your account is safe.</p>
            </td>
          </tr>

          <!-- Footer Glow -->
          <tr>
            <td style="height:2px;background:linear-gradient(90deg,transparent,rgba(0,210,255,0.3),transparent);"></td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px 40px;background:rgba(0,0,0,0.3);">
              <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.2);">© ${new Date().getFullYear()} GlobalPulse. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
