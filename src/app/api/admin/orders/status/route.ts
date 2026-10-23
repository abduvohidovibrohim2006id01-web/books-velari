import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ClickAPI } from "@/lib/click";
import { getAdminActor, logOrderStatusChange } from "@/lib/admin-audit";

// Auth: middleware.ts barcha /api/admin/* ni himoya qiladi (admin_token tekshiradi).

export async function POST(req: Request) {
    try {
        const { orderId, status } = await req.json();

        const updateData: any = { status };
        if (status === "Yetkazildi") {
            updateData.delivered_at = new Date().toISOString();
        }

        // 1. If order is cancelled, check for Click payment to refund
        if (status === "Bekor qilingan") {
            try {
                const { data: tx } = await supabaseAdmin
                    .from("click_transactions")
                    .select("click_trans_id, status")
                    .eq("order_id", orderId)
                    .eq("status", "completed")
                    .single();
                
                if (tx && tx.click_trans_id) {
                    console.log(`🔄 Attempting to reverse Click payment for order #${orderId}...`);
                    const result = await ClickAPI.reversePayment(tx.click_trans_id, orderId);
                    
                    if (result.success) {
                        console.log(`✅ Refund successful for order #${orderId}`);
                        await supabaseAdmin
                            .from("click_transactions")
                            .update({ status: "refunded", error_note: "Refunded by Admin" })
                            .eq("click_trans_id", tx.click_trans_id);
                    } else {
                        console.error(`❌ Refund failed: ${result.error}`);
                        // Optionally: notify admin about failed refund
                    }
                }
            } catch (refundError) {
                console.error("Refund side-effect error:", refundError);
            }
        }

        // 2. Update order status (eski holat jurnal uchun oldin olinadi)
        const { data: before } = await supabaseAdmin.from("orders").select("status").eq("id", orderId).maybeSingle();
        const { data: order, error } = await supabaseAdmin
            .from("orders")
            .update(updateData)
            .eq("id", orderId)
            .select("user_phone, total")
            .single();

        if (error) throw error;

        await logOrderStatusChange({
            actor: await getAdminActor(req as any), orderId, oldStatus: before?.status, newStatus: status,
            source: "admin/orders/status", req,
        });

        // 3. Handle Affiliate Rewards
        if (status === "Yetkazildi") {
            // Import and run MLM commission distribution
            const { distributeCommissions } = await import("@/lib/mlm-utils");
            distributeCommissions(orderId).catch(err => console.error("MLM Distribute Error:", err));
        } else if (status === "Bekor qilingan") {
            // Reject all pending affiliate transactions for this order
            await supabaseAdmin
                .from("affiliate_transactions")
                .update({ status: "rejected" })
                .eq("order_id", orderId)
                .eq("status", "pending");
        }

        // 4. Notify customer via Telegram
        if (order?.user_phone) {
            await notifyCustomerStatusUpdate(order.user_phone, orderId, status);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Admin status update error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function notifyCustomerStatusUpdate(phone: string, orderId: string, status: string) {
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

        if (status === "Yetkazilmoqda") {
            statusText = "yo'lga chiqdi 🚚";
            emoji = "🚚";
        } else if (status === "Yetkazildi") {
            statusText = "yetkazib berildi ✅";
            emoji = "✅";
        } else if (status === "Bekor qilingan") {
            statusText = "bekor qilindi ❌";
            emoji = "❌";
        } else if (status === "Kutilmoqda") {
            statusText = "tasdiqlanishni kutmoqda ⏳";
            emoji = "⏳";
        }

        const text = `${emoji} <b>Buyurtma holati o'zgardi!</b>\n\n` +
            `🆔 Buyurtma: #<code>${orderId.slice(0, 8)}</code>\n` +
            `📊 Holati: <b>${statusText}</b>\n\n` +
            `<i>Velari do'konini tanlaganingiz uchun rahmat!</i>`;

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
        console.error("Customer status notification error:", e);
    }
}
