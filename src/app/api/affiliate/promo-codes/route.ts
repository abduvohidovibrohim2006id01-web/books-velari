import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";
import { checkRateLimit } from "@/lib/rate-limiter";

async function getUserFromToken(req: NextRequest) {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    return payload?.sub; // phone
}

export async function GET(req: NextRequest) {
    const phone = await getUserFromToken(req);
    if (!phone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { data: user } = await supabaseAdmin.from("users").select("id").eq("phone", phone).single();
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Get my active promo codes & available tariffs in parallel
        const [{ data: myCodes }, { data: tariffs }] = await Promise.all([
            supabaseAdmin
                .from("affiliate_promo_codes")
                .select("*, promo_code_tariffs(*)")
                .eq("affiliate_id", user.id),
            supabaseAdmin
                .from("promo_code_tariffs")
                .select("*")
                .eq("is_active", true)
        ]);

        return NextResponse.json({ success: true, myCodes: myCodes || [], tariffs: tariffs || [] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const phone = await getUserFromToken(req);
    if (!phone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        if (!(await checkRateLimit(phone, 10, 60, "affiliate-promo"))) {
            return NextResponse.json({ error: "Juda ko'p urinish. 1 daqiqa kuting." }, { status: 429 });
        }

        const { tariffId, customCode } = await req.json();
        if (!tariffId || !customCode) return NextResponse.json({ error: "Tariff and Code required" }, { status: 400 });

        const cleanCode = String(customCode).trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,20}$/.test(cleanCode)) {
            return NextResponse.json({ error: "Promo-kod faqat 3-20 ta harf va raqamdan iborat bo'lishi kerak" }, { status: 400 });
        }

        const { data: user } = await supabaseAdmin.from("users").select("id").eq("phone", phone).single();
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Check if code is already taken
        const { data: existing } = await supabaseAdmin
            .from("affiliate_promo_codes")
            .select("id")
            .eq("code", cleanCode)
            .maybeSingle();

        if (existing) return NextResponse.json({ error: "Bu promo-kod band" }, { status: 400 });

        const { data, error } = await supabaseAdmin
            .from("affiliate_promo_codes")
            .insert({
                affiliate_id: user.id,
                tariff_id: tariffId,
                code: cleanCode
            })
            .select();

        if (error) throw error;
        return NextResponse.json({ success: true, data: data[0] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
