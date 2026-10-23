import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapProduct } from "@/lib/mappers";
import { notFound } from "next/navigation";
import StoreClient from "./StoreClient";

export const revalidate = 300; // 5 daqiqalik Edge Cache — Vercel CPU sarfini tejaydi

const getWarehouse = cache(async (id: string) => {
    const { data: wh } = await supabaseAdmin
        .from("warehouses")
        .select("id,name,logo,address,active")
        .eq("id", id)
        .maybeSingle();
    return wh;
});

export async function generateMetadata({ params }: { params: { lang: string; id: string } }) {
    const lang = params.lang === "ru" ? "ru" : "uz";
    const wh = await getWarehouse(params.id);

    if (!wh || wh.active === false) {
        notFound();
    }

    const title = wh.name;
    const description = wh.address 
        ? `${wh.name} do'konidagi barcha tovarlar. Manzil: ${wh.address}` 
        : `${wh.name} do'konidagi barcha mahsulotlar katalogi.`;

    return {
        title,
        description,
        alternates: {
            canonical: `https://velari.uz/${lang}/store/${params.id}`,
            languages: {
                "uz-UZ": `https://velari.uz/uz/store/${params.id}`,
                "ru-RU": `https://velari.uz/ru/store/${params.id}`,
                "x-default": `https://velari.uz/uz/store/${params.id}`,
            },
        },
    };
}

const PRODUCT_COLS =
    "id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,sales,avg_rating,review_count,stock,stock_details,category_id,brand_id,video_url,model,color_name,group_id,is_original,article,created_at";

export default async function StorePage({ params }: { params: { lang: string; id: string } }) {
    const lang = params.lang === "ru" ? "ru" : "uz";

    const wh = await getWarehouse(params.id);

    if (!wh || wh.active === false) notFound();

    const { data: rows } = await supabaseAdmin
        .from("products")
        .select(PRODUCT_COLS)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(500);

    const products = (rows || [])
        .filter((p: any) => Number((p.stock_details || {})[params.id]) > 0)
        .map(mapProduct)
        .map((d: any) => {
            const firstImg = d.images?.[0] || d.image;
            const trimmedMeta = firstImg && d.image_metadata?.[firstImg] ? { [firstImg]: d.image_metadata[firstImg] } : {};
            return { ...d, image_metadata: trimmedMeta };
        });

    return (
        <StoreClient
            warehouse={{ id: wh.id, name: wh.name, logo: wh.logo || null, address: wh.address || null }}
            products={products}
            language={lang}
        />
    );
}
