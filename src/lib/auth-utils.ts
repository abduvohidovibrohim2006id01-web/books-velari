import crypto from "crypto";
import { getPasswordSalt } from "@/lib/secrets";

/**
 * Parolni hash qilish (SHA-256)
 * ADMIN_SECRET-ni salt sifatida ishlatamiz.
 * Note: This function uses Node.js 'crypto' and should only be used in Node.js environments.
 */
export function hashPassword(password: string): string {
    const salt = getPasswordSalt();
    return crypto.createHash("sha256").update(password + salt).digest("hex");
}

/**
 * Xavfsiz xabarlar uchun helper (optional)
 */
export function secureDelay(ms: number = 500) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
