/**
 * SEO-friendly URL slug yaratish va o'qish.
 *
 * Slug formati:  `<nom-slug>--<identifikator>`
 *   - nom-slug:  mahsulot nomi (tilga mos), lotin harflarga, defislar SAQLANADI
 *   - --      :  ajratuvchi (ikki defis) — identifikatorni ishonchli ajratadi
 *   - identifikator:  article (yoki id) — XOM holda (katta harf/defis saqlanadi),
 *                     chunki DB'da aynan shu ko'rinishda saqlanadi va resolve uchun kerak.
 *
 * Misol:  "VGR V-071 Rotor"  →  vgr-v-071-rotor--ART-3328TT
 *         (model "V-071" defisi saqlanadi → qidiruvda mos keladi)
 */

// Rus kirill → lotin transliteratsiya (ru slug uchun: "белый" → "belyy")
const CYRILLIC_TO_LATIN: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh',
    з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
    п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
    ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function transliterate(str: string): string {
    let out = '';
    for (const ch of str) {
        const lower = ch.toLowerCase();
        const mapped = CYRILLIC_TO_LATIN[lower];
        out += mapped !== undefined ? mapped : ch;
    }
    return out;
}

/** Nomni URL-xavfsiz slug'ga aylantiradi — DEFISLAR saqlanadi (model/artikul buzilmaydi). */
function slugifyName(name: string): string {
    return transliterate(String(name).toLowerCase())
        .replace(/[^a-z0-9\s-]/g, '')  // faqat lotin, raqam, probel, defis qoladi
        .replace(/[\s-]+/g, '-')        // probel/defis ketma-ketligi → bitta defis ("v - 071" → "v-071")
        .replace(/^-+|-+$/g, '');       // bosh/oxiridagi defislarni olib tashlash
}

/**
 * Mahsulot uchun SEO slug. Til bo'yicha nom tanlanadi:
 *   - lang='ru' → name_ru (kirill bo'lsa lotinga transliteratsiya qilinadi)
 *   - aks holda → name_uz
 * Identifikator (article || id) "--" dan keyin XOM holda qo'shiladi.
 */
export const getProductSlug = (item: any, lang: string = 'uz') => {
    if (!item) return '';
    const rawName = lang === 'ru'
        ? (item.name_ru || item.name_uz || item.name || 'product')
        : (item.name_uz || item.name || 'product');

    const nameSlug = slugifyName(rawName) || 'product';
    const identifier = item.article || item.id;
    return `${nameSlug}--${identifier}`;
};

/**
 * Kategoriya uchun toza SEO slug (identifikatorsiz, faqat nom).
 * Til bo'yicha: ru→name_ru (kirill→lotin), aks→name_uz.
 * Misol:  "Отпариватели" → "otparivateli",  "Quloqchinlar" → "quloqchinlar"
 * Resolve qilish: route barcha kategoriyalar slug'ini hisoblab, mos kelganini topadi.
 */
export const getCategorySlug = (cat: any, lang: string = 'uz') => {
    if (!cat) return '';
    const rawName = lang === 'ru'
        ? (cat.name_ru || cat.name_uz || cat.name || 'category')
        : (cat.name_uz || cat.name || 'category');
    return slugifyName(rawName) || 'category';
};

/**
 * Slug'dan mahsulot identifikatorini (article yoki id) ajratib oladi.
 * BARCHA shakllarni qo'llab-quvvatlaydi: yangi slug ("nom--ID"), UUID, xom artikul.
 */
export const getProductIdFromSlug = (slug: string) => {
    if (!slug) return '';

    // 1) Asosiy format: "--" dan keyingi qism = identifikator
    if (slug.includes('--')) {
        const parts = slug.split('--');
        return parts[parts.length - 1];
    }

    // 2) UUID (8-4-4-4-12) — to'g'ridan-to'g'ri id
    const uuidMatch = slug.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i);
    if (uuidMatch) {
        return uuidMatch[1];
    }

    // 3) Xom identifikator (masalan "ART-3328TT") — BUTUN satrni qaytaramiz.
    //    (Avval split('-').pop() defisli artikulni buzardi: "ART-3328TT" → "3328TT")
    return slug;
};
