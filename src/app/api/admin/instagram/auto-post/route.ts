import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getProductRealStock } from '@/lib/stock';
import { getProductSlug } from '@/lib/slugify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BASE_URL = 'https://velari.uz';
const IG_ID = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '17841446090191717';
const PAGE_TOKEN = process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;

function stripHtml(html: string = ''): string {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

function formatPrice(val: number): string {
    return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export async function POST(req: NextRequest) {
    try {
        if (!PAGE_TOKEN) {
            return NextResponse.json({ error: 'INSTAGRAM_PAGE_ACCESS_TOKEN sozlanmagan' }, { status: 500 });
        }

        const body = await req.json().catch(() => ({}));
        let product: any = null;

        if (body.productId) {
            const { data, error } = await supabaseAdmin
                .from('products')
                .select('*')
                .eq('id', body.productId)
                .eq('is_deleted', false)
                .single();
            if (error || !data) {
                return NextResponse.json({ error: 'Mahsulot topilmadi' }, { status: 404 });
            }
            product = data;
        } else {
            // Random mahsulot tanlash (sotuvda bor bo'lgan)
            const { data, error } = await supabaseAdmin
                .from('products')
                .select('*')
                .eq('is_deleted', false)
                .gt('stock', 0);

            const inStockData = (data || []).filter((p: any) => getProductRealStock(p) > 0);

            if (error || inStockData.length === 0) {
                return NextResponse.json({ error: 'Sotuvda mahsulot topilmadi' }, { status: 404 });
            }

            // Tasodifiy bittasini tanlash
            const randomIndex = Math.floor(Math.random() * inStockData.length);
            product = inStockData[randomIndex];
        }

        const mainImage = product.image || (Array.isArray(product.images) && product.images[0]) || '';
        if (!mainImage) {
            return NextResponse.json({ error: 'Mahsulotda rasm mavjud emas' }, { status: 400 });
        }

        // Instagram faqat JPEG qabul qiladi. AVIF/WebP bo'lsa meta-image proxy orqali o'tkazamiz
        let imageUrl = mainImage;
        const lower = mainImage.toLowerCase();
        if (lower.endsWith('.avif') || lower.endsWith('.webp')) {
            imageUrl = `${BASE_URL}/api/meta-image?url=${encodeURIComponent(mainImage)}`;
        }

        const name = product.name_uz || product.name || product.name_ru || 'Mahsulot';
        const rawDesc = stripHtml(product.description_uz || product.description || product.description_ru || '');
        const shortDesc = rawDesc.length > 250 ? rawDesc.substring(0, 247) + '...' : rawDesc;

        const slug = getProductSlug(product);
        const productUrl = `${BASE_URL}/uz/products/${slug}`;

        let priceText = `🏷 Narxi: ${formatPrice(product.price || 0)} so'm`;
        if (product.old_price && product.old_price > (product.price || 0)) {
            priceText = `⚡️ Maxsus narx: ${formatPrice(product.price)} so'm\n❌ Eski narx: ${formatPrice(product.old_price)} so'm`;
        }

        const caption = `🛍 ${name}

${shortDesc ? shortDesc + '\n\n' : ''}${priceText}

✅ Respublika bo'ylab tezkor yetkazib berish
✅ Kafolat va sifat nazorati

🛒 Buyurtma berish uchun saytimizga kiring:
👉 ${productUrl}

#velari #velarimarket #uzbekistan #toshkent #onlineshop #xarid #mahsulotlar #katalog`;

        // 1. Container yaratish
        const containerRes = await fetch(`https://graph.facebook.com/v25.0/${IG_ID}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                image_url: imageUrl,
                caption: caption,
                access_token: PAGE_TOKEN,
            }),
        });

        const containerData = await containerRes.json();
        if (containerData.error) {
            console.error('Instagram Container Error:', containerData.error);
            return NextResponse.json({ error: containerData.error.message || 'Instagram konteyner yaratishda xato' }, { status: 400 });
        }

        const creationId = containerData.id;

        // 2. Chop etish (Publish)
        const publishRes = await fetch(`https://graph.facebook.com/v25.0/${IG_ID}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: PAGE_TOKEN,
            }),
        });

        const publishData = await publishRes.json();
        if (publishData.error) {
            console.error('Instagram Publish Error:', publishData.error);
            return NextResponse.json({ error: publishData.error.message || 'Instagram postni e\'lon qilishda xato' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: 'Instagram post muvaffaqiyatli joylandi!',
            instagramPostId: publishData.id,
            product: {
                id: product.id,
                name: name,
                sku: product.sku,
            },
        });
    } catch (err: any) {
        console.error('Auto post route error:', err);
        return NextResponse.json({ error: err.message || 'Server xatosi' }, { status: 500 });
    }
}
