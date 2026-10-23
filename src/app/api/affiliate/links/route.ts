import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh as supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import crypto from "crypto";
import { getUserJwtSecret } from "@/lib/secrets";

async function getUserFromToken(req: NextRequest) {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    return payload?.sub; // phone
}

export async function GET(req: NextRequest) {
    const phone = await getUserFromToken(req);
    if (!phone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { data: user } = await supabaseAdmin.from("users").select("id").eq("phone", phone).single();
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const { data, error } = await supabaseAdmin
            .from("affiliate_links")
            .select("*, products(name, name_uz, name_ru, image, price)")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

        if (error) throw error;
        return NextResponse.json({ success: true, data });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const phone = await getUserFromToken(req);
    if (!phone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { productId } = await req.json();
        if (!productId) return NextResponse.json({ error: "Product ID required" }, { status: 400 });

        const { data: user } = await supabaseAdmin.from("users").select("id").eq("phone", phone).single();
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // Anonim, URL-xavfsiz slug (hamkor ismi/kodi ko'rinmasligi uchun) + collision retry
        let slug = "";
        for (let i = 0; i < 5; i++) {
            const candidate = crypto.randomBytes(5).toString('hex'); // 10 belgili
            const { data: existing } = await supabaseAdmin.from("affiliate_links").select("id").eq("slug", candidate).maybeSingle();
            if (!existing) { slug = candidate; break; }
        }
        if (!slug) return NextResponse.json({ error: "Qayta urinib ko'ring (slug collision)" }, { status: 500 });

        const { data, error } = await supabaseAdmin
            .from("affiliate_links")
            .insert({
                user_id: user.id,
                product_id: productId,
                slug
            })
            .select();

        if (error) throw error;
        return NextResponse.json({ success: true, data: data[0] });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
