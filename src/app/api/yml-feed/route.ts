import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProductSlug } from "@/lib/slugify";

export const revalidate = 86400; // 24 soatda bir yangilanadi

const BASE_URL = "https://velari.uz";

function escapeXml(str: string): string {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export async function GET() {
    try {
        const [{ data: products }, { data: categories }] = await Promise.all([
            supabaseAdmin
                .from("products")
                .select("id, name, name_uz, name_ru, price, old_price, image, images, description, description_uz, description_ru, stock, article, category_id, brand_id, is_deleted, updated_at")
                .eq("is_deleted", false)
                .order("sales", { ascending: false, nullsFirst: false }),
            supabaseAdmin
                .from("categories")
                .select("id, name, name_uz, name_ru, parent_id")
                .eq("is_deleted", false),
        ]);

        if (!products) {
            return NextResponse.json({ error: "No products" }, { status: 500 });
        }

        const validProducts = (products || []).filter(p => p.price && p.price > 0 && p.image);

        const catMap = new Map((categories || []).map((c) => [c.id, c]));

        const now = new Date().toISOString().slice(0, 16).replace("T", " ");

        // ── Kategoriyalar ──
        const categoryLines = (categories || [])
            .map((c) => {
                const name = escapeXml(c.name_ru || c.name_uz || c.name || "");
                const parentAttr = c.parent_id ? ` parentId="${c.parent_id}"` : "";
                return `      <category id="${c.id}"${parentAttr}>${name}</category>`;
            })
            .join("\n");

        // ── Mahsulotlar ──
        const offerLines = validProducts
            .map((p) => {
                const available = (p.stock ?? 1) > 0 ? "true" : "false";
                const uzSlug = getProductSlug(p, "uz");
                const ruSlug = getProductSlug(p, "ru");

                const nameRu = escapeXml(p.name_ru || p.name_uz || p.name || "");
                const nameUz = escapeXml(p.name_uz || p.name || "");
                const descRu = escapeXml((p.description_ru || p.description || "").substring(0, 3000));
                const descUz = escapeXml((p.description_uz || p.description || "").substring(0, 3000));

                const catId = p.category_id || "";
                const catName = catMap.get(catId);
                const vendor = escapeXml(p.brand_id || "Velari");

                // Rasmlar: asosiy + qo'shimcha (max 10)
                const allImages: string[] = [p.image, ...(p.images || [])].filter(Boolean).slice(0, 10);
                const pictureLines = allImages
                    .map((img) => `        <picture>${escapeXml(img)}</picture>`)
                    .join("\n");

                const oldPriceLine = p.old_price
                    ? `\n        <oldprice>${p.old_price}</oldprice>`
                    : "";

                // Yandex Business uchun bitta offer — rus tilida (Yandex asosan ruscha indekslaydi)
                const offer = `    <offer id="${p.id}" available="${available}">
        <url>${BASE_URL}/ru/products/${ruSlug}</url>
        <name>${nameRu}</name>
        <price>${p.price}</price>${oldPriceLine}
        <currencyId>UZS</currencyId>
        <categoryId>${catId}</categoryId>
${pictureLines}
        <vendor>${vendor}</vendor>
        <description>${descRu}</description>
    </offer>`;

                return offer;
            })
            .join("\n");

        const yml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE yml_catalog SYSTEM "shops.dtd">
<yml_catalog date="${now}">
  <shop>
    <name>Velari</name>
    <company>Velari</company>
    <url>${BASE_URL}</url>
    <currencies>
      <currency id="UZS" rate="1"/>
    </currencies>
    <categories>
${categoryLines}
    </categories>
    <offers>
${offerLines}
    </offers>
  </shop>
</yml_catalog>`;

        return new NextResponse(yml, {
            status: 200,
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
                "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
            },
        });
    } catch (err) {
        console.error("[YML Feed]", err);
        return NextResponse.json({ error: "Feed generation failed" }, { status: 500 });
    }
}
