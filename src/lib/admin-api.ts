/**
 * Admin client helper — barcha admin o'qish/yozish operatsiyalarini
 * /api/admin/crud orqali supabaseAdmin (service role) bilan bajaradi.
 * Bu RLS ni chetlab o'tadi va xatolarni jimgina yutib yubormaydi.
 */

type OrderBy = { column: string; ascending?: boolean };

async function call(body: Record<string, unknown>) {
    const res = await fetch("/api/admin/crud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(json?.error || `Admin API xatolik (${res.status})`);
    }
    return json;
}

const cacheStore = new Map<string, { data: any; expiresAt: number }>();
const CACHEABLE_TABLES = new Set(["categories", "brands", "warehouses", "featured_categories", "settings", "site_settings"]);
const CACHE_TTL_MS = 60 * 1000; // 60 soniya

export function clearAdminCache(table?: string) {
    if (table) {
        const toDelete: string[] = [];
        cacheStore.forEach((_, key) => {
            if (key.startsWith(`${table}:`)) {
                toDelete.push(key);
            }
        });
        toDelete.forEach(k => cacheStore.delete(k));
    } else {
        cacheStore.clear();
    }
}

export async function adminSelect<T = any>(
    table: string,
    opts: {
        columns?: string;
        match?: { column: string; value: any };
        in?: { column: string; values: any[] };
        orderBy?: OrderBy;
        limit?: number;
        single?: boolean;
        skipCache?: boolean;
        count?: "exact" | "planned" | "estimated";
    } = {}
): Promise<T> {
    const isCacheable = CACHEABLE_TABLES.has(table) && !opts.skipCache;
    const cacheKey = isCacheable ? `${table}:${JSON.stringify(opts)}` : null;

    if (cacheKey && cacheStore.has(cacheKey)) {
        const cached = cacheStore.get(cacheKey)!;
        if (Date.now() < cached.expiresAt) {
            return cached.data as T;
        }
        cacheStore.delete(cacheKey);
    }

    const json = await call({
        table,
        action: "select",
        payload: { columns: opts.columns, single: opts.single, count: opts.count },
        matchConfig: opts.match,
        inConfig: opts.in,
        orderBy: opts.orderBy,
        limit: opts.limit,
    });

    const result = json.data as T;

    if (cacheKey && result) {
        cacheStore.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }

    return result;
}

export async function adminCount(
    table: string,
    match?: { column: string; value: any }
): Promise<number> {
    const json = await call({
        table,
        action: "select",
        payload: { columns: "id", count: "exact" },
        matchConfig: match,
        limit: 1,
    });
    return json.count ?? (Array.isArray(json.data) ? json.data.length : 0);
}

export async function adminInsert<T = any>(table: string, payload: any): Promise<T> {
    clearAdminCache(table);
    const json = await call({ table, action: "insert", payload });
    return json.data as T;
}

export async function adminUpdate<T = any>(
    table: string,
    payload: any,
    match: { column: string; value: any }
): Promise<T> {
    clearAdminCache(table);
    const json = await call({ table, action: "update", payload, matchConfig: match });
    return json.data as T;
}

export async function adminUpsert<T = any>(table: string, payload: any, onConflict?: string): Promise<T> {
    clearAdminCache(table);
    const json = await call({ table, action: "upsert", payload, onConflict });
    return json.data as T;
}

export async function adminDelete(table: string, match: { column: string; value: any }): Promise<void> {
    clearAdminCache(table);
    await call({ table, action: "delete", matchConfig: match });
}

export async function adminRpc<T = any>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
    const json = await call({ action: "rpc", fn, args });
    return json.data as T;
}

export const adminApi = {
    categories: {
        getAll: (opts?: { skipCache?: boolean }) =>
            adminSelect<any[]>("categories", {
                columns: "id, name, name_uz, name_ru, parent_id, image, icon, color, is_deleted",
                match: { column: "is_deleted", value: false },
                orderBy: { column: "name", ascending: true },
                skipCache: opts?.skipCache,
            }),
    },
    brands: {
        getAll: (opts?: { skipCache?: boolean }) =>
            adminSelect<any[]>("brands", {
                columns: "id, name, logo, is_deleted",
                match: { column: "is_deleted", value: false },
                orderBy: { column: "name", ascending: true },
                skipCache: opts?.skipCache,
            }),
    },
    warehouses: {
        getAll: (opts?: { skipCache?: boolean }) =>
            adminSelect<any[]>("warehouses", {
                orderBy: { column: "name", ascending: true },
                skipCache: opts?.skipCache,
            }),
    },
    settings: {
        get: async (id: string, opts?: { skipCache?: boolean }) => {
            const row = await adminSelect<any>("settings", {
                columns: "data",
                match: { column: "id", value: id },
                single: true,
                skipCache: opts?.skipCache,
            });
            return row?.data ?? null;
        },
        save: async (id: string, data: any) => {
            clearAdminCache("settings");
            return adminUpsert("settings", { id, data });
        },
    },
    siteSettings: {
        get: async (key: string, opts?: { skipCache?: boolean }) => {
            const row = await adminSelect<any>("site_settings", {
                columns: "value",
                match: { column: "key", value: key },
                single: true,
                skipCache: opts?.skipCache,
            });
            return row?.value ?? null;
        },
        save: async (key: string, value: any) => {
            clearAdminCache("site_settings");
            return adminUpsert("site_settings", { key, value }, "key");
        },
    },
};

