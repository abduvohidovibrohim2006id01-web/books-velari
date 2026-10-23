import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getSessionPhone, phoneDigits } from "@/lib/user-session";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        // 0. RATE LIMITING (5 attempts per minute to prevent brute-force)
        if (!await checkRateLimit(ip, 5, 60, "wallet-transfer-confirm")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish. Bir daqiqadan so'ng qayta urining." }, { status: 429 });
        }

        const { senderPhone, receiverPhone, amount, code } = await req.json();

        const sessionPhone = await getSessionPhone(req as any);
        if (!sessionPhone || phoneDigits(sessionPhone) !== phoneDigits(senderPhone)) {
            return NextResponse.json({ success: false, message: "Ruxsat etilmadi. Iltimos, qayta tizimga kiring." }, { status: 401 });
        }

        // 1. Execute Atomic DB Transaction (Locked RPC V4 with Attempt Limits)
        const { data, error } = await supabaseAdmin.rpc('process_p2p_transfer_v4', {
            p_sender_phone: senderPhone,
            p_receiver_phone: receiverPhone,
            p_amount: amount,
            p_otp_code: code
        });

        if (error) throw error;

        if (data && !data.success) {
            return NextResponse.json({ success: false, message: data.error });
        }

        const isGift = data.is_gift;
        const newBalance = data.new_balance;

        // 2. Notify Participants via Telegram (Async)
        const BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
        if (BOT_TOKEN) {
            // Notify Sender
            supabaseAdmin.from("users").select("telegram_id").eq("phone", senderPhone).single().then(({ data: s }) => {
                if (s?.telegram_id) {
                    const text = isGift 
                        ? `🎁 <b>Sovg'angiz muvaffaqiyatli yuborildi!</b>\n\n💰 Summa: -${amount.toLocaleString()} so'm\n👤 Kimga: ${receiverPhone}\n📉 Yangi balans: ${newBalance.toLocaleString()} so'm`
                        : `✅ <b>O'tkazma bajarildi!</b>\n\n💰 Summa: -${amount.toLocaleString()} so'm\n👤 Kimga: ${receiverPhone}\n📉 Yangi balans: ${newBalance.toLocaleString()} so'm`;
                    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chat_id: s.telegram_id, text, parse_mode: "HTML" })
                    });
                }
            });

            // Notify Receiver
            supabaseAdmin.from("users").select("telegram_id").eq("phone", receiverPhone).single().then(({ data: r }) => {
                if (r?.telegram_id) {
                    const text = isGift
                        ? `🎁 <b>Sizga sovg'a keldi!</b>\n\n💰 Summa: +${amount.toLocaleString()} so'm\n👤 Kimdan: ${senderPhone}\n\n<i>Bayramingiz bilan! 🎉</i>`
                        : `💰 <b>Hisobingiz to'ldirildi!</b>\n\n📈 Summa: +${amount.toLocaleString()} so'm\n👤 Kimdan: ${senderPhone}`;
                    fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ chat_id: r.telegram_id, text, parse_mode: "HTML" })
                    });
                }
            });
        }

        return NextResponse.json({ success: true, message: "Muvaffaqiyatli yakunlandi" });
    } catch (error: any) {
        console.error("Transfer Confirm Error:", error);
        return NextResponse.json({ success: false, message: "O'tkazma vaqtida xatolik yuz berdi" });
    }
}
