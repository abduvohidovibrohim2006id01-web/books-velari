import { NextRequest, NextResponse } from "next/server";
import { makeImageVariants, isVariantableImage, type ImageVariants } from "@/lib/image-variants";
import { putObject } from "@/lib/s3-put";
import { checkRateLimit } from "@/lib/rate-limiter";
import { getUserJwtSecret, getAdminSecret } from "@/lib/secrets";

export const maxDuration = 60; // Vercel: max 60s on Hobby, 300s on Pro

const YANDEX_CONFIG = {
    ACCESS_KEY: process.env.YANDEX_S3_ACCESS_KEY || "",
    SECRET_KEY: process.env.YANDEX_S3_SECRET_KEY || "",
    BUCKET: process.env.YANDEX_S3_BUCKET || "savdomarketimag",
    REGION: process.env.YANDEX_S3_REGION || "ru-central1",
};

import { verifyJwt } from "@/lib/jwt-utils";

async function hmacSha256(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
    const encoder = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        typeof key === "string" ? encoder.encode(key) : key,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    return await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function hashSha256(data: string | ArrayBuffer): Promise<string> {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest("SHA-256", typeof data === "string" ? encoder.encode(data) : data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        // 0. RATE LIMITING (3 uploads per minute)
        if (!await checkRateLimit(ip, 3, 60, "upload")) {
            return NextResponse.json({ error: "Juda ko'p urinish. Bir daqiqadan so'ng qayta urining." }, { status: 429 });
        }

        // 🛡 AUTH: Only authenticated users or admins can upload
        const adminToken = req.cookies.get('admin_token')?.value;
        const userToken = req.cookies.get('user_token')?.value;
        const ADMIN_SECRET = getAdminSecret();
        const JWT_SECRET = getUserJwtSecret();

        let payload = null;
        if (adminToken) {
            payload = await verifyJwt(adminToken, ADMIN_SECRET);
        } else if (userToken) {
            payload = await verifyJwt(userToken, JWT_SECRET);
        }

        if (!payload) {
            return NextResponse.json({ error: "Ruxsat etilmadi. Iltimos tizimga kiring." }, { status: 401 });
        }

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        let fileName = formData.get("fileName") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        // 🟢 SIZE LIMIT: 10MB
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: "Fayl hajmi juda katta (Max: 10MB)" }, { status: 400 });
        }

        const sourceBuffer: Buffer = Buffer.from(new Uint8Array(await file.arrayBuffer()));

        // 🟢 Variantlar — umumiy jarayon (src/lib/image-variants.ts): AVIF asosiy + thumb/xs/md/lg WEBP + blur
        let variants: ImageVariants | null = null;
        if (isVariantableImage(file.type)) {
            try {
                variants = await makeImageVariants(sourceBuffer);
                fileName = (fileName || `img_${Date.now()}`).split('.')[0] + '.avif';
            } catch (err) {
                console.error("Sharp processing failed:", err);
            }
        }

        const safeBaseName = (fileName || "image.avif").replace(/[^a-zA-Z0-9.-]/g, "_");
        const baseNoExt = safeBaseName.replace(/\.(avif|webp|jpg|jpeg|png)$/i, "");
        const timestamp = Date.now();

        // putObject: Cache-Control immutable (src/lib/s3-put.ts)
        const originalContentType = variants ? "image/avif" : (file.type || "application/octet-stream");
        const [originalUrl, thumbUrl, xsUrl, mdUrl, lgUrl] = await Promise.all([
            putObject(variants ? variants.main : sourceBuffer, `uploads/${timestamp}_original_${safeBaseName}`, originalContentType),
            variants ? putObject(variants.thumb, `uploads/${timestamp}_thumb_${baseNoExt}.webp`, "image/webp") : undefined,
            variants ? putObject(variants.xs, `uploads/${timestamp}_${baseNoExt}_xs.webp`, "image/webp") : undefined,
            variants ? putObject(variants.md, `uploads/${timestamp}_${baseNoExt}_md.webp`, "image/webp") : undefined,
            variants ? putObject(variants.lg, `uploads/${timestamp}_${baseNoExt}_lg.webp`, "image/webp") : undefined,
        ]);

        return NextResponse.json({
            url: originalUrl,
            lowResUrl: thumbUrl || xsUrl || null,
            blurDataURL: variants?.blurDataURL || "",
            xs: xsUrl,
            md: mdUrl,
            lg: lgUrl,
        });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: `Upload failed: ${error.message || "Unknown error"}` }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        // 🔒 SECURE AUTH CHECK: Cryptographically verify Admin Token
        const adminToken = req.cookies.get('admin_token')?.value;
        const ADMIN_SECRET = getAdminSecret();
        
        const payload = adminToken ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
        
        if (!payload || payload.role !== 'admin') {
            return NextResponse.json({ error: "Ruxsat etilmadi (Faqat Admin o'chira oladi)" }, { status: 401 });
        }

        const { fileUrl } = await req.json();

        if (!fileUrl || !fileUrl.includes("yandexcloud.net")) {
            return NextResponse.json({ success: true, note: "Not a Yandex S3 URL" });
        }

        const { ACCESS_KEY, SECRET_KEY, BUCKET, REGION } = YANDEX_CONFIG;
        const host = "storage.yandexcloud.net";

        const urlParts = new URL(fileUrl);
        const fileKey = decodeURIComponent(urlParts.pathname.replace(`/${BUCKET}/`, '').replace(/^\//, ''));

        const now = new Date();
        const amzDate = now.toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
        const dateStamp = amzDate.slice(0, 8);

        const method = "DELETE";
        const canonicalUri = `/${BUCKET}/${fileKey}`;
        const canonicalQueryString = "";

        const headersConfig: Record<string, string> = { "host": host, "x-amz-date": amzDate, "x-amz-content-sha256": "UNSIGNED-PAYLOAD" };
        const canonicalHeaders = Object.keys(headersConfig).sort().map(k => `${k}:${headersConfig[k]}\n`).join("");
        const signedHeaders = Object.keys(headersConfig).sort().join(";");
        const canonicalRequest = [method, canonicalUri, canonicalQueryString, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
        const algorithm = "AWS4-HMAC-SHA256";
        const credentialScope = `${dateStamp}/${REGION}/s3/aws4_request`;
        const hashedCanonicalRequest = await hashSha256(canonicalRequest);
        const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${hashedCanonicalRequest}`;

        const kDate = await hmacSha256(`AWS4${SECRET_KEY}`, dateStamp);
        const kRegion = await hmacSha256(kDate, REGION);
        const kService = await hmacSha256(kRegion, "s3");
        const kSigning = await hmacSha256(kService, "aws4_request");
        const signatureBuffer = await hmacSha256(kSigning, stringToSign);
        const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

        const authorizationHeader = `${algorithm} Credential=${ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

        const deleteResponse = await fetch(`https://${host}/${BUCKET}/${fileKey}`, {
            method: method,
            headers: {
                "x-amz-date": amzDate,
                "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
                "Authorization": authorizationHeader
            }
        });

        if (!deleteResponse.ok) throw new Error(await deleteResponse.text());

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Delete error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
