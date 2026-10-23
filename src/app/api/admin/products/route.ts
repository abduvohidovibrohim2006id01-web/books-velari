import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import { revalidatePath } from "next/cache";
import { getProductSlug } from "@/lib/slugify";

/**
 * Admin Products API — Trash, Restore, Delete operations
 * supabaseAdmin orqali RLS ni chetlab o'tadi
 */

async function verifyAdmin(req: NextRequest) {
    const adminToken = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET || !adminToken) return false;
    const payload = await verifyJwt(adminToken, ADMIN_SECRET);
    return payload && payload.role === "admin";
}

async function getProductSnapshot(ids: string[]) {
    if (!ids.length) return [];

    const { data, error } = await supabaseAdmin
        .from("products")
        .select("id, article, name, name_uz, name_ru")
        .in("id", ids);
    if (error) throw error;
    return data || [];
}

function revalidateProductCache(products: any[]) {
    const paths = new Set<string>();
    for (const product of products) {
        paths.add(`/uz/products/${getProductSlug(product, "uz")}`);
        paths.add(`/ru/products/${getProductSlug(product, "ru")}`);
    }
    paths.forEach((path) => revalidatePath(path));

    revalidatePath("/uz/catalog");
    revalidatePath("/ru/catalog");
    revalidatePath("/uz");
    revalidatePath("/ru");
    revalidatePath("/sitemap.xml");
    revalidatePath("/sitemap/[id]", "page");
    revalidatePath("/image-sitemap.xml");
    revalidatePath("/image-sitemap/[id]", "page");
    revalidatePath("/api/google-feed");
}

export async function PATCH(req: NextRequest) {
    if (!(await verifyAdmin(req))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { action, id, ids } = await req.json();
        const productSnapshot = await getProductSnapshot(id ? [id] : (ids || []));

        // Single product actions
        if (action === "move_to_trash" && id) {
            const { error } = await supabaseAdmin
                .from("products")
                .update({ is_deleted: true })
                .eq("id", id);
            if (error) throw error;
            revalidateProductCache(productSnapshot);
            return NextResponse.json({ success: true });
        }

        if (action === "restore" && id) {
            const { error } = await supabaseAdmin
                .from("products")
                .update({ is_deleted: false })
                .eq("id", id);
            if (error) throw error;
            revalidateProductCache(productSnapshot);
            return NextResponse.json({ success: true });
        }

        // Bulk actions
        if (action === "bulk_move_to_trash" && ids?.length > 0) {
            const { error } = await supabaseAdmin
                .from("products")
                .update({ is_deleted: true })
                .in("id", ids);
            if (error) throw error;
            revalidateProductCache(productSnapshot);
            return NextResponse.json({ success: true });
        }

        if (action === "bulk_restore" && ids?.length > 0) {
            const { error } = await supabaseAdmin
                .from("products")
                .update({ is_deleted: false })
                .in("id", ids);
            if (error) throw error;
            revalidateProductCache(productSnapshot);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        console.error("Admin Products PATCH error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    if (!(await verifyAdmin(req))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id, ids } = await req.json();
        const productSnapshot = await getProductSnapshot(id ? [id] : (ids || []));

        // Single permanent delete
        if (id) {
            const { error } = await supabaseAdmin
                .from("products")
                .delete()
                .eq("id", id);
            if (error) throw error;
            revalidateProductCache(productSnapshot);
            return NextResponse.json({ success: true });
        }

        // Bulk permanent delete
        if (ids?.length > 0) {
            const { error } = await supabaseAdmin
                .from("products")
                .delete()
                .in("id", ids);
            if (error) throw error;
            revalidateProductCache(productSnapshot);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "No id or ids provided" }, { status: 400 });
    } catch (error: any) {
        console.error("Admin Products DELETE error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
