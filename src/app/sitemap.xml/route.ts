import { NextResponse } from 'next/server';
import { getSitemapChunks, renderSitemapIndex, SITEMAP_XML_HEADERS } from '@/lib/sitemap-data';

// Sitemap indeksi — barcha /sitemap/N.xml bola fayllarni ko'rsatadi.
// Next 14 generateSitemaps uchun indeks yaratmaydi, shuning uchun route handler.
export const revalidate = 86400; // Regenerate sitemap every 24 hours

export async function GET() {
    const chunks = await getSitemapChunks();
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    console.log(`Sitemap: ${total} URLs in ${chunks.length} file(s)`);

    return new NextResponse(renderSitemapIndex(chunks.length), { headers: SITEMAP_XML_HEADERS });
}
