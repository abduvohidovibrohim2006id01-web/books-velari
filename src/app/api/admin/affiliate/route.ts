import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";

async function isAdmin(req: NextRequest) {
    const token = req.cookies.get("admin_token")?.value;
    if (!token) return false;
    
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET) return false;
    
    const payload = await verifyJwt(token, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function GET(req: NextRequest) {
    if (!(await isAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        // 1. Get all pending and recent withdrawal requests
        const { data: withdrawals, error: withError } = await supabaseAdmin
            .from("withdraw_requests")
            .select(`
                *,
                users (phone, name)
            `)
            .order("created_at", { ascending: false });

        if (withError) throw withError;

        // 2. Get affiliate settings
        const { data: settingsRow } = await supabaseAdmin
            .from("site_settings")
            .select("*")
            .eq("key", "affiliate_settings")
            .single();

        // 3. Get some stats (Total paid, Total pending, Active affiliates)
        const { data: statsData } = await supabaseAdmin
            .from("affiliate_transactions")
            .select("amount, status");
        
        const stats = {
            total_earned: statsData?.filter(t => t.status === 'approved').reduce((sum, t) => sum + Number(t.amount), 0) || 0,
            pending_rewards: statsData?.filter(t => t.status === 'pending').reduce((sum, t) => sum + Number(t.amount), 0) || 0,
            active_affiliates_count: 0 // Will fetch below
        };

        const { count } = await supabaseAdmin
            .from("users")
            .select("*", { count: 'exact', head: true })
            .not("affiliate_code", "is", null);
        
        stats.active_affiliates_count = count || 0;

        return NextResponse.json({
            success: true,
            withdrawals,
            settings: settingsRow?.value || {},
            stats
        });

    } catch (error: any) {
        console.error("Admin Affiliate GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!(await isAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { action } = body;

        // ACTION: Update Settings
        if (action === "update_settings") {
            const { settings } = body;
            const { error } = await supabaseAdmin
                .from("site_settings")
                .upsert({ 
                    key: "affiliate_settings", 
                    value: settings,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
            return NextResponse.json({ success: true, message: "Sozlamalar yangilandi" });
        }

        // ACTION: Handle Withdrawal Request
        if (action === "handle_withdraw") {
            const { id, status, note } = body; // status: paid, rejected
            
            const { data: request, error: fetchError } = await supabaseAdmin
                .from("withdraw_requests")
                .select("*")
                .eq("id", id)
                .single();

            if (fetchError || !request) throw fetchError || new Error("Request not found");

            if (request.status !== "pending") {
                return NextResponse.json({ error: "Bu so'rov allaqachon ko'rib chiqilgan" }, { status: 400 });
            }

            if (status === "paid") {
                const { error: updateError } = await supabaseAdmin
                    .from("withdraw_requests")
                    .update({ status: "paid", updated_at: new Date().toISOString() })
                    .eq("id", id);
                if (updateError) throw updateError;
            } else if (status === "rejected") {
                // If rejected, refund the balance to the user
                const { data: user } = await supabaseAdmin
                    .from("users")
                    .select("real_balance")
                    .eq("phone", request.user_phone)
                    .single();
                
                if (user) {
                    await supabaseAdmin
                        .from("users")
                        .update({ real_balance: user.real_balance + request.amount })
                        .eq("phone", request.user_phone);
                }

                await supabaseAdmin
                    .from("withdraw_requests")
                    .update({ status: "rejected", updated_at: new Date().toISOString() })
                    .eq("id", id);
            }

            return NextResponse.json({ success: true, message: "Muvaffaqiyatli bajarildi" });
        }

        return NextResponse.json({ error: "Noto'g'ri amal" }, { status: 400 });

    } catch (error: any) {
        console.error("Admin Affiliate POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
