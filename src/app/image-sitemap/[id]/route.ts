import { NextResponse } from 'next/server';
import { getImageSitemapChunks, renderImageUrlset, SITEMAP_XML_HEADERS } from '@/lib/sitemap-data';

// Bola image sitemap: /image-sitemap/0.xml, /image-sitemap/1.xml, ...
export const revalidate = 86400; // 24 soatda qayta generatsiya

// Build vaqtida mavjud fayllar oldindan yaratiladi (ISR); yangi paydo bo'lganlari so'rovda yaratiladi
export async function generateStaticParams() {
    try {
        const chunks = await getImageSitemapChunks();
        return chunks.map((_, i) => ({ id: `${i}.xml` }));
    } catch (error) {
        // Build yiqilmasin — fayllar birinchi so'rovda yaratiladi
        console.error('Image sitemap generateStaticParams failed:', error);
        return [];
    }
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
