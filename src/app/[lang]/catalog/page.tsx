import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import CatalogClient from './CatalogClient';
import { getCatalogCategories } from '@/lib/categories';
import { getCategorySlug } from '@/lib/slugify';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { mapProduct } from '@/lib/mappers';
import { getProductRealStock } from '@/lib/stock';

export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
    const lang = params.lang || 'uz';
    const baseUrl = 'https://velari.uz';

    return {
        title: {
            absolute: lang === 'uz'
                ? "Katalog | Velari - Premium Elektronika va Gadjetlar O'zbekistonda"
                : "Каталог | Velari - Премиум электроника и гаджеты в Узбекистане",
        },
        description: lang === 'uz'
            ? "Velari onlayn do'konida barcha turdagi smartfonlar, noutbuklar va gadjetlar katalogi. Muddatli to'lov, rasmiy kafolat va O'zbekiston bo'ylab yetkazib berish."
            : "Каталог всех видов смартфонов, ноутбуков и гаджетов в онлайн магазине Velari. Рассрочка, официальная гарантия и доставка по всему Узбекистану.",
        keywords: ["katalog", "smartfonlar", "gadjetlar", "elektronika", "Velari katalogi", "Toshkent", "Uzbekistan", "muddatli to'lov"],
        openGraph: {
            title: lang === 'uz' 
                ? "Katalog | Velari - Premium Elektronika va Gadjetlar"
                : "Каталог | Velari - Премиум электроника и гаджеты",
            description: lang === 'uz'
                ? "Barcha turdagi original gadjetlar va elektronika mahsulotlari katalogi."
                : "Каталог всех видов оригинальных гаджетов и электроники.",
            url: `${baseUrl}/${lang}/catalog`,
            siteName: "Velari",
            images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Velari Katalog" }],
            locale: lang === 'uz' ? "uz_UZ" : "ru_RU",
            type: "website",
        },
        alternates: {
            canonical: `${baseUrl}/${lang}/catalog`,
            languages: {
                'uz-UZ': `${baseUrl}/uz/catalog`,
                'ru-RU': `${baseUrl}/ru/catalog`,
                'x-default': `${baseUrl}/uz/catalog`,
            },
        }
    };
}

export const revalidate = 86400; // 24 hours

export default async function CatalogPage({ params, searchParams }: {
    params: { lang: string };
    searchParams?: { category?: string };
}) {
    // Serverda kategoriyalar, boshlang'ich mahsulotlar va brendlarni parallel yuklaymiz (ISR orqali tezkor CDN keshi)
    const [
        categories,
        { data: productsData },
        { data: brandsData },
        { data: pcData },
        { data: warehousesData }
    ] = await Promise.all([
        getCatalogCategories(),
        supabaseAdmin
            .from("products")
            .select("id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,sales,avg_rating,review_count,stock,stock_details,category_id,brand_id,video_url,model,color_name,group_id,is_original,article,express_delivery,created_at")
            .eq("is_deleted", false)
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

    // Eski `?category=ID` havolalarni toza URL'ga 301-redirect (SEO + indekslangan URL'lar)
    const catId = searchParams?.category;
    if (catId) {
        const cat = categories.find((c) => c.id === catId);
        if (cat) {
            const lang = params.lang === 'ru' ? 'ru' : 'uz';
            redirect(`/${lang}/catalog/${getCategorySlug(cat, lang)}`);
        }
    }

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
            initialProducts={mappedProducts}
            initialBrands={(brandsData || []) as any}
            initialProductCatIds={validCatIds}
            initialWarehouses={warehousesData || []}
        />
    );
}
