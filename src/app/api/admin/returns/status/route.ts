import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
    try {
        const { returnId, status } = await req.json();

        if (!returnId || !status) {
            return NextResponse.json({ success: false, error: "Missing required fields" }, { status: 400 });
        }

        // 1. Update return status
        const { data: returnReq, error } = await supabaseAdmin
            .from("order_returns")
            .update({ status, updated_at: new Date().toISOString() })
            .eq("id", returnId)
            .select("user_phone, order_id")
            .single();

        if (error) throw error;

        // 2. Handle Cashback Penalty if approved
        if (status === "approved" && returnReq?.order_id) {
            await supabaseAdmin.rpc('handle_return_cashback_penalty', { p_order_id: returnReq.order_id });
        }

        // 3. Notify customer via Telegram
        if (returnReq?.user_phone) {
            await notifyCustomerReturnStatus(returnReq.user_phone, returnReq.order_id, status);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Admin return status update error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function notifyCustomerReturnStatus(phone: string, orderId: string, status: string) {
    try {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('telegram_id')
            .eq('phone', phone)
            .single();

        if (!user || !user.telegram_id) return;

        const CUSTOMER_BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
        if (!CUSTOMER_BOT_TOKEN) return;

        let statusText = status;
        let emoji = "ℹ️";

        if (status === "approved") {
            statusText = "tasdiqlandi ✅. Mahsulotni qaytarish yo'riqnomasi uchun admin bilan bog'laning.";
            emoji = "✅";
        } else if (status === "processing") {
            statusText = "qayta ishlanmoqda 🔄. Mahsulotni qaytarish jarayoni boshlandi.";
            emoji = "🔄";
        } else if (status === "rejected") {
            statusText = "rad etildi ❌. Qo'shimcha ma'lumot uchun qo'llab-quvvatlash xizmatiga murojaat qiling.";
            emoji = "❌";
        } else if (status === "completed") {
            statusText = "muvaffaqiyatli yakunlandi ✨. Mablag'ingiz qaytarildi.";
            emoji = "✨";
        }

        const text = `${emoji} <b>Qaytarish so'rovi holati o'zgardi!</b>\n\n` +
            `🆔 Buyurtma: #<code>${orderId.slice(0, 8)}</code>\n` +
            `📊 Holati: <b>${statusText}</b>\n\n` +
            `<i>Velari jamoasi</i>`;

        await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: user.telegram_id,
                text,
                parse_mode: "HTML"
            }),
        });
    } catch (e) {
        console.error("Customer return notification error:", e);
    }
}
