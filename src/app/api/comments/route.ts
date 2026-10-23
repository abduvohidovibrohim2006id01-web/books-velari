import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret, getAdminSecret } from "@/lib/secrets";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        if (!await checkRateLimit(ip, 10, 60, "comments")) {
            return NextResponse.json({ success: false, message: "Juda ko'p urinish." }, { status: 429 });
        }

        const { action, p_user_phone, p_comment_id, p_comment_data } = await req.json();

        if (!action || !p_user_phone) {
            return NextResponse.json({ success: false, message: "Ma'lumotlar yetarli emas." }, { status: 400 });
        }

        // 🛡 SECURITY: Verify JWT Token
        const token = req.cookies.get("user_token")?.value;
        const adminToken = req.cookies.get("admin_token")?.value;
        
        const JWT_SECRET = getUserJwtSecret();
        const ADMIN_SECRET = getAdminSecret();

        let authPayload: any = null;
        if (adminToken) {
            try {
                authPayload = await verifyJwt(adminToken, ADMIN_SECRET);
            } catch {
                authPayload = null;
            }
        }
        if (!authPayload && token) {
            try {
                authPayload = await verifyJwt(token, JWT_SECRET);
                if (!authPayload || authPayload.sub !== p_user_phone) {
                    return NextResponse.json({ success: false, message: "Sessiya xatosi. Iltimos qayta kiring." }, { status: 401 });
                }
            } catch {
                authPayload = null;
            }
        }

        if (!authPayload) {
            return NextResponse.json({ success: false, message: "Sharh qoldirish uchun tizimga kiring." }, { status: 401 });
        }

        const isAdmin = Boolean(authPayload && (authPayload as any).role === 'admin');

        // 🛡 ACTION: ADD COMMENT
        if (action === 'insert') {
            const { product_id, text, type, rating, parent_id, user_name, user_avatar, images, video_url } = p_comment_data || {};

            // 1. MUST HAVE PURCHASED TO REVIEW
            if (type === 'review' && !parent_id) {
                const { data: orders } = await supabaseAdmin
                    .from("orders")
                    .select("items")
                    .eq("user_phone", p_user_phone);

                const hasPurchased = orders?.some(order => 
                    order.items?.some((item: any) => item.id === product_id)
                );

                if (!hasPurchased) {
                    return NextResponse.json({ success: false, message: "Sharh qoldirish uchun ushbu mahsulotni sotib olgan bo'lishingiz kerak." }, { status: 403 });
                }
            }

            // 2. Insert Comment
            // comments.id — text primary key (default yo'q), shuning uchun bu yerda generatsiya qilamiz.
            const allowedFields = {
                product_id,
                text,
                type: type || 'review',
                rating,
                parent_id,
                user_name,
                user_avatar,
                images,
                video_url
            };
            const sanitizedData = Object.fromEntries(
                Object.entries(allowedFields).filter(([_, v]) => v !== undefined)
            );

            const { data, error } = await supabaseAdmin.from("comments").insert([{
                id: (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`),
                ...sanitizedData,
                is_admin: isAdmin ? Boolean(p_comment_data.is_admin) : false,
                user_id: p_user_phone, // We use phone as identity for now
                created_at: new Date().toISOString()
            }]);

            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        // 🛡 ACTION: UPDATE / DELETE
        if (action === 'update' || action === 'delete' || action === 'react') {
            // 1. Ownership Check
            const { data: comment } = await supabaseAdmin
                .from("comments")
                .select("user_id, is_admin")
                .eq("id", p_comment_id)
                .single();

            if (!comment) return NextResponse.json({ success: false, message: "Sharh topilmadi." }, { status: 404 });
            
            // Allow update/delete if it's the owner or if an admin (check phone)
            // Note: In real app, verify admin status properly
            const isOwner = comment.user_id === p_user_phone || isAdmin;
            if (!isOwner && action !== 'react') {
                return NextResponse.json({ success: false, message: "Ruxsat etilmadi." }, { status: 403 });
            }

            if (action === 'delete') {
                await supabaseAdmin.from("comments").delete().eq("id", p_comment_id);
            } else if (action === 'update') {
                await supabaseAdmin.from("comments").update({ 
                    text: p_comment_data?.text, 
                    is_edited: true,
                    updated_at: new Date().toISOString() 
                }).eq("id", p_comment_id);
            } else if (action === 'react') {
                const rawReactions = p_comment_data?.reactions;
                if (!rawReactions || typeof rawReactions !== "object" || Array.isArray(rawReactions)) {
                    return NextResponse.json({ success: false, message: "Noto'g'ri reaksiya formati." }, { status: 400 });
                }
                const sanitizedReactions: Record<string, number> = {};
                for (const [key, val] of Object.entries(rawReactions)) {
                    if (typeof val === 'number' && val >= 0 && val <= 100000) {
                        sanitizedReactions[key] = Math.floor(val);
                    }
                }
                await supabaseAdmin.from("comments").update({ 
                    reactions: sanitizedReactions 
                }).eq("id", p_comment_id);
            }

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ success: false, message: "Noto'g'ri amal." }, { status: 400 });

    } catch (error: any) {
        return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    }
}
