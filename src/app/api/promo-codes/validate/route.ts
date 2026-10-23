import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
    try {
        const { code, totalAmount, userPhone } = await req.json();

        if (!code) {
            return NextResponse.json({ success: false, error: "Promo kodni kiriting" }, { status: 400 });
        }

        const normalizedCode = code.trim().toUpperCase();

        // 1. Check standard promo codes first
        const { data: promo } = await supabaseAdmin
            .from("promo_codes")
            .select("*")
            .eq("code", normalizedCode)
            .single();

        if (promo) {
            // Activity check
            if (!promo.active) return NextResponse.json({ success: false, error: "Ushbu promo kod hozirda faol emas" });
            
            // Expiration check
            if (promo.expires_at && new Date(promo.expires_at).getTime() < new Date().getTime()) {
                return NextResponse.json({ success: false, error: "Ushbu promo kodning muddati tugagan" });
            }

            // Usage limit check (umumiy)
            if (promo.usage_limit && promo.usage_count >= promo.usage_limit) {
                return NextResponse.json({ success: false, error: "Ushbu promo koddan foydalanish limiti tugagan" });
            }

            // Per-user limit check (har bir foydalanuvchi uchun)
            if (promo.per_user_limit && promo.per_user_limit > 0) {
                if (!userPhone) {
                    return NextResponse.json({ success: false, error: "Promo kodni ishlatish uchun tizimga kiring" });
                }
                const { count } = await supabaseAdmin
                    .from("promo_redemptions")
                    .select("*", { count: "exact", head: true })
                    .eq("code", normalizedCode)
                    .eq("user_phone", userPhone);
                if ((count || 0) >= promo.per_user_limit) {
                    return NextResponse.json({
                        success: false,
                        error: promo.per_user_limit === 1
                            ? "Siz bu promo kodni allaqachon ishlatgansiz"
                            : `Siz bu promo kodni ${promo.per_user_limit} marta ishlatib bo'lgansiz`
                    });
                }
            }

            // Min amount check
            if (totalAmount && totalAmount < promo.min_order_amount) {
                return NextResponse.json({ 
                    success: false, 
                    error: `Minimal buyurtma miqdori ${promo.min_order_amount.toLocaleString()} so'm bo'lishi kerak` 
                });
            }

            let discount = promo.discount_type === 'fixed' 
                ? promo.discount_value 
                : (totalAmount * promo.discount_value) / 100;

            if (promo.discount_type === 'percent' && promo.max_discount_amount && discount > promo.max_discount_amount) {
                discount = promo.max_discount_amount;
            }

            return NextResponse.json({ success: true, discount, code: promo.code, isAffiliate: false });
        }

        // 2. Check for Advanced Affiliate Promo Code
        const { data: advPromo } = await supabaseAdmin
            .from("affiliate_promo_codes")
            .select("*, promo_code_tariffs(*)")
            .eq("code", normalizedCode)
            .single();

        if (advPromo && advPromo.is_active) {
            const tariff: any = advPromo.promo_code_tariffs;

            if (advPromo.usage_limit && advPromo.usage_count >= advPromo.usage_limit) {
                return NextResponse.json({ success: false, error: "Ushbu promo koddan foydalanish limiti tugagan" });
            }

            // Minimal buyurtma sharti — order tomonida ham shu tekshiriladi (mos bo'lishi uchun)
            const minOrder = Number(tariff?.min_order_value) || 0;
            if (minOrder > 0 && totalAmount < minOrder) {
                return NextResponse.json({ success: false, error: `Minimal buyurtma summasi: ${minOrder.toLocaleString()} so'm` });
            }

            let discount = 0;
            if (tariff) {
                // Server (orders/place) bilan bir xil: percent uchun floor, tovardan oshmaydi
                const raw = tariff.type === 'fixed'
                    ? (Number(tariff.discount_value) || 0)
                    : Math.floor(totalAmount * (Number(tariff.discount_value) || 0) / 100);
                discount = Math.min(Math.max(0, raw), totalAmount);
            }

            return NextResponse.json({
                success: true,
                discount,
                code: advPromo.code,
                isAffiliate: true,
                affiliateName: advPromo.title || "Hamkor"
            });
        }

        // 3. Referal kodlar (users.affiliate_code) o'chirilgan — chegirma ham, hamkor mukofoti ham berilmaydi.

        return NextResponse.json({ success: false, error: "Bunday promo kod mavjud emas" });
    } catch (error: any) {
        console.error("Promo validation error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
