import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProductIdFromSlug } from "@/lib/slugify";

// In-memory cache for resolved PDF filenames (24 hours TTL)
const FILE_CACHE = new Map<string, { fileName: string; expires: number }>();

// In-memory cache for dynamic Telegram Stream Bridge URL (60 seconds TTL)
let cachedBridgeUrl: { url: string; expires: number } | null = null;

async function getBridgeUrl(): Promise<string> {
    const now = Date.now();
    if (cachedBridgeUrl && cachedBridgeUrl.expires > now) {
        return cachedBridgeUrl.url;
    }

    if (process.env.TELEGRAM_BRIDGE_URL) {
        cachedBridgeUrl = { url: process.env.TELEGRAM_BRIDGE_URL, expires: now + 300000 };
        return process.env.TELEGRAM_BRIDGE_URL;
    }

    try {
        const { data } = await supabaseAdmin
            .from("site_settings")
            .select("value")
            .eq("key", "telegram_bridge")
            .maybeSingle();

        if (data?.value?.url && data?.value?.active) {
            cachedBridgeUrl = { url: data.value.url, expires: now + 60000 };
            return data.value.url;
        }
    } catch (e) {
        console.error("[api/read] Failed to fetch telegram_bridge from site_settings:", e);
    }

    // Default fallback tunnel URL
    const fallback = "https://queensland-varies-continues-identification.trycloudflare.com";
    cachedBridgeUrl = { url: fallback, expires: now + 60000 };
    return fallback;
}

export const dynamic = "force-dynamic";

export async function GET(
    request: Request,
    { params }: { params: { id: string } | Promise<{ id: string }> }
) {
    try {
        const resolvedParams = await Promise.resolve(params);
        const rawId = resolvedParams?.id;

        if (!rawId) {
            return new Response("Mahsulot identifikatori ko'rsatilmadi", { status: 400 });
        }

        const cleanId = getProductIdFromSlug(rawId);

        let archiveIdentifier: string | null = null;
        let fileName: string | null = null;
        let hasDirectArchiveFile = false;

        // 1. Supabase'dan mahsulotni topish
        try {
            const { data: product } = await supabaseAdmin
                .from("products")
                .select("id, name, archive_identifier, archive_url")
                .or(`id.eq.${cleanId},article.eq.${cleanId},archive_identifier.eq.${cleanId},id.eq.${rawId},article.eq.${rawId},archive_identifier.eq.${rawId}`)
                .limit(1)
                .maybeSingle();

            if (product) {
                // To'plam / Volume to'g'ridan-to'g'ri fayl manzili mavjudligini tekshirish
                if (product.archive_url) {
                    const directFileMatch = product.archive_url.match(/archive\.org\/download\/([^/?#]+)\/([^/?#]+\.pdf)/i);
                    if (directFileMatch) {
                        archiveIdentifier = directFileMatch[1];
                        try {
                            fileName = decodeURIComponent(directFileMatch[2]);
                        } catch {
                            fileName = directFileMatch[2];
                        }
                        hasDirectArchiveFile = true;
                    }
                }

                // Standart identifikatordan aniqlash
                if (!archiveIdentifier) {
                    if (product.archive_identifier) {
                        archiveIdentifier = product.archive_identifier;
                    } else if (product.archive_url) {
                        const match = product.archive_url.match(/archive\.org\/(?:details|embed|download)\/([^/?#]+)/i);
                        if (match) {
                            archiveIdentifier = match[1];
                        }
                    }
                }
            }
        } catch (dbErr) {
            console.error("[api/read] Supabase query error:", dbErr);
        }

        // 2. Agar Archive.org ma'lumotlari mavjud bo'lsa, avval Archive.org dan olishga urinamiz
        if (archiveIdentifier) {
            try {
                if (!fileName) {
                    const now = Date.now();
                    const cached = FILE_CACHE.get(archiveIdentifier);

                    if (cached && cached.expires > now) {
                        fileName = cached.fileName;
                    } else {
                        const metaRes = await fetch(`https://archive.org/metadata/${encodeURIComponent(archiveIdentifier)}`, {
                            headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
                                "Accept": "application/json",
                            },
                            next: { revalidate: 86400 }
                        });

                        if (metaRes.ok) {
                            const metaData = await metaRes.json();
                            const files: any[] = Array.isArray(metaData?.files) ? metaData.files : [];
                            const pdfFiles = files.filter((f: any) => {
                                const name = (f.name || "").toLowerCase();
                                const format = (f.format || "").toLowerCase();
                                return (format.includes("pdf") || name.endsWith(".pdf")) && !name.endsWith(".xml") && !name.endsWith(".sqlite");
                            });

                            const selected = pdfFiles.find((f: any) => f.format === "Text PDF")
                                || pdfFiles.find((f: any) => f.source === "original" && f.name?.toLowerCase().endsWith(".pdf"))
                                || pdfFiles[0];

                            if (selected && selected.name) {
                                fileName = String(selected.name);
                                FILE_CACHE.set(archiveIdentifier, {
                                    fileName: fileName,
                                    expires: now + 24 * 60 * 60 * 1000
                                });
                            }
                        }
                    }
                }

                if (fileName) {
                    const downloadUrl = `https://archive.org/download/${archiveIdentifier}/${encodeURIComponent(fileName)}`;
                    const fetchHeaders: Record<string, string> = {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept": "application/pdf,*/*",
                    };

                    const rangeHeader = request.headers.get("range");
                    if (rangeHeader) {
                        fetchHeaders["Range"] = rangeHeader;
                    }

                    const archiveRes = await fetch(downloadUrl, {
                        headers: fetchHeaders,
                        redirect: "follow",
                    });

                    if (archiveRes.ok || archiveRes.status === 206) {
                        const responseHeaders = new Headers();
                        responseHeaders.set("Content-Type", "application/pdf");
                        responseHeaders.set("Content-Disposition", 'inline; filename="book.pdf"');
                        responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
                        responseHeaders.set("X-Content-Type-Options", "nosniff");
                        responseHeaders.set("Accept-Ranges", "bytes");

                        const contentLength = archiveRes.headers.get("content-length");
                        if (contentLength) responseHeaders.set("Content-Length", contentLength);
                        const contentRange = archiveRes.headers.get("content-range");
                        if (contentRange) responseHeaders.set("Content-Range", contentRange);

                        return new Response(archiveRes.body, {
                            status: archiveRes.status,
                            headers: responseHeaders,
                        });
                    }
                }
            } catch (archiveErr) {
                console.warn("[api/read] Archive.org fetch failed, falling back to Telegram stream bridge:", archiveErr);
            }
        }

        // 3. ON-DEMAND FALLBACK: Telegram Stream Bridge orqali lahzalik oqim
        const bridgeBase = await getBridgeUrl();
        const bridgeUrl = `${bridgeBase.replace(/\/+$/, "")}/stream/${encodeURIComponent(cleanId)}`;

        const bridgeHeaders: Record<string, string> = {
            "Accept": "application/pdf,*/*",
        };
        const rangeHeader = request.headers.get("range");
        if (rangeHeader) {
            bridgeHeaders["Range"] = rangeHeader;
        }

        try {
            const bridgeRes = await fetch(bridgeUrl, {
                headers: bridgeHeaders,
                redirect: "follow",
            });

            if (bridgeRes.ok || bridgeRes.status === 206) {
                const responseHeaders = new Headers();
                responseHeaders.set("Content-Type", "application/pdf");
                responseHeaders.set("Content-Disposition", 'inline; filename="book.pdf"');
                responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
                responseHeaders.set("X-Content-Type-Options", "nosniff");
                responseHeaders.set("Accept-Ranges", "bytes");

                const contentLength = bridgeRes.headers.get("content-length");
                if (contentLength) responseHeaders.set("Content-Length", contentLength);
                const contentRange = bridgeRes.headers.get("content-range");
                if (contentRange) responseHeaders.set("Content-Range", contentRange);

                return new Response(bridgeRes.body, {
                    status: bridgeRes.status,
                    headers: responseHeaders,
                });
            }
        } catch (bridgeErr) {
            console.error("[api/read] Telegram bridge fetch error:", bridgeErr);
        }

        return new Response("Kitob fayli topilmadi yoki hali yuklanmagan", { status: 404 });

    } catch (err: any) {
        console.error("[api/read] Unexpected error:", err);
        return new Response("Xatolik yuz berdi: " + (err?.message || "Internal Server Error"), { status: 500 });
    }
}
