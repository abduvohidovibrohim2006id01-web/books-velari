import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProductSlug } from '@/lib/slugify';

export const dynamic = 'force-dynamic';
export const revalidate = 86400; // 24 soatda kesh yangilanadi

const BASE_URL = 'https://velari.uz';

function escapeCdata(text: string = ''): string {
  return text.replace(/\]\]>/g, ']]&gt;');
}

function stripHtml(html: string = ''): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')       // <br> -> yangi qator
    .replace(/<\/p>/gi, '\n')             // </p> -> yangi qator
    .replace(/<[^>]*>/g, '')              // barcha HTML teglarni o'chirish
    .replace(/&nbsp;/gi, ' ')             // &nbsp; -> bo'sh joy
    .replace(/&amp;/gi, '&')              // &amp; -> &
    .replace(/&lt;/gi, '<')               // &lt; -> <
    .replace(/&gt;/gi, '>')               // &gt; -> >
    .replace(/&quot;/gi, '"')             // &quot; -> "
    .replace(/&#039;/gi, "'")             // &#039; -> '
    .replace(/[✅✔️☑️🔥⭐💥🎁🎉🚀💡⚡🔹🔸▪️●•]/g, '')  // emojilarni o'chirish
    .replace(/\n{3,}/g, '\n\n')           // 3+ yangi qatorni 2 taga kamaytirish
    .replace(/[ \t]+/g, ' ')              // ortiqcha bo'sh joylarni tozalash
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') === 'ru' ? 'ru' : 'uz';

    const { data: brands } = await supabaseAdmin.from('brands').select('id, name');
    const brandMap: Record<string, string> = {};
    (brands || []).forEach((b) => {
      brandMap[b.id] = b.name;
    });

    const { data: products, error } = await supabaseAdmin
      .from('products')
      .select('id, name, name_uz, name_ru, price, old_price, stock, image, images, description, description_uz, description_ru, sku, model, brand_id, category_id, group_id')
      .eq('is_deleted', false);

    if (error) {
      console.error('Meta catalog feed error:', error.message);
      return new Response('Database error', { status: 500 });
    }

    let itemsXml = '';

    // Meta faqat JPEG/PNG qabul qiladi. AVIF/WebP rasmlarni proxy orqali JPEG ga o'tkazish.
    const metaImageUrl = (url: string): string => {
      if (!url) return url;
      const lower = url.toLowerCase();
      if (lower.endsWith('.avif') || lower.endsWith('.webp')) {
        return `${BASE_URL}/api/meta-image?url=${encodeURIComponent(url)}`;
      }
      return url;
    };

    for (const p of products || []) {
      const title = (lang === 'ru' ? (p.name_ru || p.name || p.name_uz) : (p.name_uz || p.name || p.name_ru)) || 'Mahsulot';
      const description = (lang === 'ru' ? (p.description_ru || p.description || p.description_uz) : (p.description_uz || p.description || p.description_ru)) || title;
      const slug = getProductSlug(p);
      const link = `${BASE_URL}/${lang}/products/${slug}`;
      const mainImage = p.image || (Array.isArray(p.images) && p.images[0]) || '';
      
      if (!mainImage) continue; // Meta requires main image

      const brand = brandMap[p.brand_id] || 'Velari';
      const isAvailable = (p.stock || 0) > 0 ? 'in stock' : 'out of stock';
      
      const priceVal = p.price || 0;
      const oldPriceVal = p.old_price && p.old_price > priceVal ? p.old_price : null;

      // Meta Standard:
      // <g:price> is the regular list price (e.g. 2236000 UZS)
      // <g:sale_price> is the actual discounted price (e.g. 1115070 UZS)
      let priceXml = `<g:price>${oldPriceVal ? oldPriceVal : priceVal} UZS</g:price>`;
      if (oldPriceVal) {
        priceXml += `\n        <g:sale_price>${priceVal} UZS</g:sale_price>`;
      }

      // Group ID for variants (e.g. color/size options)
      let groupIdXml = '';
      if (p.group_id) {
        groupIdXml = `\n        <g:item_group_id>${p.group_id}</g:item_group_id>`;
      }

      // Secondary images (up to 10)
      let addImgsXml = '';
      if (Array.isArray(p.images)) {
        const extraImgs = p.images.filter((img: string) => img && img !== mainImage).slice(0, 10);
        extraImgs.forEach((img: string) => {
          addImgsXml += `\n        <g:additional_image_link>${metaImageUrl(img)}</g:additional_image_link>`;
        });
      }

      itemsXml += `
    <item>
      <g:id>${p.sku || p.id}</g:id>${groupIdXml}
      <g:title><![CDATA[${escapeCdata(title)}]]></g:title>
      <g:description><![CDATA[${escapeCdata(stripHtml(description).substring(0, 4900))}]]></g:description>
      <g:link>${link}</g:link>
      <g:image_link>${metaImageUrl(mainImage)}</g:image_link>${addImgsXml}
      <g:brand><![CDATA[${escapeCdata(brand)}]]></g:brand>
      <g:condition>new</g:condition>
      <g:availability>${isAvailable}</g:availability>
      ${priceXml}
    </item>`;
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Velari Market Meta Product Feed (${lang.toUpperCase()})</title>
    <link>${BASE_URL}</link>
    <description>Velari Market Products Catalog Feed for Meta Facebook/Instagram Commerce</description>
    ${itemsXml}
  </channel>
</rss>`;

    return new Response(xml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    });
  } catch (err: any) {
    console.error('Meta catalog route error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
