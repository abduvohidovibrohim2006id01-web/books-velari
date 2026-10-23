import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSessionPhone, phoneDigits } from "@/lib/user-session";
import { checkRateLimit } from "@/lib/rate-limiter";

export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        if (!(await checkRateLimit(ip, 5, 60, "returns-legacy"))) {
            return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
        }

        const { orderId, userPhone, items, reason } = await req.json();

        if (!orderId || !userPhone || !items || items.length === 0) {
            return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
        }

        const sessionPhone = await getSessionPhone(req);
        if (!sessionPhone || phoneDigits(sessionPhone) !== phoneDigits(userPhone)) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        // Buyurtma foydalanuvchiga tegishli ekanini tekshirish
        const { data: order, error: orderErr } = await supabaseAdmin
            .from("orders")
            .select("id, user_phone")
            .eq("id", orderId)
            .maybeSingle();

        if (orderErr || !order || phoneDigits(order.user_phone) !== phoneDigits(sessionPhone)) {
            return NextResponse.json({ success: false, error: "Buyurtma sizga tegishli emas yoki topilmadi" }, { status: 403 });
        }

        // 1. Create return request
        const { data, error } = await supabaseAdmin
            .from("order_returns")
            .insert({
                order_id: orderId,
                user_phone: userPhone,
                items: items,
                reason: reason,
                status: 'pending'
            })
            .select()
            .single();

        if (error) throw error;

        // 2. Optionally update order status or flag it
        // We can just keep it in order_returns for now

        // 3. Notify Admin optionally via Telegram
        await notifyAdminNewReturn(orderId, reason);

        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        console.error("Return submission error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function notifyAdminNewReturn(orderId: string, reason: string) {
    try {
        const ADMIN_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const ADMIN_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
        
        if (!ADMIN_BOT_TOKEN || !ADMIN_CHAT_ID) return;

        const text = `🔄 <b>Yangi qaytarish so'rovi!</b>\n\n` +
            `🆔 Buyurtma: #<code>${orderId}</code>\n` +
            `📝 Sabab: ${reason}\n\n` +
            `<a href="${process.env.NEXT_PUBLIC_BASE_URL}/admin/returns">Admindan ko'rish</a>`;

        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: ADMIN_CHAT_ID,
                text,
                parse_mode: "HTML"
            }),
        });
    } catch (e) {
        console.error("Admin notification error:", e);
    }
}
