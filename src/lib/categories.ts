import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCategorySlug } from "@/lib/slugify";

export type CatalogCategory = {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    parentId?: string;
    image?: string;
    image_meta?: any;
};

/** Katalog uchun barcha faol kategoriyalar (SSR). catalog va catalog/[slug] ishlatadi. */
export async function getCatalogCategories(): Promise<CatalogCategory[]> {
    try {
        const { data, error } = await supabaseAdmin
            .from("categories")
            .select("id,name,name_uz,name_ru,parent_id,image,image_meta")
            .eq("is_deleted", false)
            .order("name");

        if (error) {
            console.error("getCatalogCategories: failed:", error.message);
            return [];
        }

        return (data || []).map((c) => ({
            id: c.id,
            name: c.name,
            name_uz: c.name_uz,
            name_ru: c.name_ru,
            parentId: c.parent_id,
            image: c.image,
            image_meta: c.image_meta || undefined,
        }));
    } catch (error) {
        console.error("getCatalogCategories error:", error);
        return [];
    }
}

/**
 * Toza slug'dan kategoriyani topadi (nom-slug taqqoslab, DB slug ustunisiz).
 * Avval joriy til, keyin ikkala tilda (til almashtirilganda eski havola ishlasin).
 */
export function resolveCategoryBySlug(
    categories: CatalogCategory[],
    slug: string,
    lang: string,
): CatalogCategory | null {
    const target = (slug || "").toLowerCase();
    if (!target) return null;
    let found = categories.find((c) => getCategorySlug(c, lang) === target);
    if (!found) {
        found = categories.find(
            (c) => getCategorySlug(c, "uz") === target || getCategorySlug(c, "ru") === target,
        );
    }
    return found || null;
}
