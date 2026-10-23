import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProductSlug, getCategorySlug } from '@/lib/slugify';
import { getProductRealStock } from '@/lib/stock';
import { getOptimizedImageUrl } from '@/lib/imageVariants';

/**
 * Sitemap uchun umumiy ma'lumot qatlami.
 *
 * - isIndexableProduct — mahsulot sitemap'ga kiradimi (yagona filtr)
 * - fetchAllRows       — Supabase 1000 qator limitini chetlab, hammasini sahifalab yuklaydi
 * - getSitemapChunks   — barcha <url> yozuvlari, 45 000 talik fayllarga bo'lingan
 */

export const SITEMAP_BASE_URL = 'https://velari.uz';

/** Bitta sitemap faylidagi <url> yozuvlari chegarasi (protokol limiti 50 000). */
export const MAX_URLS_PER_SITEMAP = 45_000;

const PAGE_SIZE = 1000;

// Bosh sahifa va /catalog — eng so'nggi mahsulotning updated_at qiymatini oladi.
// Qolgan statik sahifalarda lastModified yo'q.
const STATIC_PATHS = ['', '/catalog', '/reels', '/blog', '/about', '/return-policy'];
const PRODUCT_DRIVEN_PATHS = new Set(['', '/catalog']);

// ───────────────────────── 2.3 — Yagona filtr ─────────────────────────

export function isIndexableProduct(p: any): boolean {
    if (!p || p.is_deleted === true) return false;

    const price = Number(p.price);
    if (p.price === null || p.price === undefined || !Number.isFinite(price) || price <= 0) return false;

    if (typeof p.image !== 'string' || p.image.trim() === '') return false;

    const hasName = [p.name_uz, p.name, p.name_ru].some((n) => typeof n === 'string' && n.trim() !== '');
    if (!hasName) return false;

    if (!(p.article || p.id)) return false;

    return true;
}

// ───────────────────────── 2.2-A — Sahifalab yuklash ─────────────────────────

/**
 * Jadvaldagi barcha mos qatorlarni 1000 talik bo'laklar bilan yuklaydi.
 * Har so'rovda .order('id') — tartibsiz .range() qatorlarni o'tkazib yuborishi
 * yoki takrorlashi mumkin.
 * Xato bo'lsa — throw: yarim-to'la sitemap 24 soat keshda qolmasligi uchun.
 */
export async function fetchAllRows<T = any>(
    table: string,
    columns: string,
    applyFilters: (query: any) => any = (q) => q,
): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
        const query = applyFilters(supabaseAdmin.from(table).select(columns))
            .order('id', { ascending: true })
            .range(from, from + PAGE_SIZE - 1);
        const { data, error } = await query;
        if (error) {
            throw new Error(`Sitemap: ${table} fetch failed: ${error.message}`);
        }
        const chunk = (data || []) as T[];
        rows.push(...chunk);
        if (chunk.length < PAGE_SIZE) break;
    }
    return rows;
}

// ───────────────────────── 2.1 — uz/ru juftliklari ─────────────────────────

export interface SitemapUrl {
    loc: string;
    lastModified?: Date;
    alternates: { uz: string; ru: string };
}

/** Bitta element (sahifa/kategoriya/blog/mahsulot) — uz va ru yozuvlari, doim birga. */
type SitemapGroup = SitemapUrl[];

function pair(uzUrl: string, ruUrl: string, lastModified?: Date): SitemapGroup {
    const alternates = { uz: uzUrl, ru: ruUrl };
    const base = lastModified ? { lastModified, alternates } : { alternates };
    return [
        { loc: uzUrl, ...base },
        { loc: ruUrl, ...base },
    ];
}

function toDate(value: unknown): Date | undefined {
    if (!value) return undefined;
    const date = new Date(value as string);
    return isNaN(date.getTime()) ? undefined : date;
}

// ───────────────────────── 2.4 — Stokda tovari bor kategoriyalar ─────────────────────────

/**
 * O'zida yoki istalgan darajadagi subkategoriyasida stokda bor mahsuloti bo'lgan
 * kategoriya ID lari. Stok mantiqi — getProductRealStock (catalog/[slug] bilan bir xil).
 */
async function getNonEmptyCategoryIds(categories: { id: string; parent_id?: string | null }[]): Promise<Set<string>> {
    const stockRows = await fetchAllRows<{ category_id: string | null; stock: any; stock_details: any }>(
        'products',
        'id, category_id, stock, stock_details',
        (q) => q.eq('is_deleted', false).gt('stock', 0),
    );

    const parentOf = new Map<string, string | null>();
    for (const c of categories) parentOf.set(c.id, c.parent_id ?? null);

    const nonEmpty = new Set<string>();
    for (const row of stockRows) {
        if (!row.category_id || getProductRealStock(row) <= 0) continue;
        // Kategoriyaning o'zi va barcha ota-kategoriyalari kiritiladi
        let current: string | null = row.category_id;
        while (current && !nonEmpty.has(current)) {
            nonEmpty.add(current);
            current = parentOf.get(current) ?? null;
        }
    }
    return nonEmpty;
}

// ───────────────────────── 2.2-B — Umumiy ro'yxat va bo'lish ─────────────────────────

/**
 * sitemap.xml, image-sitemap.xml va Merchant feed uchun yagona mahsulot manbasi: bir xil DB filtri,
 * id bo'yicha tartib, har qator baribir isIndexableProduct'dan o'tkaziladi.
 */
export async function fetchIndexableProducts(columns: string): Promise<any[]> {
    const products = await fetchAllRows('products', columns, (q) =>
        q.eq('is_deleted', false).gt('price', 0).not('image', 'is', null).neq('image', ''),
    );
    return products.filter(isIndexableProduct);
}

/** Guruhlarni (uz+ru juftliklari) fayllarga bo'ladi; guruh hech qachon ikki faylga bo'linmaydi. */
function chunkGroups<T>(groups: T[][], maxPerChunk: number): T[][] {
    const chunks: T[][] = [];
    let current: T[] = [];
    for (const group of groups) {
        if (current.length + group.length > maxPerChunk) {
            chunks.push(current);
            current = [];
        }
        current.push(...group);
    }
    if (current.length > 0 || chunks.length === 0) chunks.push(current);
    return chunks;
}

async function getSitemapGroups(): Promise<SitemapGroup[]> {
    const baseUrl = SITEMAP_BASE_URL;

    const [indexableProducts, categories] = await Promise.all([
        fetchIndexableProducts('id, name, name_uz, name_ru, article, updated_at, price, image, is_deleted'),
        fetchAllRows('categories', 'id, name, name_uz, name_ru, parent_id, updated_at', (q) => q.eq('is_deleted', false)),
    ]);

    // Blogs jadvali bo'lmasligi mumkin — sitemap buning uchun yiqilmaydi
    let blogs: any[] = [];
    try {
        blogs = await fetchAllRows('blogs', 'id, slug, created_at, updated_at', (q) => q.eq('is_deleted', false));
    } catch (blogError) {
        console.warn('Sitemap: Blogs table not available:', blogError);
    }

    let latestProductUpdate: Date | undefined;
    for (const product of indexableProducts) {
        const updated = toDate(product.updated_at);
        if (updated && (!latestProductUpdate || updated > latestProductUpdate)) {
            latestProductUpdate = updated;
        }
    }

    const groups: SitemapGroup[] = [];

    // 1) Statik sahifalar
    for (const path of STATIC_PATHS) {
        groups.push(pair(
            `${baseUrl}/uz${path}`,
            `${baseUrl}/ru${path}`,
            PRODUCT_DRIVEN_PATHS.has(path) ? latestProductUpdate : undefined,
        ));
    }

    // 2) Kategoriyalar — faqat stokda tovari borlari
    const nonEmptyCategoryIds = await getNonEmptyCategoryIds(categories);
    for (const cat of categories) {
        if (!nonEmptyCategoryIds.has(cat.id)) continue;
        groups.push(pair(
            `${baseUrl}/uz/catalog/${getCategorySlug(cat, 'uz')}`,
            `${baseUrl}/ru/catalog/${getCategorySlug(cat, 'ru')}`,
            toDate(cat.updated_at),
        ));
    }

    // 3) Bloglar — updated_at → created_at → yo'q
    for (const blog of blogs) {
        if (!blog.slug) continue;
        groups.push(pair(
            `${baseUrl}/uz/blog/${blog.slug}`,
            `${baseUrl}/ru/blog/${blog.slug}`,
            toDate(blog.updated_at) || toDate(blog.created_at),
        ));
    }

    // 4) Mahsulotlar (fetchAllRows tufayli id bo'yicha tartiblangan)
    for (const product of indexableProducts) {
        groups.push(pair(
            `${baseUrl}/uz/products/${getProductSlug(product, 'uz')}`,
            `${baseUrl}/ru/products/${getProductSlug(product, 'ru')}`,
            toDate(product.updated_at),
        ));
    }

    return groups;
}

/**
 * Barcha <url> yozuvlari, MAX_URLS_PER_SITEMAP talik fayllarga bo'lingan.
 * Bitta elementning uz va ru yozuvlari hech qachon ikki faylga bo'linib ketmaydi.
 */
export async function getSitemapChunks(): Promise<SitemapUrl[][]> {
    return chunkGroups(await getSitemapGroups(), MAX_URLS_PER_SITEMAP);
}

// ───────────────────────── image-sitemap ─────────────────────────

/** Bitta image-sitemap faylidagi <url> chegarasi (50 MB hajm limitidan uzoq turish uchun). */
export const MAX_URLS_PER_IMAGE_SITEMAP = 2_000;

/** Google: bitta <url> ichida 1000 tagacha rasm; biz 50 bilan cheklaymiz. */
const MAX_IMAGES_PER_URL = 50;

const VIDEO_RE = /\.(mp4|webm|mov)(\?|#|$)/i;
const PLACEHOLDER = '/placeholder.png';

function toAbsoluteImageUrl(img: string): string {
    const abs = /^https?:\/\//i.test(img) ? img : `${SITEMAP_BASE_URL}${img.startsWith('/') ? '' : '/'}${img}`;
    // Probel yoki ASCII bo'lmagan belgi bo'lsa kodlanadi; allaqachon %XX bo'lsa — qayta kodlanmaydi
    if (/%[0-9A-Fa-f]{2}/.test(abs) || !/[^\x21-\x7E]/.test(abs)) return abs;
    return encodeURI(abs);
}

/**
 * Mahsulot rasmlari uchun YAGONA manba (image-sitemap, JSON-LD, og:image): image birinchi,
 * keyin images; sahifada ko'rinadigan variant (getOptimizedImageUrl 'lg'); video va
 * placeholder'siz; absolyut va kodlangan URL; dublikatsiz; 50 tagacha.
 */
export function getProductImageUrls(p: any): string[] {
    const meta = p?.image_metadata || undefined;
    const raw = [p?.image, ...(Array.isArray(p?.images) ? p.images : [])];
    const urls: string[] = [];
    for (const img of raw) {
        if (typeof img !== 'string' || img.trim() === '') continue;
        const source = img.trim();
        if (VIDEO_RE.test(source) || source === PLACEHOLDER) continue;
        const variant = getOptimizedImageUrl(meta, source, 'lg').trim();
        if (!variant || VIDEO_RE.test(variant) || variant === PLACEHOLDER) continue;
        const url = toAbsoluteImageUrl(variant);
        if (!urls.includes(url)) urls.push(url);
        if (urls.length >= MAX_IMAGES_PER_URL) break;
    }
    return urls;
}

export interface ImageSitemapUrl {
    loc: string;
    lastModified?: Date;
    title: string;
    images: string[];
}

/**
 * image-sitemap: sitemap.xml bilan AYNAN bir xil mahsulotlar (rasmi bor bo'lganlari),
 * har biri uchun uz va ru <url>, MAX_URLS_PER_IMAGE_SITEMAP talik fayllarga bo'lingan.
 */
export async function getImageSitemapChunks(): Promise<ImageSitemapUrl[][]> {
    const products = await fetchIndexableProducts(
        'id, name, name_uz, name_ru, article, price, image, images, image_metadata, updated_at, is_deleted',
    );

    const groups: ImageSitemapUrl[][] = [];
    for (const product of products) {
        const images = getProductImageUrls(product);
        if (images.length === 0) continue;
        const lastModified = toDate(product.updated_at);
        const base = lastModified ? { lastModified, images } : { images };
        groups.push([
            {
                loc: `${SITEMAP_BASE_URL}/uz/products/${getProductSlug(product, 'uz')}`,
                title: String(product.name_uz || product.name || '').trim(),
                ...base,
            },
            {
                loc: `${SITEMAP_BASE_URL}/ru/products/${getProductSlug(product, 'ru')}`,
                title: String(product.name_ru || product.name_uz || product.name || '').trim(),
                ...base,
            },
        ]);
    }

    return chunkGroups(groups, MAX_URLS_PER_IMAGE_SITEMAP);
}

// ───────────────────────── XML ─────────────────────────

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function renderUrlset(urls: SitemapUrl[]): string {
    const entries = urls.map((url) => {
        const lastmod = url.lastModified ? `\n    <lastmod>${url.lastModified.toISOString()}</lastmod>` : '';
        const uz = xmlEscape(url.alternates.uz);
        const ru = xmlEscape(url.alternates.ru);
        return (
            `  <url>\n` +
            `    <loc>${xmlEscape(url.loc)}</loc>${lastmod}\n` +
            `    <xhtml:link rel="alternate" hreflang="uz-UZ" href="${uz}" />\n` +
            `    <xhtml:link rel="alternate" hreflang="ru-RU" href="${ru}" />\n` +
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${uz}" />\n` +
            `  </url>\n`
        );
    });

    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
        entries.join('') +
        `</urlset>\n`
    );
}

export function renderImageUrlset(urls: ImageSitemapUrl[]): string {
    const entries = urls.map((url) => {
        const lastmod = url.lastModified ? `\n    <lastmod>${url.lastModified.toISOString()}</lastmod>` : '';
        // image:title — Yandex Images ishlatadi (Google e'tiborsiz qoldiradi, zararsiz)
        const titleTag = url.title ? `<image:title>${xmlEscape(url.title)}</image:title>` : '';
        const imageTags = url.images
            .map((img) => `    <image:image><image:loc>${xmlEscape(img)}</image:loc>${titleTag}</image:image>\n`)
            .join('');
        return `  <url>\n    <loc>${xmlEscape(url.loc)}</loc>${lastmod}\n${imageTags}  </url>\n`;
    });

    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n` +
        entries.join('') +
        `</urlset>\n`
    );
}

export function renderSitemapIndex(count: number, basePath = '/sitemap'): string {
    let entries = '';
    for (let i = 0; i < count; i++) {
        entries += `  <sitemap>\n    <loc>${SITEMAP_BASE_URL}${basePath}/${i}.xml</loc>\n  </sitemap>\n`;
    }
    return (
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        entries +
        `</sitemapindex>\n`
    );
}

// Cache-Control qo'yilmaydi: keshni Next ISR boshqaradi (revalidate = 86400). Qo'lda
// s-maxage berilsa, Vercel CDN javobni 24 soat ushlab turadi va revalidatePath uni tozalamaydi.
export const SITEMAP_XML_HEADERS = {
    'Content-Type': 'application/xml; charset=utf-8',
};
