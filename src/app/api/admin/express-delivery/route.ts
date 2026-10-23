import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";

/**
 * Tezkor (express) yetkazish — admin mahsulot belgilash boshqaruvi (#8).
 *
 *  GET  ?q=...           → mahsulotlar ro'yxati (express_delivery bayrog'i bilan) + stats
 *  POST { action: "toggle", id, value }
 *  POST { action: "bulk_set", ids, value }
 */

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
        const { searchParams } = new URL(req.url);
        const q = (searchParams.get("q") || "").trim();

        let query = supabaseAdmin
            .from("products")
            .select("id, name, name_uz, name_ru, image, price, express_delivery")
            .eq("is_deleted", false)
            .order("express_delivery", { ascending: false })
            .order("name", { ascending: true })
            .limit(500);

        if (q) query = query.ilike("name", `%${q}%`);

        const { data, error } = await query;
        if (error) throw error;

        const products = data || [];
        const expressCount = products.filter((p: any) => p.express_delivery === true).length;

        return NextResponse.json({
            success: true,
            products,
            stats: { total: products.length, express: expressCount },
        });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json();
        const action = body.action;

        if (action === "toggle") {
            const id = String(body.id || "");
            if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
            const { error } = await supabaseAdmin
                .from("products")
                .update({ express_delivery: !!body.value })
                .eq("id", id);
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        if (action === "bulk_set") {
            const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
            if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
            const { error } = await supabaseAdmin
                .from("products")
                .update({ express_delivery: !!body.value })
                .in("id", ids);
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
