import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh as db } from "@/lib/supabase-admin";
import { getSessionPhone } from "@/lib/user-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/profile — sessiya egasining profili (faqat xavfsiz maydonlar).
 * Parol, admin kalitlari, token_version, telegram_id, IP, PIN xeshi QAYTARILMAYDI.
 */
export async function GET(req: NextRequest) {
    const phone = await getSessionPhone(req);
    if (!phone) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { data: user, error } = await db
        .from("users")
        .select("id, phone, name, username, is_admin, created_at, last_login, affiliate_code, affiliate_role, affiliate_agreed, real_balance, affiliate_pin")
        .eq("phone", phone)
        .maybeSingle();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    if (!user) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const { affiliate_pin, ...safe } = user as any;
    return NextResponse.json({ success: true, user: { ...safe, hasPin: Boolean(affiliate_pin) } });
}
