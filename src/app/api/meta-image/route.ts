import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Meta Catalog Image Proxy
 * AVIF/WebP rasmlarni JPEG formatga o'tkazib beradi.
 * Meta faqat JPEG/PNG qabul qiladi.
 * 
 * Usage: /api/meta-image?url=https://storage.yandexcloud.net/...avif
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const imageUrl = searchParams.get('url');

    if (!imageUrl) {
        return NextResponse.json({ error: 'url parameter required' }, { status: 400 });
    }

    // Faqat Yandex Cloud dan ruxsat berish (xavfsizlik)
    if (!imageUrl.includes('storage.yandexcloud.net') && !imageUrl.includes('savdomarketimag')) {
        return NextResponse.json({ error: 'Invalid image source' }, { status: 403 });
    }

    try {
        const response = await fetch(imageUrl, {
            headers: { 'Accept': 'image/*' },
        });

        if (!response.ok) {
            return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Sharp bilan JPEG ga konvertatsiya qilish
        const jpegBuffer = await sharp(buffer)
            .jpeg({ quality: 85, mozjpeg: true })
            .toBuffer();

        return new NextResponse(new Uint8Array(jpegBuffer), {
            status: 200,
            headers: {
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=86400, s-maxage=604800',
                'Content-Length': String(jpegBuffer.length),
            },
        });
    } catch (err: any) {
        console.error('Meta image proxy error:', err.message);
        return NextResponse.json({ error: 'Image conversion failed' }, { status: 500 });
    }
}
