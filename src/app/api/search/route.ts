import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mapProduct } from '@/lib/mappers';
import { PUBLIC_PRODUCT_COLUMNS, toPublicProduct } from '@/lib/public-product';
import { checkRateLimit } from '@/lib/rate-limiter';
import { expandQuery, cleanSearchText } from '@/lib/query-normalize';
import { getQueryEmbedding } from '@/lib/embeddings';
import { runTextSearch, minGroups, FUZZY_THRESHOLD, SEMANTIC_THRESHOLD, type V2Result } from '@/lib/search-pipeline';
import { getProductRealStock } from '@/lib/stock';
import { getSessionPhone } from '@/lib/user-session';

/**
 * Admin "Qidiruv Lug'ati" (search_synonyms): keyword (xaridor yozadigan) → maps_to.
 * Sinonim so'rovdagi so'zni ALMASHTIRMAYDI — qo'shimcha variant bo'ladi (expandQuery).
 * Lug'at xotirada 5 daqiqa keshlanadi.
 */
const SYNONYMS_TTL_MS = 5 * 60 * 1000;
let synonymsCache: { map: Record<string, string>; expires: number } | null = null;

async function getSynonymsMap(): Promise<Record<string, string>> {
    const now = Date.now();
    if (synonymsCache && synonymsCache.expires > now) return synonymsCache.map;
    try {
        const { data, error } = await supabaseAdmin.from('search_synonyms').select('keyword, maps_to').limit(2000);
        if (error) throw error;
        const map: Record<string, string> = {};
        for (const row of data || []) map[(row.keyword || '').toLowerCase().trim()] = row.maps_to;
        synonymsCache = { map, expires: now + SYNONYMS_TTL_MS };
        return map;
    } catch {
        return synonymsCache?.map || {};
    }
}

/** Kategoriya + barcha ichki subkategoriyalari (katalog asosiy kategoriya bilan qidirganda ham topilsin). */
let categoryTreeCache: { parents: Map<string, string | null>; expires: number } | null = null;
async function withDescendants(categoryId: string): Promise<string[]> {
    const now = Date.now();
    if (!categoryTreeCache || categoryTreeCache.expires < now) {
        const { data } = await supabaseAdmin.from('categories').select('id, parent_id').eq('is_deleted', false);
        categoryTreeCache = { parents: new Map((data || []).map((c: any) => [String(c.id), c.parent_id ? String(c.parent_id) : null])), expires: now + SYNONYMS_TTL_MS };
    }
    const out = [categoryId];
    for (let i = 0; i < out.length; i++) {
        categoryTreeCache.parents.forEach((parent, id) => { if (parent === out[i] && !out.includes(id)) out.push(id); });
    }
    return out;
}

async function categoryNamesFor(ids: string[]): Promise<Record<string, { uz: string; ru: string }>> {
    const names: Record<string, { uz: string; ru: string }> = {};
    if (!ids.length) return names;
    const { data } = await supabaseAdmin.from('categories').select('id, name, name_uz, name_ru').in('id', ids);
    for (const c of data || []) names[String(c.id)] = { uz: c.name_uz || c.name || '', ru: c.name_ru || c.name_uz || c.name || '' };
    return names;
}

/** id tartibini saqlagan holda ommaviy ustunlarni oladi va xaritalaydi (stokdagilar). */
async function loadProducts(ids: string[]): Promise<any[]> {
    if (!ids.length) return [];
    const { data } = await supabaseAdmin.from('products').select(PUBLIC_PRODUCT_COLUMNS).in('id', ids);
    const byId = new Map((data || []).map((r: any) => [String(r.id), r]));
    return ids
        .map(id => byId.get(String(id)))
        .filter(Boolean)
        .map((r: any) => mapProduct(toPublicProduct(r)))
        .filter((p: any) => getProductRealStock(p) > 0);
}

export interface VisualAnalysis {
    subject: string;
    brand?: string | null;
    color?: string | null;
    tags: string[];
    searchQuery: string;
}

// ── Rasm qidiruvi ────────────────────────────────────────────────────────────
const IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;
const IMAGE_MODEL = 'gemini-embedding-2'; // product_image_embeddings bilan bir xil (scripts/embed-product-images.mjs)
// product_image_embeddings: har mahsulotdan 4 tagacha rasm (lg WEBP), eng yaxshi moslik; faqat stokdagilar.
const IMAGE_RPC = 'match_products_by_image_v2';
const IMAGE_MATCH_THRESHOLD = 0.35;

/** data URL'ni tekshiradi: faqat jpeg/png/webp, ≤ 1.5 MB, sarlavha baytlari turga mos. */
function parseImageDataUrl(image: unknown): { mime: string; data: string } | { error: string } {
    if (typeof image !== 'string') return { error: "Rasm formati noto'g'ri" };
    const m = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/);
    if (!m) return { error: 'Faqat JPEG, PNG yoki WEBP rasm qabul qilinadi' };
    const data = m[2].replace(/\s/g, '');
    const bytes = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (bytes > IMAGE_MAX_BYTES) return { error: 'Rasm hajmi 1.5 MB dan oshmasligi kerak' };
    const head = Buffer.from(data.slice(0, 24), 'base64');
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isWebp = head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP';
    const ok = (m[1] === 'image/jpeg' && isJpeg) || (m[1] === 'image/png' && isPng) || (m[1] === 'image/webp' && isWebp);
    if (!ok) return { error: 'Rasm fayli turi mos emas' };
    return { mime: m[1], data };
}

async function generateGeminiImageEmbedding(mime: string, data: string): Promise<string | null> {
    const keys = Array.from(new Set([process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY].filter((k): k is string => !!k)));
    for (const key of keys) {
        try {
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:embedContent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
                body: JSON.stringify({ content: { parts: [{ inline_data: { mime_type: mime, data } }] }, outputDimensionality: 768 }),
                signal: AbortSignal.timeout(7000),
            });
            if (!res.ok) continue;
            const json = await res.json();
            if (Array.isArray(json.embedding?.values)) return `[${json.embedding.values.join(',')}]`;
        } catch (err: any) {
            console.warn('[ImageSearch] Gemini error:', err?.message);
        }
    }
    return null;
}

// ── Zaxira (RPC xatosi bo'lsa): ILIKE, har so'z AND ────────────────────────────
function ilikeFallback(tokens: string[], limit: number, offset = 0) {
    // cleanSearchText: vergul/qavs/%/_ va boshqa belgilar olib tashlangan — PostgREST .or() sintaksisi buzilmaydi
    let q = supabaseAdmin.from('products').select(PUBLIC_PRODUCT_COLUMNS).eq('is_deleted', false).gt('stock', 0);
    for (const t of tokens.map(x => x.replace(/[.'-]/g, ' ').trim()).filter(x => x.length >= 2).slice(0, 5)) {
        q = q.or(['name', 'name_uz', 'name_ru', 'article', 'model'].map(f => `${f}.ilike.%${t}%`).join(','));
    }
    return q.range(offset, offset + limit - 1);
}

export async function POST(req: NextRequest) {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

    try {
        const body = await req.json();
        const { query, image, suggest, page = 1, limit, category, brand, brands, minPrice, maxPrice, rating, sort } = body || {};

        // ═══ RASM QIDIRUVI ═══
        if (image && !query) {
            // Qimmat (Gemini) — alohida, qattiqroq chegara
            if (!(await checkRateLimit(ip, 10, 60, 'search-image'))) {
                return NextResponse.json({ success: false, message: "Rasm bilan qidiruv: juda ko'p urinish, bir daqiqadan so'ng qayta urining.", results: [] }, { status: 429 });
            }
            const parsed = parseImageDataUrl(image);
            if ('error' in parsed) return NextResponse.json({ success: false, message: parsed.error, results: [] }, { status: 400 });

            const vector = await generateGeminiImageEmbedding(parsed.mime, parsed.data);
            if (!vector) return NextResponse.json({ success: true, results: [], count: 0, message: 'Rasmni tahlil qilishda xatolik yuz berdi' });

            const { data: matches, error: imgErr } = await supabaseAdmin.rpc(IMAGE_RPC, {
                query_embedding: vector,
                match_threshold: IMAGE_MATCH_THRESHOLD,
                match_count: Math.min(100, Math.max(1, Number(limit) || 50)),
            });
            if (imgErr || !matches?.length) {
                if (imgErr) console.error(`${IMAGE_RPC} error:`, imgErr.message);
                return NextResponse.json({ success: true, results: [], count: 0, message: "Rasmga o'xshash mahsulot topilmadi" });
            }
            const results = await loadProducts(matches.map((m: any) => String(m.id)));
            const facetCounts: Record<string, number> = {};
            for (const p of results) if (p.category) facetCounts[p.category] = (facetCounts[p.category] || 0) + 1;
            return NextResponse.json({
                success: true, results, count: results.length, isVisual: true, detectedVisionQuery: null,
                facets: { categories: facetCounts, tags: {}, categoryNames: await categoryNamesFor(Object.keys(facetCounts)) },
            });
        }

        // ═══ MATN ═══
        if (!(await checkRateLimit(suggest ? `${ip}:s` : ip, suggest ? 100 : 60, 60, 'search'))) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish.", results: [] }, { status: 429 });
        }

        const searchQuery = String(query || '').trim().slice(0, 200);
        const raw = cleanSearchText(searchQuery);
        if (suggest && raw.length < 2) return NextResponse.json({ success: true, results: [], count: 0 });

        const groups = expandQuery(searchQuery, await getSynonymsMap());
        const brandIds: string[] = Array.isArray(brands) && brands.length ? brands.filter(Boolean).map(String) : (brand ? [String(brand)] : []);
        const categoryIds = category ? await withDescendants(String(category)) : null;

        const currentPage = Math.max(1, Number(page) || 1);
        const currentLimit = suggest ? 6 : Math.min(100, Math.max(1, Number(limit) || 24));
        const offset = suggest ? 0 : (currentPage - 1) * currentLimit;

        // smart_search_v2 chaqiruvi; takliflarda filtr/saralash/shaxsiy profil yo'q
        const callV2 = (user: string | null) => async ({ need, embedding }: { need: number; embedding: string | null }): Promise<V2Result> => {
            const { data, error } = await supabaseAdmin.rpc('smart_search_v2', {
                p_groups: groups,
                p_raw: raw,
                p_min_groups: need,
                p_fuzzy: FUZZY_THRESHOLD,
                query_embedding: embedding,
                p_sem_threshold: SEMANTIC_THRESHOLD,
                p_category_ids: suggest ? null : categoryIds,
                p_min_price: !suggest && Number(minPrice) > 0 ? Number(minPrice) : null,
                p_max_price: !suggest && Number(maxPrice) > 0 ? Number(maxPrice) : null,
                p_brand_ids: !suggest && brandIds.length ? brandIds : null,
                p_min_rating: !suggest && Number(rating) > 0 ? Number(rating) : null,
                p_sort: suggest ? null : (sort || null),
                p_offset: offset,
                p_limit: currentLimit,
                p_user_identifier: user,
            });
            if (error) throw error;
            return data as V2Result;
        };

        // ── Takliflar: yengil, AI'siz ──
        if (suggest) {
            try {
                const rpc = callV2(null);
                let r = await rpc({ need: minGroups(groups.length), embedding: null });
                if (r.total === 0 && groups.length > 1) r = await rpc({ need: 1, embedding: null });
                const results = await loadProducts(r.items.map(i => String(i.id)));
                return NextResponse.json({ success: true, results, count: results.length });
            } catch (e: any) {
                console.error('suggest smart_search_v2 error:', e?.message);
                const { data } = await ilikeFallback(raw.split(' '), 6);
                const results = (data || []).map((r: any) => mapProduct(toPublicProduct(r))).filter((p: any) => getProductRealStock(p) > 0);
                return NextResponse.json({ success: true, results, count: results.length });
            }
        }

        // ── To'liq qidiruv ──
        // Foydalanuvchi faqat imzolangan user_token'dan (body.userPhone va user_phone cookie'ga ishonilmaydi)
        const userPhone = await getSessionPhone(req).catch(() => null);

        let result: V2Result;
        let usedAI = false;
        let isFallback = false;
        let rpcFailed = false;
        try {
            ({ result, usedAI, isFallback } = await runTextSearch(groups.length, callV2(userPhone), () => getQueryEmbedding(raw)));
        } catch (e: any) {
            console.error('smart_search_v2 error:', e?.message);
            rpcFailed = true;
            const { data } = await ilikeFallback(raw.split(' '), currentLimit + 1, offset);
            const ids = (data || []).map((r: any) => String(r.id));
            result = { total: offset + ids.length, groups: groups.length, max_coverage: null, group_hits: [], facets: {}, items: ids.map(id => ({ id, score: 0, coverage: 0, sem: null })) };
        }

        const pageIds = result.items.slice(0, currentLimit).map(i => String(i.id));
        let results = await loadProducts(pageIds);
        const hasMore = rpcFailed ? result.items.length > currentLimit : offset + result.items.length < result.total;

        const facetCats = result.facets || {};
        const categoryNames = await categoryNamesFor(Object.keys(facetCats).length ? Object.keys(facetCats) : Array.from(new Set(results.map((p: any) => String(p.category || '')).filter(Boolean))));
        results = results.map((p: any) => {
            const nm = categoryNames[String(p.category ?? '')];
            return nm ? { ...p, category_uz: nm.uz, category_ru: nm.ru } : p;
        });
        // Kategoriya soni — BUTUN natija bo'yicha (faqat sahifa emas)
        const facets = { categories: facetCats, tags: {} as Record<string, number>, categoryNames };

        // "Balki shuni nazarda tutdingizmi?" — faqat haqiqiy tuzatish bo'lsa (katalogda yo'q so'z → mavjud so'z)
        let didYouMean: string | null = null;
        if (currentPage === 1 && raw.length >= 3) {
            const { data: dym } = await supabaseAdmin.rpc('search_did_you_mean', { p_tokens: raw.split(' ') });
            // Lug'atdagi ichki (ko'pincha inglizcha) sinonim hech qachon xaridorga ko'rsatilmaydi
            const internal = new Set(Object.values(await getSynonymsMap()).flatMap(v => cleanSearchText(v).split(' ')));
            if (typeof dym === 'string' && dym && dym !== raw && !dym.split(' ').some(w => internal.has(w) && !raw.split(' ').includes(w))) {
                didYouMean = dym;
            }
        }

        // Statistika — faqat 1-sahifa (keyingi sahifalar bir xil so'rovni qayta sanamasin)
        if (currentPage === 1 && searchQuery) {
            supabaseAdmin.from('search_analytics').insert({ query: searchQuery, results_count: result.total, user_phone: userPhone })
                .then(({ error }) => { if (error) console.error('Search analytics logging failed:', error.message); });

            if (userPhone) {
                const topCats = Object.entries(facetCats).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([c]) => c);
                supabaseAdmin.from('user_telemetry_logs').insert([{
                    user_identifier: userPhone, event_type: 'SEARCH', event_value: searchQuery,
                    event_metadata: { results_count: result.total, query: searchQuery, categories: topCats, ai: usedAI },
                }]).then(({ error }) => { if (error) console.error('Search telemetry logging failed:', error.message); });

                if (topCats.length > 0) {
                    supabaseAdmin.from('user_interests').select('categories').eq('id', userPhone).single().then(({ data }) => {
                        const currentCats = (data?.categories as Record<string, number>) || {};
                        topCats.forEach(c => { currentCats[c] = (currentCats[c] || 0) + 1; });
                        supabaseAdmin.from('user_interests').upsert({
                            id: userPhone, user_phone: userPhone, categories: currentCats, updated_at: new Date().toISOString(),
                        }).then(() => {});
                    }).then(undefined, () => {}); // = .catch (PromiseLike'da .catch tipi yo'q)
                }
            }
        }

        return NextResponse.json({
            success: true,
            results,
            facets,
            didYouMean,
            isFallback,
            usedAI,
            visualAnalysis: null,
            detectedVisionQuery: null,
            query: searchQuery,
            page: currentPage,
            limit: currentLimit,
            hasMore,
            total: result.total,
            count: results.length,
        });
    } catch (error: any) {
        console.error('Search failed:', error);
        return NextResponse.json({ error: 'Search failed', results: [] }, { status: 500 });
    }
}
