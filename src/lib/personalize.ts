import type { Product } from "@/types";

/**
 * Shaxsiy moslashtirish dvigateli (Yo'l B o'zagi).
 *
 * G'oya: mahsulotlar `ai_persona` (personas / use_cases / moods / value_props) bilan
 * tavsiflangan. Foydalanuvchi e'tibor bergan mahsulotlarning persona'larini agregatlab,
 * mijozning "niyat profili"ni AYNAN shu persona-fazoda quramiz. Nomzodlarni shu fazoda
 * mos kelishi bo'yicha ballaymiz va eng kuchli mos o'lchovdan HALOL "nega bu senga"
 * jumlasini tuzamiz — LLM'siz, 0 latensiya, cold-start'da ham ishlaydi.
 */

export type AiPersona = {
    personas?: string[];
    use_cases?: string[];
    moods?: string[];
    complements?: string[];
    value_props?: string[];
    occasions?: string[];
    search_terms?: string[];
    one_liner_uz?: string;
    one_liner_ru?: string;
};

export type AffinitySignals = {
    priceSegment?: "budget" | "medium" | "premium" | null;
    avgPriceAffinity?: number | null;
    nightOwl?: boolean;
    discountSeeker?: boolean;
    topCategories?: Record<string, number>;
};

// Persona-fazodagi niyat profili: har o'lcham qiymati -> chastotaviy og'irlik.
export type IntentProfile = {
    personas: Record<string, number>;
    use_cases: Record<string, number>;
    moods: Record<string, number>;
    categories: Record<string, number>;
    isEmpty: boolean;
};

const getPersona = (p: Product): AiPersona | null => {
    const raw = (p as any).ai_persona;
    if (!raw) return null;
    if (typeof raw === "string") { try { return JSON.parse(raw); } catch { return null; } }
    return raw as AiPersona;
};

const bump = (m: Record<string, number>, key: string, w: number) => {
    const k = (key || "").trim().toLowerCase();
    if (k) m[k] = (m[k] || 0) + w;
};

/**
 * Foydalanuvchi e'tibor bergan mahsulotlardan niyat profilini quradi.
 * `attentionProducts` — eng yangi avval (sessiya niyati uzoq diddan ustun turishi uchun
 * yangi elementlarga ko'proq og'irlik beramiz).
 */
export function buildIntentProfile(
    attentionProducts: Product[],
    affinity?: AffinitySignals,
): IntentProfile {
    const profile: IntentProfile = {
        personas: {}, use_cases: {}, moods: {}, categories: {}, isEmpty: true,
    };

    attentionProducts.forEach((p, idx) => {
        // Recency og'irligi: birinchi (eng yangi) element 1.0, keyingilar pasayadi.
        const recency = 1 / (1 + idx * 0.35);
        const persona = getPersona(p);
        if (persona) {
            (persona.personas || []).forEach(v => bump(profile.personas, v, recency));
            (persona.use_cases || []).forEach(v => bump(profile.use_cases, v, recency));
            (persona.moods || []).forEach(v => bump(profile.moods, v, recency));
        }
        if (p.category) bump(profile.categories, String(p.category), recency);
    });

    // Uzoq muddatli kategoriya affinity'sini qo'shamiz (sessiyadan past og'irlik bilan).
    if (affinity?.topCategories) {
        Object.entries(affinity.topCategories).forEach(([cat, w]) => {
            bump(profile.categories, cat, Math.min(Number(w) || 0, 5) * 0.15);
        });
    }

    profile.isEmpty =
        Object.keys(profile.personas).length === 0 &&
        Object.keys(profile.use_cases).length === 0 &&
        Object.keys(profile.categories).length === 0;

    return profile;
}

const priceInSegment = (price: number, seg?: string | null): boolean => {
    if (!seg) return false;
    if (seg === "premium") return price > 5_000_000;
    if (seg === "budget") return price < 500_000;
    return price >= 500_000 && price <= 5_000_000; // medium
};

const overlapScore = (
    dims: string[] | undefined,
    weights: Record<string, number>,
): { score: number; topKey: string | null } => {
    let score = 0;
    let topKey: string | null = null;
    let topVal = 0;
    (dims || []).forEach(d => {
        const k = (d || "").trim().toLowerCase();
        const w = weights[k];
        if (w) {
            score += w;
            if (w > topVal) { topVal = w; topKey = d; } // asl (lowercase emas) ko'rinishni saqlash uchun d
        }
    });
    return { score, topKey };
};

export type MatchReason = {
    kind: "persona" | "use_case" | "mood" | "category" | "discount" | "merit" | "generic";
    value: string | null;
};

export type ScoredProduct = {
    product: Product;
    score: number;
    reason: MatchReason;
    reasonText: { uz: string; ru: string };
};

const WEIGHTS = {
    persona: 3.0,
    use_case: 2.5,
    mood: 1.5,
    category: 2.0,
    priceSegment: 1.2,
    discountSeeker: 1.0,
    merit: 0.4,
};

/**
 * Bitta nomzodni niyat profiliga qarab ballaydi va eng kuchli mos o'lchovni qaytaradi.
 */
export function scoreProduct(
    product: Product,
    intent: IntentProfile,
    affinity?: AffinitySignals,
): { score: number; reason: MatchReason } {
    const persona = getPersona(product);
    let score = 0;
    const contributions: { kind: MatchReason["kind"]; value: string | null; weight: number }[] = [];

    if (persona) {
        const pp = overlapScore(persona.personas, intent.personas);
        if (pp.score > 0) { score += pp.score * WEIGHTS.persona; contributions.push({ kind: "persona", value: pp.topKey, weight: pp.score * WEIGHTS.persona }); }

        const uc = overlapScore(persona.use_cases, intent.use_cases);
        if (uc.score > 0) { score += uc.score * WEIGHTS.use_case; contributions.push({ kind: "use_case", value: uc.topKey, weight: uc.score * WEIGHTS.use_case }); }

        const md = overlapScore(persona.moods, intent.moods);
        if (md.score > 0) { score += md.score * WEIGHTS.mood; contributions.push({ kind: "mood", value: md.topKey, weight: md.score * WEIGHTS.mood }); }
    }

    // Kategoriya mosligi
    const catW = product.category ? intent.categories[String(product.category).toLowerCase()] : 0;
    if (catW) { score += catW * WEIGHTS.category; contributions.push({ kind: "category", value: String(product.category), weight: catW * WEIGHTS.category }); }

    // Narx segmenti mosligi
    if (affinity?.priceSegment && priceInSegment(product.price, affinity.priceSegment)) {
        score += WEIGHTS.priceSegment;
    }

    // Chegirma izlovchi
    const hasDiscount = product.oldPrice && product.oldPrice > product.price;
    if (affinity?.discountSeeker && hasDiscount) {
        score += WEIGHTS.discountSeeker;
        contributions.push({ kind: "discount", value: null, weight: WEIGHTS.discountSeeker });
    }

    // Obyektiv qadr & Ommaboplik (Sales, Rating, Reviews, Merit)
    const sales = Number((product as any).sales || 0);
    const rating = Number(product.rating || (product as any).avg_rating || 0);
    const reviews = Number((product as any).reviewCount || (product as any).review_count || 0);

    if (sales > 0) {
        score += Math.min(sales * 0.1, 2.5); // Sotuvlar ommabopligi (2.5 gacha)
        contributions.push({ kind: "merit", value: null, weight: Math.min(sales * 0.1, 2.5) });
    }
    if (rating >= 4.0) {
        score += WEIGHTS.merit * (rating / 5); // Reyting hissasi
    }
    if (reviews > 0) {
        score += Math.min(reviews * 0.05, 1.0); // Sharhlar ommabopligi
    }
    if ((product as any).isOriginal) {
        score += WEIGHTS.merit;
    }

    // Eng kuchli hissa = sabab
    contributions.sort((a, b) => b.weight - a.weight);
    const top = contributions[0];
    const reason: MatchReason = top
        ? { kind: top.kind, value: top.value }
        : { kind: hasDiscount ? "merit" : "generic", value: null };

    return { score, reason };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Mos o'lchovdan HALOL "nega bu senga" jumlasini tuzadi (raqamsiz, ijtimoiy dalilsiz).
 * Cold-start / mos kelmaganda mahsulotning o'z one-liner'iga yoki obyektiv qadrga tushadi.
 */
export function buildReasonText(product: Product, reason: MatchReason): { uz: string; ru: string } {
    const persona = getPersona(product);
    switch (reason.kind) {
        case "persona":
            return reason.value
                ? { uz: `${cap(reason.value)} uchun mos`, ru: `Подходит для: ${reason.value}` }
                : fallback(product, persona);
        case "use_case":
            return reason.value
                ? { uz: `${cap(reason.value)} uchun`, ru: `Для: ${reason.value}` }
                : fallback(product, persona);
        case "mood":
            return reason.value
                ? { uz: `${cap(reason.value)} hissi uchun tanlangan`, ru: `Для ощущения: ${reason.value}` }
                : fallback(product, persona);
        case "category":
            return { uz: `Siz qiziqqan yo'nalishga mos`, ru: `По вашим интересам` };
        case "discount":
            return { uz: `Siz uchun foydali narx`, ru: `Выгодная цена для вас` };
        case "merit":
            return { uz: `Ommabop va yuqori reytingli`, ru: `Популярный выбор` };
        case "generic":
        default:
            return fallback(product, persona);
    }
}

function fallback(product: Product, persona: AiPersona | null): { uz: string; ru: string } {
    if (persona?.one_liner_uz || persona?.one_liner_ru) {
        return {
            uz: persona.one_liner_uz || persona.one_liner_ru || "",
            ru: persona.one_liner_ru || persona.one_liner_uz || "",
        };
    }
    // Obyektiv qadr — avtoritet/halol
    if ((product as any).isOriginal) {
        return { uz: "Original, rasmiy kafolat bilan", ru: "Оригинал, с официальной гарантией" };
    }
    return { uz: "Velari tanlovi", ru: "Выбор Velari" };
}

/**
 * Bir xil kategoriyadan ketma-ket 2-3 tadan ortiq mahsulot to'planib qolmasligi uchun
 * kategoriyalar bo'yicha xilma-xillik (diversity) beruvchi qayta saralash funksiyasi.
 */
export function applyCategoryDiversity(items: ScoredProduct[], maxPerCategory = 2): ScoredProduct[] {
    const result: ScoredProduct[] = [];
    const pool = [...items];
    const categoryCounts: Record<string, number> = {};

    while (pool.length > 0) {
        let pickedIdx = -1;
        for (let i = 0; i < pool.length; i++) {
            const cat = String(pool[i].product.category || "unknown");
            if ((categoryCounts[cat] || 0) < maxPerCategory) {
                pickedIdx = i;
                break;
            }
        }
        if (pickedIdx === -1) {
            pickedIdx = 0;
        }
        const item = pool.splice(pickedIdx, 1)[0];
        const cat = String(item.product.category || "unknown");
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        result.push(item);
    }
    return result;
}

/**
 * Asosiy kirish nuqtasi: nomzodlarni mijoz niyatiga qarab tartiblaydi va sabab matni qo'shadi.
 * @param candidates  ai_persona to'ldirilgan mahsulotlar
 * @param attentionProducts  e'tibor berilgan mahsulotlar (eng yangi avval)
 */
export function personalize(
    candidates: Product[],
    attentionProducts: Product[],
    affinity?: AffinitySignals,
    opts?: { limit?: number; excludeIds?: Set<string> },
): ScoredProduct[] {
    const intent = buildIntentProfile(attentionProducts, affinity);
    const exclude = opts?.excludeIds || new Set<string>();

    const scored = candidates
        .filter(p => !exclude.has(p.id))
        .map(p => {
            const { score, reason } = scoreProduct(p, intent, affinity);
            return { product: p, score, reason, reasonText: buildReasonText(p, reason) };
        });

    // Cold-start: niyat profili bo'sh bo'lsa — obyektiv qadr bo'yicha (rating/sotuv/merit).
    if (intent.isEmpty) {
        scored.sort((a, b) =>
            (Number(b.product.rating || (b.product as any).avg_rating || 0) - Number(a.product.rating || (a.product as any).avg_rating || 0)) ||
            ((b.product.sales || 0) - (a.product.sales || 0)) ||
            (b.score - a.score)
        );
    } else {
        scored.sort((a, b) => b.score - a.score);
    }

    // Kategoriyalar bo'yicha xilma-xillik filtrini qo'llash
    const diversified = applyCategoryDiversity(scored, 2);

    return diversified.slice(0, opts?.limit ?? 12);
}

