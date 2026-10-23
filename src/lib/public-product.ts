/**
 * Brauzerga uzatiladigan mahsulot ustunlari — faqat ommaviy sahifalar (mahsulot, bosh sahifa,
 * katalog, qidiruv, reels, savat) haqiqatda ishlatadiganlari.
 *
 * Ichki maydonlar ATAYLAB kiritilmagan: cost_price, additional_expenses, comm_*,
 * barcode, embedding*, image_embedding, ai_persona*, total_views, total_wishlists,
 * total_returns, cashback_*, updated_at, va h.k. (`sales` — egasi qarori bilan ochiq:
 * saralash va "HIT" belgisi uchun.)
 * Yangi maydon kerak bo'lsa — shu yerga qo'shing (select("*") ishlatmang).
 *
 * Bitta literal satr (join yoki + emas): Supabase select() tipini shu satrdan chiqaradi.
 */
export const PUBLIC_PRODUCT_COLUMNS = 'id, article, sku, model, name, name_uz, name_ru, description, description_uz, description_ru, price, old_price, stock, stock_details, image, images, image_metadata, video_url, category_id, brand_id, group_id, color_name, is_original, is_deleted, express_delivery, avg_rating, review_count, sales, created_at';

const PUBLIC_PRODUCT_KEYS = new Set(PUBLIC_PRODUCT_COLUMNS.split(',').map((c) => c.trim()));

/**
 * Serverdan brauzerga ketadigan javob uchun: xom DB qatoridan (masalan SETOF products
 * qaytaradigan RPC natijasi) faqat ommaviy ustunlarni qoldiradi. `extraKeys` — RPC'ning
 * o'z hisoblangan maydonlari (similarity, category_name...), ichki ustun bo'lmasligi kerak.
 */
export function toPublicProduct<T extends Record<string, any>>(row: T, extraKeys: string[] = []): Partial<T> {
    const out: Record<string, any> = {};
    for (const key of Object.keys(row || {})) {
        if (PUBLIC_PRODUCT_KEYS.has(key) || extraKeys.includes(key)) out[key] = row[key];
    }
    return out as Partial<T>;
}
