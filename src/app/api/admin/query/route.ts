import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminFresh } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";

export const dynamic = "force-dynamic";

/**
 * Admin o'qish so'rovlari (src/lib/admin-query.ts dagi adminFrom zanjiri).
 * Zanjir service role bilan qayta bajariladi — faqat SELECT va filtr/tartib metodlari.
 * Middleware /api/admin/* ni allaqachon himoyalaydi; bu yerda ham admin tokeni tekshiriladi.
 */

const ALLOWED_METHODS = new Set([
    "select", "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains",
    "not", "or", "filter", "match", "order", "range", "limit", "single", "maybeSingle",
]);

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) {
        return NextResponse.json({ data: null, count: null, error: { message: "Unauthorized" } }, { status: 401 });
    }

    try {
        const { table, steps } = await req.json();

        if (typeof table !== "string" || !/^[a-z_][a-z0-9_]*$/.test(table)) {
            return NextResponse.json({ data: null, count: null, error: { message: "Invalid table" } }, { status: 400 });
        }
        if (!Array.isArray(steps) || steps.length === 0 || steps[0]?.m !== "select") {
            return NextResponse.json({ data: null, count: null, error: { message: "Query must start with select()" } }, { status: 400 });
        }
        for (const step of steps) {
            if (!step || !ALLOWED_METHODS.has(step.m) || !Array.isArray(step.a)) {
                return NextResponse.json({ data: null, count: null, error: { message: `Method not allowed: ${step?.m}` } }, { status: 400 });
            }
        }
        if (steps.filter((s: any) => s.m === "select").length > 1) {
            return NextResponse.json({ data: null, count: null, error: { message: "Only one select() allowed" } }, { status: 400 });
        }

        // Fresh (no-store) mijoz: admin har doim eng oxirgi holatni ko'rsin (Next fetch keshi emas)
        let query: any = supabaseAdminFresh.from(table);
        for (const { m, a } of steps) {
            query = query[m](...a);
        }

        const { data, count, error } = await query;
        return NextResponse.json({
            data: data ?? null,
            count: count ?? null,
            error: error ? { message: error.message, code: error.code, details: error.details, hint: error.hint } : null,
        });
    } catch (err: any) {
        console.error("Admin query error:", err);
        return NextResponse.json({ data: null, count: null, error: { message: err?.message || "Internal server error" } }, { status: 500 });
    }
}
