import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { revalidatePath } from "next/cache";
import { sendOrderStatusNotification } from "@/lib/telegram";
import { getProductSlug } from "@/lib/slugify";
import { getAdminActor, logOrderStatusChange } from "@/lib/admin-audit";

function toArray(value: any): any[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
}

async function getProductSnapshot(matchConfig: any, inConfig: any, payload: any) {
    try {
        let query: any = supabaseAdmin
            .from("products")
            .select("id, article, name, name_uz, name_ru");

        if (matchConfig) {
            query = query.eq(matchConfig.column, matchConfig.value);
        } else if (inConfig) {
            query = query.in(inConfig.column, inConfig.values);
        } else {
            const ids = toArray(payload).map((item) => item?.id).filter(Boolean);
            if (!ids.length) return [];
            query = query.in("id", ids);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error("Product cache snapshot error:", error);
        return [];
    }
}

function performSmartRevalidation(table: string, products: any[] = []) {
    try {
        if (table === "products") {
            const slugs = new Set<string>();
            for (const product of products) {
                if (!product?.id && !product?.article) continue;
                slugs.add(`/uz/products/${getProductSlug(product, "uz")}`);
                slugs.add(`/ru/products/${getProductSlug(product, "ru")}`);
            }
            slugs.forEach((path) => {
                revalidatePath(path);
            });
            revalidatePath("/uz/catalog");
            revalidatePath("/ru/catalog");
            revalidatePath("/uz");
            revalidatePath("/ru");
            revalidatePath("/sitemap.xml");
            revalidatePath("/sitemap/[id]", "page");
            revalidatePath("/image-sitemap.xml");
            revalidatePath("/image-sitemap/[id]", "page");
            revalidatePath("/api/google-feed");
        } else if (table === "categories") {
            revalidatePath("/uz/catalog");
            revalidatePath("/ru/catalog");
            revalidatePath("/uz");
            revalidatePath("/ru");
            revalidatePath("/sitemap.xml");
            revalidatePath("/sitemap/[id]", "page");
        } else if (table === "banners" || table === "site_settings" || table === "settings") {
            revalidatePath("/uz");
            revalidatePath("/ru");
            revalidatePath("/uz/about");
            revalidatePath("/ru/about");
            revalidatePath("/uz/return-policy");
            revalidatePath("/ru/return-policy");
            revalidatePath("/api/shop-settings");
        }
    } catch (e) {
        console.error("Smart revalidation error:", e);
    }
}


/**
 * Universal Admin CRUD API
 * supabaseAdmin orqali RLS ni chetlab o'tib, barcha jadvallar uchun umumiy yozish operatsiyalari.
 */

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

export async function POST(req: NextRequest) {
    if (!(await verifyAdmin(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { table, action, payload, matchConfig, inConfig, onConflict, fn, args, orderBy, limit } = await req.json();

        // RPC chaqiruvi (admin RLS chetlab o'tib funksiya bajaradi, masalan hamyon balansini o'zgartirish)
        if (action === "rpc") {
            if (!fn) return NextResponse.json({ error: "Function name (fn) is required" }, { status: 400 });
            const { data, error } = await supabaseAdmin.rpc(fn, args || {});
            if (error) throw error;
            return NextResponse.json({ success: true, data });
        }

        if (!table) return NextResponse.json({ error: "Table is required" }, { status: 400 });

        let query = supabaseAdmin.from(table);
        const productSnapshot = table === "products" && ["update", "upsert", "delete"].includes(action)
            ? await getProductSnapshot(matchConfig, inConfig, payload)
            : [];

        if (action === "select") {
            // RLS chetlab o'tib o'qish (admin sahifalarda sozlamalarni yuklash uchun)
            const selectOpts = payload?.count ? { count: payload.count } : undefined;
            let selectQuery: any = query.select(payload?.columns || "*", selectOpts);
            if (matchConfig) selectQuery = selectQuery.eq(matchConfig.column, matchConfig.value);
            if (inConfig) selectQuery = selectQuery.in(inConfig.column, inConfig.values);
            if (orderBy) selectQuery = selectQuery.order(orderBy.column, { ascending: orderBy.ascending ?? true });
            if (limit) selectQuery = selectQuery.limit(limit);
            const { data, count, error } = payload?.single
                ? await selectQuery.maybeSingle()
                : await selectQuery;
            if (error) throw error;
            return NextResponse.json({ success: true, data, count });
        }
        else if (action === "insert") {
            const { data, error } = await query.insert(payload).select();
            if (error) throw error;
            
            performSmartRevalidation(table, toArray(data));
            
            return NextResponse.json({ success: true, data });
        } 
        else if (action === "update") {
            if (!matchConfig && !inConfig) return NextResponse.json({ error: "Match config required for update" }, { status: 400 });
            
            // Buyurtma holati o'zgarsa — jurnal uchun eski holatlar oldindan olinadi
            let ordersBefore: { id: string; status: string | null }[] = [];
            if (table === "orders" && payload?.status) {
                let beforeQuery: any = supabaseAdmin.from("orders").select("id, status");
                if (matchConfig) beforeQuery = beforeQuery.eq(matchConfig.column, matchConfig.value);
                if (inConfig) beforeQuery = beforeQuery.in(inConfig.column, inConfig.values);
                const { data } = await beforeQuery;
                ordersBefore = data || [];
            }

            let updateQuery: any = query.update(payload);
            
            if (matchConfig) {
                // simple equal match: { column: "id", value: "123" }
                updateQuery = updateQuery.eq(matchConfig.column, matchConfig.value);
            }
            if (inConfig) {
                // in match: { column: "id", values: ["123", "456"] }
                updateQuery = updateQuery.in(inConfig.column, inConfig.values);
            }

            const { data, error } = await updateQuery.select();
            if (error) throw error;

            if (ordersBefore.length) {
                const actor = await getAdminActor(req);
                for (const o of ordersBefore) {
                    await logOrderStatusChange({ actor, orderId: o.id, oldStatus: o.status, newStatus: payload.status, source: "admin/crud", req });
                }
            }

            performSmartRevalidation(table, [...productSnapshot, ...toArray(data)]);

            // Mijozga Telegram orqali xabar yuborish (Buyurtma holati o'zgarganda)
            if (table === "orders" && payload.status) {
                let orderIdToNotify = null;
                if (matchConfig && matchConfig.column === 'id') {
                    orderIdToNotify = matchConfig.value;
                } else if (data && data.length > 0) {
                    orderIdToNotify = data[0].id;
                }
                
                if (orderIdToNotify) {
                    sendOrderStatusNotification(orderIdToNotify, payload.status);
                }

                // Handle Affiliate Rewards (MLM)
                const updatedOrderIds: string[] = (data && Array.isArray(data) ? data : ordersBefore)
                    .map((o: any) => String(o.id))
                    .filter(Boolean);

                if (payload.status === "Yetkazildi") {
                    const { distributeCommissions } = await import("@/lib/mlm-utils");
                    for (const orderId of updatedOrderIds) {
                        distributeCommissions(orderId).catch(err => console.error("MLM Distribute Error (CRUD):", err));
                    }
                } else if (payload.status === "Bekor qilingan") {
                    for (const orderId of updatedOrderIds) {
                        await supabaseAdmin
                            .from("affiliate_transactions")
                            .update({ status: "rejected" })
                            .eq("order_id", orderId)
                            .eq("status", "pending");
                    }
                }
            }
            
            return NextResponse.json({ success: true, data });
        }
        else if (action === "upsert") {
            let upsertQuery = query.upsert(payload, onConflict ? { onConflict } : undefined);
            const { data, error } = await upsertQuery.select();
            if (error) throw error;
            
            performSmartRevalidation(table, [...productSnapshot, ...toArray(data)]);
            
            return NextResponse.json({ success: true, data });
        }
        else if (action === "delete") {
            if (!matchConfig && !inConfig) return NextResponse.json({ error: "Match config required for delete" }, { status: 400 });
            
            let deleteQuery: any = query.delete();
            if (matchConfig) {
                deleteQuery = deleteQuery.eq(matchConfig.column, matchConfig.value);
            }
            if (inConfig) {
                deleteQuery = deleteQuery.in(inConfig.column, inConfig.values);
            }

            const { data, error } = await deleteQuery;
            if (error) throw error;
            
            performSmartRevalidation(table, productSnapshot);
            
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        console.error(`Admin CRUD POST error:`, error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
