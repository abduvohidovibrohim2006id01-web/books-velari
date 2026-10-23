import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

/**
 * Global User Search for Messaging (Secure)
 * Authenticated-only to prevent anonymous scraping of customer database.
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q")?.trim().toLowerCase();
    const isSuggested = searchParams.get("suggested") === "true";
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10), 1), 50);
    const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

    if (!isSuggested && (!query || query.length < 2)) {
        return NextResponse.json({ success: true, users: [], hasMore: false });
    }

    // 🛡 1. Require Authenticated User Session (Blocks anonymous scrapers)
    const token = req.cookies.get("user_token")?.value;
    if (!token) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    if (!payload || !payload.sub) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    try {
        if (!await checkRateLimit(ip, 60, 60, "users-search")) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

        let data: any[] = [];
        if (isSuggested) {
            // 👥 Return all users with pagination (20 per page for smooth scrolling)
            const { data: usersData, error } = await supabaseAdmin
                .from("users")
                .select("name, username, phone, created_at")
                .neq("phone", payload.sub)
                .order("created_at", { ascending: false })
                .range(offset, offset + limit - 1);

            if (error) throw error;
            data = usersData || [];
        } else {
            // 🔍 Search users by username or name only (no raw phone search)
            const { data: usersData, error } = await supabaseAdmin
                .from("users")
                .select("name, username, phone")
                .neq("phone", payload.sub)
                .or(`username.ilike.%${query}%,name.ilike.%${query}%`)
                .range(offset, offset + limit - 1);

            if (error) throw error;
            data = usersData || [];
        }

        // 🛡 Mask phone numbers and phone-like usernames before sending to client
        const maskedUsers = (data || []).map(u => {
            const isPhoneUsername = u.username && /^\+?[0-9]{9,15}$/.test(u.username);
            const maskedPhone = u.phone ? (u.phone.slice(0, 7) + "***" + u.phone.slice(-4)) : null;
            return {
                name: u.name || (u.username && !isPhoneUsername ? `@${u.username}` : "Foydalanuvchi"),
                username: isPhoneUsername ? null : u.username,
                phone: maskedPhone,
                id: u.phone // Safe for authenticated user chat routing
            };
        });

        return NextResponse.json({ 
            success: true, 
            users: maskedUsers,
            hasMore: maskedUsers.length === limit,
            nextOffset: offset + maskedUsers.length
        });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

