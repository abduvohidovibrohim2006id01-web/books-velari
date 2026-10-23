import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminActor } from "@/lib/admin-audit";

export const dynamic = "force-dynamic";

/**
 * Admin dashboard: embedding'i yo'q faol mahsulotlar soni (matn va asosiy rasm).
 * Soni > 0 bo'lsa ega kompyuterida `npm run embed:all` (yoki EMBEDDING-YANGILASH.bat) ni ishga tushiradi.
 * Middleware /api/admin/* ni himoyalaydi; bu yerda ham admin tekshiriladi.
 */
export async function GET(req: NextRequest) {
    if ((await getAdminActor(req)) === "unknown") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [active, noText, imageRows] = await Promise.all([
        supabaseAdmin.from("products").select("id", { count: "exact" }).eq("is_deleted", false).limit(5000),
        supabaseAdmin.from("products").select("id", { count: "exact", head: true }).eq("is_deleted", false).is("embedding", null),
        supabaseAdmin.from("product_image_embeddings").select("product_id").eq("position", 0).limit(10000),
    ]);
    if (active.error || noText.error || imageRows.error) {
        return NextResponse.json({ error: "Holatni o'qib bo'lmadi" }, { status: 500 });
    }

    const withImage = new Set((imageRows.data || []).map((r: any) => String(r.product_id)));
    const missingImage = (active.data || []).filter((p: any) => !withImage.has(String(p.id))).length;

    return NextResponse.json({
        activeProducts: active.count ?? (active.data || []).length,
        missingText: noText.count ?? 0,
        missingImage,
        command: "npm run embed:all",
    });
}
