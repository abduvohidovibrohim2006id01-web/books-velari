import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { DEFAULT_DISCOUNT_CONFIG } from "@/lib/smart-discount";

/**
 * Smart chegirma — admin boshqaruvi va audit (#42).
 *
 *  GET  → { config, offers (oxirgi qarorlar auditi), stats }
 *  POST { action: "save_config", config } → konfiguratsiyani saqlaydi (oraliq/chegaralar/istisnolar)
 *  POST { action: "revoke_offer", offerId } → aktiv taklifni admin bekor qiladi
 */

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function GET(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const [
            { data: config },
            { data: offers },
            { data: users }
        ] = await Promise.all([
            supabaseAdmin.from("smart_discount_config").select("*").eq("id", "global").single(),
            supabaseAdmin.from("smart_discount_offers")
                .select("id, user_identifier, product_id, percent, intent_score, signals, reason_uz, status, source, created_at, expires_at, redeemed_at, revoked_by")
                .order("created_at", { ascending: false })
                .limit(200),
            supabaseAdmin.from("users")
                .select("phone, name")
                .is("deleted_at", null)
                .order("name", { nullsFirst: false })
                .limit(500)
        ]);

        // Auditga mahsulot nomlarini qo'shamiz
        const productIds = Array.from(new Set((offers || []).map(o => o.product_id).filter(Boolean)));
        let nameMap: Record<string, string> = {};
        if (productIds.length) {
            const { data: prods } = await supabaseAdmin.from("products").select("id, name").in("id", productIds);
            nameMap = Object.fromEntries((prods || []).map(p => [p.id, p.name]));
        }
        const offersWithNames = (offers || []).map(o => ({ ...o, product_name: nameMap[o.product_id] || o.product_id }));

        const stats = {
            total: offers?.length || 0,
            active: offers?.filter(o => o.status === "active").length || 0,
            redeemed: offers?.filter(o => o.status === "redeemed").length || 0,
            expired: offers?.filter(o => o.status === "expired").length || 0,
            revoked: offers?.filter(o => o.status === "revoked").length || 0,
        };

        return NextResponse.json({ success: true, config: config || { id: "global", ...DEFAULT_DISCOUNT_CONFIG }, offers: offersWithNames, stats, users: users || [] });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json();
        const action = body.action;

        if (action === "save_config") {
            const c = body.config || {};
            // Validatsiya / xavfsiz chegaralar
            const min = clampInt(c.min_percent, 0, 90, 3);
            const max = clampInt(c.max_percent, 0, 90, 10);
            const payload = {
                enabled: !!c.enabled,
                min_percent: Math.min(min, max),
                max_percent: Math.max(min, max),
                intent_threshold: clampNum(c.intent_threshold, 0, 1, 0.45),
                offer_ttl_hours: clampInt(c.offer_ttl_hours, 1, 720, 48),
                cooldown_hours: clampInt(c.cooldown_hours, 0, 2160, 168),
                max_active_offers_per_user: clampInt(c.max_active_offers_per_user, 1, 50, 3),
                excluded_product_ids: Array.isArray(c.excluded_product_ids) ? c.excluded_product_ids.map(String) : [],
                excluded_category_ids: Array.isArray(c.excluded_category_ids) ? c.excluded_category_ids.map(String) : [],
                updated_at: new Date().toISOString(),
            };
            const { error } = await supabaseAdmin
                .from("smart_discount_config").update(payload).eq("id", "global");
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        if (action === "create_manual_offer") {
            const userId = String(body.user_identifier || "").trim();
            const productId = String(body.product_id || "").trim();
            const percent = clampInt(body.percent, 1, 90, 0);
            if (!userId || !productId) return NextResponse.json({ error: "user_identifier va product_id shart" }, { status: 400 });
            if (percent <= 0) return NextResponse.json({ error: "Foiz 1..90 oralig'ida bo'lishi kerak" }, { status: 400 });

            // Doimiy yoki vaqtli
            const permanent = !!body.permanent;
            let expiresAt: string | null = null;
            if (!permanent) {
                const d = new Date(body.expires_at);
                if (isNaN(d.getTime()) || d.getTime() <= Date.now())
                    return NextResponse.json({ error: "Tugash sanasi kelajakda bo'lishi kerak" }, { status: 400 });
                expiresAt = d.toISOString();
            }

            // Shu user×mahsulot uchun mavjud aktiv takliflarni almashtiramiz (bittadan ortiq bo'lmasin)
            await supabaseAdmin.from("smart_discount_offers")
                .update({ status: "revoked", revoked_by: "admin" })
                .eq("user_identifier", userId).eq("product_id", productId).eq("status", "active");

            const { error } = await supabaseAdmin.from("smart_discount_offers").insert({
                user_identifier: userId,
                product_id: productId,
                percent,
                intent_score: 0,
                signals: { manual: true },
                reason_uz: body.reason_uz || "Siz uchun shaxsiy chegirma",
                reason_ru: body.reason_ru || "Персональная скидка для вас",
                status: "active",
                source: "manual",
                created_by: "admin",
                expires_at: expiresAt,
            });
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        if (action === "delete_offer") {
            const offerId = String(body.offerId || "");
            if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });
            const { error } = await supabaseAdmin.from("smart_discount_offers").delete().eq("id", offerId);
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        if (action === "revoke_offer") {
            const offerId = String(body.offerId || "");
            if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });
            const { error } = await supabaseAdmin
                .from("smart_discount_offers")
                .update({ status: "revoked", revoked_by: "admin" })
                .eq("id", offerId)
                .eq("status", "active");
            if (error) throw error;
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

function clampInt(v: any, lo: number, hi: number, def: number): number {
    const n = Math.round(Number(v));
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}
function clampNum(v: any, lo: number, hi: number, def: number): number {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(lo, Math.min(hi, n));
}
