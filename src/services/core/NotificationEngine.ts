import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db";
import { logger } from "../../lib/logger";

export class NotificationEngine {
  /**
   * Dispatch a notification to a specific user.
   * - Saves to DB for persistent UI access.
   * - (Placeholder) Triggers Email/Push.
   */
  static async notifyUser(userId: number, title: string, message: string, type: "TRADE_EXECUTION" | "DAILY_PNL" | "SYSTEM" = "TRADE_EXECUTION") {
    try {
      // 1. Save to DB for persistence
      await db.insert(notificationsTable).values({
        userId,
        title,
        message,
        type,
        isRead: false,
      });

      // 2. Dispatch real-time websocket event (if user is connected)
      // This will be hooked up to WebSocketManager later
      
      // 3. Dispatch Email (Placeholder)
      this.sendEmail(userId, title, message);

      logger.info(`[NotificationEngine] Dispatched ${type} to user ${userId}: ${title}`);
    } catch (err) {
      logger.error(`[NotificationEngine] Failed to notify user ${userId}: ${err}`);
    }
  }

  private static async sendEmail(userId: number, title: string, message: string) {
    // In production, this uses nodemailer, SendGrid, or AWS SES
    // Example:
    // const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    // await transporter.sendMail({ to: user[0].email, subject: title, text: message });
    logger.debug(`[Email Service Mock] Sent to user ${userId}: ${title}`);
  }
}
