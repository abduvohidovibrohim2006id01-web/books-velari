import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh as db } from "@/lib/supabase-admin";
import { getSessionPhone, phoneVariants } from "@/lib/user-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/comments — sessiya egasining sharhlari + mahsulotning faqat ochiq maydonlari
 * (avvalgi brauzerdagi `products(*)` join'i o'rniga). comments.user_id — telefon.
 */
export async function GET(req: NextRequest) {
    const phone = await getSessionPhone(req);
    if (!phone) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const { data: user } = await db.from("users").select("id").eq("phone", phone).maybeSingle();
    const ids = [...phoneVariants(phone), ...(user?.id ? [String(user.id)] : [])];

    const { data: comments, error } = await db
        .from("comments")
        .select("id, product_id, user_id, username, text, type, parent_id, rating, reactions, is_edited, created_at, data")
        .in("user_id", ids)
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const productIds = Array.from(new Set((comments || []).map((c) => c.product_id).filter(Boolean)));
    const { data: products } = productIds.length
        ? await db.from("products").select("id, article, name, name_uz, name_ru, image, image_metadata").in("id", productIds)
        : { data: [] as any[] };
    const byId = new Map((products || []).map((p: any) => [p.id, p]));

    return NextResponse.json({
        success: true,
        comments: (comments || []).map((c) => ({ ...c, products: byId.get(c.product_id) || null })),
    });
}
