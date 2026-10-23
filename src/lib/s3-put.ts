/**
 * Yandex Object Storage'ga PUT (AWS SigV4) — ikkala upload route'i va scripts/ uchun yagona funksiya.
 * Har obyektga Cache-Control: public, max-age=31536000, immutable (fayl nomi vaqt belgisi bilan noyob —
 * mazmuni hech qachon o'zgarmaydi, brauzer qayta so'ramaydi).
 * Tashqi importi yo'q (fetch + WebCrypto) — Node skriptlaridan ham ishlatiladi.
 */

export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";
const HOST = "storage.yandexcloud.net";

type S3Config = { accessKey: string; secretKey: string; bucket: string; region: string };

export function s3ConfigFromEnv(env: Record<string, string | undefined> = process.env): S3Config {
    return {
        accessKey: env.YANDEX_S3_ACCESS_KEY || "",
        secretKey: env.YANDEX_S3_SECRET_KEY || "",
        bucket: env.YANDEX_S3_BUCKET || "savdomarketimag",
        region: env.YANDEX_S3_REGION || "ru-central1",
    };
}

async function hmac(key: ArrayBuffer | string, data: string): Promise<ArrayBuffer> {
    const enc = new TextEncoder();
    const k = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    return crypto.subtle.sign("HMAC", k, enc.encode(data));
}

async function sha256hex(data: string): Promise<string> {
    const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, "0")).join("");
}

const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");

/**
 * SigV4 imzolangan so'rov. extraHeaders imzoga kiritiladi (x-amz-* sarlavhalar uchun, masalan copy).
 */
export async function s3Request(
    method: "PUT" | "HEAD" | "GET",
    key: string,
    opts: { body?: Buffer | Uint8Array; contentType?: string; cacheControl?: string; amzHeaders?: Record<string, string>; query?: Record<string, string>; config?: S3Config } = {},
): Promise<Response> {
    const { accessKey, secretKey, bucket, region } = opts.config || s3ConfigFromEnv();
    const amzDate = new Date().toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
    const dateStamp = amzDate.slice(0, 8);
    const path = `/${bucket}/${key ? key.split("/").map(encodeURIComponent).join("/") : ""}`;
    // SigV4 kanonik query: kalitlar tartiblangan, RFC3986 kodlangan
    const enc3986 = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
    const q = opts.query || {};
    const canonicalQuery = Object.keys(q).sort().map(k => `${enc3986(k)}=${enc3986(q[k])}`).join("&");

    const signed: Record<string, string> = {
        host: HOST,
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        "x-amz-date": amzDate,
        ...Object.fromEntries(Object.entries(opts.amzHeaders || {}).map(([k, v]) => [k.toLowerCase(), v])),
    };
    const names = Object.keys(signed).sort();
    const canonicalHeaders = names.map(k => `${k}:${signed[k]}\n`).join("");
    const signedHeaders = names.join(";");
    const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${await sha256hex(canonicalRequest)}`;
    const kSigning = await hmac(await hmac(await hmac(await hmac(`AWS4${secretKey}`, dateStamp), region), "s3"), "aws4_request");
    const signature = hex(await hmac(kSigning, stringToSign));

    const headers: Record<string, string> = {
        "x-amz-date": amzDate,
        "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        ...(opts.amzHeaders || {}),
    };
    if (opts.contentType) headers["Content-Type"] = opts.contentType;
    if (opts.cacheControl) headers["Cache-Control"] = opts.cacheControl;
    return fetch(`https://${HOST}${path}${canonicalQuery ? "?" + canonicalQuery : ""}`, { method, headers, body: opts.body as any });
}

/** Faylni yuklaydi va ommaviy URL qaytaradi (immutable kesh bilan). */
export async function putObject(buffer: Buffer, key: string, contentType: string, config?: S3Config): Promise<string> {
    const cfg = config || s3ConfigFromEnv();
    const res = await s3Request("PUT", key, { body: buffer, contentType, cacheControl: IMMUTABLE_CACHE_CONTROL, config: cfg });
    if (!res.ok) throw new Error(await res.text());
    return `https://${HOST}/${cfg.bucket}/${key}`;
}
