import { NextResponse } from "next/server";
import { getShopSettingsServer } from "@/lib/shop-settings.server";

export const revalidate = 300; // 5 daqiqalik edge kesh

export async function GET() {
    try {
        const settings = await getShopSettingsServer();
        return NextResponse.json(
            { success: true, settings },
            {
                headers: {
                    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
                },
            }
        );
    } catch {
        const { DEFAULT_SHOP_SETTINGS } = await import("@/lib/shop-settings");
        return NextResponse.json({ success: true, settings: DEFAULT_SHOP_SETTINGS });
    }
}
