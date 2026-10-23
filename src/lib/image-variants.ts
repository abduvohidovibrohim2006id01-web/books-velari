/**
 * Rasm variantlari (sharp) — /api/upload (mahsulot) va /api/admin/upload (stories, kategoriya, banner...)
 * hamda scripts/backfill-image-variants.mjs uchun YAGONA jarayon. Sozlamalar /api/upload dagi mavjud
 * jarayondan ko'chirilgan (o'zgartirilmagan).
 *
 *  main    — 1080x1440 ichida, AVIF (asl fayl o'rniga saqlanadigan)
 *  blur    — 20x20 WEBP data URL (placeholder)
 *  thumb   — 360x480 cover, WEBP q40 (aylana / eng kichik)
 *  xs/md/lg— kengligi 640/828/1080, WEBP
 * Tashqi importi faqat sharp — Node skriptlaridan ham ishlatiladi.
 */
import sharp from "sharp";

export type ImageVariants = {
    main: Buffer;          // image/avif
    blurDataURL: string;
    thumb: Buffer;         // image/webp
    xs: Buffer;            // image/webp
    md: Buffer;            // image/webp
    lg: Buffer;            // image/webp
};

/** Rasm turi variant yaratishga yaroqlimi (gif/svg/animatsiya — yo'q). */
export function isVariantableImage(mime: string): boolean {
    return mime.startsWith("image/") && !mime.includes("gif") && !mime.includes("svg") && !mime.includes("dynamic");
}

export async function makeImageVariants(source: Buffer): Promise<ImageVariants> {
    const image = sharp(source);

    const blurBuffer = await image.clone()
        .resize(20, 20, { fit: "cover" })
        .blur(5)
        .toFormat("webp", { quality: 20 })
        .toBuffer();

    const main = await image.clone()
        .resize(1080, 1440, { fit: "inside", withoutEnlargement: true })
        .toFormat("avif", { quality: 75, effort: 3 })
        .toBuffer();

    const thumb = await image.clone()
        .resize(360, 480, { fit: "cover" })
        .toFormat("webp", { quality: 40, effort: 6, smartSubsample: true })
        .toBuffer();

    const [xs, md, lg] = await Promise.all([
        image.clone().resize({ width: 640, withoutEnlargement: true }).toFormat("webp", { quality: 78, effort: 4 }).toBuffer(),
        image.clone().resize({ width: 828, withoutEnlargement: true }).toFormat("webp", { quality: 80, effort: 4 }).toBuffer(),
        image.clone().resize({ width: 1080, withoutEnlargement: true }).toFormat("webp", { quality: 82, effort: 4 }).toBuffer(),
    ]);

    return { main, blurDataURL: `data:image/webp;base64,${blurBuffer.toString("base64")}`, thumb, xs, md, lg };
}
