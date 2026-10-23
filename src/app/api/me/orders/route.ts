import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh as db } from "@/lib/supabase-admin";
import { getSessionPhone, phoneVariants } from "@/lib/user-session";
import { normalizeOrderStatus } from "@/lib/order-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/orders[?delivered=1] — sessiya egasining buyurtmalari (account: sharh, qaytarish).
 * delivered=1 — faqat yetkazilganlar.
 */
export async function GET(req: NextRequest) {
    const phone = await getSessionPhone(req);
    if (!phone) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { data, error } = await db
        .from("orders")
        .select("id, items, total, status, created_at, delivered_at, payment_method, address, delivery_type, delivery_fee, discount_amount, wallet_amount, promo_code")
        .in("user_phone", phoneVariants(phone))
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    let orders = data || [];
    if (req.nextUrl.searchParams.get("delivered") === "1") {
        orders = orders.filter((o) => normalizeOrderStatus(o.status) === "delivered" || /yetkazib berildi/i.test(String(o.status)));
    }
    return NextResponse.json({ success: true, orders });
}
