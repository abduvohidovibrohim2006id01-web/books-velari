/**
 * Maxfiy kalitlar — faqat muhit o'zgaruvchilaridan, hech qanday qattiq yozilgan zaxirasiz.
 * Kalit yo'q bo'lsa xato tashlanadi (route 500 qaytaradi) — jimgina ma'lum kalit bilan
 * ishlab ketishdan ko'ra to'xtash xavfsizroq.
 *
 *  JWT_SECRET   — mijoz tokenlari (user_token). Admin tokenlari bilan almashtirib bo'lmaydi.
 *  ADMIN_SECRET — admin tokenlari (admin_token), x-admin-secret, parol tuzi.
 */

export class MissingSecretError extends Error {
    constructor(name: string) {
        super(`Server configuration error: ${name} is not set`);
        this.name = "MissingSecretError";
    }
}

/** Mijoz JWT (user_token) imzolash/tekshirish kaliti. */
export function getUserJwtSecret(): string {
    const value = process.env.JWT_SECRET?.trim();
    if (!value) throw new MissingSecretError("JWT_SECRET");
    return value;
}

/** Admin kaliti (admin_token, x-admin-secret) — qirqilgan qiymat, avvalgidek. */
export function getAdminSecret(): string {
    const value = process.env.ADMIN_SECRET?.trim();
    if (!value) throw new MissingSecretError("ADMIN_SECRET");
    return value;
}

/** Web Push (VAPID) kalit juftligi — server (admin push yuborish) uchun. */
export function getVapidKeys(): { publicKey: string; privateKey: string } {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    if (!publicKey) throw new MissingSecretError("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
    if (!privateKey) throw new MissingSecretError("VAPID_PRIVATE_KEY");
    return { publicKey, privateKey };
}

/**
 * Parol xeshi tuzi — ADMIN_SECRET'ning XOM (qirqilmagan) qiymati, avvalgidek.
 * O'zgartirilsa, mavjud parollar mos kelmay qoladi.
 */
export function getPasswordSalt(): string {
    const value = process.env.ADMIN_SECRET;
    if (!value) throw new MissingSecretError("ADMIN_SECRET");
    return value;
}
