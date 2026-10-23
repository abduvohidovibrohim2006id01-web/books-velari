import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

export async function POST() {
    try {
        // Nuqtaviy xavfsiz kesh yangilash: butun sayt layout'ini emas, asosiy o'zak sahifalarni yangilaymiz
        revalidatePath("/uz");
        revalidatePath("/ru");
        revalidatePath("/uz/catalog");
        revalidatePath("/ru/catalog");
        revalidatePath("/uz/blog");
        revalidatePath("/ru/blog");
        revalidatePath("/[lang]/products/[id]", "page");
        revalidatePath("/sitemap.xml");
        revalidatePath("/sitemap/[id]", "page");
        revalidatePath("/image-sitemap.xml");
        revalidatePath("/image-sitemap/[id]", "page");

        return NextResponse.json({ success: true, message: "Sayt keshi xavfsiz yangilandi" });
    } catch (error: any) {
        console.error("Revalidate All error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
