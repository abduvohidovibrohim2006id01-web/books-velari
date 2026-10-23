import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh as db } from "@/lib/supabase-admin";
import { getSessionPhone, phoneDigits, phoneVariants } from "@/lib/user-session";
import { normalizeOrderStatus } from "@/lib/order-status";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/wallet — sessiya egasining hamyoni (brauzer anon kalit bilan o'qimaydi).
 *   ?summary=1 — faqat balans (account, checkout uchun)
 * Qaytadi: wallet {balance, wallet_number, is_active}, cashback[], transfers[], pendingOrders[].
 */
export async function GET(req: NextRequest) {
    const me = await getSessionPhone(req);
    if (!me) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const variants = phoneVariants(me);
    const digits = phoneDigits(me);

    const { data: wallets, error } = await db
        .from("user_wallets")
        .select("user_phone, wallet_number, balance, is_active, created_at, updated_at")
        .in("user_phone", variants);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    // Bir nechta yozilish varianti bo'lsa — sayt ishlatadigan (faqat raqam) birinchi
    const wallet = (wallets || []).sort((a, b) => Number(b.user_phone === digits) - Number(a.user_phone === digits))[0] || null;

    if (req.nextUrl.searchParams.get("summary") === "1") {
        return NextResponse.json({ success: true, wallet: wallet ? { balance: wallet.balance, wallet_number: wallet.wallet_number, is_active: wallet.is_active } : null });
    }

    const [{ data: cashback }, { data: transfers }, { data: pendingOrders }] = await Promise.all([
        db.from("cashback_transactions")
            .select("id, order_id, amount, type, description, created_at")
            .in("user_phone", variants)
            .order("created_at", { ascending: false })
            .limit(200),
        db.from("wallet_transfers")
            .select("id, sender_phone, receiver_phone, amount, status, created_at")
            .or(variants.map((v) => `sender_phone.eq.${v},receiver_phone.eq.${v}`).join(","))
            .order("created_at", { ascending: false })
            .limit(200),
        db.from("orders")
            .select("id, potential_cashback, status")
            .in("user_phone", variants)
            .neq("status", "Yetkazildi")
            .gt("potential_cashback", 0),
    ]);

    const activePendingOrders = (pendingOrders || []).filter((o) => {
        const st = normalizeOrderStatus(o.status);
        return st !== "delivered" && st !== "cancelled";
    });

    return NextResponse.json({
        success: true,
        myPhone: digits,
        wallet: wallet ? { balance: wallet.balance, wallet_number: wallet.wallet_number, is_active: wallet.is_active, created_at: wallet.created_at, updated_at: wallet.updated_at } : null,
        cashback: cashback || [],
        transfers: (transfers || []).map((t) => ({ ...t, isOutgoing: phoneDigits(t.sender_phone) === digits })),
        pendingOrders: activePendingOrders,
    });
}
