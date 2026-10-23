import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import CatalogClient from '../CatalogClient';
import { getCatalogCategories, resolveCategoryBySlug } from '@/lib/categories';
import { getCategorySlug } from '@/lib/slugify';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mapProduct } from '@/lib/mappers';
import { getProductRealStock } from '@/lib/stock';

export const revalidate = 86400; // 24 soat

function decodeSlug(slug: string): string {
    try {
        return decodeURIComponent(slug);
    } catch {
        return slug;
    }
}

export async function generateMetadata({ params }: { params: { lang: string; slug: string } }): Promise<Metadata> {
    const lang = params.lang === 'ru' ? 'ru' : 'uz';
    const baseUrl = 'https://velari.uz';
    const categories = await getCatalogCategories();
    const cat = resolveCategoryBySlug(categories, params.slug, lang);

    if (!cat) {
        return {
            title: { absolute: "404 - Sahifa topilmadi | Velari" },
            robots: { index: false, follow: false },
        };
    }

    const name = lang === 'ru' ? (cat.name_ru || cat.name_uz || cat.name) : (cat.name_uz || cat.name);
    const uzSlug = getCategorySlug(cat, 'uz');
    const ruSlug = getCategorySlug(cat, 'ru');
    const canonicalSlug = lang === 'ru' ? ruSlug : uzSlug;

    // "| Velari" ni catalog/layout shabloni qo'shadi
    const title = lang === 'ru'
        ? `${name} — купить в Ташкенте`
        : `${name} — Toshkentda sotib olish`;
    const description = lang === 'ru'
        ? `${name}: широкий выбор по выгодным ценам. Рассрочка, официальная гарантия и доставка по всему Узбекистану. Velari Market.`
        : `${name}: keng tanlov hamyonbop narxlarda. Muddatli to'lov, rasmiy kafolat va O'zbekiston bo'ylab yetkazib berish. Velari Market.`;

    return {
        title,
        description,
        openGraph: {
            title: `${title} | Velari`, description,
            url: `${baseUrl}/${lang}/catalog/${canonicalSlug}`,
            siteName: 'Velari', type: 'website',
            locale: lang === 'ru' ? 'ru_RU' : 'uz_UZ',
            images: [{ url: '/og-image.png', width: 1200, height: 630, alt: name }],
        },
        alternates: {
            canonical: `${baseUrl}/${lang}/catalog/${canonicalSlug}`,
            languages: {
                'uz-UZ': `${baseUrl}/uz/catalog/${uzSlug}`,
                'ru-RU': `${baseUrl}/ru/catalog/${ruSlug}`,
                'x-default': `${baseUrl}/uz/catalog/${uzSlug}`,
            },
        },
        robots: { index: true, follow: true },
    };
}

export default async function CategoryCatalogPage({ params }: { params: { lang: string; slug: string } }) {
    const lang = params.lang === 'ru' ? 'ru' : 'uz';
    const categories = await getCatalogCategories();
    const cat = resolveCategoryBySlug(categories, params.slug, lang);

    if (!cat) notFound();

    // Boshqa til slug'i (yoki eski/katta harfli shakl) bilan kelsa — shu tildagi canonical slug'ga 308
    const canonicalSlug = getCategorySlug(cat, lang);
    if (decodeSlug(params.slug) !== canonicalSlug) {
        permanentRedirect(`/${lang}/catalog/${canonicalSlug}`);
    }

    // Barcha ichki subkategoriya ID larini aniqlash
    const getAllIds = (catId: string): string[] => {
        const children = categories.filter(c => c.parentId === catId);
        let ids = [catId];
        for (const child of children) ids = [...ids, ...getAllIds(child.id)];
        return ids;
    };
    const targetCatIds = getAllIds(cat.id);

    const [
        { data: productsData },
        { data: brandsData },
        { data: pcData },
        { data: warehousesData }
    ] = await Promise.all([
        supabaseAdmin
            .from("products")
            .select("id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,sales,avg_rating,review_count,stock,stock_details,category_id,brand_id,video_url,model,color_name,group_id,is_original,article,express_delivery,created_at")
            .eq("is_deleted", false)
            .in("category_id", targetCatIds)
            .gt("stock", 0)
            .order("sales", { ascending: false, nullsFirst: false })
            .limit(100),
        supabaseAdmin
            .from("brands")
            .select("id, name, name_uz, name_ru")
            .eq("is_deleted", false)
            .order("name"),
        supabaseAdmin
            .from("products")
            .select("category_id, stock, stock_details")
            .eq("is_deleted", false)
            .gt("stock", 0)
            .limit(10000),
        supabaseAdmin
            .from("warehouses")
            .select("id,name,logo,dbs_config,active")
            .eq("active", true)
    ]);

    const mappedProducts = (productsData || [])
        .map(mapProduct)
        .filter((p: any) => getProductRealStock(p) > 0)
        .map((d: any) => {
            const firstImg = d.images?.[0] || d.image;
            const trimmedMeta = firstImg && d.image_metadata?.[firstImg] ? { [firstImg]: d.image_metadata[firstImg] } : {};
            return { ...d, image_metadata: trimmedMeta };
        });
    const validCatIds = (pcData || [])
        .filter((r: any) => getProductRealStock(r) > 0)
        .map((r: any) => r.category_id)
        .filter(Boolean);

    return (
        <CatalogClient 
            initialCategories={categories} 
            initialCategory={cat.id} 
            initialProducts={mappedProducts}
            initialBrands={(brandsData || []) as any}
            initialProductCatIds={validCatIds}
            initialWarehouses={warehousesData || []}
        />
    );
}
