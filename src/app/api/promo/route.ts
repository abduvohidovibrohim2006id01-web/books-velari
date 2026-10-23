import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from("site_settings")
            .select("value")
            .eq("key", "promo_countdown")
            .maybeSingle();

        if (error || !data) {
            return NextResponse.json({ success: false });
        }

        const promo = data.value;
        return NextResponse.json({ success: true, promo });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message });
    }
}
