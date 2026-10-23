import { NextRequest, NextResponse } from "next/server";
import { getVapidKeys } from "@/lib/secrets";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";

// Node.js runtime zarur — web-push kutubxonasi native crypto ishlatadi
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { publicKey: pubKey, privateKey: privKey } = getVapidKeys(); // yo'q bo'lsa -> xato (500)

    if (!pubKey || !privKey) {
        return NextResponse.json({ error: "VAPID kalitlari o'rnatilmagan (Server xatosi)" }, { status: 500 });
    }

    try {
        // web-push ni dynamic import qilamiz — bundling muammolarini oldini olish uchun
        const webpush = (await import("web-push")).default;
        webpush.setVapidDetails("mailto:admin@velari.uz", pubKey, privKey);
        
        const { title, body, url } = await req.json();

        if (!title || !body) {
            return NextResponse.json({ error: "Sarlavha va matn kerak" }, { status: 400 });
        }

        // Barcha obunalarni bazadan olamiz
        const { data: subscriptions, error } = await supabaseAdmin
            .from("fcm_tokens")
            .select("token, user_phone");

        if (error) {
            return NextResponse.json({ error: "DB xatosi: " + error.message, detail: error }, { status: 500 });
        }

        const results = {
            success: 0,
            failed: 0,
            errors: [] as string[]
        };

        const pushPayload = JSON.stringify({ title, body, url: url || '/' });

        // Har bir obunachiga xabar jo'natamiz
        const pushPromises = (subscriptions || []).map(async (subRow) => {
            try {
                let subscription;
                try {
                    subscription = typeof subRow.token === 'string' ? JSON.parse(subRow.token) : subRow.token;
                } catch {
                    results.failed++;
                    results.errors.push(`Token parse xatosi (${subRow.user_phone})`);
                    return;
                }
                if (!subscription || !subscription.endpoint) {
                    results.failed++;
                    results.errors.push(`Endpoint yo'q (${subRow.user_phone})`);
                    return;
                }
                await webpush.sendNotification(subscription, pushPayload);
                results.success++;
            } catch (error: any) {
                console.error("Push yuborishda xato (phone: " + subRow.user_phone + "):", error?.message || error);
                results.failed++;
                results.errors.push(`${subRow.user_phone}: ${error?.message || 'Noma\'lum xato'}`);
                if (error?.statusCode === 410 || error?.statusCode === 404) {
                    await supabaseAdmin.from("fcm_tokens").delete().eq("token", subRow.token);
                }
            }
        });

        await Promise.all(pushPromises);

        return NextResponse.json({ success: true, results });
    } catch (error: any) {
        console.error("Push send error:", error);
        return NextResponse.json({ 
            error: error.message || "Noma'lum xato", 
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            type: error.constructor?.name 
        }, { status: 500 });
    }
}
