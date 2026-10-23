// 🔒 SERVER ONLY: Bu fayl FAQAT server-side (Server Components, API routes) da ishlatiladi.
// Client Component larda IMPORT QILMANG!
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ShopSettings, DEFAULT_SHOP_SETTINGS } from "@/lib/shop-settings";

let cachedSettings: { data: ShopSettings; expiresAt: number } | null = null;
const SETTINGS_TTL_MS = 60 * 1000; // 60 soniya

/**
 * Server tomonida do'kon sozlamalarini DB dan xavfsiz o'qish (Next.js SSR / API)
 */
export async function getShopSettingsServer(): Promise<ShopSettings> {
    if (cachedSettings && cachedSettings.expiresAt > Date.now()) {
        return { ...cachedSettings.data };
    }

    try {
        const { data, error } = await supabaseAdmin
            .from("settings")
            .select("data")
            .eq("id", "shop")
            .maybeSingle();

        if (error || !data?.data) {
            return { ...DEFAULT_SHOP_SETTINGS };
        }

        const resolved: ShopSettings = {
            ...DEFAULT_SHOP_SETTINGS,
            ...data.data,
        };

        cachedSettings = {
            data: resolved,
            expiresAt: Date.now() + SETTINGS_TTL_MS,
        };

        return { ...resolved };
    } catch {
        return { ...DEFAULT_SHOP_SETTINGS };
    }
}
