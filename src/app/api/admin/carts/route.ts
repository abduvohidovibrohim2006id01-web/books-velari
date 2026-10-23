import { NextRequest, NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/secrets";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { sendCartReminder } from "@/lib/telegram";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Foydalanuvchining sayt ichidagi (support) chatiga admin xabarini yozish
async function sendInAppMessage(phone: string, text: string) {
    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
    await supabaseAdmin.from("support_messages").insert([{
        id: msgId,
        chat_id: phone,
        text,
        sender_id: "admin",
        sender_type: "admin",
        is_admin: true,
        created_at: new Date().toISOString(),
    }]);
    await supabaseAdmin.from("support_chats").upsert({
        id: phone,
        last_message: text,
        last_timestamp: new Date().toISOString(),
        status: "active",
        unread_by_admin: 0,
    });
}

// Foydalanuvchining qurilmasiga web-push (PWA) yuborish
async function sendWebPushToPhone(phone: string, title: string, body: string, url: string) {
    const { publicKey: pubKey, privateKey: privKey } = getVapidKeys(); // yo'q bo'lsa -> xato (500)
    if (!pubKey || !privKey || !phone) return;

    try {
        const webpush = (await import("web-push")).default;
        webpush.setVapidDetails("mailto:admin@velari.uz", pubKey, privKey);
        
        const cleanPhone = phone.replace(/\D/g, "");
        const { data: tokens } = await supabaseAdmin
            .from("fcm_tokens")
            .select("token")
            .or(`user_phone.eq.${phone},user_phone.eq.+${cleanPhone},user_phone.eq.${cleanPhone}`);

        if (!tokens || tokens.length === 0) return;

        const payload = JSON.stringify({ title, body, url });
        await Promise.all(tokens.map(async (row: any) => {
            try {
                const sub = typeof row.token === 'string' ? JSON.parse(row.token) : row.token;
                if (!sub || !sub.endpoint) return;
                await webpush.sendNotification(sub, payload);
            } catch (err: any) {
                if (err?.statusCode === 410 || err?.statusCode === 404) {
                    await supabaseAdmin.from("fcm_tokens").delete().eq("token", row.token);
                }
            }
        }));
    } catch (err) {
        console.error("sendWebPushToPhone error:", err);
    }
}

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function GET(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        // Fetch active carts that have items in them
        const { data: carts, error } = await supabaseAdmin
            .from("active_carts")
            .select(`
                user_phone,
                items,
                updated_at,
                users ( name, telegram_id )
            `)
            .order("updated_at", { ascending: false })
            .limit(200);

        if (error) throw error;

        // Filter carts that actually have items
        const validCarts = carts?.filter(cart => 
            cart.items && 
            Array.isArray(cart.items) && 
            cart.items.length > 0 && 
            cart.user_phone !== "anonymous"
        ) || [];

        // Extract all unique product IDs
        const allProductIds = Array.from(
            new Set(
                validCarts
                    .flatMap(c => (Array.isArray(c.items) ? c.items : []).map((i: any) => i?.id))
                    .filter(Boolean)
            )
        );

        // Fetch products details from database
        let productMap = new Map<string, any>();
        if (allProductIds.length > 0) {
            const { data: products } = await supabaseAdmin
                .from("products")
                .select("id, name, name_uz, name_ru, price, old_price, image, is_deleted")
                .in("id", allProductIds);

            if (products) {
                productMap = new Map(products.map(p => [p.id, p]));
            }
        }

        // Fetch support chats for reminder timestamps and messages
        const allPhones = validCarts.map(c => c.user_phone).filter(Boolean);
        let chatMap = new Map<string, any>();
        if (allPhones.length > 0) {
            const { data: chats } = await supabaseAdmin
                .from("support_chats")
                .select("id, last_message, last_timestamp")
                .in("id", allPhones);

            if (chats) {
                chatMap = new Map(chats.map(c => [c.id, c]));
            }
        }

        // Enrich carts with product data and reminder history
        const enrichedCarts = validCarts.map(cart => {
            const enrichedItems = (cart.items || []).map((item: any) => {
                const prod = productMap.get(item.id);
                return {
                    id: item.id,
                    quantity: Number(item.quantity) || 1,
                    name: prod?.name_uz || prod?.name || item.name || "(O'chirilgan mahsulot)",
                    price: Number(prod?.price ?? item.price ?? 0),
                    image: prod?.image || item.image || "",
                    is_deleted: !prod || prod.is_deleted === true,
                };
            });

            const total = enrichedItems.reduce((sum: number, it: any) => sum + (it.price * it.quantity), 0);
            const chatInfo = chatMap.get(cart.user_phone);

            return {
                ...cart,
                items: enrichedItems,
                total,
                last_reminded_at: chatInfo?.last_timestamp || null,
                last_reminder_message: chatInfo?.last_message || null,
            };
        });

        return NextResponse.json({ success: true, carts: enrichedCarts });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { phone, items, customMessage } = await req.json();

        if (!phone || !items || items.length === 0) {
            return NextResponse.json({ error: "Noto'g'ri ma'lumot" }, { status: 400 });
        }

        const count = Array.isArray(items) ? items.length : 0;
        const defaultText = `🛒 Savatingizda ${count} ta mahsulot kutib turibdi! Ularni unutmang — hoziroq xarid qiling. 💚`;
        const reminderText = customMessage && customMessage.trim() 
            ? `🛒 Savatingizda ${count} ta mahsulot kutib turibdi!\n${customMessage.trim()}`
            : defaultText;

        const timestamp = new Date().toISOString();

        // Barcha kanallarga parallel yuboramiz (biror kanal ishlamasa ham, qolganlari ishlaydi)
        const [tgResult] = await Promise.allSettled([
            sendCartReminder(phone, items, customMessage), // Telegram
            sendInAppMessage(phone, reminderText),          // Sayt/PWA ichidagi chat
            sendWebPushToPhone(phone, "Velari — Savatingiz", reminderText, "/uz/cart"), // Web push
        ]);

        const tgOk = tgResult.status === "fulfilled" && (tgResult.value as any)?.success;

        return NextResponse.json({
            success: true,
            message: tgOk ? "Eslatma yuborildi (Telegram + Sayt + Push)" : "Eslatma sayt/PWA orqali yuborildi",
            last_reminded_at: timestamp,
            last_reminder_message: reminderText,
            telegram_sent: !!tgOk,
        });
    } catch (error: any) {
        console.error("Cart reminder error:", error);
        return NextResponse.json({ error: error.message || "Xatolik yuz berdi" }, { status: 500 });
    }
}
