import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { hashPassword } from "@/lib/auth-utils";

export async function POST(req: Request) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        if (!await checkRateLimit(ip, 5, 60, "auth-update")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish." }, { status: 429 });
        }

        const { phone, password, name, username, newPassword } = await req.json();

        if (!phone || !password) {
            return NextResponse.json({ success: false, message: "Telefon raqami va parol zarur." }, { status: 400 });
        }

        // 🛡 SECURITY: Verify Identity
        const { data: user, error: findError } = await supabaseAdmin
            .from("users")
            .select("password, token_version")
            .eq("phone", phone)
            .single();

        if (findError || !user) {
            return NextResponse.json({ success: false, message: "Foydalanuvchi topilmadi." }, { status: 404 });
        }

        // Check if current password is correct
        const isAuth = user.password === password || user.password === hashPassword(password);
        if (!isAuth) {
            return NextResponse.json({ success: false, message: "Tasdiqlash xatosi (Hozirgi parol noto'g'ri)." }, { status: 401 });
        }

        // 🛡 Prepare Update Data
        const updateData: any = { 
            name, 
            username, 
            updated_at: new Date().toISOString() 
        };

        // If password is being changed
        if (newPassword) {
            updateData.password = hashPassword(newPassword);
            // Increment token_version to logout other devices
            updateData.token_version = (user.token_version || 1) + 1;
        }

        const { error } = await supabaseAdmin
            .from("users")
            .update(updateData)
            .eq("phone", phone);

        if (error) throw error;

        return NextResponse.json({ success: true, token_version_updated: !!updateData.token_version });

    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
