import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");
    const userPhone = searchParams.get("phone");

    if (!orderId || !userPhone) {
        return NextResponse.json({ success: false, message: "Missing orderId or phone" }, { status: 400 });
    }

    const token = req.cookies.get("user_token")?.value;
    if (!token) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    if (!payload || payload.sub !== userPhone) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

    try {
        const { data, error } = await supabaseAdmin
            .from("orders")
            .select("*")
            .eq("id", orderId)
            .eq("user_phone", userPhone)
            .single();

        if (error || !data) {
            return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true, order: data });
    } catch (e: any) {
        return NextResponse.json({ success: false, message: e.message }, { status: 500 });
    }
}
