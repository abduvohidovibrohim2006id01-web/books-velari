import { NextResponse } from 'next/server';
import { getImageSitemapChunks, renderImageUrlset, SITEMAP_XML_HEADERS } from '@/lib/sitemap-data';

// Bola image sitemap: /image-sitemap/0.xml, /image-sitemap/1.xml, ...
export const revalidate = 86400; // 24 soatda qayta generatsiya
export const dynamicParams = true;

// Build vaqtida 157,720 kitob so'ralmaydi va build soniyalar ichida muvaffaqiyatli o'tadi;
// fayllar kerak bo'lganda so'rov bo'yicha (on-demand ISR) yaratiladi.
export async function generateStaticParams() {
    return [];
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
    const match = /^(\d+)\.xml$/.exec(params.id);
    if (!match) {
        return new NextResponse('Not Found', { status: 404 });
    }

    const chunks = await getImageSitemapChunks();
    const chunk = chunks[Number(match[1])];
    if (!chunk) {
        return new NextResponse('Not Found', { status: 404 });
    }

    return new NextResponse(renderImageUrlset(chunk), { headers: SITEMAP_XML_HEADERS });
}
