import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseAdminFresh as db } from "@/lib/supabase-admin";
import { getSessionPhone, phoneDigits, phoneVariants } from "@/lib/user-session";

export const dynamic = "force-dynamic";

/**
 * Shaxsiy xabarlar (sayt) — brauzer anon kalit bilan o'qimaydi/yozmaydi.
 *   GET    /api/me/messages?with=<telefon>[&since=<ISO>]  — chat xabarlari (+ suhbatdosh profili)
 *   POST   /api/me/messages  { to, text?, image?, video? } — xabar yuborish
 *   DELETE /api/me/messages?id=<msgId>                     — o'z xabarini o'chirish
 *   DELETE /api/me/messages?with=<telefon>&all=1           — butun suhbatni o'chirish
 * Faqat sessiya egasi ishtirok etgan chatlar bilan ishlaydi.
 */

const MAX_TEXT = 4000;
const MAX_URL = 1000;
const MAX_MESSAGES = 500;

/** Sayt ishlatadigan xona ID formulasi: ikkala telefon raqamlari, saralangan, "_" bilan. */
function roomIdFor(a: string, b: string): string {
    return [phoneDigits(a), phoneDigits(b)].sort().join("_");
}

function isParticipant(chat: { id: string; participants?: string[] | null }, myDigits: string): boolean {
    if ((chat.participants || []).some((p) => phoneDigits(p) === myDigits)) return true;
    return chat.id.split("_").includes(myDigits);
}

function safeMediaUrl(v: unknown): string | null {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || v.length > MAX_URL || !/^https:\/\//i.test(v)) throw new Error("Invalid media URL");
    return v;
}

async function findUser(phone: string) {
    const { data } = await db
        .from("users")
        .select("phone, name, username")
        .in("phone", phoneVariants(phone))
        .limit(1)
        .maybeSingle();
    return data;
}

export async function GET(req: NextRequest) {
    const me = await getSessionPhone(req);
    if (!me) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const target = req.nextUrl.searchParams.get("with") || "";
    const since = req.nextUrl.searchParams.get("since");
    const myDigits = phoneDigits(me);
    if (!phoneDigits(target)) return NextResponse.json({ success: false, error: "with is required" }, { status: 400 });

    const roomId = roomIdFor(me, target);
    const { data: chat } = await db
        .from("private_chats")
        .select("id, participants, unread_count, cleared_at")
        .eq("id", roomId)
        .maybeSingle();
    if (chat && !isParticipant(chat, myDigits)) {
        return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // "Faqat mendan": yashirilgan xabarlar va men tozalagan vaqtgacha bo'lganlar ko'rinmaydi
    const clearedAt: string | undefined = chat?.cleared_at?.[myDigits];
    const hasSince = Boolean(since && !Number.isNaN(Date.parse(since)));
    let query = db
        .from("private_messages")
        .select("id, chat_id, text, image, video, sender_id, created_at")
        .eq("chat_id", roomId)
        .not("hidden_for", "cs", `{${myDigits}}`)
        // Polling: since'dan keyingilar (eskidan yangiga); to'liq yuklash: 500 ta ENG YANGI
        .order("created_at", { ascending: hasSince })
        .limit(MAX_MESSAGES);
    if (hasSince) query = query.gt("created_at", since!);
    if (clearedAt) query = query.gt("created_at", clearedAt);
    const { data: rows, error } = await query;
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    const messages = hasSince ? rows || [] : (rows || []).slice().reverse();

    // Suhbatdoshning faqat ommaviy ma'lumotlari (to'liq poll'da)
    let targetInfo: any = undefined;
    if (!since) {
        const [user, { data: status }] = await Promise.all([
            findUser(target),
            db.from("user_status").select("is_online").in("id", phoneVariants(target)).limit(1).maybeSingle(),
        ]);
        targetInfo = {
            name: user?.name || "User",
            username: user?.username || phoneDigits(target).slice(-4),
            phone: target,
            isOnline: Boolean(status?.is_online),
        };
    }

    // O'qildi deb belgilash (menga tegishli barcha kalit variantlari)
    if (chat && (!since || (messages && messages.length > 0))) {
        const unread: Record<string, number> = { ...(chat.unread_count || {}) };
        const myKeys = Object.keys(unread).filter((k) => phoneDigits(decodeURIComponent(k)) === myDigits);
        if (myKeys.some((k) => Number(unread[k]) > 0) || !(myDigits in unread)) {
            for (const k of myKeys) unread[k] = 0;
            unread[myDigits] = 0;
            await db.from("private_chats").update({ unread_count: unread }).eq("id", roomId);
        }
    }

    return NextResponse.json({ success: true, roomId, exists: Boolean(chat), messages: messages || [], target: targetInfo });
}

export async function POST(req: NextRequest) {
    const me = await getSessionPhone(req);
    if (!me) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 }); }

    const myDigits = phoneDigits(me);
    const otherDigits = phoneDigits(body?.to);
    if (!otherDigits) return NextResponse.json({ success: false, error: "to is required" }, { status: 400 });
    if (otherDigits === myDigits) return NextResponse.json({ success: false, error: "Cannot message yourself" }, { status: 400 });

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (text.length > MAX_TEXT) return NextResponse.json({ success: false, error: "Text too long" }, { status: 400 });
    let image: string | null, video: string | null;
    try { image = safeMediaUrl(body?.image); video = safeMediaUrl(body?.video); }
    catch { return NextResponse.json({ success: false, error: "Invalid media URL" }, { status: 400 }); }
    if (!text && !image && !video) return NextResponse.json({ success: false, error: "Empty message" }, { status: 400 });

    const [meUser, otherUser] = await Promise.all([findUser(me), findUser(String(body.to))]);
    if (!otherUser) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const roomId = roomIdFor(me, String(body.to));
    const now = new Date().toISOString();
    const lastMessage = image ? "🖼️ Foto" : video ? "🎥 Video" : text;

    const { data: chat } = await db
        .from("private_chats")
        .select("id, participants, unread_count")
        .eq("id", roomId)
        .maybeSingle();

    if (chat) {
        if (!isParticipant(chat, myDigits)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        const unread: Record<string, number> = { ...(chat.unread_count || {}) };
        unread[otherDigits] = (Number(unread[otherDigits]) || 0) + 1;
        const { error } = await db.from("private_chats")
            .update({ last_message: lastMessage, last_timestamp: now, unread_count: unread })
            .eq("id", roomId);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    } else {
        const { error } = await db.from("private_chats").insert({
            id: roomId,
            participants: [myDigits, otherDigits],
            participant_data: {
                [myDigits]: { name: meUser?.name || "User", username: meUser?.username || myDigits },
                [otherDigits]: { name: otherUser.name || "User", username: otherUser.username || otherDigits },
            },
            unread_count: { [otherDigits]: 1, [myDigits]: 0 },
            last_message: lastMessage,
            last_timestamp: now,
        });
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const { data: message, error } = await db
        .from("private_messages")
        .insert({ id: randomUUID(), chat_id: roomId, text, image, video, sender_id: me })
        .select("id, chat_id, text, image, video, sender_id, created_at")
        .single();
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, message });
}

export async function DELETE(req: NextRequest) {
    const me = await getSessionPhone(req);
    if (!me) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    const myDigits = phoneDigits(me);
    const params = req.nextUrl.searchParams;

    // scope=me — faqat mendan (suhbatdoshda qoladi); scope=all (yoki eski all=1) — ikkala tarafdan
    const scope = params.get("scope") === "me" ? "me" : (params.get("scope") === "all" || params.get("all") === "1") ? "all" : null;

    const msgId = params.get("id");
    if (msgId) {
        const { data: msg } = await db.from("private_messages").select("id, chat_id, sender_id, hidden_for").eq("id", msgId).maybeSingle();
        if (!msg) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
        const { data: chat } = await db.from("private_chats").select("id, participants").eq("id", msg.chat_id).maybeSingle();
        const inChat = chat ? isParticipant(chat, myDigits) : msg.chat_id.split("_").includes(myDigits);
        if (!inChat) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

        if (scope === "me") {
            const hidden = Array.from(new Set([...(msg.hidden_for || []), myDigits]));
            const { error } = await db.from("private_messages").update({ hidden_for: hidden }).eq("id", msgId);
            if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            return NextResponse.json({ success: true, scope });
        }
        // Ikkala tarafdan — faqat o'z xabarini
        if (phoneDigits(msg.sender_id) !== myDigits) {
            return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
        }
        const { error } = await db.from("private_messages").delete().eq("id", msgId);
        if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
        return NextResponse.json({ success: true, scope: "all" });
    }

    const target = params.get("with");
    if (target && scope) {
        const roomId = roomIdFor(me, target);
        const { data: chat } = await db.from("private_chats").select("id, participants, cleared_at").eq("id", roomId).maybeSingle();
        if (chat && !isParticipant(chat, myDigits)) return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

        if (scope === "me") {
            if (!chat) return NextResponse.json({ success: true, scope });
            const cleared = { ...(chat.cleared_at || {}), [myDigits]: new Date().toISOString() };
            const { error } = await db.from("private_chats").update({ cleared_at: cleared }).eq("id", roomId);
            if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
            return NextResponse.json({ success: true, scope });
        }
        const { error: e1 } = await db.from("private_messages").delete().eq("chat_id", roomId);
        const { error: e2 } = await db.from("private_chats").delete().eq("id", roomId);
        if (e1 || e2) return NextResponse.json({ success: false, error: (e1 || e2)!.message }, { status: 500 });
        return NextResponse.json({ success: true, scope: "all" });
    }

    return NextResponse.json({ success: false, error: "id&scope or with&scope is required" }, { status: 400 });
}
