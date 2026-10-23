import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import {
    evaluateOffer,
    DEFAULT_DISCOUNT_CONFIG,
    type DiscountConfig,
    type IntentSignals,
} from "@/lib/smart-discount";
import { getUserJwtSecret } from "@/lib/secrets";

/**
 * Smart chegirma — mijoz tomoni (#41).
 *
 *  GET  → shu foydalanuvchining barcha aktiv (amaldagi) takliflari.
 *  POST { productId, inWishlist? } → shu mahsulot uchun taklifni baholaydi va kerak bo'lsa yaratadi.
 *
 * Faqat login bo'lgan foydalanuvchi uchun (taklif shaxsiy va identifikatorga bog'lanadi).
 * Signallar SERVER tomonda yig'iladi (telemetry + active_carts) — client'ga ishonilmaydi
 * (inWishlist faqat yumshoq turtki, foiz baribir admin max % bilan cheklangan).
 */

async function getUserPhone(req: NextRequest): Promise<string | null> {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    return payload?.sub || null;
}

async function loadConfig(): Promise<DiscountConfig> {
    const { data } = await supabaseAdmin.from("smart_discount_config").select("*").eq("id", "global").single();
    if (!data) return DEFAULT_DISCOUNT_CONFIG;
    return {
        enabled: !!data.enabled,
        min_percent: Number(data.min_percent),
        max_percent: Number(data.max_percent),
        intent_threshold: Number(data.intent_threshold),
        offer_ttl_hours: Number(data.offer_ttl_hours),
        cooldown_hours: Number(data.cooldown_hours),
        max_active_offers_per_user: Number(data.max_active_offers_per_user),
        excluded_product_ids: data.excluded_product_ids || [],
        excluded_category_ids: data.excluded_category_ids || [],
    };
}

/** Eskirgan aktiv takliflarni 'expired' qiladi (lazy). */
async function expireStale(userPhone: string) {
    await supabaseAdmin
        .from("smart_discount_offers")
        .update({ status: "expired" })
        .eq("user_identifier", userPhone)
        .eq("status", "active")
        .lt("expires_at", new Date().toISOString());
}

export async function GET(req: NextRequest) {
    try {
        const userPhone = await getUserPhone(req);
        if (!userPhone) return NextResponse.json({ success: true, offers: [] });

        await expireStale(userPhone);
        const { data } = await supabaseAdmin
            .from("smart_discount_offers")
            .select("id, product_id, percent, reason_uz, reason_ru, expires_at, created_at")
            .eq("user_identifier", userPhone)
            .eq("status", "active")
            .order("created_at", { ascending: false });

        return NextResponse.json({ success: true, offers: data || [] });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const userPhone = await getUserPhone(req);
        if (!userPhone) return NextResponse.json({ success: true, offer: null, reason: "guest" });

        const body = await req.json().catch(() => ({}));
        const productId = String(body.productId || "");
        const clientInWishlist = !!body.inWishlist;
        if (!productId) return NextResponse.json({ success: false, error: "productId required" }, { status: 400 });

        const cfg = await loadConfig();
        if (!cfg.enabled) return NextResponse.json({ success: true, offer: null, reason: "disabled" });

        await expireStale(userPhone);

        // Allaqachon aktiv taklif bormi? — qaytaramiz (yangi yaratmaymiz)
        const { data: existing } = await supabaseAdmin
            .from("smart_discount_offers")
            .select("id, product_id, percent, reason_uz, reason_ru, expires_at")
            .eq("user_identifier", userPhone)
            .eq("product_id", productId)
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
        if (existing) return NextResponse.json({ success: true, offer: existing, reason: "existing" });

        // Cooldown: shu user×mahsulotga yaqinda taklif berilganmi (har qanday status)?
        const cooldownSince = new Date(Date.now() - cfg.cooldown_hours * 3600_000).toISOString();
        const { count: recentCount } = await supabaseAdmin
            .from("smart_discount_offers")
            .select("id", { count: "exact", head: true })
            .eq("user_identifier", userPhone)
            .eq("product_id", productId)
            .gte("created_at", cooldownSince);
        if ((recentCount || 0) > 0) return NextResponse.json({ success: true, offer: null, reason: "cooldown" });

        // Aktiv takliflar limiti
        const { count: activeCount } = await supabaseAdmin
            .from("smart_discount_offers")
            .select("id", { count: "exact", head: true })
            .eq("user_identifier", userPhone)
            .eq("status", "active")
            .gt("expires_at", new Date().toISOString());
        if ((activeCount || 0) >= cfg.max_active_offers_per_user)
            return NextResponse.json({ success: true, offer: null, reason: "max_active" });

        // Signallarni server tomonda yig'ish
        const signals = await gatherSignals(userPhone, productId, clientInWishlist);

        // Mahsulot kategoriyasi (istisno tekshiruvi uchun)
        const { data: prod } = await supabaseAdmin
            .from("products").select("category_id, is_deleted").eq("id", productId).single();
        if (!prod || prod.is_deleted) return NextResponse.json({ success: true, offer: null, reason: "no_product" });

        const result = evaluateOffer(signals, cfg, { productId, categoryId: prod.category_id });
        if (!result.eligible)
            return NextResponse.json({ success: true, offer: null, reason: result.blockReason, score: result.score });

        const expiresAt = new Date(Date.now() + cfg.offer_ttl_hours * 3600_000).toISOString();
        const { data: inserted, error } = await supabaseAdmin
            .from("smart_discount_offers")
            .insert({
                user_identifier: userPhone,
                product_id: productId,
                percent: result.percent,
                intent_score: result.score,
                signals: { ...signals, breakdown: result.breakdown.parts, dominant: result.breakdown.dominant },
                reason_uz: result.reason_uz,
                reason_ru: result.reason_ru,
                status: "active",
                expires_at: expiresAt,
            })
            .select("id, product_id, percent, reason_uz, reason_ru, expires_at")
            .single();
        if (error) throw error;

        return NextResponse.json({ success: true, offer: inserted, reason: "created" });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

async function gatherSignals(userPhone: string, productId: string, clientInWishlist: boolean): Promise<IntentSignals> {
    const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();

    // Telemetry: ko'rishlar, savatga qo'shish, dwell, qaytib kelish (xil kunlar)
    const { data: events } = await supabaseAdmin
        .from("user_telemetry_logs")
        .select("event_type, event_value, created_at")
        .eq("user_identifier", userPhone)
        .eq("product_id", productId)
        .gte("created_at", since)
        .limit(500);

    let views = 0, cartAdds = 0, dwellSeconds = 0;
    const days = new Set<string>();
    (events || []).forEach((e: any) => {
        if (e.event_type === "PRODUCT_VIEW") views++;
        else if (e.event_type === "CART_ADD") cartAdds++;
        else if (e.event_type === "DWELL_TIME") dwellSeconds += Number(e.event_value) || 0;
        if (e.created_at) days.add(String(e.created_at).slice(0, 10));
    });

    // Hozir savatda turibdimi (active_carts — ishonchli manba)
    let inCart = false;
    const { data: cart } = await supabaseAdmin
        .from("active_carts").select("items").eq("user_phone", userPhone).maybeSingle();
    if (cart?.items && Array.isArray(cart.items)) {
        inCart = cart.items.some((it: any) => String(it.id) === productId);
    }

    return {
        views,
        cartAdds,
        inCart,
        inWishlist: clientInWishlist,
        distinctDays: days.size,
        dwellSeconds,
    };
}
