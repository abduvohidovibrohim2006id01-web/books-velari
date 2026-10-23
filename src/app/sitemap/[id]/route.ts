import { NextResponse } from 'next/server';
import { getSitemapChunks, renderUrlset, SITEMAP_XML_HEADERS } from '@/lib/sitemap-data';

// Bola sitemap: /sitemap/0.xml, /sitemap/1.xml, ...
export const revalidate = 86400; // Regenerate sitemap every 24 hours
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

    const chunks = await getSitemapChunks();
    const chunk = chunks[Number(match[1])];
    if (!chunk) {
        return new NextResponse('Not Found', { status: 404 });
    }

    return new NextResponse(renderUrlset(chunk), { headers: SITEMAP_XML_HEADERS });
}
