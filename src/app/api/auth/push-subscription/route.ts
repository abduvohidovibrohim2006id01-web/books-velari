import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Node.js runtime zarur
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        const { subscription, userPhone, platform } = await req.json();

        if (!subscription || !subscription.endpoint) {
            return NextResponse.json({ error: "Obuna ma'lumotlari yo'q" }, { status: 400 });
        }

        const tokenStr = JSON.stringify(subscription);
        const targetPhone = userPhone?.trim() || 'anonymous';

        // 1. Foydalanuvchi users jadvalida borligini tekshiramiz (fcm_tokens foreign key talabi uchun)
        const { data: existingUser } = await supabaseAdmin
            .from("users")
            .select("phone")
            .eq("phone", targetPhone)
            .maybeSingle();

        if (!existingUser) {
            // crypto.randomUUID o'rniga oddiy ID generatsiya
            const id = 'push_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
            const password = 'push_auth_' + Date.now() + '_' + Math.random().toString(36).substring(2, 18);
            
            const { error: userInsertError } = await supabaseAdmin.from("users").insert([{
                id,
                phone: targetPhone,
                password,
                name: targetPhone === 'anonymous' ? 'Mehmon' : 'Foydalanuvchi',
                is_admin: false,
                created_at: new Date().toISOString()
            }]);

            if (userInsertError) {
                console.error("User insert error:", userInsertError);
                // Agar yana xato bo'lsa (masalan, race condition), lekin user allaqachon mavjud, davom etamiz
                if (userInsertError.code !== '23505') { // 23505 = unique violation (user already exists)
                    return NextResponse.json({ error: "Foydalanuvchi yaratishda xato: " + userInsertError.message }, { status: 500 });
                }
            }
        }

        // 2. Tokenni fcm_tokens jadvaliga saqlaymiz
        const { error } = await supabaseAdmin
            .from("fcm_tokens")
            .upsert({
                user_phone: targetPhone,
                token: tokenStr,
                platform: platform || 'web',
                last_updated: new Date().toISOString()
            }, { onConflict: 'user_phone' });

        if (error) {
            console.error("fcm_tokens upsert error:", error);
            return NextResponse.json({ error: "Token saqlashda xato: " + error.message, detail: error }, { status: 500 });
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Push subscription error:", error);
        return NextResponse.json({ 
            error: error.message || "Noma'lum xato",
            type: error.constructor?.name
        }, { status: 500 });
    }
}
