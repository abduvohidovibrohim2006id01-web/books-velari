import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function GET(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { data, error } = await supabaseAdmin
            .from("promo_code_tariffs")
            .select("*")
            .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { action, tariff } = body;

        if (action === "create") {
            const { data, error } = await supabaseAdmin
                .from("promo_code_tariffs")
                .insert(tariff)
                .select();
            if (error) throw error;
            return NextResponse.json({ success: true, data });
        }

        if (action === "update") {
            const { id, ...updates } = tariff;
            const { data, error } = await supabaseAdmin
                .from("promo_code_tariffs")
                .update(updates)
                .eq("id", id)
                .select();
            if (error) throw error;
            return NextResponse.json({ success: true, data });
        }

        if (action === "delete") {
            const { error } = await supabaseAdmin
                .from("promo_code_tariffs")
                .delete()
                .eq("id", body.id);
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
