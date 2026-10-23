import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { submitToIndexNow } from "@/lib/index-now";
import { getProductSlug } from "@/lib/slugify";

/**
 * SEO Auto-Indexing Cron Job
 * 
 * Har kuni avtomatik ishga tushadi (Vercel Cron):
 * 1. Oxirgi 24 soatda yangilangan mahsulotlarni topadi
 * 2. IndexNow orqali Bing/Yandex ga xabar beradi
 * 
 * Bu cron har kuni 06:00 UTC da ishlaydi (vercel.json da sozlangan)
 */
export async function GET(req: Request) {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const startTime = Date.now();
    const results: Record<string, any> = {};

    try {
        // 1. Oxirgi 25 soatda yangilangan mahsulotlarni topish (1 soat overlap)
        const since = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
        
        const { data: updatedProducts, error: productsError } = await supabaseAdmin
            .from("products")
            .select("id, name, name_uz, name_ru, article, updated_at")
            .eq("is_deleted", false)
            .gte("updated_at", since);

        if (productsError) {
            console.error("SEO Cron: Failed to fetch updated products:", productsError.message);
            results.productsError = productsError.message;
        }

        // 2. Yangilangan mahsulotlar uchun URL'larni yaratish
        const baseUrl = "https://velari.uz";
        const updatedUrls: string[] = [];

        if (updatedProducts && updatedProducts.length > 0) {
            for (const product of updatedProducts) {
                updatedUrls.push(`${baseUrl}/uz/products/${getProductSlug(product, 'uz')}`);
                updatedUrls.push(`${baseUrl}/ru/products/${getProductSlug(product, 'ru')}`);
            }
            results.updatedProducts = updatedProducts.length;
            results.urlsGenerated = updatedUrls.length;
        } else {
            results.updatedProducts = 0;
        }

        // 3. Asosiy sahifalarni har doim ping qilish
        const staticUrls = [
            `${baseUrl}/uz`,
            `${baseUrl}/ru`,
            `${baseUrl}/uz/catalog`,
            `${baseUrl}/ru/catalog`,
            `${baseUrl}/uz/blog`,
            `${baseUrl}/ru/blog`,
        ];

        const allUrls = [...staticUrls, ...updatedUrls];

        // 4. IndexNow ga yuborish (Bing, Yandex)
        if (allUrls.length > 0) {
            const indexNowResult = await submitToIndexNow(allUrls);
            results.indexNow = indexNowResult ? "success" : "failed";
            results.indexNowUrls = allUrls.length;
        }

        // 5. Oxirgi yangilangan mahsulotlarni topish — yangi qo'shilganlar
        const { data: newProducts, error: newError } = await supabaseAdmin
            .from("products")
            .select("id, name, name_uz, name_ru, article")
            .eq("is_deleted", false)
            .gte("created_at", since);

        if (newProducts && newProducts.length > 0) {
            const newUrls = newProducts.flatMap(p => [
                `${baseUrl}/uz/products/${getProductSlug(p, 'uz')}`,
                `${baseUrl}/ru/products/${getProductSlug(p, 'ru')}`,
            ]);
            
            // Yangi mahsulotlar uchun alohida IndexNow
            await submitToIndexNow(newUrls);
            results.newProducts = newProducts.length;
        }

        const duration = Date.now() - startTime;
        results.duration = `${duration}ms`;
        results.timestamp = new Date().toISOString();

        console.log("✅ SEO Auto-Index Cron completed:", JSON.stringify(results));
        
        return NextResponse.json({ 
            success: true, 
            message: "SEO auto-indexing completed",
            ...results 
        });
    } catch (error: any) {
        console.error("SEO Cron Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message,
            duration: `${Date.now() - startTime}ms`
        });
    }
}
