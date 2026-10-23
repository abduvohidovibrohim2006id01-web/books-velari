import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

async function getUserFromToken(req: NextRequest) {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    if (!payload || !payload.sub) return null;
    return payload.sub; // phone
}

export async function GET(req: NextRequest) {
    const phone = await getUserFromToken(req);
    if (!phone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { data: user } = await supabaseAdmin.from("users").select("affiliate_role").eq("phone", phone).single();
        if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

        const { data: products, error } = await supabaseAdmin
            .from("products")
            .select("id, name, name_uz, name_ru, price, image, comm_seller, comm_tm, comm_manager")
            .eq("is_deleted", false)
            .gt("comm_seller", 0) // faqat hamkorlik komissiyasi belgilangan mahsulotlar
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Add role-specific commission info to each product
        const enrichedProducts = products.map(p => {
            let myComm = 0;
            // Simplified: "Seller %" is what anyone gets if they sell it.
            // But we need to know the specific percentage based on who is viewing.
            // Actually, the user's rule: "Sotuvchi foizi (5%): Bu mehnat haqi. Kim sotishidan qat'i nazar u aynan shu foizni oladi."
            myComm = p.comm_seller || 0; 

            return {
                ...p,
                myCommission: myComm
            };
        });

        return NextResponse.json({ success: true, products: enrichedProducts });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
