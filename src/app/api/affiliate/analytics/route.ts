import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh as supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

async function getUserFromToken(req: NextRequest) {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    return payload?.sub as string | null;
}

export async function GET(req: NextRequest) {
    const phone = await getUserFromToken(req);
    if (!phone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { data: me } = await supabaseAdmin
            .from("users")
            .select("id, affiliate_role, upline_id")
            .eq("phone", phone)
            .single();

        if (!me) return NextResponse.json({ error: "User not found" }, { status: 404 });

        // 1. My own links with stats
        const { data: myLinks } = await supabaseAdmin
            .from("affiliate_links")
            .select("id, slug, product_id, clicks, conversions, created_at, products(name, name_uz, name_ru, image, price)")
            .eq("user_id", me.id)
            .order("created_at", { ascending: false });

        // 2. If TM or TSM — also show downline members' link stats
        let teamLinks: any[] = [];
        if (me.affiliate_role === 'top_manager' || me.affiliate_role === 'top_sales_manager' || me.affiliate_role === 'sales_manager') {
            // Get direct downline
            const { data: downline } = await supabaseAdmin
                .from("users")
                .select("id, name, phone, affiliate_role")
                .eq("upline_id", me.id);

            if (downline && downline.length > 0) {
                const downlineIds = downline.map(d => d.id);

                const { data: downlineLinks } = await supabaseAdmin
                    .from("affiliate_links")
                    .select("id, slug, product_id, clicks, conversions, created_at, user_id, products(name, name_uz, name_ru, image, price)")
                    .in("user_id", downlineIds)
                    .order("clicks", { ascending: false });

                // Attach member info
                teamLinks = (downlineLinks || []).map(link => ({
                    ...link,
                    member: downline.find(d => d.id === link.user_id)
                }));
            }
        }

        // 3. Summary stats
        const totalClicks = (myLinks || []).reduce((sum, l) => sum + (l.clicks || 0), 0);
        const totalConversions = (myLinks || []).reduce((sum, l) => sum + (l.conversions || 0), 0);
        const teamTotalClicks = teamLinks.reduce((sum, l) => sum + (l.clicks || 0), 0);

        return NextResponse.json({
            success: true,
            myLinks: myLinks || [],
            teamLinks,
            stats: {
                totalClicks,
                totalConversions,
                teamTotalClicks,
                conversionRate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(1) : "0"
            }
        });

    } catch (error: any) {
        console.error("Affiliate Analytics Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
