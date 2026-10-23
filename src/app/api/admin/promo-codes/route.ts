import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
    try {
        const { data, error } = await supabaseAdmin
            .from("promo_codes")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const promo = await req.json();
        const { id, created_at, updated_at, usage_count, ...rest } = promo;

        // Promo kod nomini normallashtirish (bo'sh joy + katta harf)
        const promoData: any = { ...rest };
        if (typeof promoData.code === "string") promoData.code = promoData.code.trim().toUpperCase();
        // per_user_limit: 0/bo'sh = cheksiz (NULL)
        if (promoData.per_user_limit === "" || promoData.per_user_limit == null || Number(promoData.per_user_limit) === 0) {
            promoData.per_user_limit = null;
        }

        if (id) {
            const { error } = await supabaseAdmin
                .from("promo_codes")
                .update({ ...promoData, updated_at: new Date().toISOString() })
                .eq("id", id);
            if (error) throw error;
        } else {
            const { error } = await supabaseAdmin
                .from("promo_codes")
                .insert(promoData);
            if (error) throw error;
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        // Unikal nom buzilishi (23505) — do'stona xabar
        if (error?.code === "23505" || /duplicate key|unique/i.test(error?.message || "")) {
            return NextResponse.json(
                { success: false, error: "Bunday nomli promo kod allaqachon mavjud. Boshqa nom tanlang." },
                { status: 409 }
            );
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        const { id } = await req.json();
        const { error } = await supabaseAdmin
            .from("promo_codes")
            .delete()
            .eq("id", id);
        
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
