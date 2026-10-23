import { NextResponse } from "next/server";
import { supabaseAdminFresh as db } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/promo-codes/active — do'konning faol, muddati o'tmagan promo-kodlari (ommaviy).
 * Faqat ko'rsatish uchun kerakli maydonlar; foydalanish statistikasi qaytarilmaydi.
 */
export async function GET() {
    const { data, error } = await db
        .from("promo_codes")
        .select("id, code, discount_type, discount_value, min_order_amount, max_discount_amount, expires_at, created_at")
        .eq("active", true)
        .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const now = Date.now();
    const promos = (data || []).filter((p) => !p.expires_at || new Date(p.expires_at).getTime() > now);
    return NextResponse.json({ success: true, promos });
}
