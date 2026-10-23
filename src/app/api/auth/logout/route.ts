import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt-utils";
import { writeVisitorLog, getGeoByIp } from "@/lib/visitor-log";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getUserJwtSecret } from "@/lib/secrets";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";

    try {
        const userToken = req.cookies.get("user_token")?.value;
        const JWT_SECRET = getUserJwtSecret();

        let userPhone: string | null = null;
        let userName = "Mehmon";

        if (userToken) {
            const payload = await verifyJwt(userToken, JWT_SECRET);
            if (payload?.sub) {
                userPhone = payload.sub as string;

                // Ismni bazadan olish
                const { data: dbUser } = await supabaseAdmin
                    .from("users")
                    .select("name")
                    .eq("phone", userPhone)
                    .single();
                if (dbUser?.name) userName = dbUser.name;
            }
        }

        // ✍️ LOGOUT LOG (background)
        if (userPhone) {
            getGeoByIp(ip).then(geo => {
                writeVisitorLog({
                    user_phone: userPhone,
                    name: userName,
                    event_type: "logout",
                    ip_address: ip,
                    ...geo,
                    current_path: "/account",
                });
            });
        }

        // Cookie'ni o'chirish
        const response = NextResponse.json({ success: true });
        response.cookies.set("user_token", "", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 0,
            path: "/",
        });

        return response;

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
