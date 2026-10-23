import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendTransferOTP } from "@/lib/telegram";
import { checkRateLimit } from "@/lib/rate-limiter";
import { transferSchema } from "@/lib/validators";
import { getSessionPhone, phoneDigits } from "@/lib/user-session";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        // 0. RATE LIMITING (3 transfers per minute)
        if (!await checkRateLimit(ip, 3, 60, "wallet-transfer-req")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish. Bir daqiqadan so'ng qayta urining." }, { status: 429 });
        }

        const body = await req.json();
        const validation = transferSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ success: false, message: validation.error.issues[0].message });
        }

        const { senderPhone, receiverPhone, amount, isGift } = validation.data;

        const sessionPhone = await getSessionPhone(req as any);
        if (!sessionPhone || phoneDigits(sessionPhone) !== phoneDigits(senderPhone)) {
            return NextResponse.json({ success: false, message: "Ruxsat etilmadi. Iltimos, qayta tizimga kiring." }, { status: 401 });
        }

        if (senderPhone === receiverPhone) {
            return NextResponse.json({ success: false, message: "O'zingizga o'tkazma qila olmaysiz" });
        }

        // 1. Check Sender (Balance + Telegram)
        const { data: sender } = await supabaseAdmin
            .from("users")
            .select("telegram_id, user_wallets(balance)")
            .eq("phone", senderPhone)
            .single();
        
        if (!sender || !sender.telegram_id) {
            return NextResponse.json({ success: false, message: "Tasdiqlash kodi uchun avval Telegram botdan ro'yxatdan o'te" });
        }

        const balance = (sender as any).user_wallets?.[0]?.balance || 0;
        if (balance < amount) {
            return NextResponse.json({ success: false, message: "Mablag' yetarli emas" });
        }

        // 2. Check Receiver
        const { data: receiver } = await supabaseAdmin
            .from("user_wallets")
            .select("user_phone")
            .eq("user_phone", receiverPhone)
            .single();
        
        if (!receiver) {
            return NextResponse.json({ success: false, message: "Qabul qiluvchi hamyoni topilmadi" });
        }

        // 3. Generate Secure OTP
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

        // 4. Bind OTP to this specific transaction
        await supabaseAdmin.from("p2p_otps").delete().eq("sender_phone", senderPhone); // Clean old
        await supabaseAdmin.from("p2p_otps").insert([{
            sender_phone: senderPhone,
            receiver_phone: receiverPhone,
            amount: amount,
            code: code,
            is_gift: isGift || false,
            expires_at: expiresAt
        }]);

        // 5. Send via Telegram util
        await sendTransferOTP(senderPhone, amount, receiverPhone, code);

        return NextResponse.json({ success: true, message: "Kod Telegramga yuborildi" });
    } catch (error) {
        console.error("Transfer Request Error:", error);
        return NextResponse.json({ success: false, message: "Xatolik yuz berdi" });
    }
}
