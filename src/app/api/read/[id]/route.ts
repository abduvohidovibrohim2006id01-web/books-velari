import { supabaseAdmin } from "@/lib/supabase-admin";
import { getProductIdFromSlug } from "@/lib/slugify";

// In-memory cache for resolved PDF filenames (24 hours TTL)
const FILE_CACHE = new Map<string, { fileName: string; expires: number }>();

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
                    }
                }

                // Agar to'g'ridan-to'g'ri fayl manzili topilmagan bo'lsa, standart identifikatordan aniqlash
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

        // Agar DB dan topilmasa, cleanId yoki rawId ning o'zi bevosita archive_identifier bo'lishi mumkin
        if (!archiveIdentifier) {
            if (/^[a-zA-Z0-9_\-\.]{3,120}$/.test(cleanId)) {
                archiveIdentifier = cleanId;
            } else if (/^[a-zA-Z0-9_\-\.]{3,120}$/.test(rawId)) {
                archiveIdentifier = rawId;
            }
        }

        if (!archiveIdentifier) {
            return new Response("Kitob arxiv identifikatori topilmadi", { status: 404 });
        }

        // 2. Archive.org fayl nomini aniqlash (agar to'plamdan to'g'ridan-to'g'ri olinmagan bo'lsa)
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
                    next: { revalidate: 86400 } // 24 soat kesh
                });

                if (!metaRes.ok) {
                    return new Response("Arxiv ma'lumotlarini yuklab bo'lmadi", { status: 404 });
                }

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

                if (!selected || !selected.name) {
                    return new Response("Kitobning PDF formati topilmadi", { status: 404 });
                }

                const resolvedName = String(selected.name);
                fileName = resolvedName;
                FILE_CACHE.set(archiveIdentifier, {
                    fileName: resolvedName,
                    expires: now + 24 * 60 * 60 * 1000 // 24 soat
                });
            }
        }

        if (!fileName) {
            return new Response("Kitobning PDF formati topilmadi", { status: 404 });
        }

        // 3. Archive.org'dan PDF faylni oqim (stream) ko'rinishida olish
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

        if (!archiveRes.ok && archiveRes.status !== 206) {
            return new Response("Kitob faylini yuklab bo'lmadi", { status: archiveRes.status });
        }

        // 4. Brauzerga xavfsiz inline sarlavhalar bilan PDF oqimini qaytarish
        const responseHeaders = new Headers();
        responseHeaders.set("Content-Type", "application/pdf");
        responseHeaders.set("Content-Disposition", 'inline; filename="book.pdf"');
        responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
        responseHeaders.set("X-Content-Type-Options", "nosniff");
        responseHeaders.set("Accept-Ranges", "bytes");

        const contentLength = archiveRes.headers.get("content-length");
        if (contentLength) {
            responseHeaders.set("Content-Length", contentLength);
        }

        const contentRange = archiveRes.headers.get("content-range");
        if (contentRange) {
            responseHeaders.set("Content-Range", contentRange);
        }

        return new Response(archiveRes.body, {
            status: archiveRes.status,
            headers: responseHeaders,
        });
    } catch (err: any) {
        console.error("[api/read] Unexpected error:", err);
        return new Response("Xatolik yuz berdi: " + (err?.message || "Internal Server Error"), { status: 500 });
    }
}
