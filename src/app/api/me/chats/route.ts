import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh } from "@/lib/supabase-admin";
import { getSessionPhone, phoneDigits, phoneVariants } from "@/lib/user-session";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/chats — foydalanuvchi ishtirok etgan shaxsiy chatlar + uning support chati.
 * Faqat user_token sessiyasi egasining chatlari qaytadi (brauzer anon kalit bilan o'qimaydi).
 */
export async function GET(req: NextRequest) {
    const phone = await getSessionPhone(req);
    if (!phone) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const variants = phoneVariants(phone);

    const [{ data: chats, error }, { data: support }] = await Promise.all([
        supabaseAdminFresh
            .from("private_chats")
            .select("id, participants, participant_data, last_message, last_timestamp, unread_count, created_at, cleared_at")
            .overlaps("participants", variants)
            .order("last_timestamp", { ascending: false, nullsFirst: false }),
        supabaseAdminFresh
            .from("support_chats")
            .select("id, username, last_message, last_timestamp, status, created_at")
            .in("id", variants)
            .order("last_timestamp", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
    ]);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // "Faqat mendan" tozalangan suhbat — undan keyin yangi xabar kelmaguncha ro'yxatda ko'rinmaydi
    const myDigits = phoneDigits(phone);
    const visible = (chats || [])
        .filter((ch: any) => {
            const cleared = ch.cleared_at?.[myDigits];
            return !cleared || (ch.last_timestamp && new Date(ch.last_timestamp) > new Date(cleared));
        })
        .map(({ cleared_at, ...ch }: any) => ch);

    return NextResponse.json({ success: true, chats: visible, supportChat: support || null });
}
