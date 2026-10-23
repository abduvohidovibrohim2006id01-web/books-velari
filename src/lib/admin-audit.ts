import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { getAdminSecret } from "@/lib/secrets";

/**
 * Admin amallari jurnali (admin_audit_logs): kim, qachon, nima.
 * Jurnalga yozishdagi xato asosiy amalni TO'XTATMAYDI.
 */

type ReqLike = { headers: { get(name: string): string | null } };

/** So'rov kimdan: admin_token (admin:<sub>), x-admin-secret (service) yoki noma'lum. */
export async function getAdminActor(req: ReqLike & { cookies?: { get(name: string): { value: string } | undefined } }): Promise<string> {
    try {
        const secret = getAdminSecret();
        const cookieToken = req.cookies?.get("admin_token")?.value
            || /(?:^|;\s*)admin_token=([^;]+)/.exec(req.headers.get("cookie") || "")?.[1];
        if (cookieToken) {
            const payload: any = await verifyJwt(cookieToken, secret);
            if (payload?.role === "admin") return `admin:${payload.sub ?? "unknown"}`;
        }
        const headerSecret = req.headers.get("x-admin-secret") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
        if (headerSecret && headerSecret === secret) return "service";
    } catch { /* noma'lum */ }
    return "unknown";
}

export async function logAdminAction(entry: { actor: string; action: string; target: Record<string, unknown>; req?: ReqLike }) {
    try {
        await supabaseAdmin.from("admin_audit_logs").insert({
            admin_phone: entry.actor,
            action: entry.action,
            target: JSON.stringify(entry.target),
            ip_address: entry.req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
            user_agent: entry.req?.headers.get("user-agent")?.slice(0, 300) || null,
        });
    } catch (e) {
        console.error("admin_audit_logs insert failed:", e);
    }
}

/** Buyurtma holati o'zgarishi: eski -> yangi (faqat haqiqatan o'zgarganda). */
export async function logOrderStatusChange(opts: {
    actor: string; orderId: string; oldStatus: string | null | undefined; newStatus: string; source: string; req?: ReqLike;
}) {
    if ((opts.oldStatus ?? null) === opts.newStatus) return;
    await logAdminAction({
        actor: opts.actor,
        action: "ORDER_STATUS_CHANGE",
        target: { order_id: opts.orderId, old_status: opts.oldStatus ?? null, new_status: opts.newStatus, source: opts.source },
        req: opts.req,
    });
}
