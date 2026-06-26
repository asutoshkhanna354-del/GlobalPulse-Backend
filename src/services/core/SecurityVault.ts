import crypto from "crypto";
import { config } from "dotenv";

config();

// Must be a 32-character string for AES-256-GCM
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "default_encryption_key_must_be_32!"; 

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

export class SecurityVault {
  /**
   * Encrypts a sensitive string (like an API secret or refresh token)
   */
  static encrypt(text: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Key derivation function
    const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, "sha512");

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");

    const tag = cipher.getAuthTag();

    // Format: iv:salt:tag:encryptedData
    return `${iv.toString("hex")}:${salt.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
  }

  /**
   * Decrypts an encrypted string back to plaintext
   */
  static decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(":");
      if (parts.length !== 4) throw new Error("Invalid encrypted format");

      const iv = Buffer.from(parts[0], "hex");
      const salt = Buffer.from(parts[1], "hex");
      const tag = Buffer.from(parts[2], "hex");
      const encryptedData = parts[3];

      const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, "sha512");

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      let decrypted = decipher.update(encryptedData, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (e) {
      console.error("Decryption failed:", e);
      throw new Error("Failed to decrypt sensitive data");
    }
  }
}
