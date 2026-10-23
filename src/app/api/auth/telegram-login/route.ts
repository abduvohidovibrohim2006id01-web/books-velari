import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { createJwt } from "@/lib/jwt-utils";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-product";
import { getUserJwtSecret } from "@/lib/secrets";

/**
 * Telegram bot bergan bir martalik token orqali saytga avtomatik kirish.
 * Token login_tokens jadvalida saqlanadi, faqat 1 marta va 30 daqiqa ichida ishlaydi.
 */
export async function POST(req: NextRequest) {
    try {
        const { token } = await req.json();
        if (!token || typeof token !== "string") {
            return NextResponse.json({ error: "Token yo'q" }, { status: 400 });
        }

        // 1. Tokenni topish
        const { data: row } = await supabaseAdmin
            .from("login_tokens")
            .select("*")
            .eq("token", token)
            .single();

        if (!row) {
            return NextResponse.json({ error: "Havola yaroqsiz" }, { status: 401 });
        }
        if (row.used) {
            return NextResponse.json({ error: "Havola allaqachon ishlatilgan" }, { status: 401 });
        }
        if (new Date(row.expires_at).getTime() < Date.now()) {
            return NextResponse.json({ error: "Havola muddati tugagan" }, { status: 401 });
        }

        // 2. Tokenni darhol "ishlatilgan" deb belgilash (qayta ishlatilmasligi uchun)
        await supabaseAdmin.from("login_tokens").update({ used: true }).eq("token", token);

        // 3. Foydalanuvchini topish
        const { data: user } = await supabaseAdmin
            .from("users")
            .select("*")
            .eq("phone", row.phone)
            .single();

        if (!user) {
            return NextResponse.json({ error: "Foydalanuvchi topilmadi" }, { status: 404 });
        }

        // 4. Sessiya tokeni (oddiy login bilan bir xil)
        const JWT_SECRET = getUserJwtSecret();
        const jwt = await createJwt({
            sub: user.phone,
            role: "user",
            token_version: user.token_version || 1,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 kun
        }, JWT_SECRET);

        // 5. Foydalanuvchining savatini tiklash (agar active_carts da bo'lsa)
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
                            return {
                                ...p,
                                quantity: it.quantity || 1,
                            };
                        }).filter(Boolean);
                    }
                }
            }
        } catch { /* savat tiklash xatosi tizimni to'xtatmaydi */ }

        const response = NextResponse.json({
            success: true,
            next: row.next_path || null,
            cart: cartItems,
            user: {
                id: user.id,
                phone: user.phone,
                name: user.name || "Mijoz",
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
        console.error("Telegram login error:", error);
        return NextResponse.json({ error: "Server xatosi" }, { status: 500 });
    }
}
