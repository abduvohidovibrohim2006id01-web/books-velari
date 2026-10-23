import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getSessionPhone, phoneDigits } from "@/lib/user-session";
import { normalizeOrderStatus, type OrderStatusCode } from "@/lib/order-status";

/**
 * Mijoz tomonidan buyurtma holatini o'zgartirish (sayt va velari_app shu endpointni chaqiradi).
 *
 * Faqat ikki holat uchun (kodda aniqlangan chaqiruvlar):
 *  1) Bekor qilish (orders sahifasi)       : awaiting_payment | pending | accepted  -> cancelled
 *  2) To'lov usulini tanlash (payment)     : awaiting_payment -> accepted          (cash)
 *                                            awaiting_payment -> awaiting_payment  (click/payme)
 * Telefon sessiyadan (user_token) olinadi — body'dagi userPhone'ga ishonilmaydi.
 * "Yetkazildi"/delivered va komissiya taqsimlash bu yerdan HECH QACHON ishga tushmaydi —
 * faqat admin (/api/admin/orders/status) orqali.
 */

const CANCELLABLE: OrderStatusCode[] = ["awaiting_payment", "pending", "accepted"];
const ONLINE_METHODS = new Set(["click", "payme"]);

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        if (!await checkRateLimit(ip, 5, 60, "orders-update-status")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish." }, { status: 429 });
        }

        const sessionPhone = await getSessionPhone(req);
        if (!sessionPhone) {
            return NextResponse.json({ success: false, message: "Iltimos, tizimga kiring." }, { status: 401 });
        }

        const { orderId, status, paymentMethod } = await req.json();
        if (!orderId || typeof status !== "string" || !status.trim()) {
            return NextResponse.json({ success: false, message: "Ma'lumotlar yetarli emas." }, { status: 400 });
        }

        const { data: order, error: findError } = await supabaseAdmin
            .from("orders")
            .select("user_phone, status")
            .eq("id", orderId)
            .single();

        if (findError || !order) {
            return NextResponse.json({ success: false, message: "Buyurtma topilmadi." }, { status: 404 });
        }
        if (phoneDigits(order.user_phone) !== phoneDigits(sessionPhone)) {
            return NextResponse.json({ success: false, message: "Ruxsat etilmadi (Not your order)." }, { status: 403 });
        }

        const current = normalizeOrderStatus(order.status);
        const target = normalizeOrderStatus(status);
        const method = typeof paymentMethod === "string" ? paymentMethod.trim().toLowerCase() : "";

        let update: Record<string, unknown> | null = null;
        if (target === "cancelled" && CANCELLABLE.includes(current)) {
            update = { status: status.trim() };
        } else if (current === "awaiting_payment" && target === "accepted" && method === "cash") {
            update = { status: status.trim(), payment_method: method };
        } else if (current === "awaiting_payment" && target === "awaiting_payment" && ONLINE_METHODS.has(method)) {
            update = { status: status.trim(), payment_method: method };
        }

        if (!update) {
            return NextResponse.json({
                success: false,
                message: "Bu holat o'zgarishi ruxsat etilmaydi.",
            }, { status: 403 });
        }

        const { error: updateError } = await supabaseAdmin
            .from("orders")
            .update({ ...update, updated_at: new Date().toISOString() })
            .eq("id", orderId);
        if (updateError) throw updateError;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Order Update API Error:", error);
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
