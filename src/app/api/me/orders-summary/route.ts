import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh as db } from "@/lib/supabase-admin";
import { getSessionPhone, phoneVariants } from "@/lib/user-session";
import { normalizeOrderStatus } from "@/lib/order-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/orders-summary — sessiya egasining buyurtmalar soni va kutilayotgan keshbek.
 * Kutilayotgan keshbek: yetkazilmagan va bekor qilinmagan buyurtmalardagi potential_cashback yig'indisi.
 */
export async function GET(req: NextRequest) {
    const phone = await getSessionPhone(req);
    if (!phone) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { data: orders, error } = await db
        .from("orders")
        .select("status, potential_cashback")
        .in("user_phone", phoneVariants(phone));
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const list = orders || [];
    const pendingCashback = list
        .filter((o) => !["delivered", "cancelled"].includes(normalizeOrderStatus(o.status)))
        .reduce((sum, o) => sum + (Number(o.potential_cashback) > 0 ? Number(o.potential_cashback) : 0), 0);

    return NextResponse.json({ success: true, orderCount: list.length, pendingCashback });
}
