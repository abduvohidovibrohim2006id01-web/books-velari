import { supabaseAdmin } from "./supabase-admin";

const ADMIN_BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${ADMIN_BOT_TOKEN}`;

export interface ProductModerationItem {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    model?: string;
    brand_id?: string;
    brand?: string;
    color_name?: string;
    sku?: string;
    article?: string;
    barcode?: string;
    price: number;
    old_price?: number;
    stock: number;
    image: string;
    images?: string[];
    image_metadata?: Record<string, any>;
}

export async function sendTelegramRaw(method: string, payload: any) {
    if (!ADMIN_BOT_TOKEN) return null;
    try {
        const res = await fetch(`${TELEGRAM_API}/${method}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (err) {
        console.error(`Telegram API ${method} error:`, err);
        return null;
    }
}

export async function answerCallback(callbackQueryId: string, text?: string, showAlert = false) {
    return sendTelegramRaw("answerCallbackQuery", {
        callback_query_id: callbackQueryId,
        text: text || "",
        show_alert: showAlert
    });
}

export async function editMessage(chatId: string | number, messageId: number, text: string, replyMarkup?: any) {
    return sendTelegramRaw("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
        parse_mode: "HTML"
    });
}

export function buildProductCard(prod: ProductModerationItem, brandsMap: Record<string, string>) {
    const name = prod.name_uz || prod.name;
    const bId = String(prod.brand_id || prod.brand || "");
    let brand = brandsMap[bId];
    if (!brand) {
        const skuUpper = (prod.sku || "").toUpperCase();
        if (skuUpper.startsWith("VGR")) brand = "VGR";
        else if (skuUpper.startsWith("CRONIER")) brand = "CRONIER";
        else if (skuUpper.startsWith("MAC")) brand = "M•A•C STYLER";
        else if (skuUpper.startsWith("JRM")) brand = "J•R•M STYLER";
        else if (skuUpper.startsWith("BABYVERSE")) brand = "BaByverse";
        else brand = "Ko'rsatilmagan";
    }

    const model = prod.model || "Noma'lum";
    const color = prod.color_name || "Ko'rsatilmagan";
    const sku = prod.sku || prod.article || prod.id;
    const barcode = prod.barcode || "Mavjud emas";
    const price = Number(prod.price || 0);
    const oldPrice = Number(prod.old_price || 0);
    const stock = Number(prod.stock || 0);
    const images = prod.images && prod.images.length > 0 ? prod.images : (prod.image ? [prod.image] : []);

    const lines = [
        `📦 <b>Mahsulot:</b> ${name}`,
        `🏷 <b>Brend:</b> ${brand}`,
        `🔢 <b>Model:</b> <code>${model}</code>`,
        `🎨 <b>Rang:</b> ${color}`,
        `🔖 <b>SKU:</b> <code>${sku}</code>`,
        `📊 <b>Bar-kod:</b> <code>${barcode}</code>`,
        "",
        `💰 <b>Sotuv narxi:</b> <b>${price.toLocaleString()} so'm</b>`
    ];

    if (oldPrice && oldPrice > price) {
        const disc = Math.round(((oldPrice - price) / oldPrice) * 100);
        lines.push(`<s>Eski narxi: ${oldPrice.toLocaleString()} so'm</s> (-${disc}%)`);
    }

    lines.push(`📦 <b>Omborda:</b> ${stock} ta`);
    lines.push(`🖼 <b>Rasmlar soni:</b> ${images.length} ta`);
    lines.push(`🆔 <b>ID:</b> <code>${prod.id}</code>`);

    // Build Inline Keyboard
    const inline_keyboard: any[][] = [];

    // 1. Delete individual images
    if (images.length > 0) {
        const imgButtons: any[] = [];
        images.forEach((_, idx) => {
            imgButtons.push({
                text: `🗑 ${idx + 1}-rasm`,
                callback_data: `del_img:${prod.id}:${idx}`
            });
        });

        for (let i = 0; i < imgButtons.length; i += 3) {
            inline_keyboard.push(imgButtons.slice(i, i + 3));
        }
    }

    // 2. Edit Fields
    inline_keyboard.push([
        { text: "💰 Narxni o'zgartirish", callback_data: `edit_price:${prod.id}` },
        { text: "🔢 Modelni tahrirlash", callback_data: `edit_model:${prod.id}` }
    ]);

    inline_keyboard.push([
        { text: "📝 Nomni tahrirlash", callback_data: `edit_name:${prod.id}` },
        { text: "🏷 Brendni tanlash", callback_data: `edit_brand:${prod.id}` }
    ]);

    // 3. Delete Product / Next Product
    inline_keyboard.push([
        { text: "🗑 Mahsulotni o'chirish", callback_data: `del_prod:${prod.id}` },
        { text: "✅ Keyingisi ➡️", callback_data: `next_prod:${prod.id}` }
    ]);

    return {
        text: lines.join("\n"),
        reply_markup: { inline_keyboard }
    };
}

export async function sendProductForModeration(chatId: string | number, prod: ProductModerationItem, sendAlbum = true) {
    const { data: brands } = await supabaseAdmin.from("brands").select("id, name");
    const brandsMap: Record<string, string> = {};
    (brands || []).forEach(b => { brandsMap[String(b.id)] = b.name; });

    const card = buildProductCard(prod, brandsMap);
    const meta = prod.image_metadata || {};
    const images = prod.images && prod.images.length > 0 ? prod.images : (prod.image ? [prod.image] : []);

    const photoUrls = images.map(u => {
        if (meta[u]?.lg) return meta[u].lg;
        return u;
    }).filter(Boolean).slice(0, 10);

    if (sendAlbum && photoUrls.length > 0) {
        if (photoUrls.length === 1) {
            await sendTelegramRaw("sendPhoto", {
                chat_id: chatId,
                photo: photoUrls[0]
            });
        } else {
            const media = photoUrls.map(url => ({
                type: "photo",
                media: url
            }));
            await sendTelegramRaw("sendMediaGroup", {
                chat_id: chatId,
                media
            });
        }
    }

    return sendTelegramRaw("sendMessage", {
        chat_id: chatId,
        text: card.text,
        reply_markup: card.reply_markup,
        parse_mode: "HTML"
    });
}

export async function getNextProductToReview(currentId?: string): Promise<ProductModerationItem | null> {
    let query = supabaseAdmin
        .from("products")
        .select("*")
        .ilike("barcode", "478%")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

    const { data: list } = await query.limit(400);
    if (!list || list.length === 0) return null;

    if (!currentId) return list[0] as any;

    const currIdx = list.findIndex(p => p.id === currentId);
    if (currIdx !== -1 && currIdx + 1 < list.length) {
        return list[currIdx + 1] as any;
    }
    return list[0] as any;
}
