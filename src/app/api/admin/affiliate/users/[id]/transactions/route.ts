import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getAdminSecret } from "@/lib/secrets";

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
    try {
        const adminToken = req.headers.get("cookie")?.split("admin_token=")[1]?.split(";")[0];
        const ADMIN_SECRET = getAdminSecret();

        const payload = adminToken ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
        if (!payload || payload.role !== "admin") {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
        }

        const userId = params.id;

        // Fetch user basic info
        const { data: user, error: userError } = await supabaseAdmin
            .from("users")
            .select("id, name, phone, affiliate_role, affiliate_code, real_balance, created_at, upline_id")
            .eq("id", userId)
            .single();

        if (userError) throw userError;

        // Fetch user's affiliate transactions
        const { data: transactions, error: txError } = await supabaseAdmin
            .from("affiliate_transactions")
            .select(`
                id,
                amount,
                status,
                created_at,
                order_stage,
                order_id,
                orders ( total, status ),
                products ( name )
            `)
            .eq("user_id", userId)
            .order("created_at", { ascending: false });

        if (txError) throw txError;

        return NextResponse.json({ success: true, data: { user, transactions } });
    } catch (error: any) {
        console.error("Admin affiliate user transactions error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
