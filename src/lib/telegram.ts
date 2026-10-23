import { supabaseAdmin } from "./supabase-admin";
import crypto from "crypto";

const ADMIN_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const CUSTOMER_BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;

export async function sendOrderNotification(orderId: string, method: string) {
    try {
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
        if (!order) return;

        if (!ADMIN_BOT_TOKEN || !ADMIN_ID) return;

        const itemsText = order.items.map((i: any) => `- ${i.name} (x${i.quantity} ta)`).join('\n');
        
        let text = `🛍 <b>Yangi Buyurtma!</b>\n`;
        text += `🆔 ID: #${order.id}\n`;
        text += `📞 Mijoz: ${order.user_phone || "Mavjud emas"}\n`;
        text += `📍 Manzil: ${order.address || "Ko'rsatilmagan"}\n\n`;
        text += `📦 <b>Mahsulotlar:</b>\n${itemsText}\n\n`;
        text += `💰 <b>Jami summa:</b> ${Number(order.total).toLocaleString()} so'm\n`;
        text += `💳 <b>To'lov usuli:</b> ${method === 'click' ? "✅ Click orqali to'landi" : "💵 Naqd to'lov (Qabul qilinganda)"}`;

        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'HTML' })
        });

        // Also notify the customer if they have a telegram_id
        await notifyCustomerOrder(order.user_phone, orderId);

    } catch(e) {
        console.error("Telegram notification error:", e);
    }
}

export async function notifyCustomerOrder(phone: string, orderId: string) {
    try {
        // Fetch user telegram_id
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('telegram_id')
            .eq('phone', phone)
            .single();

        if (!user || !user.telegram_id || !CUSTOMER_BOT_TOKEN) return;

        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
        if (!order) return;

        const itemsText = order.items.map((i: any) => `- ${i.name} (x${i.quantity} ta)`).join('\n');

        let text = `🛍 <b>Buyurtmangiz qabul qilindi!</b>\n\n`;
        text += `🆔 Buyurtma raqami: #${order.id}\n`;
        text += `📦 <b>Mahsulotlar:</b>\n${itemsText}\n\n`;
        text += `💰 <b>Jami summa:</b> ${Number(order.total).toLocaleString()} so'm\n\n`;
        text += `<i>Yaqin orada operatorimiz siz bilan bog'lanadi. Rahmat!</i>`;

        await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: user.telegram_id, text, parse_mode: 'HTML' })
        });
    } catch(e) {
        console.error("Customer Telegram notification error:", e);
    }
}

export async function sendOrderStatusNotification(orderId: string, newStatus: string) {
    try {
        const { data: order } = await supabaseAdmin.from('orders').select('*').eq('id', orderId).single();
        if (!order || !order.user_phone) return;

        const { data: user } = await supabaseAdmin
            .from('users')
            .select('telegram_id')
            .eq('phone', order.user_phone)
            .single();

        if (!user || !user.telegram_id || !CUSTOMER_BOT_TOKEN) return;

        let statusText = newStatus;
        if (newStatus === 'yolda' || newStatus === 'yo\'lda') statusText = '🚚 Yetkazib berilmoqda';
        else if (newStatus === 'yetkazildi') statusText = '✅ Yetkazib berildi';
        else if (newStatus === 'bekor_qilindi') statusText = '❌ Bekor qilindi';
        else if (newStatus === 'qabul_qilindi') statusText = '📦 Qabul qilindi va tayyorlanmoqda';

        let text = `📦 <b>Buyurtma holati o'zgardi!</b>\n\n`;
        text += `🆔 Buyurtma raqami: #${order.id}\n`;
        text += `🆕 Yangi holat: <b>${statusText}</b>\n\n`;
        
        if (newStatus === 'yolda' || newStatus === 'yo\'lda') {
            text += `<i>Kuryer yaqin orada siz bilan bog'lanadi. Iltimos, aloqada bo'ling!</i>`;
        }

        await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: user.telegram_id, text, parse_mode: 'HTML' })
        });
    } catch(e) {
        console.error("Order status Telegram notification error:", e);
    }
}

export async function sendTransferOTP(phone: string, amount: number, receiverPhone: string, code: string) {
    try {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('telegram_id')
            .eq('phone', phone)
            .single();

        if (!user || !user.telegram_id || !CUSTOMER_BOT_TOKEN) return;

        let text = `💳 <b>P2P O'tkazma so'rovi!</b>\n\n`;
        text += `💰 Summa: <b>${amount.toLocaleString()} so'm</b>\n`;
        text += `👤 Qabul qiluvchi: <b>${receiverPhone}</b>\n\n`;
        text += `🔑 Tasdiqlash kodi: <code>${code}</code>\n\n`;
        text += `⚠️ <i>Agar ushbu so'rovni siz yubormagan bo'lsangiz, kodni hech kimga bermang!</i>`;

        await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: user.telegram_id, text, parse_mode: 'HTML' })
        });
    } catch(e) {
        console.error("OTP Telegram notification error:", e);
    }
}

export async function sendCartReminder(phone: string, items: any[], customNote?: string) {
    try {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('telegram_id, name')
            .eq('phone', phone)
            .single();

        if (!user || !user.telegram_id || !CUSTOMER_BOT_TOKEN) return { success: false, error: "Foydalanuvchi botga ulanmagan" };

        const itemsText = items.map((i: any) => `• <b>${i.name}</b> (x${i.quantity || 1} ta) — ${(Number(i.price) * (i.quantity || 1)).toLocaleString()} so'm`).join('\n');
        const total = items.reduce((sum, i) => sum + (Number(i.price) * (i.quantity || 1)), 0);

        let text = `🛒 <b>Savatda mahsulotlar qolib ketdi!</b>\n\n`;
        text += `Assalomu alaykum, <b>${user.name || 'Hurmatli mijoz'}</b>!\n`;
        text += `Sizning savatingizda quyidagi mahsulotlar o'z xaridini kutmoqda:\n\n`;
        text += `📦 <b>Tanlangan mahsulotlar:</b>\n${itemsText}\n\n`;
        text += `💰 <b>Jami summa:</b> <b>${total.toLocaleString()} so'm</b>\n\n`;
        
        if (customNote && customNote.trim()) {
            text += `🎁 <b>Admin eslatmasi:</b>\n<i>${customNote.trim()}</i>\n\n`;
        }

        text += `🏃‍♂️ <i>Mahsulotlar soni cheklangan, ularni hoziroq rasmiylashtirib oling!</i>`;

        // Create one-time secure magic login token (cross-device auto-login)
        let cartUrl = `https://velari.uz/uz/cart?ref=tg_reminder`;
        try {
            const loginToken = typeof crypto !== 'undefined' && crypto.randomBytes 
                ? crypto.randomBytes(24).toString('hex') 
                : ('lt_' + Date.now() + '_' + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2));
            const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 kun

            const { error: ltErr } = await supabaseAdmin.from('login_tokens').insert([{
                token: loginToken,
                phone: phone,
                next_path: '/uz/cart',
                expires_at: expiresAt,
                used: false
            }]);

            if (!ltErr) {
                cartUrl = `https://velari.uz/uz/auth?lt=${loginToken}`;
            }
        } catch (ltErr) {
            console.warn("Magic login token generation error:", ltErr);
        }

        // Inline keyboard button leading directly to cart with auto-login
        const reply_markup = {
            inline_keyboard: [
                [
                    {
                        text: "🛒 Savatni ochish va xarid qilish",
                        url: cartUrl
                    }
                ]
            ]
        };

        // Find primary product image
        const firstValidImage = items.find((i: any) => i.image && i.image.startsWith("http"))?.image 
            || (items[0]?.image ? `https://velari.uz${items[0].image}` : null);

        // 1. Try sending with photo first
        if (firstValidImage && text.length <= 1000) {
            try {
                const photoRes = await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendPhoto`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: user.telegram_id,
                        photo: firstValidImage,
                        caption: text,
                        parse_mode: 'HTML',
                        reply_markup
                    })
                });
                const photoData = await photoRes.json();
                if (photoData.ok) {
                    return { success: true };
                }
            } catch (err) {
                console.warn("sendPhoto failed, falling back to sendMessage:", err);
            }
        }

        // 2. Fallback: sendMessage with rich preview and button
        const res = await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: user.telegram_id, 
                text, 
                parse_mode: 'HTML',
                reply_markup,
                link_preview_options: {
                    is_disabled: false,
                    prefer_large_media: true
                }
            })
        });
        
        const data = await res.json();
        if (!data.ok) throw new Error(data.description);

        return { success: true };
    } catch(e: any) {
        console.error("Cart reminder Telegram notification error:", e);
        return { success: false, error: e.message };
    }
}

export async function sendLowStockAlert(lowStockItems: { name: string; stock: number }[]) {
    try {
        if (!ADMIN_BOT_TOKEN || !ADMIN_ID || lowStockItems.length === 0) return;

        let text = `⚠️ <b>DIQQAT! Mahsulot tugamoqda</b>\n\n`;
        text += `Quyidagi mahsulotlarning ombordagi qoldig'i 5 tadan kam qoldi:\n\n`;
        
        lowStockItems.forEach((item, index) => {
            text += `${index + 1}. <b>${item.name}</b> — <i>${item.stock} ta qoldi!</i>\n`;
        });
        
        text += `\n<i>Sotuvlar to'xtab qolmasligi uchun zudlik bilan omborni to'ldiring.</i>`;

        await fetch(`https://api.telegram.org/bot${ADMIN_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: ADMIN_ID, text, parse_mode: 'HTML' })
        });
    } catch(e) {
        console.error("Low stock Telegram alert error:", e);
    }
}
export async function sendPinResetCode(phone: string, code: string) {
    try {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('telegram_id')
            .eq('phone', phone)
            .single();

        if (!user || !user.telegram_id || !CUSTOMER_BOT_TOKEN) return;

        let text = `🔐 <b>Hamkorlik PIN-kodini tiklash!</b>\n\n`;
        text += `Tasdiqlash kodi: <code>${code}</code>\n\n`;
        text += `⚠️ <i>Ushbu kodni hech kimga bermang! Agar ushbu so'rovni siz yubormagan bo'lsangiz, ushbu xabarga e'tibor bermang.</i>`;

        await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: user.telegram_id, text, parse_mode: 'HTML' })
        });
    } catch(e) {
        console.error("PIN Reset Telegram notification error:", e);
    }
}
export async function sendMemberVerificationCode(phone: string, senderName: string, code: string) {
    try {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('telegram_id')
            .eq('phone', phone)
            .single();

        if (!user || !user.telegram_id || !CUSTOMER_BOT_TOKEN) return;

        let text = `👥 <b>Hamkorlik jamoasiga taklif!</b>\n\n`;
        text += `<b>${senderName}</b> sizni o'z jamoasiga qo'shmoqchi.\n`;
        text += `Tasdiqlash kodi: <code>${code}</code>\n\n`;
        text += `⚠️ <i>Agar siz jamoaga qo'shilishni xohlamasangiz, ushbu kodni hech kimga bermang.</i>`;

        await fetch(`https://api.telegram.org/bot${CUSTOMER_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: user.telegram_id, text, parse_mode: 'HTML' })
        });
    } catch(e) {
        console.error("Member verification Telegram notification error:", e);
    }
}

export async function getUserOrdersForBot(telegramId: string) {
    try {
        const { data: user } = await supabaseAdmin
            .from('users')
            .select('phone, name')
            .eq('telegram_id', telegramId)
            .single();

        if (!user || !user.phone) {
            return {
                found: false,
                text: "⚠️ Siz hali saytimizda yoki botda ro'yxatdan o'tmagansiz.\n\nIltimos, avval 📱 <b>Ro'yxatdan o'tish</b> tugmasini bosib telefon raqamingizni tasdiqlang."
            };
        }

        const { data: orders } = await supabaseAdmin
            .from('orders')
            .select('*')
            .eq('user_phone', user.phone)
            .order('created_at', { ascending: false })
            .limit(5);

        if (!orders || orders.length === 0) {
            return {
                found: true,
                text: `📦 <b>Mening buyurtmalarim</b>\n\nFoydalanuvchi: <b>${user.name || user.phone}</b>\n\nSizda hozircha hech qanday buyurtmalar mavjud emas.`
            };
        }

        let text = `📦 <b>Sizning oxirgi buyurtmalaringiz:</b>\n\n`;
        orders.forEach((order: any, index: number) => {
            let statusEmoji = "⏳";
            const st = (order.status || "").toLowerCase();
            if (st.includes("yolda") || st.includes("yo'lda")) statusEmoji = "🚚";
            else if (st.includes("yetkazildi")) statusEmoji = "✅";
            else if (st.includes("bekor")) statusEmoji = "❌";
            else if (st.includes("qabul")) statusEmoji = "📦";

            const itemsStr = (order.items || []).map((i: any) => `${i.name} (x${i.quantity || 1})`).join(", ");
            text += `${index + 1}. <b>Buyurtma #${order.id}</b>\n`;
            text += `   ${statusEmoji} Holat: <b>${order.status || 'Qabul qilindi'}</b>\n`;
            text += `   🛍 Mahsulotlar: ${itemsStr}\n`;
            text += `   💰 Summa: ${Number(order.total || 0).toLocaleString()} so'm\n\n`;
        });

        return { found: true, text };
    } catch (e: any) {
        console.error("getUserOrdersForBot error:", e);
        return { found: false, text: "Xatolik yuz berdi. Iltimos keyinroq qayta urinib ko'ring." };
    }
}

function escapeHtml(str: string): string {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

export async function forwardCustomerSupportMessage(customerChatId: string, customerPhone: string | null, customerName: string | null, messageText: string) {
    try {
        const adminId = process.env.TELEGRAM_ADMIN_ID || "5572037414";
        const adminBotToken = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
        const customerBotToken = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;

        if (!adminBotToken && !customerBotToken) {
            console.error("No telegram bot token configured");
            return false;
        }

        const safeName = escapeHtml(customerName || 'Noma\'lum');
        const safePhone = escapeHtml(customerPhone || 'Kiritilmagan');
        const safeText = escapeHtml(messageText || '');

        let text = `💬 <b>MIJOZ KUTISH / SUPPORT XABARI</b>\n\n`;
        text += `👤 <b>Mijoz:</b> ${safeName}\n`;
        text += `📞 <b>Raqam:</b> <code>${safePhone}</code>\n`;
        text += `🆔 <b>Telegram ID:</b> <code>${customerChatId}</code>\n\n`;
        text += `📝 <b>Xabar:</b>\n<i>"${safeText}"</i>\n\n`;
        text += `───────────────\n`;
        text += `↩️ <b>Javob berish uchun:</b>\n`;
        text += `Ushbu xabarga <b>Reply</b> qiling yoki quyidagi komandadan foydalaning:\n`;
        text += `<code>/reply ${customerChatId} [javobingiz]</code>`;

        // 1-urinish: Admin Bot orqali yuborish
        if (adminBotToken) {
            const res = await fetch(`https://api.telegram.org/bot${adminBotToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: adminId, text, parse_mode: 'HTML' })
            });
            const data = await res.json();
            if (data.ok) return true;
        }

        // 2-urinish (Zaxira): Customer Bot orqali Admin ID ga yuborish
        if (customerBotToken) {
            const res = await fetch(`https://api.telegram.org/bot${customerBotToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: adminId, text, parse_mode: 'HTML' })
            });
            const data = await res.json();
            return data.ok;
        }
        return false;
    } catch (e) {
        console.error("forwardCustomerSupportMessage error:", e);
        return false;
    }
}

export async function sendSupportReplyToCustomer(customerChatId: string, replyText: string) {
    try {
        const customerBotToken = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN;
        if (!customerBotToken) {
            console.error("TELEGRAM_CUSTOMER_BOT_TOKEN is missing");
            return false;
        }

        const safeReply = escapeHtml(replyText || "");
        let text = `🎧 <b>Operator javobi:</b>\n\n`;
        text += `${safeReply}\n\n`;
        text += `<i>Yana savollaringiz bo'lsa, bemalol yozishingiz mumkin!</i>`;

        const res = await fetch(`https://api.telegram.org/bot${customerBotToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: customerChatId, text, parse_mode: 'HTML' })
        });
        const data = await res.json();
        return data.ok;
    } catch (e) {
        console.error("sendSupportReplyToCustomer error:", e);
        return false;
    }
}


