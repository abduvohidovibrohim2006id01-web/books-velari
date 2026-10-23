import { NextResponse } from 'next/server';
import { getSitemapChunks, renderUrlset, SITEMAP_XML_HEADERS } from '@/lib/sitemap-data';

// Bola sitemap: /sitemap/0.xml, /sitemap/1.xml, ...
export const revalidate = 86400; // Regenerate sitemap every 24 hours

// Build vaqtida mavjud fayllar oldindan yaratiladi (ISR); yangi paydo bo'lganlari so'rovda yaratiladi
export async function generateStaticParams() {
    try {
        const chunks = await getSitemapChunks();
        return chunks.map((_, i) => ({ id: `${i}.xml` }));
    } catch (error) {
        // Build yiqilmasin — fayllar birinchi so'rovda yaratiladi
        console.error('Sitemap generateStaticParams failed:', error);
        return [];
    }
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
