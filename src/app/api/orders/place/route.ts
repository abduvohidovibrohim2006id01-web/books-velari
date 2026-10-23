import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { verifyJwt } from "@/lib/jwt-utils";
import { z } from "zod";
import { sendLowStockAlert } from "@/lib/telegram";
import { computeStandardDelivery, EXPRESS_FREE_THRESHOLD } from "@/lib/delivery";
import { estimateExpressDelivery, formatEta } from "@/lib/yandex-delivery";
import { applyGlobalPromo, type PromoSettings } from "@/lib/promo-utils";
import { getUserJwtSecret } from "@/lib/secrets";
import { normalizeOrderStatus } from "@/lib/order-status";

/**
 * Zod Schema for Order Validation
 */
const orderSchema = z.object({
    userPhone: z.string().min(9).max(15),
    items: z.array(z.object({
        id: z.string(),
        name: z.string(),
        price: z.number().positive(),
        quantity: z.number().int().positive(),
        image: z.string().optional()
    })).min(1),
    total: z.number().positive(),
    address: z.string().min(5),
    coords: z.array(z.number()).length(2).optional().nullable(),
    promoCode: z.string().optional().nullable(),
    isWalletPayment: z.boolean().optional(),
    walletUsage: z.number().optional(),
    referralData: z.record(z.string(), z.string()).optional().nullable() // { productId: affiliateLinkSlug }
});

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        // 0. RATE LIMITING
        if (!await checkRateLimit(ip, 15, 60, "orders-place")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish. Bir ozdan so'ng qayta urinib ko'ring." }, { status: 429 });
        }

        // 🛡 JWT AUTH CHECK
        const userToken = req.cookies.get('user_token')?.value;
        const JWT_SECRET = getUserJwtSecret();
        const payload = userToken ? await verifyJwt(userToken, JWT_SECRET) : null;

        const rawBody = await req.json();
        const rawItems = Array.isArray(rawBody.p_items) ? rawBody.p_items : [];
        const computedTotal = rawItems.reduce(
            (sum: number, i: any) => sum + (Number(i.price) || 0) * (Number(i.quantity) || 0),
            0
        );
        const body = {
            userPhone: rawBody.p_user_phone,
            items: rawBody.p_items,
            total: computedTotal,
            address: rawBody.p_address,
            coords: rawBody.p_coords,
            promoCode: rawBody.p_promo_code,
            walletUsage: rawBody.p_wallet_usage,
            referralData: rawBody.p_referral_data
        };
        
        // 1. DATA VALIDATION (Zod)
        const validation = orderSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ 
                success: false, 
                message: "Ma'lumotlar noto'g'ri kiritilgan. Iltimos, barcha maydonlarni tekshiring.", 
                errors: validation.error.format() 
            }, { status: 400 });
        }

        const validatedData = validation.data;

        // 🛡 SECURITY: Verify phone ownership
        if (!payload || payload.sub !== validatedData.userPhone) {
            return NextResponse.json({ success: false, message: "Xavfsizlik tizimi: Noto'g'ri sessiya. Iltimos qayta tizimga kiring." }, { status: 401 });
        }

        // 🛡 NEW: Session Version Check (Logout on password change)
        const { data: dbUser } = await supabaseAdmin
            .from("users")
            .select("token_version")
            .eq("phone", validatedData.userPhone)
            .single();

        if (dbUser && dbUser.token_version !== payload.token_version) {
            return NextResponse.json({ 
                success: false, 
                message: "Sessiya muddati tugagan (Parol o'zgargan). Iltimos, qayta kiring." 
            }, { status: 401 });
        }

        // 2. Execute Atomic DB Transaction via Admin Client (Secure bypass)
        // Boshlang'ich holat: to'lovdan oldingi holat. Client lokalizatsiyalangan
        // qiymat yuborsa o'shani, aks holda o'zbekcha standart qiymatni yozamiz
        // (eski "pending" inglizcha qiymati endi ishlatilmaydi).
        // Mijoz faqat to'lovdan oldingi holatni yubora oladi — "Yetkazildi" va h.k. qabul qilinmaydi.
        const requestedStatus = typeof rawBody.p_status === "string" ? rawBody.p_status.trim() : "";
        const initialStatus =
            requestedStatus && ["awaiting_payment", "pending"].includes(normalizeOrderStatus(requestedStatus))
                ? requestedStatus
                : "To'lov kutilmoqda";
        // Referal kodlar (users.affiliate_code) o'chirilgan: place_order RPC ular uchun chegirma beradi
        // va hamkorga mukofot yozadi — shuning uchun bunday kod RPC'ga UZATILMAYDI (do'kon promo-kodi
        // bo'lmasa). Hamkorlik promo-kodlari (affiliate_promo_codes) quyida alohida, is_active bilan.
        let promoForRpc: string | null = validatedData.promoCode?.trim() || null;
        if (promoForRpc) {
            const variants = Array.from(new Set([promoForRpc, promoForRpc.toUpperCase()]));
            const [{ data: storePromo }, { data: referrer }] = await Promise.all([
                supabaseAdmin.from("promo_codes").select("id").in("code", variants).limit(1).maybeSingle(),
                supabaseAdmin.from("users").select("id").in("affiliate_code", variants).limit(1).maybeSingle(),
            ]);
            if (referrer && !storePromo) promoForRpc = null;
        }

        const { data, error } = await supabaseAdmin.rpc('place_order', {
            p_user_phone: validatedData.userPhone,
            p_items: validatedData.items,
            p_address: validatedData.address,
            p_coords: validatedData.coords || null,
            p_status: initialStatus,
            p_promo_code: promoForRpc,
            p_wallet_usage: validatedData.walletUsage || 0
        });

        if (error) {
            console.error("Order RPC Error:", error);
            return NextResponse.json({ success: false, message: "Buyurtma berishda xatolik: " + error.message }, { status: 500 });
        }

        // --- NEW: Yetkazib berish narxini SERVER tomonida hisoblash va buyurtmaga yozish (#7/#8) ---
        // Narx mijozdan emas, server tomonidan hisoblanadi (xavfsizlik). delivery_* ustunlari
        // mavjud bo'lmasa, update jim ravishda o'tkazib yuboriladi (buyurtma baribir o'tadi).
        try {
            const orderId = data?.orderId;
            if (data?.success && orderId) {
                const reqDeliveryType = rawBody.p_delivery_type === "express" ? "express" : "standard";

                // RPC hisoblagan haqiqiy summani o'qiymiz
                const { data: ord } = await supabaseAdmin
                    .from("orders")
                    .select("total, wallet_amount, discount_amount")
                    .eq("id", orderId)
                    .single();
                const baseTotal = Number(ord?.total) || 0;
                const walletAmt = Number(ord?.wallet_amount) || 0;
                const baseDiscount = Number(ord?.discount_amount) || 0;

                // --- promo-countdown (vaqtli kategoriya/mahsulot chegirmasi) ---
                // RPC total'ni products.price (to'liq narx) dan hisoblaydi va countdown'ni
                // bilmaydi -> payment to'liq narxni ko'rsatardi. Bu yerda chegirmani SERVER
                // tomonida (DB narx+kategoriya bo'yicha, client narxiga ishonmasdan) hisoblab
                // total'dan ayiramiz. Narx checkout (savat) bilan mos bo'ladi.
                let countdownDiscount = 0;
                try {
                    const { data: promoRow } = await supabaseAdmin
                        .from("site_settings").select("value").eq("key", "promo_countdown").maybeSingle();
                    const promo = (promoRow?.value || null) as PromoSettings | null;
                    if (promo?.enabled) {
                        const itemIds = (validatedData.items || []).map((i: any) => i.id);
                        const { data: priceRows } = await supabaseAdmin
                            .from("products").select("id, price, category_id, brand_id").in("id", itemIds);
                        const byId = new Map((priceRows || []).map((p: any) => [String(p.id), p]));
                        for (const it of validatedData.items as any[]) {
                            const p = byId.get(String(it.id));
                            if (!p) continue;
                            const realPrice = Number(p.price) || 0;
                            // applyGlobalPromo Product oladi; kategoriya .category, brend .brand_id maydonida
                            const discountedProduct = applyGlobalPromo(
                                { id: String(p.id), category: p.category_id, brand_id: p.brand_id, price: realPrice } as any,
                                promo
                            );
                            const discounted = Number(discountedProduct.price) || realPrice;
                            countdownDiscount += (realPrice - discounted) * (Number(it.quantity) || 0);
                        }
                    }
                } catch (pcErr) {
                    console.error("Promo-countdown calc skipped:", pcErr);
                }

                // --- Advanced affiliate promo-kod chegirmasi (affiliate_promo_codes + tarif) ---
                // place_order RPC bu jadvalni bilmaydi (faqat promo_codes + eski affiliate_code) ->
                // tarif bo'yicha mijoz chegirmasi total'ga tushmасди. Shu yerda SERVER tomonida
                // qo'llaymiz, shunda checkout'da ko'rsatilgan chegirma haqiqiy summaga mos bo'ladi.
                let affPromoDiscount = 0;
                try {
                    if (validatedData.promoCode) {
                        const code = validatedData.promoCode.toUpperCase();
                        const { data: advPromo } = await supabaseAdmin
                            .from("affiliate_promo_codes")
                            .select("usage_limit, usage_count, is_active, promo_code_tariffs(type, discount_value, min_order_value)")
                            .eq("code", code)
                            .maybeSingle();
                        const tariff: any = (advPromo as any)?.promo_code_tariffs;
                        // Chegirma countdown'dan keyingi tovarlar summasidan hisoblanadi
                        const goodsForPromo = Math.max(0, baseTotal + walletAmt - countdownDiscount);
                        if (advPromo && advPromo.is_active && tariff
                            && (!advPromo.usage_limit || advPromo.usage_count < advPromo.usage_limit)
                            && goodsForPromo >= (Number(tariff.min_order_value) || 0)) {
                            const raw = tariff.type === "fixed"
                                ? (Number(tariff.discount_value) || 0)
                                : Math.floor(goodsForPromo * (Number(tariff.discount_value) || 0) / 100);
                            affPromoDiscount = Math.min(Math.max(0, raw), goodsForPromo);
                        }
                    }
                } catch (apErr) {
                    console.error("Affiliate promo discount calc skipped:", apErr);
                }

                // Bepul yetkazish chegarasi uchun tovarlar summasi. PROMO-KOD chegirmasi bu
                // chegaraga TA'SIR QILMAYDI (promo narx chegirmasi emas, xaridor rag'bati) —
                // shuning uchun RPC ayirgan promo (baseDiscount) qaytarib qo'shiladi va
                // affPromoDiscount ayirilmaydi. Faqat haqiqiy narx chegirmalari (countdown) kamaytiradi.
                const goodsBasis = Math.max(0, baseTotal + walletAmt + baseDiscount - countdownDiscount);

                let deliveryType: "standard" | "express" = "standard";
                let deliveryFee = 0;
                let deliveryEta: string | null = null;

                // Express so'ralgan bo'lsa — kamida bitta mahsulot mos kelishi kerak
                let expressEligible = false;
                if (reqDeliveryType === "express") {
                    const ids = (validatedData.items || []).map((i: any) => i.id);
                    const { data: prods } = await supabaseAdmin
                        .from("products").select("id, express_delivery").in("id", ids);
                    expressEligible = (prods || []).some((p: any) => p.express_delivery === true);
                }

                const coords = Array.isArray(validatedData.coords) ? (validatedData.coords as [number, number]) : null;
                if (expressEligible && coords) {
                    deliveryType = "express";
                    const est = await estimateExpressDelivery(coords);
                    deliveryEta = formatEta(est.etaMinMinutes, est.etaMaxMinutes, "uz");
                    deliveryFee = goodsBasis >= EXPRESS_FREE_THRESHOLD ? 0 : est.price;
                } else {
                    deliveryType = "standard";
                    deliveryFee = computeStandardDelivery(goodsBasis);
                }

                const { error: updErr } = await supabaseAdmin
                    .from("orders")
                    .update({
                        delivery_type: deliveryType,
                        delivery_fee: deliveryFee,
                        delivery_eta: deliveryEta,
                        // Countdown + advanced affiliate-promo chegirmalari total'dan ayiriladi (RPC ularni hisoblamagan)
                        total: Math.max(0, baseTotal - countdownDiscount - affPromoDiscount) + deliveryFee,
                        // discount_amount hujjatlashtirish uchun yangilanadi (affiliate-promo qo'shiladi)
                        discount_amount: baseDiscount + affPromoDiscount,
                    })
                    .eq("id", orderId);
                if (updErr) console.error("Delivery update skipped:", updErr.message);
            }
        } catch (delErr) {
            console.error("Delivery calc error:", delErr);
        }
        // ----------------------------------------------------------------------------------

        // --- Per-user promo redemption (standart promo_codes) ---
        // Har bir foydalanuvchining promo kodni necha marta ishlatganini yozamiz (per_user_limit nazorati uchun).
        try {
            const orderId = data?.orderId;
            if (data?.success && orderId && validatedData.promoCode) {
                const code = validatedData.promoCode.toUpperCase();
                const { data: stdPromo } = await supabaseAdmin
                    .from("promo_codes").select("id").eq("code", code).single();
                if (stdPromo) {
                    await supabaseAdmin.from("promo_redemptions").insert({
                        code,
                        user_phone: validatedData.userPhone,
                        order_id: String(orderId),
                    });
                }
            }
        } catch (e) {
            console.error("Promo redemption record error:", e);
        }
        // ----------------------------------

        // --- Smart discount redemption ---
        try {
            const orderId = data?.orderId;
            if (data?.success && orderId) {
                const itemIds = (validatedData.items || []).map((i: any) => String(i.id));
                if (itemIds.length > 0) {
                    const updatePayload: Record<string, any> = {
                        status: "redeemed",
                        redeemed_order_id: String(orderId)
                    };
                    const { error: redeemErr } = await supabaseAdmin
                        .from("smart_discount_offers")
                        .update(updatePayload)
                        .eq("user_identifier", validatedData.userPhone)
                        .eq("status", "active")
                        .in("product_id", itemIds);

                    if (redeemErr) {
                        // Fallback agar redeemed_order_id ustuni mavjud bo'lmasa
                        await supabaseAdmin
                            .from("smart_discount_offers")
                            .update({ status: "redeemed" })
                            .eq("user_identifier", validatedData.userPhone)
                            .eq("status", "active")
                            .in("product_id", itemIds);
                    }
                }
            }
        } catch (sdoErr) {
            console.error("Smart discount redemption error:", sdoErr);
        }
        // ----------------------------------

        // --- NEW: Check Low Stock Alert ---
        try {
            const productIds = validatedData.items.map((i: any) => i.id);
            const { data: stockCheck } = await supabaseAdmin
                .from("products")
                .select("id, name, stock")
                .in("id", productIds);
            
            if (stockCheck) {
                const lowStockItems = stockCheck.filter(p => p.stock < 5);
                if (lowStockItems.length > 0) {
                    // Fonda (async) yuboriladi, foydalanuvchini kutttirmaydi
                    sendLowStockAlert(lowStockItems);
                }
            }
        } catch(e) {
            console.error("Low stock check error:", e);
        }
        // ----------------------------------

        // --- NEW: MLM AFFILIATE & PROMO CODE TRACKING ---
        try {
            const orderId = data.orderId;
            let promoAffiliateId = null;

            // 1. Check if Promo Code belongs to an Affiliate
            if (validatedData.promoCode) {
                const { data: promoData } = await supabaseAdmin
                    .from("affiliate_promo_codes")
                    .select("*, promo_code_tariffs(*)")
                    .eq("code", validatedData.promoCode.toUpperCase())
                    .single();
                
                // Faol bo'lmagan kod hamkorga mukofot yozmaydi (chegirma hisobi ham is_active'ni tekshiradi)
                if (promoData && promoData.is_active) {
                    promoAffiliateId = promoData.affiliate_id;
                    const tariff = promoData.promo_code_tariffs;
                    
                    // Calculate Reward for Affiliate
                    let rewardAmount = 0;
                    if (tariff.affiliate_reward_type === 'fixed_per_use') {
                        rewardAmount = tariff.affiliate_reward_value;
                    } else if (tariff.affiliate_reward_type === 'percent_of_final_price') {
                        const discount = tariff.type === 'fixed' ? tariff.discount_value : (validatedData.total * tariff.discount_value) / 100;
                        const finalPrice = Math.max(0, validatedData.total - discount);
                        rewardAmount = (finalPrice * tariff.affiliate_reward_value) / 100;
                    } else if (tariff.affiliate_reward_type === 'percent_of_discount') {
                        const discount = tariff.type === 'fixed' ? tariff.discount_value : (validatedData.total * tariff.discount_value) / 100;
                        rewardAmount = (discount * tariff.affiliate_reward_value) / 100;
                    }

                    // Create Transaction for Promo Code Owner
                    await supabaseAdmin.from("affiliate_transactions").insert({
                        user_id: promoAffiliateId,
                        order_id: orderId,
                        status: 'pending',
                        amount: rewardAmount,
                        order_stage: 'Promo-kod ishlatildi'
                    });

                    // Update Promo Code stats
                    await supabaseAdmin.rpc('increment_promo_usage', { 
                        p_promo_id: promoData.id, 
                        p_earned: rewardAmount 
                    });
                }
            }

            // 2. If NO Promo Code was used, check for Referral Links (Standard MLM)
            if (!promoAffiliateId) {
                // Atributsiyani birlashtirish: server-side DB (cross-device) + cookie (joriy qurilma).
                // Last-click: cookie (eng yangi session) DB ustidan ustun turadi.
                const cookieRefs: Record<string, string> = (validatedData.referralData as any) || {};

                const { data: dbAttr } = await supabaseAdmin
                    .from("referral_attributions")
                    .select("product_id, slug")
                    .eq("user_phone", validatedData.userPhone);

                const merged: Record<string, string> = {};
                (dbAttr || []).forEach(a => { merged[a.product_id] = a.slug; });
                Object.entries(cookieRefs).forEach(([pid, slug]) => { merged[pid] = slug; }); // cookie ustun

                // Faqat shu buyurtmadagi mahsulotlar uchun
                const orderedIds = new Set(validatedData.items.map((i: any) => i.id));
                const referralData = Object.fromEntries(
                    Object.entries(merged).filter(([pid]) => orderedIds.has(pid))
                );

                for (const [prodId, slug] of Object.entries(referralData)) {
                    const { data: linkData } = await supabaseAdmin
                        .from("affiliate_links")
                        .select("user_id, id")
                        .eq("slug", slug)
                        .eq("product_id", prodId)
                        .single();

                    if (linkData) {
                        // Konversiya hisoblagichni oshirish (read-then-increment)
                        const { data: curLink } = await supabaseAdmin
                            .from("affiliate_links")
                            .select("conversions")
                            .eq("id", linkData.id)
                            .single();
                        await supabaseAdmin
                            .from("affiliate_links")
                            .update({ conversions: (curLink?.conversions || 0) + 1 })
                            .eq("id", linkData.id);

                        // Pending komissiyani ORDER vaqtida hisoblaymiz (sotuvchi foizi).
                        // Yetkazilganda distributeCommissions buni chegirma bo'yicha QAYTA
                        // hisoblab (overwrite) tasdiqlaydi — ikki marta sanalmaydi.
                        const { data: prod } = await supabaseAdmin
                            .from("products")
                            .select("price, comm_seller")
                            .eq("id", prodId)
                            .single();
                        const item = (validatedData.items as any[]).find(i => i.id === prodId);
                        const unitPrice = Number(item?.price ?? prod?.price ?? 0);
                        const qty = Number(item?.quantity || 1);
                        const pendingAmount = Math.floor(unitPrice * qty * (Number(prod?.comm_seller) || 0) / 100);

                        await supabaseAdmin.from("affiliate_transactions").insert({
                            user_id: linkData.user_id,
                            order_id: orderId,
                            product_id: prodId,
                            status: 'pending',
                            amount: pendingAmount,
                            order_stage: 'Referal havola orqali'
                        });
                    }
                }

                // Clear used attributions from database
                const usedProductIds = Object.keys(referralData);
                if (usedProductIds.length > 0) {
                    await supabaseAdmin
                        .from("referral_attributions")
                        .delete()
                        .eq("user_phone", validatedData.userPhone)
                        .in("product_id", usedProductIds);
                }
            }
        } catch (mlmError) {
            console.error("MLM/Promo Tracking Error:", mlmError);
        }
        // ------------------------------------------------

        return NextResponse.json(data);

    } catch (error: any) {
        console.error("Place Order API Error:", error);
        return NextResponse.json({ success: false, message: "Xatolik: " + error.message }, { status: 500 });
    }
}
