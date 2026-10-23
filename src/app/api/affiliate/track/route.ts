import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

async function getPhone(req: NextRequest): Promise<string | null> {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    return payload?.sub || null;
}

// Bitta yoki bir nechta atributsiyani saqlash (last-click upsert).
// body: { items: { [productId]: slug } }  yoki  { productId, slug }
export async function POST(req: NextRequest) {
    const phone = await getPhone(req);
    if (!phone) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        let map: Record<string, string> = {};
        if (body.items && typeof body.items === "object") {
            map = body.items;
        } else if (body.productId && body.slug) {
            map = { [body.productId]: body.slug };
        }

        const entries = Object.entries(map).filter(([pid, slug]) => pid && slug);
        if (entries.length === 0) return NextResponse.json({ success: true, saved: 0 });

        // Slug haqiqiyligini tekshirish — faqat mavjud affiliate_links
        const slugs = Array.from(new Set(entries.map(([, s]) => s)));
        const { data: validLinks } = await supabaseAdmin
            .from("affiliate_links")
            .select("slug, product_id")
            .in("slug", slugs);

        const validSet = new Set((validLinks || []).map(l => `${l.product_id}:${l.slug}`));

        const rows = entries
            .filter(([pid, slug]) => validSet.has(`${pid}:${slug}`))
            .map(([product_id, slug]) => ({
                user_phone: phone,
                product_id,
                slug,
                updated_at: new Date().toISOString(),
            }));

        if (rows.length === 0) return NextResponse.json({ success: true, saved: 0 });

        // Last-click: (user_phone, product_id) bo'yicha upsert — slug yangilanadi
        const { error } = await supabaseAdmin
            .from("referral_attributions")
            .upsert(rows, { onConflict: "user_phone,product_id" });

        if (error) throw error;
        return NextResponse.json({ success: true, saved: rows.length });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
