import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProductSlug } from "@/lib/slugify";

export default async function ReferralRedirect({ params }: { params: { slug: string, lang: string } }) {
    const { slug, lang } = params;

    // Standart manzil — havola topilmasa shu yerga
    let target = `/${lang}`;

    try {
        const { data: link } = await supabaseAdmin
            .from("affiliate_links")
            .select("id, product_id, clicks")
            .eq("slug", slug)
            .single();

        if (link) {
            // Klik hisoblagichni oshirish (xato bo'lsa ham redirect davom etadi)
            await supabaseAdmin
                .from("affiliate_links")
                .update({ clicks: (link.clicks || 0) + 1 })
                .eq("id", link.id);

            // Mijozni to'g'ridan-to'g'ri SEO slug (canonical) sahifasiga yuboramiz,
            // UUID emas — tez (pre-rendered) va to'g'ri URL. ?ref tracking saqlanadi.
            const { data: prod } = await supabaseAdmin
                .from("products")
                .select("id, article, name, name_uz, name_ru")
                .eq("id", link.product_id)
                .single();

            const productPath = prod ? getProductSlug(prod, lang) : link.product_id;
            target = `/${lang}/products/${productPath}?ref=${slug}`;
        }
    } catch (e) {
        // DB xatosi — target bosh sahifa bo'lib qoladi
    }

    // MUHIM: redirect() NEXT_REDIRECT exception otadi, shuning uchun
    // u try/catch TASHQARISIDA bo'lishi shart (aks holda catch ushlab,
    // foydalanuvchini noto'g'ri joyga yuboradi).
    redirect(target);
}
