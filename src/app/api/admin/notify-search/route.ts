import { NextRequest, NextResponse } from "next/server";
import { submitToIndexNow } from "@/lib/index-now";
import { getProductSlug, getCategorySlug } from "@/lib/slugify";
import { supabaseAdmin } from "@/lib/supabase-admin";

/**
 * API to notify search engines about new or updated products.
 * Supports single ID or array of IDs.
 */
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { productId, productIds, blogId, blogIds, categoryId, categoryIds } = body;
        const baseUrl = 'https://velari.uz';
        const urls: string[] = [];

        // 1. Handle Products
        const pIds = [...(productId ? [productId] : []), ...(productIds || [])];
        if (pIds.length > 0) {
            const { data: pData } = await supabaseAdmin.from("products").select("id, name, name_uz, name_ru, article").in("id", pIds.slice(0, 1000));
            pData?.forEach(p => {
                urls.push(`${baseUrl}/uz/products/${getProductSlug(p, 'uz')}`);
                urls.push(`${baseUrl}/ru/products/${getProductSlug(p, 'ru')}`);
            });
        }

        // 2. Handle Blogs
        const bIds = [...(blogId ? [blogId] : []), ...(blogIds || [])];
        if (bIds.length > 0) {
            const { data: bData } = await supabaseAdmin.from("blogs").select("slug").in("id", bIds.slice(0, 1000));
            bData?.forEach(b => {
                urls.push(`${baseUrl}/uz/blog/${b.slug}`);
                urls.push(`${baseUrl}/ru/blog/${b.slug}`);
            });
        }

        // 3. Handle Categories — TOZA URL (/catalog/<slug>)
        const cIds = [...(categoryId ? [categoryId] : []), ...(categoryIds || [])];
        if (cIds.length > 0) {
            const { data: cData } = await supabaseAdmin.from("categories").select("id, name, name_uz, name_ru").in("id", cIds.slice(0, 1000));
            cData?.forEach(cat => {
                urls.push(`${baseUrl}/uz/catalog/${getCategorySlug(cat, 'uz')}`);
                urls.push(`${baseUrl}/ru/catalog/${getCategorySlug(cat, 'ru')}`);
            });
        }

        if (urls.length === 0) {
            return NextResponse.json({ error: "Hech qanday ID topilmadi" }, { status: 400 });
        }

        const indexNowSuccess = await submitToIndexNow(urls);

        return NextResponse.json({ 
            success: indexNowSuccess,
            indexNow: indexNowSuccess,
            urlsCount: urls.length
        });
    } catch (error: any) {
        console.error("Notify Search API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
