import type { NextRequest } from "next/server";
import { verifyJwt } from "@/lib/jwt-utils";
import { supabaseAdminFresh } from "@/lib/supabase-admin";
import { getUserJwtSecret } from "@/lib/secrets";

/**
 * Sayt foydalanuvchisi sessiyasi (user_token cookie) — /api/me/* route'lari uchun.
 * JWT imzosi + token_version (parol o'zgarganda eski sessiyalar ishlamasin) tekshiriladi.
 * Qaytadi: JWT'dagi telefon (sub) yoki null.
 */
export async function getSessionPhone(req: NextRequest): Promise<string | null> {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;

    const JWT_SECRET = getUserJwtSecret();
    const payload: any = await verifyJwt(token, JWT_SECRET);
    if (!payload || typeof payload.sub !== "string" || !payload.sub) return null;
    if (payload.role && payload.role !== "user") return null;

    const { data: user } = await supabaseAdminFresh
        .from("users")
        .select("token_version")
        .eq("phone", payload.sub)
        .maybeSingle();
    if (!user) return null;
    if ((user.token_version || 1) !== (payload.token_version || 1)) return null;

    return payload.sub;
}

/** Telefonni faqat raqamlarga keltiradi ("+998 90..." → "99890..."). */
export function phoneDigits(phone: unknown): string {
    return String(phone ?? "").replace(/\D/g, "");
}

/** Bazada uchraydigan yozilish variantlari: xom, faqat raqam, "+" bilan. */
export function phoneVariants(phone: unknown): string[] {
    const raw = String(phone ?? "").trim();
    const digits = phoneDigits(raw);
    return Array.from(new Set([raw, digits, digits ? `+${digits}` : ""].filter(Boolean)));
}
