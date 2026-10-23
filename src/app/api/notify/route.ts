import { NextRequest, NextResponse } from "next/server";
import { sendOrderNotification } from "@/lib/telegram";
import { getSessionPhone, phoneDigits } from "@/lib/user-session";
import { checkRateLimit } from "@/lib/rate-limiter";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: NextRequest) {
    try {
        const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        if (!(await checkRateLimit(ip, 10, 60, "order-notify"))) {
            return NextResponse.json({ error: "Too many requests" }, { status: 429 });
        }

        const sessionPhone = await getSessionPhone(req);
        if (!sessionPhone) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { orderId, method } = await req.json();
        if (!orderId) {
            return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
        }

        const { data: order, error: orderErr } = await supabaseAdmin
            .from("orders")
            .select("id, user_phone")
            .eq("id", orderId)
            .maybeSingle();

        if (orderErr || !order || phoneDigits(order.user_phone) !== phoneDigits(sessionPhone)) {
            return NextResponse.json({ error: "Forbidden: Order does not belong to you" }, { status: 403 });
        }

        await sendOrderNotification(orderId, method);
        return NextResponse.json({ success: true });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e?.message || "Internal error" }, { status: 500 });
    }
}
