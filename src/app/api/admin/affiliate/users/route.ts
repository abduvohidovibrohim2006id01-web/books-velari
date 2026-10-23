import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getAdminSecret } from "@/lib/secrets";

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
    try {
        const adminToken = req.headers.get("cookie")?.split("admin_token=")[1]?.split(";")[0];
        const ADMIN_SECRET = getAdminSecret();

        const payload = adminToken ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
        if (!payload || payload.role !== "admin") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const { data: users, error } = await supabaseAdmin
            .from("users")
            .select("id, name, phone, affiliate_role, affiliate_code, real_balance, created_at, upline_id")
            .order("created_at", { ascending: false });

        if (error) throw error;

        return NextResponse.json({ success: true, data: users });
    } catch (error: any) {
        console.error("Admin affiliate users error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
