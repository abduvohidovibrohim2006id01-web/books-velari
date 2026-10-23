import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        if (!await checkRateLimit(ip, 3, 60, "orders-return")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish." }, { status: 429 });
        }

        const { order_id, user_phone, items, reason } = await req.json();

        if (!order_id || !user_phone || !items || !reason) {
            return NextResponse.json({ success: false, message: "Barcha maydonlarni to'ldiring." }, { status: 400 });
        }

        const token = req.cookies.get("user_token")?.value;
        if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
        const JWT_SECRET = getUserJwtSecret();
        const payload = await verifyJwt(token, JWT_SECRET);
        if (!payload || payload.sub !== user_phone) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

        // 🛡 SECURITY: Verify ownership before allowing a return request
        const { data: order } = await supabaseAdmin
            .from("orders")
            .select("user_phone, status")
            .eq("id", order_id)
            .single();

        if (!order || order.user_phone !== user_phone) {
            return NextResponse.json({ success: false, message: "Ruxsat etilmadi." }, { status: 403 });
        }

        // 🛡 BITTA AKTIV SO'ROV: rad etilmagan (pending/approved/processing/completed)
        // so'rov mavjud bo'lsa, qayta yuborishga ruxsat bermaymiz. Faqat 'rejected'
        // dan keyin qayta so'rash mumkin.
        const { data: existing } = await supabaseAdmin
            .from("order_returns")
            .select("id, status")
            .eq("order_id", order_id)
            .neq("status", "rejected");

        if (existing && existing.length > 0) {
            return NextResponse.json(
                { success: false, message: "Bu buyurtma uchun qaytarish so'rovi allaqachon yuborilgan." },
                { status: 409 }
            );
        }

        // 1. Insert Return Request
        const { error } = await supabaseAdmin.from("order_returns").insert({
            order_id,
            user_phone,
            items,
            reason,
            status: "pending", // admin tablari va status-update inglizcha kodlar bilan ishlaydi
            created_at: new Date().toISOString()
        });

        if (error) throw error;

        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';

// Foydalanuvchining qaytarish so'rovlari (buyurtmalar sahifasida holat ko'rsatish uchun).
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userPhone = searchParams.get("phone");
    if (!userPhone) return NextResponse.json({ success: false, message: "Missing phone" }, { status: 400 });

    const token = req.cookies.get("user_token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    if (!payload || payload.sub !== userPhone) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    try {
        const { data, error } = await supabaseAdmin
            .from("order_returns")
            .select("id, order_id, status, reason, created_at")
            .eq("user_phone", userPhone)
            .order("created_at", { ascending: false });
        if (error) throw error;
        return NextResponse.json(
            { success: true, returns: data || [] },
            { headers: { "Cache-Control": "no-store" } }
        );
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
