import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { estimateExpressDelivery, formatEta } from "@/lib/yandex-delivery";
import { EXPRESS_FREE_THRESHOLD } from "@/lib/delivery";

/**
 * Tezkor (express) yetkazish narxi/vaqtini checkout uchun baholash.
 *
 * POST { items: [{ id }], coords: [lat, lng], orderAmount, language? }
 *  →  { success, eligible, price, free, etaText }
 *
 * Eslatma: bu faqat ko'rsatish uchun. Yakuniy narx place_order'da server tomonida
 * qayta hisoblanadi (xavfsizlik).
 */
export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    try {
        if (!(await checkRateLimit(ip, 40, 60, "delivery-express"))) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish." }, { status: 429 });
        }

        const body = await req.json();
        const items = Array.isArray(body.items) ? body.items : [];
        const coords = Array.isArray(body.coords) && body.coords.length === 2 ? body.coords as [number, number] : null;
        const orderAmount = Number(body.orderAmount) || 0;
        const language: "uz" | "ru" = body.language === "ru" ? "ru" : "uz";

        const ids = items.map((i: any) => String(i.id)).filter(Boolean);
        if (ids.length === 0) {
            return NextResponse.json({ success: true, eligible: false });
        }

        // Kamida bitta mahsulot express bo'lsa — mos keladi
        const { data: prods } = await supabaseAdmin
            .from("products").select("id, express_delivery").in("id", ids);
        const eligible = (prods || []).some((p: any) => p.express_delivery === true);

        if (!eligible) {
            return NextResponse.json({ success: true, eligible: false });
        }

        if (!coords) {
            // Koordinata hali tanlanmagan — eligible, lekin narx noma'lum
            return NextResponse.json({ success: true, eligible: true, needCoords: true });
        }

        const est = await estimateExpressDelivery(coords);
        const free = orderAmount >= EXPRESS_FREE_THRESHOLD;
        const price = free ? 0 : est.price;

        return NextResponse.json({
            success: true,
            eligible: true,
            price,
            free,
            etaText: formatEta(est.etaMinMinutes, est.etaMaxMinutes, language),
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
