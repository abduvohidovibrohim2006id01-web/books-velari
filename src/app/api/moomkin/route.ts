import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

/**
 * Moomkin.uz Integration API — Backend only
 * Credentials are NEVER sent to the client.
 * Token is cached in-memory and auto-refreshed on 401.
 *
 * GET  /api/moomkin?action=registry               → { supabase_id: {moomkin_id, price, ...} }
 * GET  /api/moomkin?action=product&id={moomkin_id} → Moomkin product detail
 * POST /api/moomkin  { action:"integrate", supabase_id, product }  → integrate new product
 * PATCH /api/moomkin { action:"update", moomkin_id, fields }        → update existing product
 */

// ──────────────────────────────────────────────────────────────────────────────
// Credentials & Config (backend only, never exposed to client)
// ──────────────────────────────────────────────────────────────────────────────
const MOOMKIN_PHONE = "+998950821188";
const MOOMKIN_PASSWORD = "Abdulaziz2244";
const MOOMKIN_API = "https://api.moomkin.uz/api/v1";
const MOOMKIN_COMPANY_ID = 1673;

// Registry file path (in /public so it's always available)
const REGISTRY_PATH = path.join(process.cwd(), "public", "moomkin-registry.json");

// ──────────────────────────────────────────────────────────────────────────────
// Token management (in-memory cache, auto-refresh)
// ──────────────────────────────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiry: number = 0; // Unix ms

async function getToken(): Promise<string> {
    if (cachedToken && Date.now() < tokenExpiry - 60_000) {
        return cachedToken;
    }

    const res = await fetch(`${MOOMKIN_API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: MOOMKIN_PHONE, password: MOOMKIN_PASSWORD }),
    });

    if (!res.ok) {
        const body = await res.text();
        throw new Error(`Moomkin login failed: ${res.status} ${body}`);
    }

    const data = await res.json();
    cachedToken = (data.data?.access_token || data.access_token) as string;
    tokenExpiry = Date.now() + 23.5 * 60 * 60 * 1000;
    return cachedToken!;
}

async function moomkinFetch(
    endpoint: string,
    options: RequestInit = {},
    retry = true
): Promise<Response> {
    const token = await getToken();
    const res = await fetch(`${MOOMKIN_API}${endpoint}`, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
        },
    });

    if (res.status === 401 && retry) {
        cachedToken = null;
        tokenExpiry = 0;
        return moomkinFetch(endpoint, options, false);
    }

    return res;
}

// ──────────────────────────────────────────────────────────────────────────────
// Registry helpers
// ──────────────────────────────────────────────────────────────────────────────
function loadRegistry(): Record<string, any> {
    try {
        const raw = fs.readFileSync(REGISTRY_PATH, "utf-8");
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

function saveRegistry(data: Record<string, any>): void {
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2), "utf-8");
}

const CATEGORY_MAP: Record<string | number, number> = {
    406: 4,
    401: 5,
    403: 4,
    404: 4,
    402: 5,
    405: 5,
    303: 4,
    1785864351977: 23,
    1780990168256771: 4,
};

// ──────────────────────────────────────────────────────────────────────────────
// Upload image from URL to Moomkin
// ──────────────────────────────────────────────────────────────────────────────
async function uploadImageFromUrl(imageUrl: string): Promise<number | null> {
    try {
        const imgRes = await fetch(imageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!imgRes.ok) return null;

        const arrayBuffer = await imgRes.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const boundary = "----FormBoundary" + Math.random().toString(36).slice(2);
        const formParts = [
            `--${boundary}\r\n`,
            `Content-Disposition: form-data; name="file"; filename="product.jpg"\r\n`,
            `Content-Type: image/jpeg\r\n\r\n`,
        ];
        const header = Buffer.from(formParts.join(""));
        const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
        const body = Buffer.concat([header, buffer, footer]);

        const uploadRes = await moomkinFetch("/admin/attachment", {
            method: "POST",
            headers: {
                "Content-Type": `multipart/form-data; boundary=${boundary}`,
                "Content-Length": String(body.length),
            },
            body,
        });

        if (!uploadRes.ok) return null;
        const uploadData = await uploadRes.json();
        return (uploadData.data?.id || uploadData.id) as number;
    } catch {
        return null;
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// GET handler
// ──────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "check" || action === "ping") {
        try {
            const res = await moomkinFetch(`/admin/company/${MOOMKIN_COMPANY_ID}`);
            const data = await res.json();
            return NextResponse.json({
                success: true,
                connected: res.ok,
                status: res.status,
                company: data.data?.name || data.data || "VELARI",
                company_id: MOOMKIN_COMPANY_ID,
            });
        } catch (err: any) {
            return NextResponse.json({ success: false, error: err.message }, { status: 500 });
        }
    }

    if (action === "registry") {
        const registry = loadRegistry();
        const simplified: Record<string, { moomkin_id: number; price: number; name_uz: string; name_ru: string }> = {};
        for (const [key, val] of Object.entries(registry)) {
            simplified[key] = {
                moomkin_id: val.moomkin_id,
                price: val.price,
                name_uz: val.name_uz || "",
                name_ru: val.name_ru || "",
            };
        }
        return NextResponse.json(simplified);
    }

    if (action === "product") {
        const moomkinId = searchParams.get("id");
        if (!moomkinId) {
            return NextResponse.json({ error: "Missing id" }, { status: 400 });
        }
        try {
            const res = await moomkinFetch(`/admin/product/${moomkinId}`);
            if (!res.ok) {
                return NextResponse.json({ error: `Moomkin error: ${res.status}` }, { status: res.status });
            }
            const data = await res.json();
            return NextResponse.json(data.data || data);
        } catch (err: any) {
            return NextResponse.json({ error: err.message }, { status: 500 });
        }
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

// ──────────────────────────────────────────────────────────────────────────────
// POST handler — Integrate new product
// ──────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, supabase_id, product } = body;

        if (action !== "integrate") {
            return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }
        if (!supabase_id || !product) {
            return NextResponse.json({ error: "Missing supabase_id or product" }, { status: 400 });
        }

        const registry = loadRegistry();
        if (registry[supabase_id]) {
            return NextResponse.json({
                success: true,
                moomkin_id: registry[supabase_id].moomkin_id,
                already_exists: true,
            });
        }

        const images: string[] = product.images || (product.image ? [product.image] : []);
        const attachmentIds: number[] = [];
        for (const imgUrl of images.slice(0, 4)) {
            const attachId = await uploadImageFromUrl(imgUrl);
            if (attachId) attachmentIds.push(attachId);
        }

        const moomkinPrice = Math.round((product.price || 0) * 1.1);
        const moomkinCategoryId = CATEGORY_MAP[product.category_id] || CATEGORY_MAP[product.category] || 4;

        const productPayload: any = {
            name: { uz: product.name_uz || product.name || "", ru: product.name_ru || product.name || "" },
            description: { uz: product.description_uz || "", ru: product.description_ru || "" },
            price: moomkinPrice,
            company_id: MOOMKIN_COMPANY_ID,
            category_id: moomkinCategoryId,
        };

        if (attachmentIds.length > 0) {
            productPayload.attachments = attachmentIds.map((id, idx) => ({
                id,
                is_main: idx === 0,
                order: idx,
            }));
        }

        const createRes = await moomkinFetch("/admin/product", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(productPayload),
        });

        if (!createRes.ok) {
            const errBody = await createRes.text();
            return NextResponse.json({ error: `Moomkin create failed: ${createRes.status} ${errBody}` }, { status: 500 });
        }

        const created = await createRes.json();
        const moomkinId = (created.data?.id || created.id) as number;

        registry[supabase_id] = {
            supabase_id,
            moomkin_id: moomkinId,
            name_uz: product.name_uz || product.name || "",
            name_ru: product.name_ru || "",
            price: moomkinPrice,
            base_price: product.price,
            markup_pct: 10,
            attachments_count: attachmentIds.length,
            uploaded_at: new Date().toISOString(),
        };
        saveRegistry(registry);

        return NextResponse.json({ success: true, moomkin_id: moomkinId });
    } catch (err: any) {
        console.error("Moomkin integrate error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

// ──────────────────────────────────────────────────────────────────────────────
// PATCH handler — Update Moomkin product
// ──────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { action, moomkin_id, supabase_id, fields } = body;

        if (action !== "update") {
            return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }
        if (!moomkin_id || !fields) {
            return NextResponse.json({ error: "Missing moomkin_id or fields" }, { status: 400 });
        }

        const updateRes = await moomkinFetch(`/admin/product/${moomkin_id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(fields),
        });

        if (!updateRes.ok) {
            const errBody = await updateRes.text();
            return NextResponse.json({ error: `Moomkin update failed: ${updateRes.status} ${errBody}` }, { status: 500 });
        }

        if (supabase_id && fields.price) {
            const registry = loadRegistry();
            if (registry[supabase_id]) {
                registry[supabase_id].price = fields.price;
                registry[supabase_id].updated_at = new Date().toISOString();
                saveRegistry(registry);
            }
        }

        const updated = await updateRes.json();
        return NextResponse.json({ success: true, data: updated.data || updated });
    } catch (err: any) {
        console.error("Moomkin update error:", err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
