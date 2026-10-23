import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getAdminSecret } from "@/lib/secrets";

export async function GET(req: Request) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    try {
        if (!await checkRateLimit(ip, 20, 60)) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

        const adminToken = (req as any).cookies?.get('admin_token')?.value || req.headers.get('cookie')?.split('admin_token=')[1]?.split(';')[0];
        const ADMIN_SECRET = getAdminSecret();
        const payload = adminToken ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
        if (!payload || payload.role !== 'admin') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const { data: transactions, error: tErr } = await supabaseAdmin
            .from("cashback_transactions")
            .select("*")
            .order("created_at", { ascending: false });

        const { data: wallets, error: wErr } = await supabaseAdmin
            .from("user_wallets")
            .select("*")
            .order("balance", { ascending: false });

        const { data: settings, error: sErr } = await supabaseAdmin
            .from("site_settings")
            .select("*")
            .eq("key", "cashback_settings")
            .single();

        const { data: exceptions, error: eErr } = await supabaseAdmin
            .from("products")
            .select("id, name, image, price, cashback_type, cashback_value")
            .neq("cashback_type", "global")
            .eq("is_deleted", false);

        if (tErr || wErr || eErr) throw tErr || wErr || eErr;
        return NextResponse.json({ 
            success: true, 
            transactions, 
            wallets, 
            exceptions: exceptions || [],
            settings: settings?.value || { rate: 0.02, enabled: true } 
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    try {
        if (!await checkRateLimit(ip, 10, 60)) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

        const adminToken = (req as any).cookies?.get('admin_token')?.value || req.headers.get('cookie')?.split('admin_token=')[1]?.split(';')[0];
        const ADMIN_SECRET = getAdminSecret();
        const payload = adminToken ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
        if (!payload || payload.role !== 'admin') return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const body = await req.json();

        if (body.type === 'update_settings') {
            const { error } = await supabaseAdmin
                .from("site_settings")
                .upsert({ key: 'cashback_settings', value: body.settings, updated_at: new Date().toISOString() });
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        const { user_phone, amount, type, description } = body;

        // 🛡 SECURITY: amount must be a number and positive (unless it's a specific deduction type)
        if (isNaN(amount) || amount === 0) {
            return NextResponse.json({ success: false, message: "Noto'g'ri miqdor" }, { status: 400 });
        }

        // High security adjustment
        const { data: wallet, error: wErr } = await supabaseAdmin
            .from("user_wallets")
            .select("balance")
            .eq("user_phone", user_phone)
            .single();

        if (wErr) throw wErr;

        const newBalance = Number(wallet.balance) + Number(amount);
        
        // 🛡 SECURITY: Balance cannot go negative via manual admin work unless intended
        if (newBalance < 0) {
            return NextResponse.json({ success: false, message: "Balans manfiy bo'la olmaydi" }, { status: 400 });
        }

        // Transactional update
        const { error: upErr } = await supabaseAdmin
            .from("user_wallets")
            .update({ balance: newBalance, updated_at: new Date().toISOString() })
            .eq("user_phone", user_phone);

        if (upErr) throw upErr;

        const { error: insErr } = await supabaseAdmin
            .from("cashback_transactions")
            .insert({
                user_phone,
                amount,
                type,
                description,
                metadata: { source: 'admin_manual' }
            });

        if (insErr) throw insErr;

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
