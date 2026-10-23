"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    Loader2,
    BookOpen,
    ChevronLeft,
    ChevronRight,
    ZoomIn,
    ZoomOut,
    Maximize2,
    Minimize2,
    X,
    RefreshCw,
    AlertCircle,
    CheckCircle2,
    Zap
} from "lucide-react";

// ============================================================================
// INDEXED DB CACHE HELPERS
// ============================================================================
const DB_NAME = "kutubxona_reader_db_v1";
const STORE_NAME = "books";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        if (typeof window === "undefined" || !("indexedDB" in window)) {
            return reject(new Error("IndexedDB is not supported"));
        }
        const request = window.indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (e) => {
            const db = (e.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
    });
}

async function getCachedBook(productId: string): Promise<ArrayBuffer | null> {
    try {
        const db = await openDB();
        return await new Promise<ArrayBuffer | null>((resolve) => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(`book_${productId}`);
            req.onsuccess = () => {
                const result = req.result;
                if (result instanceof ArrayBuffer) {
                    resolve(result);
                } else if (result && result.buffer instanceof ArrayBuffer) {
                    resolve(result.buffer);
                } else {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    } catch (err) {
        console.warn("[IndexedDB] Read failed:", err);
        return null;
    }
}

async function saveBookToCache(productId: string, data: ArrayBuffer): Promise<void> {
    try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, "readwrite");
            const store = tx.objectStore(STORE_NAME);
            const req = store.put(data, `book_${productId}`);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    } catch (err) {
        console.warn("[IndexedDB] Save failed (quota or privacy mode):", err);
    }
}

// ============================================================================
// PDF.JS DYNAMIC LOADER
// ============================================================================
declare global {
    interface Window {
        pdfjsLib?: any;
    }
}

let pdfjsScriptPromise: Promise<any> | null = null;

function loadPdfJs(): Promise<any> {
    if (typeof window === "undefined") {
        return Promise.reject(new Error("Window not available"));
    }
    if (window.pdfjsLib) {
        return Promise.resolve(window.pdfjsLib);
    }
    if (pdfjsScriptPromise) return pdfjsScriptPromise;

    pdfjsScriptPromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-pdfjs="loaded"]');
        if (existingScript && window.pdfjsLib) {
            resolve(window.pdfjsLib);
            return;
        }

        const script = document.createElement("script");
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
        script.setAttribute("data-pdfjs", "loaded");
        script.async = true;

        script.onload = () => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                resolve(window.pdfjsLib);
            } else {
                reject(new Error("pdfjsLib obyekti topilmadi"));
            }
        };

        script.onerror = () => {
            pdfjsScriptPromise = null;
            reject(new Error("PDF.js kutubxonasini yuklab bo'lmadi. Tarmoqni tekshiring."));
        };

        document.head.appendChild(script);
    });

    return pdfjsScriptPromise;
}

// Format bytes helper
function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return "0 MB";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) {
        return (bytes / 1024).toFixed(0) + " KB";
    }
    return mb.toFixed(1) + " MB";
}

// ============================================================================
// COMPONENT PROPS
// ============================================================================
export interface BookCanvasReaderProps {
    productId: string;
    bookTitle: string;
    coverUrl?: string | null;
    language?: "uz" | "ru";
    onClose: () => void;
}

export function BookCanvasReader({
    productId,
    bookTitle,
    coverUrl,
    language = "uz",
    onClose,
}: BookCanvasReaderProps) {
    // Reader container ref for fullscreen & wheel
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Network / PDF refs
    const xhrRef = useRef<XMLHttpRequest | null>(null);
    const renderTaskRef = useRef<any>(null);
    const pdfDocRef = useRef<any>(null);

    // States
    const [status, setStatus] = useState<"checking" | "downloading" | "rendering" | "ready" | "error">("checking");
    const [downloadPercent, setDownloadPercent] = useState<number>(0);
    const [loadedBytes, setLoadedBytes] = useState<number>(0);
    const [totalBytes, setTotalBytes] = useState<number>(0);
    const [isFromCache, setIsFromCache] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // PDF Navigation & Zoom
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [pageInputValue, setPageInputValue] = useState<string>("1");
    const [zoom, setZoom] = useState<number>(1.0);
    const [isFitWidth, setIsFitWidth] = useState<boolean>(true);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [isPageRendering, setIsPageRendering] = useState<boolean>(false);

    // Touch swipe refs
    const touchStartCoords = useRef<{ x: number; y: number } | null>(null);

    // ------------------------------------------------------------------------
    // 1. Initial Load: Check IndexedDB -> Download if not cached
    // ------------------------------------------------------------------------
    const startLoadingBook = useCallback(async () => {
        setStatus("checking");
        setErrorMessage(null);
        setDownloadPercent(0);
        setLoadedBytes(0);
        setTotalBytes(0);

        try {
            // Check IndexedDB
            const cachedBuffer = await getCachedBook(productId);
            if (cachedBuffer && cachedBuffer.byteLength > 1000) {
                setIsFromCache(true);
                initPdfDocument(cachedBuffer);
                return;
            }

            // Not in cache -> Download with progress
            setStatus("downloading");
            setIsFromCache(false);

            const xhr = new XMLHttpRequest();
            xhrRef.current = xhr;
            xhr.open("GET", `/api/read/${encodeURIComponent(productId)}`, true);
            xhr.responseType = "arraybuffer";

            xhr.onprogress = (e) => {
                if (e.lengthComputable && e.total > 0) {
                    const pct = Math.min(100, Math.round((e.loaded / e.total) * 100));
                    setDownloadPercent(pct);
                    setLoadedBytes(e.loaded);
                    setTotalBytes(e.total);
                } else {
                    setLoadedBytes(e.loaded);
                    setTotalBytes(0);
                    // Approximate percentage if total is unknown
                    setDownloadPercent((prev) => (prev < 90 ? prev + 5 : 90));
                }
            };

            xhr.onload = async () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    const buffer = xhr.response as ArrayBuffer;
                    if (!buffer || buffer.byteLength < 100) {
                        setStatus("error");
                        setErrorMessage(
                            language === "uz"
                                ? "Kitob fayli bo'sh yoki noto'g'ri yuklandi."
                                : "Файл книги пуст или поврежден."
                        );
                        return;
                    }

                    setDownloadPercent(100);
                    // Save to IndexedDB in the background
                    saveBookToCache(productId, buffer).catch(() => {});

                    // Initialize PDF.js
                    initPdfDocument(buffer);
                } else {
                    setStatus("error");
                    setErrorMessage(
                        language === "uz"
                            ? `Kitobni yuklab bo'lmadi (Server status: ${xhr.status})`
                            : `Не удалось загрузить книгу (Статус сервера: ${xhr.status})`
                    );
                }
            };

            xhr.onerror = () => {
                setStatus("error");
                setErrorMessage(
                    language === "uz"
                        ? "Tarmoq xatosi. Internet aloqasini tekshirib qayta urining."
                        : "Ошибка сети. Проверьте интернет-соединение и повторите попытку."
                );
            };

            xhr.onabort = () => {
                // Ignore abort on unmount
            };

            xhr.send();
        } catch (err: any) {
            console.error("[BookCanvasReader] Load error:", err);
            setStatus("error");
            setErrorMessage(err?.message || "Xatolik yuz berdi");
        }
    }, [productId, language]);

    // ------------------------------------------------------------------------
    // 2. Initialize PDF.js Document
    // ------------------------------------------------------------------------
    const initPdfDocument = async (arrayBuffer: ArrayBuffer) => {
        setStatus("rendering");
        try {
            const pdfjs = await loadPdfJs();
            const loadingTask = pdfjs.getDocument({
                data: arrayBuffer,
                cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
                cMapPacked: true,
            });

            const doc = await loadingTask.promise;
            pdfDocRef.current = doc;
            setTotalPages(doc.numPages);

            // Restore last read page if available
            let initialPage = 1;
            try {
                const saved = localStorage.getItem(`book_page_${productId}`);
                if (saved) {
                    const parsed = parseInt(saved, 10);
                    if (parsed >= 1 && parsed <= doc.numPages) {
                        initialPage = parsed;
                    }
                }
            } catch (_) {}

            setCurrentPage(initialPage);
            setPageInputValue(String(initialPage));
            setStatus("ready");
        } catch (err: any) {
            console.error("[BookCanvasReader] PDF init error:", err);
            setStatus("error");
            setErrorMessage(
                language === "uz"
                    ? "Kitob sahifalarini o'qib bo'lmadi. Fayl shikastlangan bo'lishi mumkin."
                    : "Не удалось прочитать страницы книги. Возможно, файл поврежден."
            );
        }
    };

    // Trigger on mount
    useEffect(() => {
        startLoadingBook();

        return () => {
            // Cleanup on unmount
            if (xhrRef.current) {
                xhrRef.current.abort();
            }
            if (renderTaskRef.current) {
                try {
                    renderTaskRef.current.cancel();
                } catch (_) {}
            }
        };
    }, [startLoadingBook]);

    // ------------------------------------------------------------------------
    // 3. Render Canvas Page
    // ------------------------------------------------------------------------
    const renderPage = useCallback(
        async (pageNum: number) => {
            const doc = pdfDocRef.current;
            if (!doc || !canvasRef.current) return;

            setIsPageRendering(true);

            // Cancel any ongoing render task
            if (renderTaskRef.current) {
                try {
                    renderTaskRef.current.cancel();
                } catch (_) {}
            }

            try {
                const page = await doc.getPage(pageNum);
                const canvas = canvasRef.current;
                if (!canvas) return;

                // Determine scale
                let finalScale = zoom;
                if (isFitWidth && scrollContainerRef.current) {
                    const containerWidth = scrollContainerRef.current.clientWidth;
                    const padding = window.innerWidth < 640 ? 16 : 48;
                    const availableWidth = Math.max(280, containerWidth - padding);
                    const unscaledViewport = page.getViewport({ scale: 1 });
                    finalScale = availableWidth / unscaledViewport.width;
                }

                // HiDPI / Retina Crispness
                const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
                const viewport = page.getViewport({ scale: finalScale });

                canvas.width = Math.floor(viewport.width * dpr);
                canvas.height = Math.floor(viewport.height * dpr);
                canvas.style.width = `${Math.floor(viewport.width)}px`;
                canvas.style.height = `${Math.floor(viewport.height)}px`;

                const ctx = canvas.getContext("2d", { alpha: false });
                if (!ctx) return;

                // Fill clean white background
                ctx.fillStyle = "#FFFFFF";
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const renderContext = {
                    canvasContext: ctx,
                    viewport: viewport,
                    transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                };

                const renderTask = page.render(renderContext);
                renderTaskRef.current = renderTask;

                await renderTask.promise;
                setIsPageRendering(false);

                // Scroll to top of page on change
                if (scrollContainerRef.current) {
                    scrollContainerRef.current.scrollTo({ top: 0, behavior: "instant" });
                }

                // Persist current page
                try {
                    localStorage.setItem(`book_page_${productId}`, String(pageNum));
                } catch (_) {}
            } catch (err: any) {
                if (err?.name !== "RenderingCancelledException") {
                    console.error("[BookCanvasReader] Render page error:", err);
                }
                setIsPageRendering(false);
            }
        },
        [zoom, isFitWidth, productId]
    );

    // Trigger render when page, zoom or status changes
    useEffect(() => {
        if (status === "ready" && totalPages > 0) {
            renderPage(currentPage);
            setPageInputValue(String(currentPage));
        }
    }, [status, currentPage, zoom, isFitWidth, totalPages, renderPage]);

    // Re-render on window resize if in Fit-Width mode
    useEffect(() => {
        if (!isFitWidth || status !== "ready") return;

        let resizeTimer: any;
        const handleResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                renderPage(currentPage);
            }, 150);
        };

        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            clearTimeout(resizeTimer);
        };
    }, [isFitWidth, status, currentPage, renderPage]);

    // ------------------------------------------------------------------------
    // 4. Navigation Actions
    // ------------------------------------------------------------------------
    const goToPrevPage = useCallback(() => {
        setCurrentPage((prev) => {
            if (prev > 1) return prev - 1;
            return prev;
        });
    }, []);

    const goToNextPage = useCallback(() => {
        setCurrentPage((prev) => {
            if (prev < totalPages) return prev + 1;
            return prev;
        });
    }, [totalPages]);

    const handlePageInputSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(pageInputValue, 10);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
            setCurrentPage(num);
        } else {
            setPageInputValue(String(currentPage));
        }
    };

    // Zoom Actions
    const handleZoomIn = () => {
        setIsFitWidth(false);
        setZoom((prev) => Math.min(3.0, +(prev + 0.25).toFixed(2)));
    };

    const handleZoomOut = () => {
        setIsFitWidth(false);
        setZoom((prev) => Math.max(0.5, +(prev - 0.25).toFixed(2)));
    };

    const handleToggleFitWidth = () => {
        setIsFitWidth((prev) => !prev);
    };

    // Fullscreen Toggle
    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            if (containerRef.current?.requestFullscreen) {
                containerRef.current.requestFullscreen().catch(() => {});
                setIsFullscreen(true);
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen().catch(() => {});
                setIsFullscreen(false);
            }
        }
    }, []);

    useEffect(() => {
        const handleFsChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handleFsChange);
        return () => document.removeEventListener("fullscreenchange", handleFsChange);
    }, []);

    // Keyboard Shortcuts & Body Overflow Lock
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            if (e.key === "ArrowLeft" || e.key === "PageUp") {
                e.preventDefault();
                goToPrevPage();
            } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
                e.preventDefault();
                goToNextPage();
            } else if (e.key === "Escape") {
                if (document.fullscreenElement) {
                    document.exitFullscreen().catch(() => {});
                } else {
                    onClose();
                }
            } else if (e.key === "+" || e.key === "=") {
                e.preventDefault();
                handleZoomIn();
            } else if (e.key === "-") {
                e.preventDefault();
                handleZoomOut();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = originalOverflow;
        };
    }, [goToPrevPage, goToNextPage, onClose]);

    // Touch Swipe Navigation for mobile
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 1) {
            touchStartCoords.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
            };
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchStartCoords.current) return;
        const touch = e.changedTouches[0];
        const diffX = touch.clientX - touchStartCoords.current.x;
        const diffY = touch.clientY - touchStartCoords.current.y;
        touchStartCoords.current = null;

        // Minimum swipe distance of 55px, and horizontal dominance
        if (Math.abs(diffX) > 55 && Math.abs(diffX) > Math.abs(diffY) * 1.5) {
            if (diffX < 0) {
                // Swipe Left -> Next Page
                goToNextPage();
            } else {
                // Swipe Right -> Prev Page
                goToPrevPage();
            }
        }
    };

    return (
        <div
            ref={containerRef}
            className="fixed inset-0 z-[250] flex flex-col bg-[#0F1410] text-white animate-in fade-in duration-200 select-none overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-label={bookTitle}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* =============================================================== */}
            {/* TOP HEADER BAR */}
            {/* =============================================================== */}
            <header className="h-14 sm:h-16 bg-[#161E17] border-b border-white/10 px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 shrink-0 shadow-lg z-20">
                {/* Left: Book Icon & Title */}
                <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 max-w-[45%] sm:max-w-md lg:max-w-lg">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/25 shadow-sm">
                        <BookOpen size={18} strokeWidth={2.4} />
                    </div>
                    <div className="min-w-0">
                        <h2
                            className="text-xs sm:text-sm font-bold text-white truncate"
                            title={bookTitle}
                        >
                            {bookTitle}
                        </h2>
                        <div className="flex items-center gap-2 text-[10px] sm:text-[11px] font-medium text-emerald-400 mt-0.5">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {language === "uz" ? "Onlayn mutolaa" : "Онлайн чтение"}
                            </span>
                            {isFromCache && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold">
                                    <Zap size={10} className="text-yellow-400 fill-yellow-400" />
                                    {language === "uz" ? "Keshdan" : "Кэш"}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Page Navigation (Only shown when ready) */}
                {status === "ready" && totalPages > 0 && (
                    <div className="flex items-center gap-1 sm:gap-2 bg-white/5 border border-white/10 rounded-xl px-1.5 py-1 sm:px-2.5 shadow-inner">
                        <button
                            onClick={goToPrevPage}
                            disabled={currentPage <= 1}
                            className="p-1 sm:p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent active:scale-95 transition-all"
                            title={language === "uz" ? "Oldingi sahifa" : "Предыдущая"}
                            aria-label="Previous Page"
                        >
                            <ChevronLeft size={16} strokeWidth={2.5} />
                        </button>

                        <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1 text-xs font-semibold">
                            <span className="hidden sm:inline text-gray-400 text-[11px]">
                                {language === "uz" ? "Sahifa:" : "Стр:"}
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={pageInputValue}
                                onChange={(e) => setPageInputValue(e.target.value)}
                                onBlur={handlePageInputSubmit}
                                className="w-9 sm:w-11 text-center bg-black/40 border border-white/20 rounded-md py-0.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                            <span className="text-gray-400">/</span>
                            <span className="text-gray-200 text-xs">{totalPages}</span>
                        </form>

                        <button
                            onClick={goToNextPage}
                            disabled={currentPage >= totalPages}
                            className="p-1 sm:p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent active:scale-95 transition-all"
                            title={language === "uz" ? "Keyingi sahifa" : "Следующая"}
                            aria-label="Next Page"
                        >
                            <ChevronRight size={16} strokeWidth={2.5} />
                        </button>
                    </div>
                )}

                {/* Right: Zoom & Fullscreen & Close */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    {/* Zoom Controls (Hidden on very small screens) */}
                    {status === "ready" && (
                        <div className="hidden md:flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
                            <button
                                onClick={handleZoomOut}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition-colors"
                                title={language === "uz" ? "Kichraytirish (-)" : "Уменьшить (-)"}
                            >
                                <ZoomOut size={15} />
                            </button>
                            <button
                                onClick={handleToggleFitWidth}
                                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors ${
                                    isFitWidth
                                        ? "bg-emerald-600 text-white shadow-sm"
                                        : "text-gray-300 hover:text-white hover:bg-white/10"
                                }`}
                                title={language === "uz" ? "Kenglikka moslash" : "По ширине"}
                            >
                                {isFitWidth ? (language === "uz" ? "Kenglik" : "Ширина") : `${Math.round(zoom * 100)}%`}
                            </button>
                            <button
                                onClick={handleZoomIn}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition-colors"
                                title={language === "uz" ? "Kattalashtirish (+)" : "Увеличить (+)"}
                            >
                                <ZoomIn size={15} />
                            </button>
                        </div>
                    )}

                    {/* Fullscreen Toggle */}
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 sm:px-2.5 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-colors"
                        title={
                            isFullscreen
                                ? language === "uz" ? "To'liq ekrandan chiqish" : "Оконный режим"
                                : language === "uz" ? "To'liq ekran" : "Во весь экран"
                        }
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        <span className="hidden xl:inline text-[11px]">
                            {isFullscreen ? (language === "uz" ? "Kichraytirish" : "Свернуть") : (language === "uz" ? "To'liq ekran" : "Экран")}
                        </span>
                    </button>

                    {/* Close (X / Esc) */}
                    <button
                        onClick={() => {
                            if (document.fullscreenElement) {
                                document.exitFullscreen().catch(() => {});
                            }
                            onClose();
                        }}
                        className="p-2 sm:p-2 rounded-xl bg-white/10 hover:bg-red-500/80 active:scale-95 text-white flex items-center justify-center transition-colors ml-0.5 sm:ml-1"
                        title={language === "uz" ? "Yopish (Esc)" : "Закрыть (Esc)"}
                    >
                        <X size={18} strokeWidth={2.4} />
                    </button>
                </div>
            </header>

            {/* =============================================================== */}
            {/* READER MAIN CANVAS AREA OR DOWNLOAD PROGRESS SCREEN */}
            {/* =============================================================== */}
            <main
                ref={scrollContainerRef}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="flex-1 w-full h-full bg-[#131914] relative overflow-auto flex flex-col items-center justify-start py-4 sm:py-6 px-2 sm:px-4"
                style={{
                    WebkitOverflowScrolling: "touch",
                }}
            >
                {/* 1. CHECKING / DOWNLOADING SCREEN WITH REAL-TIME PROGRESS */}
                {(status === "checking" || status === "downloading" || status === "rendering") && (
                    <div className="my-auto flex flex-col items-center justify-center p-6 sm:p-8 max-w-sm sm:max-w-md w-full bg-[#182119] border border-white/10 rounded-3xl shadow-2xl text-center animate-in zoom-in-95 duration-200">
                        {/* Book Cover or Icon */}
                        <div className="w-20 h-28 sm:w-24 sm:h-32 rounded-2xl overflow-hidden shadow-2xl border-2 border-emerald-500/30 bg-black/40 mb-5 relative flex items-center justify-center">
                            {coverUrl ? (
                                <img
                                    src={coverUrl}
                                    alt=""
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <BookOpen size={36} className="text-emerald-400" />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                        </div>

                        {/* Title */}
                        <h3 className="text-sm sm:text-base font-bold text-white mb-1 line-clamp-2">
                            {bookTitle}
                        </h3>

                        {/* Progress status & percentage */}
                        {status === "checking" && (
                            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                                <Loader2 size={14} className="animate-spin text-emerald-400" />
                                {language === "uz" ? "Kesh tekshirilmoqda..." : "Проверка кэша..."}
                            </p>
                        )}

                        {status === "downloading" && (
                            <div className="w-full mt-4">
                                <div className="flex items-center justify-between text-xs font-semibold text-gray-300 mb-2">
                                    <span className="flex items-center gap-1.5 text-emerald-400">
                                        <Loader2 size={13} className="animate-spin" />
                                        {language === "uz" ? "Kitob yuklanmoqda..." : "Загрузка книги..."}
                                    </span>
                                    <span className="font-bold text-white text-sm">
                                        {downloadPercent}%
                                    </span>
                                </div>

                                {/* Animated Green Progress Bar */}
                                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5 shadow-inner">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-400 rounded-full transition-all duration-200 ease-out relative overflow-hidden"
                                        style={{ width: `${Math.max(5, downloadPercent)}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/25 animate-pulse" />
                                    </div>
                                </div>

                                {/* Real downloaded size */}
                                <div className="flex items-center justify-between mt-2.5 text-[11px] text-gray-400">
                                    <span>
                                        {totalBytes > 0
                                            ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
                                            : `${formatBytes(loadedBytes)} ${language === "uz" ? "yuklandi" : "загружено"}`}
                                    </span>
                                    <span className="text-[10px] text-emerald-400/90 font-medium">
                                        {language === "uz" ? "Keshga saqlanadi" : "В кэш"}
                                    </span>
                                </div>
                            </div>
                        )}

                        {status === "rendering" && (
                            <div className="mt-4 flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                                    <CheckCircle2 size={16} />
                                    {language === "uz" ? "Sahifalar tayyorlanmoqda..." : "Подготовка страниц..."}
                                </div>
                                <div className="w-full h-1.5 bg-emerald-500/20 rounded-full overflow-hidden mt-1">
                                    <div className="h-full bg-emerald-400 rounded-full animate-indeterminate" />
                                </div>
                            </div>
                        )}

                        {/* Hint footnote */}
                        <p className="text-[11px] text-gray-400/80 mt-4 leading-relaxed">
                            {language === "uz"
                                ? "Kitob bir marta yuklanadi va keshga saqlanadi. Keyingi safar darhol ochiladi!"
                                : "Книга скачивается один раз и сохраняется в кэш. В следующий раз откроется мгновенно!"}
                        </p>
                    </div>
                )}

                {/* 2. ERROR SCREEN */}
                {status === "error" && (
                    <div className="my-auto flex flex-col items-center justify-center p-6 sm:p-8 max-w-sm sm:max-w-md w-full bg-[#1E1717] border border-red-500/30 rounded-3xl shadow-2xl text-center animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
                            <AlertCircle size={28} />
                        </div>
                        <h3 className="text-base font-bold text-white mb-2">
                            {language === "uz" ? "Yuklab olishda xatolik" : "Ошибка загрузки"}
                        </h3>
                        <p className="text-xs text-red-300 leading-relaxed mb-6">
                            {errorMessage || (language === "uz" ? "Noma'lum xatolik" : "Неизвестная ошибка")}
                        </p>
                        <div className="flex items-center gap-3 w-full">
                            <button
                                onClick={startLoadingBook}
                                className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30"
                            >
                                <RefreshCw size={14} />
                                {language === "uz" ? "Qayta urinish" : "Повторить"}
                            </button>
                            <button
                                onClick={onClose}
                                className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-gray-300 hover:text-white text-xs font-bold transition-all"
                            >
                                {language === "uz" ? "Yopish" : "Закрыть"}
                            </button>
                        </div>
                    </div>
                )}

                {/* 3. READY STATE: HTML5 CANVAS SHEET */}
                {status === "ready" && (
                    <div className="relative flex flex-col items-center my-auto transition-all">
                        {/* Rendering spinner overlay when switching pages */}
                        {isPageRendering && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/20 backdrop-blur-[1px] rounded-sm transition-opacity">
                                <div className="p-3 rounded-xl bg-black/75 text-emerald-400 flex items-center gap-2 text-xs font-medium shadow-2xl">
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>{language === "uz" ? "Sahifa ochilmoqda..." : "Загрузка страницы..."}</span>
                                </div>
                            </div>
                        )}

                        {/* High-DPI Canvas Paper with Book Shadow */}
                        <canvas
                            ref={canvasRef}
                            className="bg-white shadow-[0_15px_50px_rgba(0,0,0,0.65)] rounded-sm max-w-none transition-shadow"
                            style={{ display: "block" }}
                        />
                    </div>
                )}
            </main>

            {/* =============================================================== */}
            {/* MOBILE & TABLET BOTTOM BAR: TOUCH BUTTONS & SWIPE HINT */}
            {/* =============================================================== */}
            {status === "ready" && totalPages > 0 && (
                <footer className="h-16 sm:h-14 bg-[#161E17]/95 backdrop-blur-md border-t border-white/10 px-4 flex items-center justify-between gap-3 shrink-0 shadow-2xl z-20">
                    {/* Previous Page Button */}
                    <button
                        onClick={goToPrevPage}
                        disabled={currentPage <= 1}
                        className="flex-1 sm:flex-initial py-2.5 px-4 sm:px-5 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white disabled:opacity-30 disabled:hover:bg-white/10 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                        aria-label="Oldingi sahifa"
                    >
                        <ChevronLeft size={18} strokeWidth={2.5} />
                        <span>{language === "uz" ? "Oldingi" : "Назад"}</span>
                    </button>

                    {/* Page Indicator (Tap to jump) */}
                    <div className="text-center shrink-0 px-2">
                        <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                            {currentPage} <span className="text-gray-400 font-normal">/ {totalPages}</span>
                        </span>
                        <div className="text-[10px] text-gray-400 block sm:hidden">
                            {language === "uz" ? "Varaqlash uchun suring" : "Смахните для листания"}
                        </div>
                    </div>

                    {/* Next Page Button */}
                    <button
                        onClick={goToNextPage}
                        disabled={currentPage >= totalPages}
                        className="flex-1 sm:flex-initial py-2.5 px-4 sm:px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white disabled:opacity-30 disabled:hover:bg-emerald-600 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-900/30"
                        aria-label="Keyingi sahifa"
                    >
                        <span>{language === "uz" ? "Keyingi" : "Вперед"}</span>
                        <ChevronRight size={18} strokeWidth={2.5} />
                    </button>
                </footer>
            )}
        </div>
    );
}

export default BookCanvasReader;
