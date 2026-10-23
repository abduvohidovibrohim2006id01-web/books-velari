import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapProduct } from "@/lib/mappers";
import { getProductRealStock } from "@/lib/stock";
import { personalize, type AffinitySignals } from "@/lib/personalize";
import { getSessionPhone } from "@/lib/user-session";

let candidatesCache: { data: any[]; expiresAt: number } | null = null;
const CANDIDATES_TTL_MS = 5 * 60 * 1000;

/**
 * Shaxsiy tavsiya endpoint'i — personalize() dvigatelini server'da ishlatadi.
 * ai_persona katta bo'lgani uchun client'ga yuborilmaydi; hammasi shu yerda.
 *
 * body: { attentionIds?: string[]; excludeIds?: string[]; limit?: number }
 * - Login bo'lsa: user_interests.attention_products + affinity profili o'qiladi.
 * - Mehmon bo'lsa: client'dagi "yaqinda ko'rilgan" attentionIds ishlatiladi.
 */
const PERSONA_SELECT =
    "id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,sales,avg_rating,review_count,stock,stock_details,category_id,brand_id,is_original,article,ai_persona";

export async function POST(req: NextRequest) {
    try {
        const body = await req.json().catch(() => ({}));
        const clientAttentionIds: string[] = Array.isArray(body.attentionIds) ? body.attentionIds.slice(0, 20) : [];
        const excludeIds = new Set<string>(Array.isArray(body.excludeIds) ? body.excludeIds : []);
        const limit = Math.min(Number(body.limit) || 12, 30);
        const lastSearch = typeof body.lastSearch === "string" ? body.lastSearch.trim() : "";

        // Login holatini aniqlash (faqat JWT sessiya orqali — IDOR himoyasi)
        const userPhone = await getSessionPhone(req);

        // Oxirgi qidiruv bo'yicha mahsulotlarni aniqlash
        let searchAttentionIds: string[] = [];
        if (lastSearch) {
            const { data: searchProducts } = await supabaseAdmin
                .from("products")
                .select("id")
                .or(`name.ilike.%${lastSearch}%,name_uz.ilike.%${lastSearch}%,name_ru.ilike.%${lastSearch}%`)
                .eq("is_deleted", false)
                .limit(5);
            if (searchProducts?.length) {
                searchAttentionIds = searchProducts.map(p => String(p.id));
            }
        }

        // 1. Niyat manbalari: attention IDlar + affinity
        let attentionIds: string[] = [...searchAttentionIds, ...clientAttentionIds];
        let affinity: AffinitySignals | undefined;

        if (userPhone) {
            const [{ data: interests }, { data: aff }] = await Promise.all([
                supabaseAdmin.from("user_interests").select("attention_products, categories").eq("id", userPhone).single(),
                supabaseAdmin.from("user_affinity_profiles").select("price_segment, avg_price_affinity, night_owl, discount_seeker, top_categories").eq("user_identifier", userPhone).single(),
            ]);
            if (interests?.attention_products && Array.isArray(interests.attention_products)) {
                // Server (login) signali oldinda, keyin client (sessiya) — takrorsiz
                attentionIds = Array.from(new Set([...interests.attention_products, ...clientAttentionIds]));
            }
            if (aff) {
                affinity = {
                    priceSegment: aff.price_segment,
                    avgPriceAffinity: aff.avg_price_affinity,
                    nightOwl: aff.night_owl,
                    discountSeeker: aff.discount_seeker,
                    topCategories: aff.top_categories || (interests?.categories ?? undefined),
                };
            } else if (interests?.categories) {
                affinity = { topCategories: interests.categories };
            }
        }

        // 2. Attention mahsulotlarini persona bilan yuklash (eng yangi avval)
        let attentionProducts: ReturnType<typeof mapProduct>[] = [];
        if (attentionIds.length > 0) {
            const { data } = await supabaseAdmin.from("products").select(PERSONA_SELECT).in("id", attentionIds.slice(0, 20)).eq("is_deleted", false);
            const byId = new Map((data || []).map((d: any) => [d.id, mapProduct(d)]));
            attentionProducts = attentionIds.map(id => byId.get(id)).filter(Boolean) as any[];
        }

        // 3. Nomzodlar (sotuv va reyting bo'yicha eng sara 200 ta mahsulot - 5 min in-memory kesh)
        let candidates: ReturnType<typeof mapProduct>[] = [];
        if (candidatesCache && candidatesCache.expiresAt > Date.now()) {
            candidates = candidatesCache.data;
        } else {
            const { data: candData, error } = await supabaseAdmin
                .from("products")
                .select(PERSONA_SELECT)
                .eq("is_deleted", false)
                .gt("stock", 0)
                .order("sales", { ascending: false, nullsFirst: false })
                .order("avg_rating", { ascending: false, nullsFirst: false })
                .limit(200);

            if (!error && candData) {
                candidates = (candData || []).map(mapProduct).filter(p => getProductRealStock(p) > 0);
                candidatesCache = { data: candidates, expiresAt: Date.now() + CANDIDATES_TTL_MS };
            }
        }

        // 4. Moslashtirish
        const ranked = personalize(candidates, attentionProducts, affinity, { limit, excludeIds });

        const results = ranked.map(r => ({
            id: r.product.id,
            score: Math.round(r.score * 100) / 100,
            reasonKind: r.reason.kind,
            reason_uz: r.reasonText.uz,
            reason_ru: r.reasonText.ru,
        }));

        return NextResponse.json({ success: true, results, personalized: attentionProducts.length > 0 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
