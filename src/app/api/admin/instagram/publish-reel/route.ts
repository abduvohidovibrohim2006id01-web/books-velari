import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Up to 60s for video processing status check

export async function POST(req: NextRequest) {
    try {
        const ADMIN_SECRET = process.env.ADMIN_SECRET;
        if (!ADMIN_SECRET) {
            return NextResponse.json({ error: 'ADMIN_SECRET tizimda sozlanmagan' }, { status: 500 });
        }

        const body = await req.json().catch(() => ({}));
        const { videoUrl, caption, secret, pageAccessToken, instagramAccountId } = body;
        const headerSecret = req.headers.get('x-admin-secret') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

        if (secret !== ADMIN_SECRET && headerSecret !== ADMIN_SECRET) {
            return NextResponse.json({ error: 'Ruxsatsiz kirish (Invalid secret)' }, { status: 401 });
        }

        const PAGE_TOKEN = pageAccessToken || process.env.INSTAGRAM_PAGE_ACCESS_TOKEN;
        const IG_ID = instagramAccountId || process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID || '17841446090191717';

        if (!PAGE_TOKEN) {
            return NextResponse.json({ error: 'INSTAGRAM_PAGE_ACCESS_TOKEN sozlanmagan' }, { status: 500 });
        }

        if (!videoUrl) {
            return NextResponse.json({ error: 'videoUrl talab qilinadi' }, { status: 400 });
        }

        console.log('[Instagram Reels] Creating reel container for:', videoUrl);

        // 1. Reels Container yaratish
        const containerRes = await fetch(`https://graph.facebook.com/v20.0/${IG_ID}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media_type: 'REELS',
                video_url: videoUrl,
                caption: caption || '',
                share_to_feed: true,
                access_token: PAGE_TOKEN,
            }),
        });

        const containerData = await containerRes.json();
        if (containerData.error) {
            console.error('[Instagram Reels] Container Error:', containerData.error);
            return NextResponse.json({ error: containerData.error.message || 'Reels konteyner yaratishda xato' }, { status: 400 });
        }

        const creationId = containerData.id;
        console.log('[Instagram Reels] Container ID created:', creationId);

        // 2. Videoning Instagram serverida tayyor bo'lishini kutish (Polling status_code)
        let isReady = false;
        let attempts = 0;
        const maxAttempts = 15; // 15 * 3s = ~45s max

        while (!isReady && attempts < maxAttempts) {
            attempts++;
            await new Promise(r => setTimeout(r, 3000));

            const statusRes = await fetch(`https://graph.facebook.com/v20.0/${creationId}?fields=status_code,status&access_token=${PAGE_TOKEN}`);
            const statusData = await statusRes.json();

            const statusCode = statusData.status_code;
            console.log(`[Instagram Reels] Check #${attempts} status:`, statusCode);

            if (statusCode === 'FINISHED') {
                isReady = true;
                break;
            } else if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
                return NextResponse.json({ 
                    error: `Video Instagram tomonidan qabul qilinmadi: ${statusData.status || statusCode}` 
                }, { status: 400 });
            }
        }

        if (!isReady) {
            return NextResponse.json({ 
                error: 'Video tayyor bo\'lishi kutilganidan ko\'proq vaqt oldi (Timeout)', 
                creationId 
            }, { status: 408 });
        }

        // 3. E'lon qilish (Publish)
        console.log('[Instagram Reels] Publishing container:', creationId);
        const publishRes = await fetch(`https://graph.facebook.com/v20.0/${IG_ID}/media_publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                creation_id: creationId,
                access_token: PAGE_TOKEN,
            }),
        });

        const publishData = await publishRes.json();
        if (publishData.error) {
            console.error('[Instagram Reels] Publish Error:', publishData.error);
            return NextResponse.json({ error: publishData.error.message || 'Reels chop etishda xato' }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: 'Instagram Reels muvaffaqiyatli chop etildi!',
            reelId: publishData.id,
            url: `https://www.instagram.com/reel/${publishData.id}/`
        });
    } catch (err: any) {
        console.error('[Instagram Reels] Server error:', err);
        return NextResponse.json({ error: err.message || 'Server xatosi' }, { status: 500 });
    }
}
