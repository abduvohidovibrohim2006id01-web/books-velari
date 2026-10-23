import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getSessionPhone, phoneDigits } from "@/lib/user-session";
import { verifyJwt } from "@/lib/jwt-utils";
import { getAdminSecret } from "@/lib/secrets";

async function checkChatAuth(req: NextRequest, chatId: string): Promise<{ authorized: boolean; status?: number; error?: string }> {
    const adminToken = req.cookies.get("admin_token")?.value;
    if (adminToken) {
        try {
            const adminSecret = getAdminSecret();
            const adminPayload: any = await verifyJwt(adminToken, adminSecret);
            if (adminPayload && adminPayload.role === "admin") {
                return { authorized: true };
            }
        } catch {
            // fallback to user check
        }
    }

    if (chatId.startsWith("visitor_")) {
        if (chatId.length < 12) {
            return { authorized: false, status: 401, error: "Unauthorized" };
        }
        return { authorized: true };
    }

    const sessionPhone = await getSessionPhone(req);
    if (!sessionPhone || phoneDigits(sessionPhone) !== phoneDigits(chatId)) {
        return { authorized: false, status: 401, error: "Unauthorized" };
    }

    return { authorized: true };
}

/**
 * GET: Fetch messages for a specific chat
 */
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get("chat_id");
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    if (!chatId) return NextResponse.json({ error: "No chat ID" }, { status: 400 });

    try {
        if (!await checkRateLimit(ip, 30, 60, "support-chat-get")) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

        const auth = await checkChatAuth(req, chatId);
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
        }

        // 🛡 SECURITY: Verify requester identity
        const { data, error } = await supabaseAdmin
            .from("support_messages")
            .select("*")
            .eq("chat_id", chatId)
            .order("created_at", { ascending: true });

        if (error) throw error;
        return NextResponse.json({ success: true, messages: data });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

/**
 * POST: Send a new message
 */
export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        if (!await checkRateLimit(ip, 15, 60, "support-chat-post")) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

        const { chat_id, text, image, video, sender_id, sender_type } = await req.json();

        if (!chat_id) return NextResponse.json({ error: "No chat ID" }, { status: 400 });

        const auth = await checkChatAuth(req, chat_id);
        if (!auth.authorized) {
            return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: auth.status || 401 });
        }

        // 🛡 SECURITY: Hard-code is_admin to false for public API users
        // Only internal admin routes can set is_admin: true
        const isAdmin = false;

        // 1. Insert Message
        const { error: msgErr } = await supabaseAdmin.from("support_messages").insert([{
            id: crypto.randomUUID(),
            chat_id,
            text,
            image,
            video,
            sender_id,
            sender_type: "user", // Forced to user
            is_admin: isAdmin, // Hard-secured
            created_at: new Date().toISOString()
        }]);

        if (msgErr) throw msgErr;

        // 2. Update/Upsert Chat Session
        const lastMsg = image ? "🖼️ Rasm" : (video ? "🎥 Video" : text);
        await supabaseAdmin.from("support_chats").upsert({
            id: chat_id,
            last_message: lastMsg,
            last_timestamp: new Date().toISOString(),
            status: 'active',
            unread_by_admin: 1
        });

        return NextResponse.json({ success: true });

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
