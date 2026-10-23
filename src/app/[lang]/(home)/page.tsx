import { buildStoryGroups } from "@/lib/stories";
import { Suspense } from "react";
import HomeClient from "./HomeClient";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapProduct, mapCategory, mapBanner } from "@/lib/mappers";
import { getProductRealStock } from "@/lib/stock";
import type { Product, Category, Banner } from "@/types";
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
    const lang = params.lang || 'uz';
    const baseUrl = 'https://velari.uz';
    
    return {
        // Brend boshida — layout shabloni ("%s | Velari") qo'shilmasin
        title: {
            absolute: lang === 'uz'
                ? "Velari | O'zbekistonda №1 Premium Elektronika Do'koni"
                : "Velari | Премиум магазин электроники №1 в Узбекистане",
        },
        description: lang === 'uz'
            ? "iPhone, Samsung, Xiaomi va boshqa global brendlarni muddatli to'lovga sotib oling. O'zbekiston bo'ylab yetkazib berish va rasmiy kafolat."
            : "Покупайте iPhone, Samsung, Xiaomi и другие мировые бренды в рассрочку. Доставка по всему Узбекистану и официальная гарантия.",
        keywords: ["Velari", "elektronika do'koni", "Toshkent", "muddatli to'lov", "iphone narxi", "samsung narxi", "O'zbekiston"],
        alternates: {
            canonical: `${baseUrl}/${lang}`,
            languages: {
                'uz-UZ': `${baseUrl}/uz`,
                'ru-RU': `${baseUrl}/ru`,
                'x-default': `${baseUrl}/uz`,
            },
        }
    };
}

export const revalidate = 86400; // 24 soatda bir marta yangilanadi (ISR limitni tejash uchun)

async function getInitialData() {
    try {
        const [
            { data: productsData },
            { data: categoriesData },
            { data: bannersData },
            { data: settingsData },
            { data: promoData },
            { data: prodCatRows },
            { data: featuredSettingRow },
            { data: storiesData },
            { data: warehousesData }
        ] = await Promise.all([
            supabaseAdmin.from("products").select("id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,sales,avg_rating,review_count,stock,stock_details,category_id,brand_id,video_url,model,color_name,group_id,is_original,article,express_delivery,created_at").eq("is_deleted", false).gt("stock", 0).order("sales", { ascending: false, nullsFirst: false }).order("avg_rating", { ascending: false, nullsFirst: false }).limit(30),
            supabaseAdmin.from("categories").select("id,name,name_uz,name_ru,parent_id,image,image_meta,icon,color,is_deleted").eq("is_deleted", false).order("name", { ascending: true }),
            supabaseAdmin.from("banners").select("id,title_uz,title_ru,html_uz,html_ru,active,order_index,tab_name_uz,tab_name_ru").eq("active", true).order("order_index", { ascending: true }),
            supabaseAdmin.from("settings").select("data").eq("id", "banners").single(),
            supabaseAdmin.from("site_settings").select("value").eq("key", "promo_countdown").single(),
            // Mahsuloti bor kategoriyalarni aniqlash uchun barcha mahsulot category_id lari
            supabaseAdmin.from("products").select("category_id, stock, stock_details").eq("is_deleted", false).gt("stock", 0).limit(10000),
            // Kategoriya vitrinasi sozlamasi (settings anon o'qishdan yopiq -> server orqali)
            supabaseAdmin.from("settings").select("data").eq("id", "featured_categories").maybeSingle(),
            // Bosh sahifa storylari (serverda keshlanadi, qayta yuklanganda sakrab chiqmasligi uchun)
            // aniq ustunlar (image_meta — aylana uchun kichik variant); select("*") keshi yangi ustunni ko'rmay qolgan edi
            supabaseAdmin.from("stories").select("id,title_uz,title_ru,image,image_meta,link,is_active,sort_order,audio,video,group_key,group_title_uz,group_title_ru,cta_type,cta_ids,cta_label_uz,cta_label_ru").eq("is_active", true).order("sort_order", { ascending: true }),
            supabaseAdmin.from("warehouses").select("id,name,logo,dbs_config,active").eq("active", true)
        ]);

        // Mahsuloti bor (bo'sh bo'lmagan) kategoriyalar to'plamini hisoblash.
        // Subkategoriyada mahsulot bo'lsa, uning parenti ham "bo'sh emas" hisoblanadi.
        const rawCats = categoriesData || [];
        const parentOf = new Map<string, string | null>(rawCats.map((c: any) => [String(c.id), c.parent_id ? String(c.parent_id) : null]));
        const directCatIds = new Set<string>((prodCatRows || []).filter((r: any) => getProductRealStock(r) > 0).map((r: any) => String(r.category_id)).filter(Boolean));
        const nonEmpty = new Set<string>();
        directCatIds.forEach(id => {
            let cur: string | null = id;
            let guard = 0;
            while (cur && guard < 10) {
                nonEmpty.add(cur);
                cur = parentOf.get(cur) || null;
                guard++;
            }
        });

        const visibleCatRows = rawCats.filter((c: any) => nonEmpty.has(String(c.id)));

        // image_metadata — faqat kartochka ishlatadigan rasmlar (asosiy + birinchi video bo'lmagan).
        // To'liq meta (har rasmga blur base64) React payload'ini ~2x kattalashtirib, mobil hydration'ni sekinlatardi.
        const trimMeta = (p: any) => {
            const meta = p.image_metadata;
            if (!meta || typeof meta !== "object") return p;
            const imgs: string[] = Array.isArray(p.images) ? p.images : [];
            const keep = new Set([imgs[0], p.image, imgs.find((u: string) => u && !u.toLowerCase().endsWith(".mp4"))].filter(Boolean));
            const trimmed: Record<string, any> = {};
            keep.forEach(k => { if (meta[k as string]) trimmed[k as string] = meta[k as string]; });
            return { ...p, image_metadata: trimmed };
        };
        const products = (productsData || []).map(mapProduct).filter((p: any) => getProductRealStock(p) > 0).slice(0, 20).map(trimMeta);
        const categories = visibleCatRows.map(mapCategory);
        const banners = (bannersData || []).map(mapBanner);
        const bannerSettings = settingsData?.data
            ? { desktopHeight: settingsData.data.desktopHeight || 210, borderRadius: settingsData.data.borderRadius || 32 }
            : { desktopHeight: 210, borderRadius: 32 };
        const promoSettings = (promoData?.value as any) || null;

        // Kategoriya vitrinasi: tanlangan, mahsuloti bor, tartibda saqlangan kategoriyalar.
        const fcData: any = (featuredSettingRow as any)?.data || null;
        const fcShow = fcData ? fcData.show_on_home !== false : false;
        const fcIds: string[] = fcData?.category_ids || [];
        const featuredCategories = (fcShow ? fcIds : [])
            .map((id: string) => rawCats.find((c: any) => String(c.id) === String(id)))
            .filter((c: any) => c && nonEmpty.has(String(c.id)))
            .map((c: any) => ({
                id: String(c.id),
                name: c.name,
                name_uz: c.name_uz,
                name_ru: c.name_ru,
                image: c.image || null,
                icon: c.icon || null,
                color: c.color || null,
            }));

        // Stories guruhlash (src/lib/stories.ts): aylana — eng kichik variant + blur
        const storyGroups = buildStoryGroups(storiesData || []);

        return { products, categories, banners, bannerSettings, promoSettings, featuredCategories, storyGroups, warehouses: warehousesData || [] };
    } catch (error) {
        console.error("Server-side fetch failed:", error);
        return { products: [], categories: [], banners: [], bannerSettings: { desktopHeight: 210, borderRadius: 32 }, promoSettings: null, featuredCategories: [], storyGroups: [], warehouses: [] };
    }
}

async function HomeDataWrapper() {
    const { products, categories, banners, bannerSettings, promoSettings, featuredCategories, storyGroups, warehouses } = await getInitialData();

    return (
        <HomeClient
            initialProducts={products}
            initialCategories={categories}
            initialBanners={banners}
            initialBannerSettings={bannerSettings}
            initialPromo={promoSettings}
            initialFeaturedCategories={featuredCategories}
            initialStoryGroups={storyGroups}
            initialWarehouses={warehouses}
        />
    );
}

export default function Home() {
    return (
        <Suspense fallback={<HomeSkeleton />}>
            <HomeDataWrapper />
        </Suspense>
    );
}

function HomeSkeleton() {
    return (
        <div className="min-h-screen bg-[#FAFAF6] animate-pulse">
            {/* 1. Header Navigation Skeleton (matches height of real site) */}
            <div className="h-16 border-b border-black/[0.04] flex items-center px-4 md:px-10 gap-8 bg-white">
                <div className="w-24 h-6 bg-gray-100 rounded-full" />
                <div className="hidden md:block flex-1 max-w-xl h-10 bg-gray-100 rounded-2xl mx-auto" />
                <div className="w-10 h-10 bg-gray-100 rounded-xl" />
            </div>

            {/* 2. Banner Section Skeleton (matches mobile aspect-16/10 and desktop hero) */}
            <div className="mt-3 md:mt-8 px-4 md:px-10">
                <div className="w-full aspect-[16/10] md:aspect-auto md:h-[210px] bg-gray-100 rounded-3xl md:rounded-[32px]" />
            </div>

            {/* 3. Category Filter Skeleton */}
            <div className="mt-6 md:mt-10 px-4 md:px-10 space-y-4">
                <div className="flex gap-3 overflow-hidden">
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-16 md:w-24 h-16 md:h-20 bg-gray-100 rounded-2xl shrink-0" />
                    ))}
                </div>
            </div>

            {/* 4. Product Tab Skeleton */}
            <div className="mt-8 px-4 md:px-10 border-b border-black/[0.04] flex gap-8">
                <div className="w-20 h-7 bg-gray-100 rounded-t-lg" />
                <div className="w-20 h-7 bg-gray-100 rounded-t-lg" />
            </div>

            {/* 5. Product Grid Skeleton (1:1 layout match with ProductCard) */}
            <div className="mt-6 px-2 md:px-10 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2.5 md:gap-x-6 gap-y-5 md:gap-y-10">
                {[...Array(12)].map((_, i) => (
                    <div
                        key={i}
                        className="flex flex-col h-full bg-white overflow-hidden rounded-[22px] border border-black/[0.04]"
                        style={{ boxShadow: "0 4px 16px rgba(15,20,16,0.05)" }}
                    >
                        <div className="relative bg-gray-100 w-full aspect-[3/4]" />
                        <div className="flex flex-col flex-1 p-[10px_14px_12px]">
                            <div className="h-3 bg-gray-100 rounded-full w-3/4 mb-2" />
                            <div className="h-3 bg-gray-100 rounded-full w-1/2 mb-3" />
                            <div className="mt-auto flex flex-col gap-2">
                                <div className="h-4 bg-gray-100 rounded-full w-24" />
                            </div>
                        </div>
                        <div className="w-full bg-gray-100 mt-auto h-[44px]" />
                    </div>
                ))}
            </div>
        </div>
    );
}
