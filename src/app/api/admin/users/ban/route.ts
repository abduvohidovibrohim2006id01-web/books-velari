import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
    try {
        const { userPhone, ban } = await req.json();

        if (!userPhone) {
            return NextResponse.json({ error: "Missing user phone" }, { status: 400 });
        }

        // We use a future date (e.g. 2099) for a permanent ban, or NULL to unban.
        const banned_until = ban ? '2099-01-01T00:00:00.000Z' : null;

        const { error } = await supabaseAdmin
            .from("users")
            .update({ banned_until })
            .eq("phone", userPhone);

        if (error) throw error;

        return NextResponse.json({ success: true, banned_until });
    } catch (e: any) {
        console.error("Ban user error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
