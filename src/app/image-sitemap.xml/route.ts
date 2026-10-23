import { NextResponse } from 'next/server';
import { getImageSitemapChunks, renderSitemapIndex, SITEMAP_XML_HEADERS } from '@/lib/sitemap-data';

// Google Images / Yandex Images uchun IMAGE sitemap indeksi — barcha /image-sitemap/N.xml
// bola fayllarni ko'rsatadi. Next 14 ning built-in sitemap'i <image:image> chiqarmaydi.
// Xato bo'lsa throw: bo'sh sitemap keshga tushmaydi (ISR eski versiyani saqlab turadi).
export const revalidate = 86400; // 24 soatda qayta generatsiya

export async function GET() {
    const chunks = await getImageSitemapChunks();
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`Image sitemap: ${total} URLs in ${chunks.length} file(s)`);

    return new NextResponse(renderSitemapIndex(chunks.length, '/image-sitemap'), { headers: SITEMAP_XML_HEADERS });
}
