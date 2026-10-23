import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createJwt } from "@/lib/jwt-utils";
import { hashPassword } from "@/lib/auth-utils";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-product";
import { getUserJwtSecret } from "@/lib/secrets";

const BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN || "";

interface TelegramUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
}

function verifyTelegramWebAppData(initData: string, botToken: string): { ok: boolean; user?: TelegramUser } {
    try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get("hash");
        if (!hash) return { ok: false };

        urlParams.delete("hash");

        const params: string[] = [];
        urlParams.forEach((value, key) => {
            params.push(`${key}=${value}`);
        });
        params.sort();
        const dataCheckString = params.join("\n");

        const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
        const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

        if (calculatedHash !== hash) {
            return { ok: false };
        }

        const userRaw = urlParams.get("user");
        const user = userRaw ? (JSON.parse(userRaw) as TelegramUser) : undefined;
        return { ok: true, user };
    } catch {
        return { ok: false };
    }
}

export async function POST(req: NextRequest) {
    try {
        const { initData, phone, name } = await req.json();

        if (!initData || typeof initData !== "string") {
            return NextResponse.json({ error: "Telegram initData mavjud emas" }, { status: 400 });
        }

        // 1. Telegram WebApp imzosini tekshirish
        const verification = verifyTelegramWebAppData(initData, BOT_TOKEN);
        if (!verification.ok || !verification.user) {
            return NextResponse.json({ error: "Telegram ma'lumotlari haqiqiy emas" }, { status: 401 });
        }

        const tgUser = verification.user;
        const telegramId = tgUser.id.toString();
        const tgDisplayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") || tgUser.username || "Mijoz";

        // 2. Ushbu telegram_id bilan foydalanuvchini qidirish
        const { data: existingUserByTg } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("telegram_id", telegramId)
            .single();

        let user = existingUserByTg;

        // 3. Agar mavjud bo'lmasa, lekin telefon berilgan bo'lsa -> ro'yxatdan o'tkazish
        if (!user && phone) {
            let cleanPhone = phone.toString().replace(/[\s\-\(\)]/g, "");
            if (!cleanPhone.startsWith("+")) cleanPhone = "+" + cleanPhone;

            // Avval shu telefon raqami bazada bormi?
            const { data: userByPhone } = await supabaseAdmin
                .from("users")
                .select("*")
                .eq("phone", cleanPhone)
                .single();

            if (userByPhone) {
                // Telefon mavjud bo'lsa, unga ushbu telegram_id ni biriktiramiz
                const { data: updatedUser } = await supabaseAdmin
                    .from("users")
                    .update({
                        telegram_id: telegramId,
                        name: userByPhone.name || name || tgDisplayName
                    })
                    .eq("phone", cleanPhone)
                    .select("*")
                    .single();
                user = updatedUser || userByPhone;
            } else {
                // Yangi foydalanuvchi yaratish
                const newId = crypto.randomUUID();
                const randomPassword = crypto.randomBytes(16).toString("hex");
                const { data: newUser, error: createError } = await supabaseAdmin
                    .from("users")
                    .insert({
                        id: newId,
                        phone: cleanPhone,
                        name: name || tgDisplayName,
                        password: hashPassword(randomPassword),
                        telegram_id: telegramId,
                        username: tgUser.username || null
                    })
                    .select("*")
                    .single();

                if (createError) {
                    console.error("User creation error in Telegram WebApp:", createError);
                    return NextResponse.json({ error: "Ro'yxatdan o'tishda xatolik yuz berdi" }, { status: 500 });
                }
                user = newUser;
            }
        }

        // 4. Foydalanuvchi topilmagan va telefon berilmagan bo'lsa -> telefon kiritishni so'raymiz
        if (!user) {
            return NextResponse.json({
                success: true,
                registered: false,
                telegramUser: {
                    id: telegramId,
                    firstName: tgUser.first_name || "",
                    lastName: tgUser.last_name || "",
                    displayName: tgDisplayName,
                    username: tgUser.username || ""
                }
            });
        }

        // 5. Sessiya yaratish va JWT berish
        const JWT_SECRET = getUserJwtSecret();
        const jwt = await createJwt({
            sub: user.phone,
            role: "user",
            token_version: user.token_version || 1,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 kun
        }, JWT_SECRET);

        // Savatchani tiklash
        let cartItems: any[] = [];
        try {
            const { data: cartRow } = await supabaseAdmin
                .from("active_carts")
                .select("items")
                .eq("user_phone", user.phone)
                .single();

            if (cartRow?.items && Array.isArray(cartRow.items) && cartRow.items.length > 0) {
                const productIds = cartRow.items.map((i: any) => i.id).filter(Boolean);
                if (productIds.length > 0) {
                    const { data: products } = await supabaseAdmin
                        .from("products")
                        .select(PUBLIC_PRODUCT_COLUMNS)
                        .in("id", productIds)
                        .eq("is_deleted", false);

                    if (products) {
                        const prodMap = new Map(products.map(p => [p.id, p]));
                        cartItems = cartRow.items.map((it: any) => {
                            const p = prodMap.get(it.id);
                            if (!p) return null;
                            return { ...p, quantity: it.quantity || 1 };
                        }).filter(Boolean);
                    }
                }
            }
        } catch { /* ignore cart recovery error */ }

        const response = NextResponse.json({
            success: true,
            registered: true,
            cart: cartItems,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name || tgDisplayName,
                username: user.username || "",
                isAdmin: user.is_admin || false
            }
        });

        response.cookies.set("user_token", jwt, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 30 * 24 * 60 * 60,
            path: "/"
        });

        return response;
    } catch (error) {
        console.error("Telegram WebApp auth error:", error);
        return NextResponse.json({ error: "Server xatosi" }, { status: 500 });
    }
}
