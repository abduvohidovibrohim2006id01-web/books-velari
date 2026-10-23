import { NextResponse } from "next/server";
import { getProductSlug } from "@/lib/slugify";
import { computeStandardDelivery } from "@/lib/delivery";
import { fetchAllRows, fetchIndexableProducts, getProductImageUrls } from "@/lib/sitemap-data";
import { getProductRealStock } from "@/lib/stock";
import { getProductDescription, getProductIdentifiers, truncateAtWord } from "@/lib/seo-text";

// Keshni Next ISR boshqaradi (sitemap kabi) — Cache-Control qo'lda qo'yilmaydi
export const revalidate = 86400;

const BASE_URL = "https://velari.uz";
const MAX_ADDITIONAL_IMAGES = 10;

function esc(str: string): string {
    return (str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

// Google price format: "274990 UZS"
function gPrice(val: number): string {
    return `${Math.round(val)} UZS`;
}

export async function GET() {
    try {
        // Mahsulotlar — sitemap bilan AYNAN bir xil to'plam (fetchAllRows + isIndexableProduct)
        const [products, categories, brands] = await Promise.all([
            fetchIndexableProducts(
                "id, name, name_uz, name_ru, price, old_price, image, images, image_metadata, description, description_uz, description_ru, stock, stock_details, article, model, category_id, brand_id, is_deleted, updated_at",
            ),
            fetchAllRows("categories", "id, name, name_ru, name_uz, parent_id", (q) => q.eq("is_deleted", false)),
            fetchAllRows("brands", "id, name", (q) => q.eq("is_deleted", false)),
        ]);

        if (!products.length) {
            throw new Error("No products");
        }

        const catMap = new Map(categories.map((c: any) => [c.id, c]));
        const brandMap = new Map(brands.map((b: any) => [b.id, b.name]));

        const getCategoryPath = (catId: string): string => {
            const parts: string[] = [];
            let cur: any = catMap.get(catId);
            while (cur) {
                parts.unshift(cur.name_ru || cur.name_uz || cur.name || "");
                cur = cur.parent_id ? catMap.get(cur.parent_id) : undefined;
            }
            return parts.join(" > ") || "Электроника";
        };

        const now = new Date().toUTCString();

        const items = products.map((p) => {
            // Rasmlar — sahifa JSON-LD va image-sitemap bilan bir xil manba (xom yoki AVIF emas)
            const images = getProductImageUrls(p);
            if (images.length === 0) return null;
            const [mainImage, ...extraImages] = images;

            const ruSlug = getProductSlug(p, "ru");
            const link = `${BASE_URL}/ru/products/${ruSlug}`;

            const titleText = p.name_ru || p.name_uz || p.name || "";
            const title = esc(titleText);
            const desc = esc(truncateAtWord(getProductDescription(p, "ru"), 5000) || titleText);

            // Identifikatorlar faqat haqiqiy bo'lsa; "Velari" brend sifatida berilmaydi
            const ids = getProductIdentifiers({ ...p, brand_name: p.brand_id ? brandMap.get(p.brand_id) : undefined });
            const identifierLines = [
                ids.mpn ? `      <g:mpn>${esc(ids.mpn)}</g:mpn>` : "",
                ids.brand ? `      <g:brand>${esc(ids.brand)}</g:brand>` : "",
                !ids.mpn ? `      <g:identifier_exists>no</g:identifier_exists>` : "",
            ].filter(Boolean).join("\n");

            const catPath = esc(getCategoryPath(p.category_id));
            const availability = getProductRealStock(p) > 0 ? "in stock" : "out of stock";

            const additionalImages = extraImages
                .slice(0, MAX_ADDITIONAL_IMAGES)
                .map((img) => `      <g:additional_image_link>${esc(img)}</g:additional_image_link>`)
                .join("\n");

            const salePriceLine = p.old_price && p.old_price > p.price
                ? `      <g:sale_price>${gPrice(p.price)}</g:sale_price>`
                : "";

            // Chegirma bo'lsa price = eski narx, sale_price = yangi narx
            const actualPrice = p.price;
            const displayPrice = p.old_price && p.old_price > p.price
                ? gPrice(p.old_price)
                : gPrice(p.price);

            // Standart yetkazish narxi — chegara va narx faqat src/lib/delivery.ts da
            const shippingPrice = `${computeStandardDelivery(actualPrice)} UZS`;

            return `    <item>
      <g:id>${esc(p.id)}</g:id>
      <g:title>${title}</g:title>
      <g:description>${desc}</g:description>
      <g:link>${link}</g:link>
      <g:image_link>${esc(mainImage)}</g:image_link>
${additionalImages ? additionalImages + "\n" : ""}\
      <g:availability>${availability}</g:availability>
      <g:price>${displayPrice}</g:price>
${salePriceLine ? salePriceLine + "\n" : ""}\
      <g:condition>new</g:condition>
${identifierLines}
      <g:product_type>${catPath}</g:product_type>
      <g:shipping>
        <g:country>UZ</g:country>
        <g:price>${shippingPrice}</g:price>
      </g:shipping>
    </item>`;
        }).filter(Boolean).join("\n");

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Velari — Premium Electronics</title>
    <link>${BASE_URL}</link>
    <description>Velari — O'zbekistondagi premium texnika do'koni</description>
    <lastBuildDate>${now}</lastBuildDate>
${items}
  </channel>
</rss>`;

        return new NextResponse(xml, {
            status: 200,
            headers: {
                "Content-Type": "application/xml; charset=utf-8",
            },
        });
    } catch (err) {
        console.error("[Google Feed]", err);
        return NextResponse.json({ error: "Feed generation failed" }, { status: 500 });
    }
}
