import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limiter";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
    try {
        // Server service role bilan yozadi (anon EXECUTE yopilgan) — shuning uchun IP bo'yicha chegara
        const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
        if (!(await checkRateLimit(ip, 60, 60, 'search-click'))) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const { productId, query } = await req.json();

        if (!productId || !query || query.trim().length < 2) {
            return NextResponse.json({ error: "Invalid data" }, { status: 400 });
        }

        const { error } = await supabase.rpc('log_search_click', {
            p_product_id: productId,
            p_query: query.trim()
        });

        if (error) {
            console.error("Auto-tagging logging error:", error);
            throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
