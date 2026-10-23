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
        const { searchParams } = new URL(req.url);
        const search = searchParams.get('search') || '';

        let query = supabaseAdmin
            .from("search_synonyms")
            .select("*")
            .order("id", { ascending: false });

        if (search) {
            query = query.or(`keyword.ilike.%${search}%,maps_to.ilike.%${search}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ synonyms: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { keyword, maps_to } = await req.json();
        
        if (!keyword || !maps_to) {
            return NextResponse.json({ error: "Barcha maydonlarni to'ldiring" }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from("search_synonyms")
            .insert([{ keyword: keyword.toLowerCase().trim(), maps_to: maps_to.toLowerCase().trim() }])
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, synonym: data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) return NextResponse.json({ error: "ID kiritilmagan" }, { status: 400 });

        const { error } = await supabaseAdmin
            .from("search_synonyms")
            .delete()
            .eq("id", id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
