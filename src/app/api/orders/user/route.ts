import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const userPhone = searchParams.get("phone");
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    if (!userPhone) {
        return NextResponse.json({ success: false, message: "Missing phone" }, { status: 400 });
    }

    const token = req.cookies.get("user_token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    if (!payload || payload.sub !== userPhone) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    try {
        // Authenticated read endpoint — isolate its bucket so unrelated traffic
        // (promo/discount/search polling on every page) can't silently 429 it,
        // which was hiding the user's own orders. Generous limit per scope.
        if (!await checkRateLimit(ip, 60, 60, "orders-user")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish." }, { status: 429 });
        }

        const { data, error } = await supabaseAdminFresh
            .from("orders")
            .select("*")
            .eq("user_phone", userPhone)
            .order("created_at", { ascending: false });

        if (error) {
            return NextResponse.json({ success: false, message: "Orders not found" }, { status: 404 });
        }

        // Kesh yo'q — mijoz buyurtma holatini (masalan "Yetkazildi") darhol ko'rishi shart.
        return NextResponse.json(
            { success: true, orders: data },
            { headers: { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
        );
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
