import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt-utils";
import { makeImageVariants, isVariantableImage, type ImageVariants } from "@/lib/image-variants";
import { putObject } from "@/lib/s3-put";
import { getAdminSecret } from "@/lib/secrets";

export const maxDuration = 60; // Vercel: max 60s on Hobby, 300s on Pro

export async function POST(req: NextRequest) {
    // — Admin auth only —
    const adminToken  = req.cookies.get("admin_token")?.value;
    const ADMIN_SECRET = getAdminSecret();
    const payload = adminToken ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
    if (!payload) {
        return NextResponse.json({ error: "Admin ruxsati kerak" }, { status: 401 });
    }

    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ error: "FormData o'qib bo'lmadi" }, { status: 400 });
    }

    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Fayl yo'q" }, { status: 400 });

    // — Size limit: 300 MB —
    const MAX = 300 * 1024 * 1024;
    if (file.size > MAX) {
        return NextResponse.json({ error: `Fayl juda katta (Max: 300 MB)` }, { status: 400 });
    }

    try {
        const rawBuffer = await file.arrayBuffer();
        const sourceBuffer: Buffer = Buffer.from(new Uint8Array(rawBuffer));
        let buffer: Buffer = sourceBuffer;
        let mime    = file.type || "application/octet-stream";
        const rawName = (formData.get("fileName") as string | null) || file.name || `file_${Date.now()}`;
        const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const ts = Date.now();

        const extFromName = safeName.split(".").pop()?.toLowerCase() || "";
        // MIME aniqlash yoki to'g'irlash (ayniqsa mobil brauzerlar va iOS Safari uchun video/mp4 talab qilinadi)
        if (!mime || mime === "application/octet-stream") {
            if (extFromName === "mp4" || extFromName === "m4v") mime = "video/mp4";
            else if (extFromName === "webm") mime = "video/webm";
            else if (extFromName === "mov") mime = "video/quicktime";
            else if (extFromName === "jpg" || extFromName === "jpeg") mime = "image/jpeg";
            else if (extFromName === "png") mime = "image/png";
            else if (extFromName === "webp") mime = "image/webp";
            else if (extFromName === "avif") mime = "image/avif";
            else if (extFromName === "mp3") mime = "audio/mpeg";
        }

        // Variantlar — umumiy jarayon (src/lib/image-variants.ts), mahsulot rasmlari bilan bir xil:
        // stories, kategoriya, banner, blog... yuklanganda AVIF asosiy + thumb/xs/md/lg WEBP + blur avtomatik.
        let variants: ImageVariants | null = null;
        if (isVariantableImage(mime)) {
            try {
                variants = await makeImageVariants(sourceBuffer);
                buffer = variants.main;
                mime = "image/avif";
            } catch { /* sharp failed – upload original */ }
        }

        let folder = "admin/misc";
        if (mime.startsWith("image/"))  folder = "admin/images";
        if (mime.startsWith("audio/"))  folder = "admin/audio";
        if (mime.startsWith("video/"))  folder = "admin/video";

        const ext = variants ? "avif" : (extFromName || (mime.startsWith("video/") ? "mp4" : "bin"));
        const baseNoExt = safeName.split(".")[0];
        const key = `${folder}/${ts}_${baseNoExt}.${ext}`;

        // putObject: Cache-Control immutable (src/lib/s3-put.ts)
        const [url, lowResUrl, xsUrl, mdUrl, lgUrl] = await Promise.all([
            putObject(buffer, key, mime),
            variants ? putObject(variants.thumb, `${folder}/${ts}_${baseNoExt}_thumb.webp`, "image/webp") : undefined,
            variants ? putObject(variants.xs, `${folder}/${ts}_${baseNoExt}_xs.webp`, "image/webp") : undefined,
            variants ? putObject(variants.md, `${folder}/${ts}_${baseNoExt}_md.webp`, "image/webp") : undefined,
            variants ? putObject(variants.lg, `${folder}/${ts}_${baseNoExt}_lg.webp`, "image/webp") : undefined,
        ]);

        return NextResponse.json({ url, blurDataURL: variants?.blurDataURL || undefined, lowResUrl, xs: xsUrl, md: mdUrl, lg: lgUrl });

    } catch (err: any) {
        console.error("Admin upload error:", err);
        return NextResponse.json({ error: `Yuklash xatosi: ${err.message}` }, { status: 500 });
    }
}
