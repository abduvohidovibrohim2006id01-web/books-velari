import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";

/**
 * Visitor Logs API (Faqat Admin uchun)
 * GET /api/admin/logs?page=1&limit=50&event=login&search=...
 */

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function GET(req: NextRequest) {
    if (!(await verifyAdmin(req))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const event = searchParams.get("event") || "";
    const search = searchParams.get("search") || "";

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    try {
        let query = supabaseAdmin
            .from("visitor_logs")
            .select("*", { count: "exact" })
            .order("created_at", { ascending: false })
            .range(from, to);

        if (event) query = query.eq("event_type", event);
        if (search) {
            query = query.or(`user_phone.ilike.%${search}%,name.ilike.%${search}%,ip_address.ilike.%${search}%,city.ilike.%${search}%`);
        }

        const { data, count, error } = await query;
        if (error) throw error;

        return NextResponse.json({ logs: data, total: count });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    if (!(await verifyAdmin(req))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { olderThanDays = 30 } = await req.json().catch(() => ({}));
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - olderThanDays);

        const { error } = await supabaseAdmin
            .from("visitor_logs")
            .delete()
            .lt("created_at", cutoff.toISOString());

        if (error) throw error;
        return NextResponse.json({ success: true, message: `${olderThanDays} kundan eski loglar o'chirildi.` });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
