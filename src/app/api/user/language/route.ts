import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

/**
 * Foydalanuvchi tanlagan tilni (uz | ru) Supabase bazasiga va Cookie'ga saqlash
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const rawLang = body.language || body.lang;
        const language = (rawLang === "ru" ? "ru" : "uz") as "uz" | "ru";

        // 1. Foydalanuvchi telefon raqamini aniqlash
        const token = req.cookies.get("user_token")?.value;
        const JWT_SECRET = getUserJwtSecret();
        let tokenPhone: string | null = null;
        if (token) {
            try {
                const payload = await verifyJwt(token, JWT_SECRET);
                if (payload?.sub && payload.sub !== "ADMIN") tokenPhone = String(payload.sub);
            } catch {}
        }
        const userPhone = tokenPhone;

        // 2. Agar foydalanuvchi mavjud bo'lsa, Supabase bazasiga yozish (parallel)
        if (userPhone) {
            await Promise.allSettled([
                // A. user_interests jadvaliga saqlash (yoki yangilash)
                supabaseAdmin.from("user_interests").upsert({
                    id: userPhone,
                    user_phone: userPhone,
                    language: language,
                    updated_at: new Date().toISOString()
                }, { onConflict: "id" }),

                // B. users jadvaliga urinish (agar ustun mavjud bo'lsa)
                supabaseAdmin.from("users").update({
                    language: language
                }).eq("phone", userPhone),

                // C. Telemetriya logiga yozish
                supabaseAdmin.from("user_telemetry_logs").insert([{
                    user_identifier: userPhone,
                    event_type: "LANGUAGE_CHANGE",
                    event_value: language,
                    event_metadata: { language }
                }])
            ]);
        }

        // 3. Javob qaytarish va Cookie'larni yangilash (1 yil muddatga)
        const res = NextResponse.json({ success: true, language, userPhone: userPhone || null });

        const cookieOptions = {
            path: "/",
            maxAge: 365 * 24 * 60 * 60, // 1 yil
            sameSite: "lax" as const,
        };

        res.cookies.set("velari_lang", language, cookieOptions);
        res.cookies.set("NEXT_LOCALE", language, cookieOptions);

        return res;
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
