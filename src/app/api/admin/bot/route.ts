import { NextResponse } from "next/server";
import { logOrderStatusChange } from "@/lib/admin-audit";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendSupportReplyToCustomer, sendOrderStatusNotification } from "@/lib/telegram";
import {
    sendTelegramRaw,
    answerCallback,
    editMessage,
    buildProductCard,
    sendProductForModeration,
    getNextProductToReview
} from "@/lib/telegram-moderation";
import { runFullSystemDiagnostic } from "@/lib/health-checker";

const ADMIN_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${ADMIN_BOT_TOKEN}`;
const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID || "5572037414";

// Bosh boshqaruv menyusi (Reply Keyboard)
const ADMIN_MAIN_KEYBOARD = {
    keyboard: [
        [{ text: "📦 Oxirgi buyurtmalar" }, { text: "📊 Bugungi statistika" }],
        [{ text: "💬 Kutayotgan chatlar" }, { text: "⚠️ Kam qolgan tovarlar" }],
        [{ text: "🔍 Buyurtma qidirish" }, { text: "⚙️ Mahsulot moderatsiyasi" }],
        [{ text: "🩺 Tizim diagnostikasi" }]
    ],
    resize_keyboard: true
};

const CANCEL_KEYBOARD = {
    keyboard: [[{ text: "❌ Bekor qilish / Orqaga" }]],
    resize_keyboard: true
};

function escapeHtml(str: string): string {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function renderOrderCard(order: any) {
    const itemsText = (order.items || []).map((i: any) => `• <b>${escapeHtml(i.name)}</b> (x${i.quantity || 1}) — <i>${Number(i.price || 0).toLocaleString()} so'm</i>`).join('\n');
    
    let stEmoji = "⏳";
    const st = (order.status || "").toLowerCase();
    if (st.includes("yolda") || st.includes("yo'lda") || st.includes("yetkazil")) stEmoji = "🚚";
    else if (st.includes("yetkazildi")) stEmoji = "✅";
    else if (st.includes("bekor")) stEmoji = "❌";

    let timeStr = "";
    try {
        timeStr = new Date(order.created_at).toLocaleString("uz-UZ", { timeZone: "Asia/Tashkent" });
    } catch {
        timeStr = order.created_at || "";
    }

    let text = `📦 <b>Buyurtma #${order.id}</b>\n\n`;
    text += `⏰ <b>Vaqti:</b> ${timeStr}\n`;
    text += `📞 <b>Mijoz:</b> <code>${escapeHtml(order.user_phone || "Kiritilmagan")}</code>\n`;
    text += `📍 <b>Manzil:</b> ${escapeHtml(order.address || "Ko'rsatilmagan")}\n`;
    text += `💳 <b>To'lov:</b> ${order.payment_method === 'click' ? "Click (Onlayn)" : "Naqd pul"}\n`;
    text += `📊 <b>Holat:</b> ${stEmoji} <b>${escapeHtml(order.status || "Kutilmoqda")}</b>\n\n`;
    text += `🛍 <b>Mahsulotlar:</b>\n${itemsText || "Mavjud emas"}\n\n`;
    text += `💰 <b>Jami summa:</b> <b>${Number(order.total || 0).toLocaleString()} so'm</b>`;

    const inline_keyboard: any[][] = [
        [
            { text: "🚚 Yetkazilmoqda", callback_data: `st:${order.id}:yolda` },
            { text: "✅ Yetkazildi", callback_data: `st:${order.id}:yetkazildi` }
        ],
        [
            { text: "❌ Bekor qilish", callback_data: `st:${order.id}:bekor_qilindi` }
        ]
    ];

    return { text, reply_markup: { inline_keyboard } };
}

async function sendAdminMessage(chatId: number | string, text: string, replyMarkup?: any) {
    await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id: chatId,
            text,
            reply_markup: replyMarkup !== undefined ? replyMarkup : ADMIN_MAIN_KEYBOARD,
            parse_mode: "HTML"
        }),
    });
}

export async function POST(req: Request) {
    try {
        // 🛡 0. SECURE TELEGRAM WEBHOOK AUTHENTICATION
        const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
        const incomingSecret = req.headers.get("x-telegram-bot-api-secret-token");
        if (webhookSecret && incomingSecret !== webhookSecret) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();

        // ==========================================
        // 1. INLINE CALLBACK QUERY HANDLER
        // ==========================================
        if (body.callback_query) {
            const cb = body.callback_query;
            const fromId = cb.from?.id?.toString() || cb.message?.chat?.id?.toString();

            // Faqat ruxsat etilgan adminga ruxsat berish
            if (fromId !== ADMIN_ID.toString()) {
                await answerCallback(cb.id, "❌ Ruxsat etilmadi!", true);
                return NextResponse.json({ ok: true });
            }

            const chatId = cb.message.chat.id;
            const messageId = cb.message.message_id;
            const data: string = cb.data || "";

            // A) 🗑 RASMNI O'CHIRISH (del_img:<productId>:<idx>)
            if (data.startsWith("del_img:")) {
                const [, productId, idxStr] = data.split(":");
                const imgIdx = parseInt(idxStr, 10);

                const { data: prod } = await supabaseAdmin
                    .from("products")
                    .select("*")
                    .eq("id", productId)
                    .single();

                if (!prod) {
                    await answerCallback(cb.id, "❌ Mahsulot topilmadi!", true);
                    return NextResponse.json({ ok: true });
                }

                const currentImages: string[] = prod.images && prod.images.length > 0 ? [...prod.images] : (prod.image ? [prod.image] : []);
                if (imgIdx < 0 || imgIdx >= currentImages.length) {
                    await answerCallback(cb.id, "❌ Bu rasm allaqachon o'chirilgan!", true);
                    return NextResponse.json({ ok: true });
                }

                const deletedUrl = currentImages[imgIdx];
                currentImages.splice(imgIdx, 1);

                const updatedMeta = { ...(prod.image_metadata || {}) };
                if (deletedUrl && updatedMeta[deletedUrl]) {
                    delete updatedMeta[deletedUrl];
                }

                const newMainImage = currentImages[0] || "";

                // Update in Supabase
                await supabaseAdmin
                    .from("products")
                    .update({
                        image: newMainImage,
                        images: currentImages,
                        image_metadata: updatedMeta,
                        updated_at: new Date().toISOString()
                    })
                    .eq("id", productId);

                await answerCallback(cb.id, `✅ ${imgIdx + 1}-rasm muvaffaqiyatli o'chirildi! Qoldi: ${currentImages.length} ta`);

                // Re-render updated card
                const { data: brands } = await supabaseAdmin.from("brands").select("id, name");
                const brandsMap: Record<string, string> = {};
                (brands || []).forEach(b => { brandsMap[String(b.id)] = b.name; });

                const updatedProd = { ...prod, image: newMainImage, images: currentImages, image_metadata: updatedMeta };
                const card = buildProductCard(updatedProd as any, brandsMap);

                await editMessage(chatId, messageId, card.text, card.reply_markup);
                return NextResponse.json({ ok: true });
            }

            // B) 💰 NARXNI O'ZGARTIRISH (edit_price:<productId>)
            if (data.startsWith("edit_price:")) {
                const [, productId] = data.split(":");
                await supabaseAdmin.from("bot_sessions").upsert({
                    chat_id: chatId.toString(),
                    step: `edit_price:${productId}`,
                    updated_at: new Date().toISOString()
                });

                await answerCallback(cb.id);
                await sendAdminMessage(
                    chatId,
                    `💰 <b>Yangi sotuv narxini kiriting:</b>\n\n` +
                    `<i>Faqat son kiriting (masalan: <code>250000</code>)\n` +
                    `Yoki sotuv va eski narxni birga kiriting: <code>250000 350000</code></i>`,
                    {
                        inline_keyboard: [
                            [{ text: "❌ Bekor qilish", callback_data: `cancel_action:${productId}` }]
                        ]
                    }
                );
                return NextResponse.json({ ok: true });
            }

            // C) 🔢 MODELNI O'ZGARTIRISH (edit_model:<productId>)
            if (data.startsWith("edit_model:")) {
                const [, productId] = data.split(":");
                await supabaseAdmin.from("bot_sessions").upsert({
                    chat_id: chatId.toString(),
                    step: `edit_model:${productId}`,
                    updated_at: new Date().toISOString()
                });

                await answerCallback(cb.id);
                await sendAdminMessage(
                    chatId,
                    `🔢 <b>Yangi model kodini kiriting:</b>\n\n<i>Masalan: <code>V-475</code> yoki <code>CR-8803</code></i>`,
                    {
                        inline_keyboard: [
                            [{ text: "❌ Bekor qilish", callback_data: `cancel_action:${productId}` }]
                        ]
                    }
                );
                return NextResponse.json({ ok: true });
            }

            // D) 📝 NOMNI O'ZGARTIRISH (edit_name:<productId>)
            if (data.startsWith("edit_name:")) {
                const [, productId] = data.split(":");
                await supabaseAdmin.from("bot_sessions").upsert({
                    chat_id: chatId.toString(),
                    step: `edit_name:${productId}`,
                    updated_at: new Date().toISOString()
                });

                await answerCallback(cb.id);
                await sendAdminMessage(
                    chatId,
                    `📝 <b>Yangi mahsulot nomini yuboring (O'zbekcha):</b>`,
                    {
                        inline_keyboard: [
                            [{ text: "❌ Bekor qilish", callback_data: `cancel_action:${productId}` }]
                        ]
                    }
                );
                return NextResponse.json({ ok: true });
            }

            // E) 🏷 BRENDNI TANLASH (edit_brand:<productId>)
            if (data.startsWith("edit_brand:")) {
                const [, productId] = data.split(":");
                await answerCallback(cb.id);

                const { data: topBrands } = await supabaseAdmin
                    .from("brands")
                    .select("id, name")
                    .eq("is_deleted", false)
                    .limit(10);

                const brandButtons: any[][] = [];
                (topBrands || []).forEach(b => {
                    brandButtons.push([{ text: `🏷 ${b.name}`, callback_data: `set_brand:${productId}:${b.id}` }]);
                });
                brandButtons.push([{ text: "✏️ Boshqa brend yozish", callback_data: `custom_brand:${productId}` }]);
                brandButtons.push([{ text: "❌ Bekor qilish", callback_data: `cancel_action:${productId}` }]);

                await sendAdminMessage(
                    chatId,
                    `🏷 <b>Mahsulot uchun brendni tanlang:</b>`,
                    { inline_keyboard: brandButtons }
                );
                return NextResponse.json({ ok: true });
            }

            // F) SET BRAND (set_brand:<productId>:<brandId>)
            if (data.startsWith("set_brand:")) {
                const [, productId, brandId] = data.split(":");
                await supabaseAdmin
                    .from("products")
                    .update({ brand_id: brandId, updated_at: new Date().toISOString() })
                    .eq("id", productId);

                await answerCallback(cb.id, "✅ Brend muvaffaqiyatli o'zgartirildi!");
                
                const { data: updatedProd } = await supabaseAdmin.from("products").select("*").eq("id", productId).single();
                if (updatedProd) {
                    await sendProductForModeration(chatId, updatedProd as any, false);
                }
                return NextResponse.json({ ok: true });
            }

            // G) CUSTOM BRAND INPUT
            if (data.startsWith("custom_brand:")) {
                const [, productId] = data.split(":");
                await supabaseAdmin.from("bot_sessions").upsert({
                    chat_id: chatId.toString(),
                    step: `edit_brand_custom:${productId}`,
                    updated_at: new Date().toISOString()
                });
                await answerCallback(cb.id);
                await sendAdminMessage(chatId, `✏️ <b>Yangi brend nomini yozib yuboring:</b>`, {
                    inline_keyboard: [[{ text: "❌ Bekor qilish", callback_data: `cancel_action:${productId}` }]]
                });
                return NextResponse.json({ ok: true });
            }

            // H) 🗑 MAHSULOTNI BUTUNLAY O'CHIRISH (del_prod:<productId>)
            if (data.startsWith("del_prod:")) {
                const [, productId] = data.split(":");
                await supabaseAdmin
                    .from("products")
                    .update({ is_deleted: true, updated_at: new Date().toISOString() })
                    .eq("id", productId);

                await answerCallback(cb.id, "🗑 Mahsulot o'chirildi!", true);
                await editMessage(chatId, messageId, `<s>Mahsulot muvaffaqiyatli o'chirildi 🗑</s>`);

                // Auto fetch next product
                const next = await getNextProductToReview(productId);
                if (next) {
                    await sendProductForModeration(chatId, next, true);
                } else {
                    await sendAdminMessage(chatId, "🎉 <b>Barcha mahsulotlar ko'rib chiqildi!</b>");
                }
                return NextResponse.json({ ok: true });
            }

            // I) ✅ KEYINGI MAHSULOT (next_prod:<currentId>)
            if (data.startsWith("next_prod:")) {
                const [, currentId] = data.split(":");
                await answerCallback(cb.id, "Keyingisi yuklanmoqda...");

                const next = await getNextProductToReview(currentId);
                if (next && next.id !== currentId) {
                    await sendProductForModeration(chatId, next, true);
                } else {
                    await sendAdminMessage(chatId, "🎉 <b>Barcha yangi mahsulotlar ko'rib chiqildi!</b>");
                }
                return NextResponse.json({ ok: true });
            }

            // J) ❌ BEKOR QILISH (cancel_action)
            if (data.startsWith("cancel_action")) {
                await supabaseAdmin.from("bot_sessions").delete().eq("chat_id", chatId.toString());
                await answerCallback(cb.id, "Amal bekor qilindi");
                await sendAdminMessage(chatId, "❌ <i>Amal bekor qilindi.</i>", ADMIN_MAIN_KEYBOARD);
                return NextResponse.json({ ok: true });
            }

            // K) 📦 BUYURTMA HOLATINI O'ZGARTIRISH (st:<orderId>:<status>)
            if (data.startsWith("st:")) {
                const [, orderId, newStatus] = data.split(":");

                let dbStatus = newStatus;
                if (newStatus === "yolda") dbStatus = "Yetkazilmoqda";
                else if (newStatus === "yetkazildi") dbStatus = "Yetkazildi";
                else if (newStatus === "bekor_qilindi") dbStatus = "Bekor qilingan";

                const { data: before } = await supabaseAdmin.from("orders").select("status").eq("id", orderId).maybeSingle();
                await supabaseAdmin
                    .from("orders")
                    .update({ status: dbStatus, updated_at: new Date().toISOString() })
                    .eq("id", orderId);
                await logOrderStatusChange({
                    actor: `telegram:${chatId}`, orderId, oldStatus: before?.status, newStatus: dbStatus, source: "admin/bot",
                });

                // Mijozga ham avtomatik Telegram bildirishnoma yuborish
                await sendOrderStatusNotification(orderId, newStatus);

                await answerCallback(cb.id, `✅ Holat yangilandi: ${dbStatus}!`, false);
                await sendAdminMessage(
                    chatId,
                    `✅ <b>Buyurtma #${orderId}</b> holati <b>${dbStatus}</b> ga o'zgartirildi va mijozga bildirishnoma yuborildi!`,
                    ADMIN_MAIN_KEYBOARD
                );
                return NextResponse.json({ ok: true });
            }
        }

        // ==========================================
        // 2. INCOMING TEXT MESSAGE HANDLER
        // ==========================================
        if (body.message) {
            const { chat, text, reply_to_message } = body.message;
            const adminChatId = chat.id;
            if (!text) return NextResponse.json({ ok: true });

            // Faqat ruxsat etilgan adminga javob berish
            if (adminChatId.toString() !== ADMIN_ID.toString()) {
                return NextResponse.json({ ok: true });
            }

            const trimmed = text.trim();

            // Check active session step
            const { data: session } = await supabaseAdmin
                .from("bot_sessions")
                .select("*")
                .eq("chat_id", adminChatId.toString())
                .single();

            // Bekor qilish komandasi
            if (trimmed === "❌ Bekor qilish / Orqaga" || trimmed === "/cancel") {
                await supabaseAdmin.from("bot_sessions").delete().eq("chat_id", adminChatId.toString());
                await sendAdminMessage(adminChatId, "❌ Amal bekor qilindi. Boshqaruv menyusi:", ADMIN_MAIN_KEYBOARD);
                return NextResponse.json({ ok: true });
            }

            if (session && session.step) {
                // 1. NARX KIRITISH
                if (session.step.startsWith("edit_price:")) {
                    const productId = session.step.split(":")[1];
                    const nums = trimmed.replace(/[^0-9 ]/g, "").trim().split(/\s+/).map(Number).filter((n: number) => n > 0);

                    if (nums.length === 0) {
                        await sendAdminMessage(adminChatId, "❌ Noto'g'ri narx! Iltimos faqat son kiriting (masalan: <code>250000</code>):", CANCEL_KEYBOARD);
                        return NextResponse.json({ ok: true });
                    }

                    const newPrice = nums[0];
                    const newOldPrice = nums.length > 1 ? nums[1] : undefined;

                    const updateData: any = { price: newPrice, updated_at: new Date().toISOString() };
                    if (newOldPrice !== undefined) updateData.old_price = newOldPrice;

                    await supabaseAdmin.from("products").update(updateData).eq("id", productId);
                    await supabaseAdmin.from("bot_sessions").delete().eq("chat_id", adminChatId.toString());

                    await sendAdminMessage(
                        adminChatId,
                        `✅ <b>Narx muvaffaqiyatli yangilandi!</b>\n` +
                        `💰 Sotuv narxi: <b>${newPrice.toLocaleString()} so'm</b>` +
                        (newOldPrice ? `\n<s>Eski narx: ${newOldPrice.toLocaleString()} so'm</s>` : ""),
                        ADMIN_MAIN_KEYBOARD
                    );

                    const { data: updatedProd } = await supabaseAdmin.from("products").select("*").eq("id", productId).single();
                    if (updatedProd) {
                        await sendProductForModeration(adminChatId, updatedProd as any, false);
                    }
                    return NextResponse.json({ ok: true });
                }

                // 2. MODEL KIRITISH
                if (session.step.startsWith("edit_model:")) {
                    const productId = session.step.split(":")[1];
                    const newModel = trimmed;

                    await supabaseAdmin.from("products").update({
                        model: newModel,
                        updated_at: new Date().toISOString()
                    }).eq("id", productId);

                    await supabaseAdmin.from("bot_sessions").delete().eq("chat_id", adminChatId.toString());
                    await sendAdminMessage(adminChatId, `✅ <b>Model yangilandi:</b> <code>${newModel}</code>`, ADMIN_MAIN_KEYBOARD);

                    const { data: updatedProd } = await supabaseAdmin.from("products").select("*").eq("id", productId).single();
                    if (updatedProd) {
                        await sendProductForModeration(adminChatId, updatedProd as any, false);
                    }
                    return NextResponse.json({ ok: true });
                }

                // 3. NOM KIRITISH
                if (session.step.startsWith("edit_name:")) {
                    const productId = session.step.split(":")[1];
                    const newName = trimmed;

                    await supabaseAdmin.from("products").update({
                        name: newName,
                        name_uz: newName,
                        updated_at: new Date().toISOString()
                    }).eq("id", productId);

                    await supabaseAdmin.from("bot_sessions").delete().eq("chat_id", adminChatId.toString());
                    await sendAdminMessage(adminChatId, `✅ <b>Nom yangilandi:</b>\n${newName}`, ADMIN_MAIN_KEYBOARD);

                    const { data: updatedProd } = await supabaseAdmin.from("products").select("*").eq("id", productId).single();
                    if (updatedProd) {
                        await sendProductForModeration(adminChatId, updatedProd as any, false);
                    }
                    return NextResponse.json({ ok: true });
                }

                // 4. CUSTOM BRAND KIRITISH
                if (session.step.startsWith("edit_brand_custom:")) {
                    const productId = session.step.split(":")[1];
                    const brandName = trimmed;

                    let { data: bRow } = await supabaseAdmin.from("brands").select("id").ilike("name", brandName).single();
                    if (!bRow) {
                        const { data: newB } = await supabaseAdmin.from("brands").insert({ name: brandName, is_deleted: false }).select("id").single();
                        bRow = newB;
                    }

                    if (bRow) {
                        await supabaseAdmin.from("products").update({
                            brand_id: bRow.id,
                            updated_at: new Date().toISOString()
                        }).eq("id", productId);
                    }

                    await supabaseAdmin.from("bot_sessions").delete().eq("chat_id", adminChatId.toString());
                    await sendAdminMessage(adminChatId, `✅ <b>Brend yangilandi:</b> 🏷 ${brandName}`, ADMIN_MAIN_KEYBOARD);

                    const { data: updatedProd } = await supabaseAdmin.from("products").select("*").eq("id", productId).single();
                    if (updatedProd) {
                        await sendProductForModeration(adminChatId, updatedProd as any, false);
                    }
                    return NextResponse.json({ ok: true });
                }

                // 5. BUYURTMA QIDIRISH (step: "search_order")
                if (session.step === "search_order") {
                    await supabaseAdmin.from("bot_sessions").delete().eq("chat_id", adminChatId.toString());

                    const query = trimmed.replace(/#/g, "").trim();
                    const { data: foundOrders } = await supabaseAdmin
                        .from("orders")
                        .select("*")
                        .or(`id.eq.${query},user_phone.ilike.%${query}%`)
                        .order("created_at", { ascending: false })
                        .limit(5);

                    if (!foundOrders || foundOrders.length === 0) {
                        await sendAdminMessage(
                            adminChatId,
                            `❌ "<code>${escapeHtml(query)}</code>" bo'yicha hech qanday buyurtma topilmadi.`,
                            ADMIN_MAIN_KEYBOARD
                        );
                        return NextResponse.json({ ok: true });
                    }

                    await sendAdminMessage(adminChatId, `🔍 <b>Topilgan buyurtmalar (${foundOrders.length} ta):</b>`);
                    for (const ord of foundOrders) {
                        const card = renderOrderCard(ord);
                        await sendAdminMessage(adminChatId, card.text, card.reply_markup);
                    }
                    return NextResponse.json({ ok: true });
                }
            }

            // BOSH MENYU TUGMALARI

            // 1. /start
            if (trimmed === "/start") {
                await sendAdminMessage(
                    adminChatId,
                    `👑 <b>Velari Admin Boshqaruv Paneliga xush kelibsiz!</b>\n\n` +
                    `Quyidagi menyu tugmalari orqali do'konni qulay boshqarishingiz mumkin:\n\n` +
                    `• 📦 <b>Oxirgi buyurtmalar:</b> So'nggi buyurtmalar ro'yxati va holatini o'zgartirish\n` +
                    `• 📊 <b>Bugungi statistika:</b> Bugungi tushum va buyurtmalar ko'rsatkichlari\n` +
                    `• 💬 <b>Kutayotgan chatlar:</b> Mijozlardan kelgan javob berilmagan xabarlar\n` +
                    `• ⚠️ <b>Kam qolgan tovarlar:</b> Omborda 5 tadan kam qolgan mahsulotlar\n` +
                    `• 🔍 <b>Buyurtma qidirish:</b> ID yoki telefon raqami bo'yicha qidiruv\n` +
                    `• ⚙️ <b>Mahsulot moderatsiyasi:</b> Mahsulot ma'lumotlarini tahrirlash\n` +
                    `• 🩺 <b>Tizim diagnostikasi:</b> Qidiruv, to'lovlar, bazalar va API lar holatini to'liq tekshirish\n\n` +
                    `<i>💡 Mijozga javob yozish uchun uning xabariga Reply qiling yoki <code>/reply &lt;chat_id&gt; &lt;javob&gt;</code> deb yozing.</i>`,
                    ADMIN_MAIN_KEYBOARD
                );
                return NextResponse.json({ ok: true });
            }

            // 2. 📦 Oxirgi buyurtmalar
            if (trimmed === "📦 Oxirgi buyurtmalar") {
                const { data: orders } = await supabaseAdmin
                    .from("orders")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(5);

                if (!orders || orders.length === 0) {
                    await sendAdminMessage(adminChatId, "📦 Hozircha birorta ham buyurtma mavjud emas.", ADMIN_MAIN_KEYBOARD);
                    return NextResponse.json({ ok: true });
                }

                await sendAdminMessage(adminChatId, `📦 <b>Oxirgi ${orders.length} ta buyurtma:</b>`);
                for (const ord of orders) {
                    const card = renderOrderCard(ord);
                    await sendAdminMessage(adminChatId, card.text, card.reply_markup);
                }
                return NextResponse.json({ ok: true });
            }

            // 3. 📊 Bugungi statistika
            if (trimmed === "📊 Bugungi statistika") {
                const now = new Date();
                const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();

                const { data: todayOrders } = await supabaseAdmin
                    .from("orders")
                    .select("total, status")
                    .gte("created_at", startOfDay);

                const count = todayOrders?.length || 0;
                let totalRevenue = 0;
                let deliveredCount = 0;
                let onWayCount = 0;
                let cancelledCount = 0;

                (todayOrders || []).forEach(o => {
                    const st = (o.status || "").toLowerCase();
                    if (!st.includes("bekor")) {
                        totalRevenue += Number(o.total || 0);
                    }
                    if (st.includes("yetkazildi")) deliveredCount++;
                    else if (st.includes("yolda") || st.includes("yo'lda") || st.includes("yetkazil")) onWayCount++;
                    else if (st.includes("bekor")) cancelledCount++;
                });

                const { count: newUsersCount } = await supabaseAdmin
                    .from("users")
                    .select("*", { count: "exact", head: true })
                    .gte("created_at", startOfDay);

                const { count: unreadChatsCount } = await supabaseAdmin
                    .from("support_chats")
                    .select("*", { count: "exact", head: true })
                    .gt("unread_by_admin", 0);

                // Vitrina va tovarlar holati tekshiruvi
                const [inStockRes, homeProdsRes] = await Promise.all([
                    supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("is_deleted", false).gt("stock", 0),
                    supabaseAdmin.from("products").select("id").eq("is_deleted", false).gt("stock", 0).order("sales", { ascending: false, nullsFirst: false }).limit(30)
                ]);
                const inStockCount = inStockRes.count || 0;
                const homeProdsCount = homeProdsRes.data?.length || 0;
                const vitrinaOk = inStockCount > 0 && homeProdsCount > 0;
                const vitrinaBadge = vitrinaOk ? `✅ Soz (${inStockCount} ta tovar sotuvda)` : `🚨 XATOLIK: Tovarlar ko'rinmayapti!`;

                let text = `📊 <b>Bugungi Savdo va Statistika</b>\n`;
                text += `📅 <i>${new Date().toLocaleDateString("uz-UZ", { timeZone: "Asia/Tashkent" })}</i>\n\n`;
                text += `🛍 <b>Do'kon Vitrinasi:</b> ${vitrinaBadge}\n`;
                if (!vitrinaOk) {
                    text += `   ⚠️ <i>DIQQAT: Bosh sahifada xaridorga tovarlar ko'rinmayapti!</i>\n\n`;
                } else {
                    text += `\n`;
                }
                text += `💰 <b>Bugungi tushum:</b> <b>${totalRevenue.toLocaleString()} so'm</b>\n`;
                text += `📦 <b>Jami buyurtmalar:</b> <b>${count} ta</b>\n`;
                text += `   • 🚚 Yetkazilmoqda: <b>${onWayCount} ta</b>\n`;
                text += `   • ✅ Yetkazildi: <b>${deliveredCount} ta</b>\n`;
                text += `   • ❌ Bekor qilingan: <b>${cancelledCount} ta</b>\n\n`;
                text += `👥 <b>Bugungi yangi mijozlar:</b> <b>${newUsersCount || 0} ta</b>\n`;
                text += `💬 <b>Javobsiz chatlar:</b> <b>${unreadChatsCount || 0} ta</b>`;

                await sendAdminMessage(adminChatId, text, ADMIN_MAIN_KEYBOARD);
                return NextResponse.json({ ok: true });
            }

            // 4. 💬 Kutayotgan chatlar
            if (trimmed === "💬 Kutayotgan chatlar") {
                const { data: unreadChats } = await supabaseAdmin
                    .from("support_chats")
                    .select("*")
                    .gt("unread_by_admin", 0)
                    .order("last_timestamp", { ascending: false })
                    .limit(10);

                if (!unreadChats || unreadChats.length === 0) {
                    await sendAdminMessage(
                        adminChatId,
                        "🎉 <b>Ajoyib! Hozircha barcha mijozlarga javob berilgan.</b>\n\nYangi kutayotgan murojaatlar yo'q.",
                        ADMIN_MAIN_KEYBOARD
                    );
                    return NextResponse.json({ ok: true });
                }

                let text = `💬 <b>Javob kutayotgan chatlar (${unreadChats.length} ta):</b>\n\n`;
                unreadChats.forEach((ch, idx) => {
                    const senderLabel = ch.username || ch.id;
                    text += `${idx + 1}. <b>${escapeHtml(senderLabel)}</b>\n`;
                    text += `   📝 <i>"${escapeHtml(ch.last_message || 'Xabar')}"</i>\n`;
                    text += `   ↩️ Javob: <code>/reply ${ch.id} [javobingiz]</code>\n\n`;
                });

                await sendAdminMessage(adminChatId, text, ADMIN_MAIN_KEYBOARD);
                return NextResponse.json({ ok: true });
            }

            // 5. ⚠️ Kam qolgan tovarlar
            if (trimmed === "⚠️ Kam qolgan tovarlar") {
                const { data: lowStock } = await supabaseAdmin
                    .from("products")
                    .select("id, name, stock, price")
                    .eq("is_deleted", false)
                    .lte("stock", 5)
                    .order("stock", { ascending: true })
                    .limit(10);

                if (!lowStock || lowStock.length === 0) {
                    await sendAdminMessage(adminChatId, "✅ <b>Omborda barcha mahsulotlar yetarli miqdorda mavjud!</b>", ADMIN_MAIN_KEYBOARD);
                    return NextResponse.json({ ok: true });
                }

                let text = `⚠️ <b>Omborda kam qolgan tovarlar (<= 5 ta):</b>\n\n`;
                lowStock.forEach((p, idx) => {
                    const stColor = (p.stock || 0) === 0 ? "🔴 TUGAGAN" : `🟡 ${p.stock} ta qoldi`;
                    text += `${idx + 1}. <b>${escapeHtml(p.name)}</b>\n`;
                    text += `   📦 Qoldiq: <b>${stColor}</b> | Narx: ${Number(p.price || 0).toLocaleString()} so'm\n\n`;
                });

                await sendAdminMessage(adminChatId, text, ADMIN_MAIN_KEYBOARD);
                return NextResponse.json({ ok: true });
            }

            // 6. 🔍 Buyurtma qidirish
            if (trimmed === "🔍 Buyurtma qidirish") {
                await supabaseAdmin.from("bot_sessions").upsert({
                    chat_id: adminChatId.toString(),
                    step: "search_order",
                    updated_at: new Date().toISOString()
                });
                await sendAdminMessage(
                    adminChatId,
                    "🔍 <b>Buyurtma qidirish:</b>\n\nBuyurtma raqamini (masalan: <code>100000000000085</code>) yoki mijoz telefon raqamini (masalan: <code>+998959820626</code>) yuboring:",
                    CANCEL_KEYBOARD
                );
                return NextResponse.json({ ok: true });
            }

            // 7. ⚙️ Mahsulot moderatsiyasi
            if (trimmed === "⚙️ Mahsulot moderatsiyasi" || trimmed === "/review" || trimmed === "/moderatsiya") {
                await sendAdminMessage(
                    adminChatId,
                    `👋 <b>Mahsulotlar moderatsiyasi</b>\n\nYangi qo'shilgan mahsulotlarni ko'rib chiqish boshlanmoqda...`,
                    ADMIN_MAIN_KEYBOARD
                );
                const first = await getNextProductToReview();
                if (first) {
                    await sendProductForModeration(adminChatId, first, true);
                } else {
                    await sendAdminMessage(adminChatId, "Bazada yangi ko'rib chiqilmagan mahsulotlar yo'q.", ADMIN_MAIN_KEYBOARD);
                }
                return NextResponse.json({ ok: true });
            }

            if (trimmed === "/next") {
                const next = await getNextProductToReview();
                if (next) {
                    await sendProductForModeration(adminChatId, next, true);
                }
                return NextResponse.json({ ok: true });
            }

            // 8. 🩺 TIZIM DIAGNOSTIKASI (HEALTH CHECK)
            if (trimmed === "🩺 Tizim diagnostikasi" || trimmed === "/health" || trimmed === "/test") {
                await sendAdminMessage(
                    adminChatId,
                    "⏳ <b>Tizim to'liq diagnostikasi boshlandi...</b>\n\nBarcha <b>83 ta API va tizim funksiyalari</b> (qidiruv, savat, buyurtmalar, to'lovlar, auth, hamyon, AI, affiliate va admin API lar) to'liq tekshirilmoqda. Iltimos, bir oz kuting...",
                    ADMIN_MAIN_KEYBOARD
                );

                try {
                    const diagnostic = await runFullSystemDiagnostic();
                    for (const msg of diagnostic.telegramMessages) {
                        await sendAdminMessage(adminChatId, msg, ADMIN_MAIN_KEYBOARD);
                    }
                } catch (diagErr: any) {
                    await sendAdminMessage(
                        adminChatId,
                        `❌ <b>Diagnostikada kutilmagan xatolik:</b>\n<code>${escapeHtml(diagErr?.message || String(diagErr))}</code>`,
                        ADMIN_MAIN_KEYBOARD
                    );
                }
                return NextResponse.json({ ok: true });
            }

            // 9. CUSTOMER SUPPORT REPLY: /reply <chat_id> <text> yoki xabarga reply
            let targetCustomerChatId: string | null = null;
            let replyText = "";

            if (trimmed.startsWith("/reply ")) {
                const parts = trimmed.slice(7).trim().split(" ");
                if (parts.length >= 2) {
                    targetCustomerChatId = parts[0];
                    replyText = parts.slice(1).join(" ");
                }
            } else if (reply_to_message && reply_to_message.text) {
                const match = reply_to_message.text.match(/Telegram ID:\s*(\d+)/i);
                if (match && match[1]) {
                    targetCustomerChatId = match[1];
                    replyText = trimmed;
                }
            }

            if (targetCustomerChatId && replyText) {
                const success = await sendSupportReplyToCustomer(targetCustomerChatId, replyText);
                if (success) {
                    await sendAdminMessage(
                        adminChatId,
                        `✅ <b>Javob mijozga yuborildi!</b>\n\n🆔 Chat ID: <code>${targetCustomerChatId}</code>\n💬 Matn: <i>"${escapeHtml(replyText)}"</i>`,
                        ADMIN_MAIN_KEYBOARD
                    );
                } else {
                    await sendAdminMessage(adminChatId, `❌ <b>Xatolik!</b> Javobni mijozga yuborib bo'lmadi.`, ADMIN_MAIN_KEYBOARD);
                }
                return NextResponse.json({ ok: true });
            }

            // Noma'lum xabar bo'lsa, asosiy menyuni chiqarish
            await sendAdminMessage(
                adminChatId,
                "Kerakli bo'limni tanlash uchun quyidagi menyu tugmalaridan foydalaning:",
                ADMIN_MAIN_KEYBOARD
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error: any) {
        console.error("Admin Bot Route Error:", error);
        return NextResponse.json({ ok: true });
    }
}
