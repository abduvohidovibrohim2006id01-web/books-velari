/**
 * Smart chegirma dvigateli — shaffof, AI-yordamchi, to'liq auditlanadigan.
 *
 * G'oya: foydalanuvchi biror mahsulotni sotib olishga "yaqinlashganda" (ko'p ko'rgan,
 * savatga solgan, bir necha kun qaytib kelgan) — unga SHAXSIY, vaqt bilan cheklangan
 * BONUS chegirma taklif qilamiz. Bu asosiy narxni O'ZGARTIRMAYDI; faqat shu foydalanuvchi
 * uchun amal qiladigan qo'shimcha taklif.
 *
 * Muhim qoidalar:
 *  - Admin foiz oralig'ini ([min, max]) va chegaralarni to'liq boshqaradi.
 *  - AI/formula faqat shu oraliq ichidan eng mosini tanlaydi — hech qachon undan tashqariga chiqmaydi.
 *  - Har bir qaror (kim, qaysi mahsulot, qancha %, qaysi signal, qachon) auditga yoziladi.
 *  - Cost/margin ustuni yo'q — shuning uchun himoya: admin max % cheklovi + mahsulot/kategoriya istisnolari.
 */

export type DiscountConfig = {
    enabled: boolean;
    min_percent: number;          // admin belgilagan eng kichik %
    max_percent: number;          // admin belgilagan eng katta % (himoya chegarasi)
    intent_threshold: number;     // 0..1 — taklif berish uchun minimal niyat bali
    offer_ttl_hours: number;      // taklif necha soat amal qiladi
    cooldown_hours: number;       // bitta user×mahsulotga qayta taklif oralig'i
    max_active_offers_per_user: number;
    excluded_product_ids: string[];
    excluded_category_ids: string[];
};

export const DEFAULT_DISCOUNT_CONFIG: DiscountConfig = {
    enabled: false,
    min_percent: 3,
    max_percent: 10,
    intent_threshold: 0.45,
    offer_ttl_hours: 48,
    cooldown_hours: 168, // 7 kun
    max_active_offers_per_user: 3,
    excluded_product_ids: [],
    excluded_category_ids: [],
};

/** Bitta user×mahsulot bo'yicha xulq signallari. */
export type IntentSignals = {
    views: number;          // mahsulotni necha marta ko'rgan
    cartAdds: number;       // savatga necha marta solgan
    inCart: boolean;        // hozir savatda turibdimi
    inWishlist: boolean;    // sevimlilarda bormi
    distinctDays: number;   // necha xil kunda qiziqqan (qaytib kelish)
    dwellSeconds: number;   // mahsulotda umumiy o'tkazgan vaqt (s)
};

export type IntentBreakdown = {
    score: number;          // 0..~1 yakuniy niyat bali
    parts: { key: string; label_uz: string; value: number }[];
    dominant: keyof IntentSignals | "none";
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Niyat balini SHAFFOF, additiv formula bilan hisoblaydi (0..~1).
 * Har bir signal o'z hissasini qo'shadi — natija auditda to'liq ko'rinadi.
 */
export function computeIntentScore(s: IntentSignals): IntentBreakdown {
    const viewsScore = (Math.min(s.views, 6) / 6) * 0.30;
    const cartScore = s.inCart ? 0.30 : s.cartAdds > 0 ? 0.22 : 0;
    const wishScore = s.inWishlist ? 0.18 : 0;
    const repeatScore = (Math.min(s.distinctDays, 4) / 4) * 0.17;
    const dwellScore = (Math.min(s.dwellSeconds, 180) / 180) * 0.05;

    const parts = [
        { key: "views", label_uz: "Ko'rishlar", value: round2(viewsScore) },
        { key: "cart", label_uz: "Savat", value: round2(cartScore) },
        { key: "wishlist", label_uz: "Sevimlilar", value: round2(wishScore) },
        { key: "repeat", label_uz: "Qaytib kelish", value: round2(repeatScore) },
        { key: "dwell", label_uz: "O'tkazgan vaqt", value: round2(dwellScore) },
    ];

    const score = round2(viewsScore + cartScore + wishScore + repeatScore + dwellScore);

    // Dominant signal — sababni izohlash uchun
    let dominant: keyof IntentSignals | "none" = "none";
    let top = 0;
    const map: [keyof IntentSignals, number][] = [
        ["inCart", cartScore], ["views", viewsScore], ["inWishlist", wishScore],
        ["distinctDays", repeatScore], ["dwellSeconds", dwellScore],
    ];
    for (const [k, v] of map) if (v > top) { top = v; dominant = k; }

    return { score, parts, dominant };
}

/**
 * Niyat baliga qarab admin oralig'i [min,max] ichidan eng mos foizni tanlaydi.
 * Shaffof chiziqli interpolatsiya: score=threshold -> min%, score>=1 -> max%.
 * Natija HAR DOIM [min,max] ichida bo'ladi (himoya chegarasi).
 */
export function pickPercent(score: number, cfg: DiscountConfig): number {
    const lo = Math.min(cfg.min_percent, cfg.max_percent);
    const hi = Math.max(cfg.min_percent, cfg.max_percent);
    if (hi <= lo) return clamp(lo, 0, 100);

    const span = Math.max(1 - cfg.intent_threshold, 0.01);
    const t = clamp((score - cfg.intent_threshold) / span, 0, 1);
    const pct = Math.round(lo + t * (hi - lo));
    return clamp(pct, lo, hi);
}

export type EligibilityResult =
    | { eligible: true; percent: number; score: number; breakdown: IntentBreakdown; reason_uz: string; reason_ru: string }
    | { eligible: false; score: number; breakdown: IntentBreakdown; blockReason: string };

/**
 * Yagona qaror nuqtasi: konfiguratsiya + signallar + istisnolar asosida
 * taklif berish kerakmi va necha % berishni aniqlaydi. (Cooldown/active-limit/mavjud
 * taklif tekshiruvlari API qatlamida — DBga bog'liq bo'lgani uchun.)
 */
export function evaluateOffer(
    signals: IntentSignals,
    cfg: DiscountConfig,
    ctx: { productId: string; categoryId?: string | null },
): EligibilityResult {
    const breakdown = computeIntentScore(signals);

    if (!cfg.enabled) return { eligible: false, score: breakdown.score, breakdown, blockReason: "disabled" };
    if (cfg.excluded_product_ids?.includes(ctx.productId))
        return { eligible: false, score: breakdown.score, breakdown, blockReason: "product_excluded" };
    if (ctx.categoryId && cfg.excluded_category_ids?.includes(ctx.categoryId))
        return { eligible: false, score: breakdown.score, breakdown, blockReason: "category_excluded" };
    if (breakdown.score < cfg.intent_threshold)
        return { eligible: false, score: breakdown.score, breakdown, blockReason: "below_threshold" };

    const percent = pickPercent(breakdown.score, cfg);
    if (percent <= 0) return { eligible: false, score: breakdown.score, breakdown, blockReason: "zero_percent" };

    const { uz, ru } = buildOfferReason(breakdown.dominant);
    return { eligible: true, percent, score: breakdown.score, breakdown, reason_uz: uz, reason_ru: ru };
}

/** Dominant signaldan HALOL, shaxsiy izoh tuzadi (raqamsiz, ijtimoiy dalilsiz). */
export function buildOfferReason(dominant: keyof IntentSignals | "none"): { uz: string; ru: string } {
    switch (dominant) {
        case "inCart":
            return { uz: "Savatingizdagi mahsulot uchun shaxsiy chegirma", ru: "Персональная скидка на товар из вашей корзины" };
        case "views":
            return { uz: "Bu mahsulotga qiziqishingiz uchun — siz uchun maxsus narx", ru: "За ваш интерес к товару — специальная цена для вас" };
        case "inWishlist":
            return { uz: "Sevimlilaringizdagi mahsulot uchun shaxsiy taklif", ru: "Персональное предложение на товар из избранного" };
        case "distinctDays":
            return { uz: "Qaytib kelganingiz uchun — siz uchun maxsus chegirma", ru: "За ваше возвращение — специальная скидка для вас" };
        default:
            return { uz: "Siz uchun shaxsiy chegirma", ru: "Персональная скидка для вас" };
    }
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
