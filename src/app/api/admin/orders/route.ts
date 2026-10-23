import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";

export const dynamic = 'force-dynamic';

/**
 * Admin — buyurtmalar ro'yxati (service-role).
 *
 * `orders` jadvalida RLS yoqilgan, lekin policy yo'q — shuning uchun client (anon)
 * hech narsa o'qiy olmaydi. Admin panel buyurtmalarni shu endpoint orqali oladi.
 */

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function GET(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
        const limitParam = searchParams.get("limit");
        // Agar maxsus limit ko'rsatilmagan bo'lsa, 50 ta tezkor yuklanadi (500 ta og'ir blok o'rniga)
        const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam))) : 50;
        const from = (page - 1) * limit;
        const to = from + limit - 1;

        let query = supabaseAdminFresh
            .from("orders")
            .select("id, user_phone, total, status, items, address, coords, created_at, smart_discount_amount, promo_code, discount_amount, wallet_amount, delivery_fee, delivery_type", { count: "exact" })
            .order("created_at", { ascending: false });

        const statusFilter = searchParams.get("status");
        if (statusFilter && statusFilter !== "all" && statusFilter !== "Barchasi") {
            query = query.eq("status", statusFilter);
        }

        const { data, count, error } = await query.range(from, to);
        if (error) throw error;

        return NextResponse.json(
            { success: true, orders: data || [], total: count ?? (data || []).length },
            { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
        );
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
