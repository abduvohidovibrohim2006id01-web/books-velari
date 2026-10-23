import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

/**
 * Foydalanuvchi tanlagan yetkazib berish viloyatini Supabase bazasiga va Cookie'ga saqlash
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const region = body.region || body.region_id;
        if (!region || typeof region !== "string") {
            return NextResponse.json({ success: false, error: "Invalid region" }, { status: 400 });
        }

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
                    region: region,
                    updated_at: new Date().toISOString()
                }, { onConflict: "id" }),

                // B. users jadvaliga urinish (agar region ustuni mavjud bo'lsa)
                supabaseAdmin.from("users").update({
                    region: region
                } as any).eq("phone", userPhone),

                // C. Telemetriya logiga yozish
                supabaseAdmin.from("user_telemetry_logs").insert([{
                    user_identifier: userPhone,
                    event_type: "REGION_CHANGE",
                    event_value: region,
                    event_metadata: { region }
                }])
            ]);
        }

        // 3. Cookie o'rnatish (1 yil muddatga)
        const res = NextResponse.json({ success: true, region, userPhone: userPhone || null });
        const cookieOptions = {
            path: "/",
            maxAge: 365 * 24 * 60 * 60,
            sameSite: "lax" as const,
        };
        res.cookies.set("velari_selected_region", region, cookieOptions);
        res.cookies.set("velari_region_manually_set", "true", cookieOptions);

        return res;
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
