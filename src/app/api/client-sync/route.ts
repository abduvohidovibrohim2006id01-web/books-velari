import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSessionPhone, phoneDigits } from "@/lib/user-session";

export async function POST(req: NextRequest) {
    try {
        const { type, payload } = await req.json();

        if (type === "cart") {
            const { user_phone, items } = payload;
            if (!user_phone) return NextResponse.json({ error: "Missing user_phone" }, { status: 400 });

            const sessionPhone = await getSessionPhone(req);
            if (!sessionPhone || phoneDigits(sessionPhone) !== phoneDigits(user_phone)) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
            
            if (!items || items.length === 0) {
                await supabaseAdmin.from("active_carts").delete().eq("user_phone", user_phone);
            } else {
                await supabaseAdmin.from("active_carts").upsert({
                    user_phone,
                    items,
                    updated_at: new Date().toISOString()
                }, { onConflict: "user_phone" });
            }
        } else if (type === "status") {
            if (payload?.user_phone) {
                const sessionPhone = await getSessionPhone(req);
                if (!sessionPhone || phoneDigits(sessionPhone) !== phoneDigits(payload.user_phone)) {
                    payload.user_phone = null;
                    payload.type = "visitor";
                }
            }
            const { id, is_online, updated_at } = payload;
            if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
            
            await supabaseAdmin.from("user_status").upsert({
                id,
                is_online,
                updated_at: updated_at || new Date().toISOString()
            }, { onConflict: "id" });
        } else if (type === "status_update") {
            if (payload?.user_phone) {
                const sessionPhone = await getSessionPhone(req);
                if (!sessionPhone || phoneDigits(sessionPhone) !== phoneDigits(payload.user_phone)) {
                    payload.user_phone = null;
                    payload.type = "visitor";
                }
            }
            const { id, is_online, updated_at } = payload;
            if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
            
            await supabaseAdmin.from("user_status").update({
                is_online,
                updated_at: updated_at || new Date().toISOString()
            }).eq("id", id);
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Client sync error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
