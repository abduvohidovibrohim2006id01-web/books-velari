"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    Loader2,
    BookOpen,
    Book,
    FileText,
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
    Zap,
    Volume2,
    VolumeX,
    Sparkles,
    Sun,
    Moon
} from "lucide-react";

// ============================================================================
// INDEXED DB CACHE HELPERS (kutubxona_reader_db_v1)
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
// REALISTIC WEB AUDIO SYNTHESIZER: PAPER TURN SOUND (0ms, 100% Offline)
// ============================================================================
class PaperSoundManager {
    private ctx: AudioContext | null = null;

    private getContext(): AudioContext | null {
        if (typeof window === "undefined") return null;
        try {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    this.ctx = new AudioCtx();
                }
            }
            if (this.ctx && this.ctx.state === "suspended") {
                this.ctx.resume().catch(() => {});
            }
            return this.ctx;
        } catch {
            return null;
        }
    }

    play() {
        try {
            const ctx = this.getContext();
            if (!ctx) return;

            const now = ctx.currentTime;
            const duration = 0.22;
            const bufferSize = Math.floor(ctx.sampleRate * duration);
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);

            // Natural textured noise: Pink/Brown noise with subtle random bursts
            let b0 = 0, b1 = 0, b2 = 0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99 * b0 + white * 0.05;
                b1 = 0.95 * b1 + white * 0.1;
                b2 = 0.85 * b2 + white * 0.25;
                const pink = (b0 + b1 + b2) * 0.35;
                const env = Math.sin((i / bufferSize) * Math.PI);
                const flutter = 1 + 0.25 * Math.sin(i * 0.06);
                data[i] = pink * env * flutter;
            }

            const noiseSource = ctx.createBufferSource();
            noiseSource.buffer = buffer;

            // Bandpass filter to match paper sliding frequencies (~1400Hz -> ~750Hz)
            const bandpass = ctx.createBiquadFilter();
            bandpass.type = "bandpass";
            bandpass.frequency.setValueAtTime(1500, now);
            bandpass.frequency.exponentialRampToValueAtTime(750, now + duration);
            bandpass.Q.setValueAtTime(2.0, now);

            // Lowpass filter to smooth out static crackles
            const lowpass = ctx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.setValueAtTime(2800, now);

            // Volume gain envelope (Soft attack + natural fade)
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.16, now + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

            noiseSource.connect(bandpass);
            bandpass.connect(lowpass);
            lowpass.connect(gain);
            gain.connect(ctx.destination);

            noiseSource.start(now);
            noiseSource.stop(now + duration);
        } catch {
            // Silently ignore if audio permission is restricted
        }
    }
}

const paperSound = new PaperSoundManager();

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
// COMPONENT PROPS & TYPES
// ============================================================================
export interface BookCanvasReaderProps {
    productId: string;
    bookTitle: string;
    coverUrl?: string | null;
    language?: "uz" | "ru";
    onClose: () => void;
}

export type PaperTheme = "sepia" | "white" | "night";
export type ViewMode = "double" | "single";

export function BookCanvasReader({
    productId,
    bookTitle,
    coverUrl,
    language = "uz",
    onClose,
}: BookCanvasReaderProps) {
    // Reader container refs
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Canvases
    const leftCanvasRef = useRef<HTMLCanvasElement>(null);
    const rightCanvasRef = useRef<HTMLCanvasElement>(null);
    const singleCanvasRef = useRef<HTMLCanvasElement>(null);

    // PDF / Network refs
    const xhrRef = useRef<XMLHttpRequest | null>(null);
    const pdfDocRef = useRef<any>(null);
    const leftRenderTaskRef = useRef<any>(null);
    const rightRenderTaskRef = useRef<any>(null);
    const singleRenderTaskRef = useRef<any>(null);

    // Loading & Network States
    const [status, setStatus] = useState<"checking" | "downloading" | "rendering" | "ready" | "error">("checking");
    const [downloadPercent, setDownloadPercent] = useState<number>(0);
    const [loadedBytes, setLoadedBytes] = useState<number>(0);
    const [totalBytes, setTotalBytes] = useState<number>(0);
    const [isFromCache, setIsFromCache] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // PDF Pages & View Mode
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [pageInputValue, setPageInputValue] = useState<string>("1");
    const [zoom, setZoom] = useState<number>(1.0);
    const [isFitWidth, setIsFitWidth] = useState<boolean>(false); // false = Fit Page to screen (Best for realistic book view)
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [isPageRendering, setIsPageRendering] = useState<boolean>(false);

    // Responsive Spread & View Preferences
    const [isNarrowScreen, setIsNarrowScreen] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<ViewMode>("double");
    const [paperTheme, setPaperTheme] = useState<PaperTheme>("sepia");
    const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);

    // 3D Flip Animation State
    const [isFlipping, setIsFlipping] = useState<boolean>(false);
    const [flipDirection, setFlipDirection] = useState<"next" | "prev" | null>(null);

    // Rendered Page Dimensions (for matching Inside Cover placeholders)
    const [renderedDims, setRenderedDims] = useState<{ width: number; height: number }>({ width: 440, height: 620 });

    // Touch swipe refs
    const touchStartCoords = useRef<{ x: number; y: number } | null>(null);

    // ------------------------------------------------------------------------
    // Screen size watcher for responsive spread (Narrow < 860px)
    // ------------------------------------------------------------------------
    useEffect(() => {
        const checkScreen = () => {
            const narrow = window.innerWidth < 860;
            setIsNarrowScreen(narrow);
        };
        checkScreen();
        window.addEventListener("resize", checkScreen);
        return () => window.removeEventListener("resize", checkScreen);
    }, []);

    // Load saved preferences from localStorage
    useEffect(() => {
        try {
            const savedTheme = localStorage.getItem("kutubxona_reader_theme") as PaperTheme;
            if (savedTheme && ["sepia", "white", "night"].includes(savedTheme)) {
                setPaperTheme(savedTheme);
            }
            const savedMode = localStorage.getItem("kutubxona_reader_mode") as ViewMode;
            if (savedMode && ["double", "single"].includes(savedMode)) {
                setViewMode(savedMode);
            }
            const savedSound = localStorage.getItem("kutubxona_reader_sound");
            if (savedSound !== null) {
                setIsSoundEnabled(savedSound === "true");
            }
        } catch (_) {}
    }, []);

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

            // Not in cache -> Download with real XHR progress
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
                    // Save to IndexedDB in background
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

            xhr.onabort = () => {};

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

    // Trigger initial loading on mount
    useEffect(() => {
        startLoadingBook();

        return () => {
            if (xhrRef.current) {
                xhrRef.current.abort();
            }
            if (leftRenderTaskRef.current) {
                try { leftRenderTaskRef.current.cancel(); } catch (_) {}
            }
            if (rightRenderTaskRef.current) {
                try { rightRenderTaskRef.current.cancel(); } catch (_) {}
            }
            if (singleRenderTaskRef.current) {
                try { singleRenderTaskRef.current.cancel(); } catch (_) {}
            }
        };
    }, [startLoadingBook]);

    // ------------------------------------------------------------------------
    // Calculate Left and Right Page Numbers for Two-Page Spread
    // ------------------------------------------------------------------------
    const effectiveIsDouble = viewMode === "double" && !isNarrowScreen;

    // Cover page is Page 1: displayed on the Right with inside cover on the Left
    const isCover = currentPage === 1;
    const leftPageNum: number | null = effectiveIsDouble
        ? (isCover ? null : (currentPage % 2 === 0 ? currentPage : currentPage - 1))
        : null;
    const rightPageNum: number | null = effectiveIsDouble
        ? (isCover ? 1 : ((leftPageNum ?? 0) + 1 <= totalPages ? (leftPageNum ?? 0) + 1 : null))
        : null;

    // ------------------------------------------------------------------------
    // 3. Render Canvas Pages (HiDPI Retina + Realistic Book Scaling)
    // ------------------------------------------------------------------------
    const renderSpread = useCallback(async () => {
        const doc = pdfDocRef.current;
        if (!doc || status !== "ready" || totalPages === 0) return;

        // Cancel previous ongoing render tasks
        if (leftRenderTaskRef.current) {
            try { leftRenderTaskRef.current.cancel(); } catch (_) {}
        }
        if (rightRenderTaskRef.current) {
            try { rightRenderTaskRef.current.cancel(); } catch (_) {}
        }
        if (singleRenderTaskRef.current) {
            try { singleRenderTaskRef.current.cancel(); } catch (_) {}
        }

        setIsPageRendering(true);

        try {
            const container = scrollContainerRef.current;
            const containerWidth = container ? container.clientWidth : window.innerWidth;
            const containerHeight = container ? container.clientHeight : window.innerHeight;
            const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

            const isDouble = viewMode === "double" && !isNarrowScreen;

            if (isDouble) {
                // Two-page realistic book layout
                const isFirstCover = currentPage === 1;
                const leftNum = isFirstCover ? null : (currentPage % 2 === 0 ? currentPage : currentPage - 1);
                const rightNum = isFirstCover ? 1 : ((leftNum ?? 0) + 1 <= totalPages ? (leftNum ?? 0) + 1 : null);

                // Sample page to compute natural aspect ratio
                const samplePageNum = rightNum || leftNum || 1;
                const samplePage = await doc.getPage(samplePageNum);
                const unscaledViewport = samplePage.getViewport({ scale: 1 });

                // Padding and spine width
                const horizPadding = window.innerWidth < 1024 ? 32 : 64;
                const vertPadding = 48;
                const spineWidth = 8;

                const maxAvailableWidth = Math.max(220, (containerWidth - horizPadding - spineWidth) / 2);
                const maxAvailableHeight = Math.max(300, containerHeight - vertPadding);

                // Scale: Fit to page (contain both width & height) or fit-width
                let baseScale = maxAvailableWidth / unscaledViewport.width;
                if (!isFitWidth) {
                    const heightScale = maxAvailableHeight / unscaledViewport.height;
                    baseScale = Math.min(baseScale, heightScale);
                }

                const finalScale = +(baseScale * zoom).toFixed(3);
                const targetWidth = Math.floor(unscaledViewport.width * finalScale);
                const targetHeight = Math.floor(unscaledViewport.height * finalScale);

                setRenderedDims({ width: targetWidth, height: targetHeight });

                // Render Left Page Canvas
                if (leftNum && leftCanvasRef.current) {
                    const page = await doc.getPage(leftNum);
                    const viewport = page.getViewport({ scale: finalScale });
                    const canvas = leftCanvasRef.current;
                    canvas.width = Math.floor(viewport.width * dpr);
                    canvas.height = Math.floor(viewport.height * dpr);
                    canvas.style.width = `${Math.floor(viewport.width)}px`;
                    canvas.style.height = `${Math.floor(viewport.height)}px`;

                    const ctx = canvas.getContext("2d", { alpha: false });
                    if (ctx) {
                        ctx.fillStyle = paperTheme === "night" ? "#1E1E24" : paperTheme === "sepia" ? "#F9F6EE" : "#FFFFFF";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        const task = page.render({
                            canvasContext: ctx,
                            viewport,
                            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                        });
                        leftRenderTaskRef.current = task;
                        await task.promise;
                    }
                }

                // Render Right Page Canvas
                if (rightNum && rightCanvasRef.current) {
                    const page = await doc.getPage(rightNum);
                    const viewport = page.getViewport({ scale: finalScale });
                    const canvas = rightCanvasRef.current;
                    canvas.width = Math.floor(viewport.width * dpr);
                    canvas.height = Math.floor(viewport.height * dpr);
                    canvas.style.width = `${Math.floor(viewport.width)}px`;
                    canvas.style.height = `${Math.floor(viewport.height)}px`;

                    const ctx = canvas.getContext("2d", { alpha: false });
                    if (ctx) {
                        ctx.fillStyle = paperTheme === "night" ? "#1E1E24" : paperTheme === "sepia" ? "#F9F6EE" : "#FFFFFF";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        const task = page.render({
                            canvasContext: ctx,
                            viewport,
                            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                        });
                        rightRenderTaskRef.current = task;
                        await task.promise;
                    }
                }
            } else {
                // Single-page clean view
                if (singleCanvasRef.current) {
                    const page = await doc.getPage(currentPage);
                    const unscaledViewport = page.getViewport({ scale: 1 });

                    const padding = window.innerWidth < 640 ? 16 : 48;
                    const availableWidth = Math.max(260, containerWidth - padding);
                    const availableHeight = Math.max(300, containerHeight - padding);

                    let baseScale = availableWidth / unscaledViewport.width;
                    if (!isFitWidth) {
                        const heightScale = availableHeight / unscaledViewport.height;
                        baseScale = Math.min(baseScale, heightScale);
                    }

                    const finalScale = +(baseScale * zoom).toFixed(3);
                    const viewport = page.getViewport({ scale: finalScale });
                    const canvas = singleCanvasRef.current;

                    canvas.width = Math.floor(viewport.width * dpr);
                    canvas.height = Math.floor(viewport.height * dpr);
                    canvas.style.width = `${Math.floor(viewport.width)}px`;
                    canvas.style.height = `${Math.floor(viewport.height)}px`;

                    const ctx = canvas.getContext("2d", { alpha: false });
                    if (ctx) {
                        ctx.fillStyle = paperTheme === "night" ? "#1E1E24" : paperTheme === "sepia" ? "#F9F6EE" : "#FFFFFF";
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        const task = page.render({
                            canvasContext: ctx,
                            viewport,
                            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                        });
                        singleRenderTaskRef.current = task;
                        await task.promise;
                    }

                    setRenderedDims({
                        width: Math.floor(viewport.width),
                        height: Math.floor(viewport.height),
                    });
                }
            }

            setIsPageRendering(false);

            // Persist current page to localStorage
            try {
                localStorage.setItem(`book_page_${productId}`, String(currentPage));
            } catch (_) {}
        } catch (err: any) {
            if (err?.name !== "RenderingCancelledException") {
                console.error("[BookCanvasReader] Render spread error:", err);
            }
            setIsPageRendering(false);
        }
    }, [viewMode, isNarrowScreen, currentPage, totalPages, zoom, isFitWidth, paperTheme, productId, status]);

    // Trigger render on dependency changes
    useEffect(() => {
        if (status === "ready" && totalPages > 0) {
            renderSpread();
            setPageInputValue(String(currentPage));
        }
    }, [status, currentPage, totalPages, viewMode, isNarrowScreen, zoom, isFitWidth, paperTheme, renderSpread]);

    // Re-render on window resize debounce
    useEffect(() => {
        if (status !== "ready") return;

        let resizeTimer: any;
        const handleResize = () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                renderSpread();
            }, 120);
        };

        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
            clearTimeout(resizeTimer);
        };
    }, [status, renderSpread]);

    // ------------------------------------------------------------------------
    // 4. Navigation Actions with 3D Flip & Sound
    // ------------------------------------------------------------------------
    const triggerFlipAnimation = (direction: "next" | "prev", onComplete: () => void) => {
        if (isSoundEnabled) {
            paperSound.play();
        }

        setIsFlipping(true);
        setFlipDirection(direction);

        setTimeout(() => {
            onComplete();
            setIsFlipping(false);
            setFlipDirection(null);
        }, 360);
    };

    const goToPrevPage = useCallback(() => {
        if (currentPage <= 1 || isFlipping) return;

        triggerFlipAnimation("prev", () => {
            setCurrentPage((prev) => {
                if (effectiveIsDouble) {
                    if (prev <= 2) return 1;
                    const left = prev % 2 === 0 ? prev : prev - 1;
                    return Math.max(1, left - 2);
                } else {
                    return Math.max(1, prev - 1);
                }
            });
        });
    }, [currentPage, isFlipping, effectiveIsDouble, isSoundEnabled]);

    const goToNextPage = useCallback(() => {
        if (currentPage >= totalPages || isFlipping) return;

        triggerFlipAnimation("next", () => {
            setCurrentPage((prev) => {
                if (effectiveIsDouble) {
                    if (prev === 1) return 2;
                    const left = prev % 2 === 0 ? prev : prev - 1;
                    const next = left + 2;
                    return next <= totalPages ? next : totalPages;
                } else {
                    return Math.min(totalPages, prev + 1);
                }
            });
        });
    }, [currentPage, totalPages, isFlipping, effectiveIsDouble, isSoundEnabled]);

    const handlePageInputSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseInt(pageInputValue, 10);
        if (!isNaN(num) && num >= 1 && num <= totalPages) {
            if (isSoundEnabled) paperSound.play();
            setCurrentPage(num);
        } else {
            setPageInputValue(String(currentPage));
        }
    };

    // Zoom Actions
    const handleZoomIn = () => {
        setIsFitWidth(false);
        setZoom((prev) => Math.min(2.5, +(prev + 0.2).toFixed(2)));
    };

    const handleZoomOut = () => {
        setIsFitWidth(false);
        setZoom((prev) => Math.max(0.6, +(prev - 0.2).toFixed(2)));
    };

    const handleToggleFitWidth = () => {
        setIsFitWidth((prev) => !prev);
    };

    // View Mode Toggle (Double vs Single)
    const toggleViewMode = () => {
        const nextMode = viewMode === "double" ? "single" : "double";
        setViewMode(nextMode);
        try {
            localStorage.setItem("kutubxona_reader_mode", nextMode);
        } catch (_) {}
    };

    // Paper Theme Toggle
    const handleSetTheme = (theme: PaperTheme) => {
        setPaperTheme(theme);
        try {
            localStorage.setItem("kutubxona_reader_theme", theme);
        } catch (_) {}
    };

    // Sound Toggle
    const toggleSound = () => {
        setIsSoundEnabled((prev) => {
            const next = !prev;
            try {
                localStorage.setItem("kutubxona_reader_sound", String(next));
            } catch (_) {}
            if (next) paperSound.play();
            return next;
        });
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

    // Touch Swipe Navigation for mobile & tablet
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

        // Minimum swipe distance 50px, horizontal dominance
        if (Math.abs(diffX) > 50 && Math.abs(diffX) > Math.abs(diffY) * 1.4) {
            if (diffX < 0) {
                goToNextPage();
            } else {
                goToPrevPage();
            }
        }
    };

    // Paper Theme Styles
    const getThemePaperFilter = () => {
        switch (paperTheme) {
            case "sepia":
                return "sepia(0.24) contrast(0.97) brightness(0.98)";
            case "night":
                return "invert(0.91) hue-rotate(180deg) contrast(1.1) brightness(0.92)";
            case "white":
            default:
                return "none";
        }
    };

    const getThemeContainerBg = () => {
        switch (paperTheme) {
            case "sepia":
                return "bg-[#181D17]";
            case "night":
                return "bg-[#0C0D10]";
            case "white":
            default:
                return "bg-[#131914]";
        }
    };

    // Format Page Indicator label
    const getPageDisplayLabel = () => {
        if (!effectiveIsDouble) {
            return `${currentPage} / ${totalPages}`;
        }
        if (isCover) {
            return `1 / ${totalPages}`;
        }
        if (leftPageNum && rightPageNum) {
            return `${leftPageNum}-${rightPageNum} / ${totalPages}`;
        }
        if (leftPageNum) {
            return `${leftPageNum} / ${totalPages}`;
        }
        return `${currentPage} / ${totalPages}`;
    };

    return (
        <div
            ref={containerRef}
            className={`fixed inset-0 z-[250] flex flex-col ${getThemeContainerBg()} text-white animate-in fade-in duration-200 select-none overflow-hidden`}
            role="dialog"
            aria-modal="true"
            aria-label={bookTitle}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* CSS Animation Keyframes for realistic 3D page flip */}
            <style jsx>{`
                @keyframes flipNext {
                    0% {
                        transform: rotateY(0deg);
                        filter: brightness(1);
                    }
                    50% {
                        transform: rotateY(-90deg) scale(0.98);
                        filter: brightness(0.75);
                    }
                    100% {
                        transform: rotateY(-180deg);
                        filter: brightness(1);
                    }
                }
                @keyframes flipPrev {
                    0% {
                        transform: rotateY(0deg);
                        filter: brightness(1);
                    }
                    50% {
                        transform: rotateY(90deg) scale(0.98);
                        filter: brightness(0.75);
                    }
                    100% {
                        transform: rotateY(180deg);
                        filter: brightness(1);
                    }
                }
                .anim-flip-next {
                    transform-origin: left center;
                    animation: flipNext 360ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
                    backface-visibility: hidden;
                }
                .anim-flip-prev {
                    transform-origin: right center;
                    animation: flipPrev 360ms cubic-bezier(0.25, 1, 0.5, 1) forwards;
                    backface-visibility: hidden;
                }
            `}</style>

            {/* =============================================================== */}
            {/* TOP HEADER BAR */}
            {/* =============================================================== */}
            <header className="h-14 sm:h-16 bg-[#161E17]/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-5 flex items-center justify-between gap-2 shrink-0 shadow-lg z-30">
                {/* Left: Book Icon & Title */}
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 max-w-[35%] sm:max-w-xs md:max-w-sm lg:max-w-md">
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
                                {language === "uz" ? "Haqiqiy kitob mutolaasi" : "Книжный ридер"}
                            </span>
                            {isFromCache && (
                                <span className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold">
                                    <Zap size={10} className="text-yellow-400 fill-yellow-400" />
                                    {language === "uz" ? "Keshdan" : "Кэш"}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Center: Page Navigation (Only shown when ready) */}
                {status === "ready" && totalPages > 0 && (
                    <div className="flex items-center gap-1 sm:gap-1.5 bg-black/35 border border-white/10 rounded-xl px-1.5 py-1 sm:px-2 shadow-inner">
                        <button
                            onClick={goToPrevPage}
                            disabled={currentPage <= 1 || isFlipping}
                            className="p-1 sm:p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent active:scale-95 transition-all"
                            title={language === "uz" ? "Oldingi sahifa (ArrowLeft)" : "Предыдущая (ArrowLeft)"}
                            aria-label="Previous Page"
                        >
                            <ChevronLeft size={17} strokeWidth={2.5} />
                        </button>

                        <form onSubmit={handlePageInputSubmit} className="flex items-center gap-1 text-xs font-semibold px-0.5">
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={pageInputValue}
                                onChange={(e) => setPageInputValue(e.target.value)}
                                onBlur={handlePageInputSubmit}
                                className="w-8 sm:w-11 text-center bg-black/50 border border-white/20 rounded-md py-0.5 text-xs font-bold text-white focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                            <span className="text-gray-400">/</span>
                            <span className="text-gray-200 text-xs">{totalPages}</span>
                        </form>

                        <button
                            onClick={goToNextPage}
                            disabled={currentPage >= totalPages || isFlipping}
                            className="p-1 sm:p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:hover:bg-transparent active:scale-95 transition-all"
                            title={language === "uz" ? "Keyingi sahifa (ArrowRight)" : "Следующая (ArrowRight)"}
                            aria-label="Next Page"
                        >
                            <ChevronRight size={17} strokeWidth={2.5} />
                        </button>
                    </div>
                )}

                {/* Right: Controls & Options */}
                <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
                    {/* View Mode Switcher: 2 Pages (Book) vs 1 Page (Single) */}
                    {status === "ready" && !isNarrowScreen && (
                        <button
                            onClick={toggleViewMode}
                            className="px-2 py-1.5 sm:px-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 hover:text-white text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-all"
                            title={
                                viewMode === "double"
                                    ? language === "uz" ? "Yakka sahifa rejimiga o'tish" : "Перейти в одну страницу"
                                    : language === "uz" ? "Kitob ko'rinishiga (2 sahifa) o'tish" : "Перейти в 2 страницы (книга)"
                            }
                        >
                            {viewMode === "double" ? (
                                <>
                                    <Book size={15} className="text-emerald-400" />
                                    <span className="hidden lg:inline text-[11px] font-semibold">
                                        {language === "uz" ? "Kitob (2 sahifa)" : "Разворот (2 стр)"}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <FileText size={15} className="text-blue-400" />
                                    <span className="hidden lg:inline text-[11px] font-semibold">
                                        {language === "uz" ? "Yakka sahifa" : "Одна страница"}
                                    </span>
                                </>
                            )}
                        </button>
                    )}

                    {/* Paper Theme Picker: Sepia, White, Night */}
                    {status === "ready" && (
                        <div className="flex items-center gap-0.5 bg-black/40 border border-white/10 rounded-xl p-0.5 sm:p-1">
                            <button
                                onClick={() => handleSetTheme("sepia")}
                                className={`px-1.5 sm:px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all ${
                                    paperTheme === "sepia"
                                        ? "bg-[#D9CDB8] text-[#2C2416] shadow-sm font-extrabold"
                                        : "text-gray-400 hover:text-white"
                                }`}
                                title={language === "uz" ? "Kitob qog'ozi (Issiq Sepia)" : "Книжная бумага (Сепия)"}
                            >
                                <span className="w-2.5 h-2.5 rounded-full bg-[#E5D7BC] border border-[#AFA085]" />
                                <span className="hidden md:inline">{language === "uz" ? "Sepia" : "Сепия"}</span>
                            </button>
                            <button
                                onClick={() => handleSetTheme("white")}
                                className={`px-1.5 sm:px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all ${
                                    paperTheme === "white"
                                        ? "bg-white text-gray-900 shadow-sm font-extrabold"
                                        : "text-gray-400 hover:text-white"
                                }`}
                                title={language === "uz" ? "Oq qog'oz" : "Белая бумага"}
                            >
                                <Sun size={12} className={paperTheme === "white" ? "text-amber-500" : "text-gray-400"} />
                                <span className="hidden md:inline">{language === "uz" ? "Oq" : "Белая"}</span>
                            </button>
                            <button
                                onClick={() => handleSetTheme("night")}
                                className={`px-1.5 sm:px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold flex items-center gap-1 transition-all ${
                                    paperTheme === "night"
                                        ? "bg-indigo-950 text-indigo-200 border border-indigo-700/50 shadow-sm font-extrabold"
                                        : "text-gray-400 hover:text-white"
                                }`}
                                title={language === "uz" ? "Tungi rejim" : "Ночной режим"}
                            >
                                <Moon size={12} className={paperTheme === "night" ? "text-indigo-300" : "text-gray-400"} />
                                <span className="hidden md:inline">{language === "uz" ? "Tungi" : "Ночь"}</span>
                            </button>
                        </div>
                    )}

                    {/* Paper Turn Sound Toggle */}
                    {status === "ready" && (
                        <button
                            onClick={toggleSound}
                            className={`p-2 rounded-xl border border-white/10 active:scale-95 transition-all ${
                                isSoundEnabled
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                    : "bg-white/5 text-gray-400 hover:text-white"
                            }`}
                            title={
                                isSoundEnabled
                                    ? language === "uz" ? "Varaqlash tovushi: Yoqiq" : "Звук страниц: Вкл"
                                    : language === "uz" ? "Varaqlash tovushi: O'chiq" : "Звук страниц: Выкл"
                            }
                        >
                            {isSoundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        </button>
                    )}

                    {/* Zoom Controls (Desktop only) */}
                    {status === "ready" && (
                        <div className="hidden xl:flex items-center gap-0.5 bg-black/40 border border-white/10 rounded-xl p-0.5">
                            <button
                                onClick={handleZoomOut}
                                className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 transition-colors"
                                title={language === "uz" ? "Kichraytirish (-)" : "Уменьшить (-)"}
                            >
                                <ZoomOut size={14} />
                            </button>
                            <button
                                onClick={handleToggleFitWidth}
                                className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                                    isFitWidth
                                        ? "bg-emerald-600 text-white"
                                        : "text-gray-300 hover:text-white"
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
                                <ZoomIn size={14} />
                            </button>
                        </div>
                    )}

                    {/* Fullscreen Toggle */}
                    <button
                        onClick={toggleFullscreen}
                        className="p-2 sm:px-2.5 sm:py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium flex items-center gap-1.5 active:scale-95 transition-colors"
                        title={
                            isFullscreen
                                ? language === "uz" ? "Oyna rejimiga qaytish" : "Оконный режим"
                                : language === "uz" ? "To'liq ekran" : "Во весь экран"
                        }
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>

                    {/* Close (Esc) */}
                    <button
                        onClick={() => {
                            if (document.fullscreenElement) {
                                document.exitFullscreen().catch(() => {});
                            }
                            onClose();
                        }}
                        className="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 active:scale-95 text-white flex items-center justify-center transition-colors ml-0.5"
                        title={language === "uz" ? "Yopish (Esc)" : "Закрыть (Esc)"}
                    >
                        <X size={18} strokeWidth={2.4} />
                    </button>
                </div>
            </header>

            {/* =============================================================== */}
            {/* READER MAIN CANVAS SPREAD OR LOADING SCREEN */}
            {/* =============================================================== */}
            <main
                ref={scrollContainerRef}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                className="flex-1 w-full h-full relative overflow-auto flex flex-col items-center justify-start py-4 sm:py-6 px-2 sm:px-4"
                style={{
                    WebkitOverflowScrolling: "touch",
                    perspective: "2200px",
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

                        {/* Status text & bar */}
                        {status === "checking" && (
                            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                                <Loader2 size={14} className="animate-spin text-emerald-400" />
                                {language === "uz" ? "Xotira kesh tekshirilmoqda..." : "Проверка кэша книги..."}
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

                                {/* Animated Emerald Progress Bar */}
                                <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5 shadow-inner">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-400 rounded-full transition-all duration-200 ease-out relative overflow-hidden"
                                        style={{ width: `${Math.max(5, downloadPercent)}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/25 animate-pulse" />
                                    </div>
                                </div>

                                {/* Downloaded size indicator */}
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
                                    {language === "uz" ? "Haqiqiy sahifalar tayyorlanmoqda..." : "Подготовка страниц книги..."}
                                </div>
                                <div className="w-full h-1.5 bg-emerald-500/20 rounded-full overflow-hidden mt-1">
                                    <div className="h-full bg-emerald-400 rounded-full animate-indeterminate" />
                                </div>
                            </div>
                        )}

                        {/* Helpful Footnote */}
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

                {/* 3. READY STATE: REALISTIC TWO-PAGE BOOK SPREAD OR SINGLE PAGE */}
                {status === "ready" && (
                    <div className="relative my-auto flex flex-col items-center justify-center transition-all select-none">
                        {/* Rendering Spinner Overlay during page transitions */}
                        {isPageRendering && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-[1px] rounded-lg transition-opacity pointer-events-none">
                                <div className="p-3 rounded-2xl bg-black/80 text-emerald-400 flex items-center gap-2.5 text-xs font-semibold shadow-2xl border border-white/10">
                                    <Loader2 size={16} className="animate-spin text-emerald-400" />
                                    <span>{language === "uz" ? "Sahifa ochilmoqda..." : "Листание страницы..."}</span>
                                </div>
                            </div>
                        )}

                        {/* =================================================== */}
                        {/* A. TWO-PAGE BOOK SPREAD (Desktop & Tablet >= 860px) */}
                        {/* =================================================== */}
                        {effectiveIsDouble ? (
                            <div
                                className="relative flex items-center justify-center rounded-sm transition-all"
                                style={{
                                    perspective: "2500px",
                                    transformStyle: "preserve-3d",
                                }}
                            >
                                {/* Hardcover Leather Trim Border (Backing Book Shell) */}
                                <div
                                    className="absolute -inset-2.5 sm:-inset-3.5 rounded-xl pointer-events-none transition-colors"
                                    style={{
                                        background:
                                            paperTheme === "night"
                                                ? "linear-gradient(145deg, #1A1A22, #0E0F14)"
                                                : "linear-gradient(145deg, #241D17, #13100D)",
                                        boxShadow:
                                            "0 25px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255,255,255,0.06), 0 10px 20px rgba(0,0,0,0.5)",
                                    }}
                                />

                                {/* Realistic Center Spine Crease Overlay */}
                                <div
                                    className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-8 sm:w-10 z-20 pointer-events-none"
                                    style={{
                                        background:
                                            "linear-gradient(to right, transparent, rgba(0,0,0,0.15) 46%, rgba(0,0,0,0.32) 50%, rgba(0,0,0,0.15) 54%, transparent)",
                                    }}
                                />

                                {/* ------------------------------------------------ */}
                                {/* LEFT PAGE (Even page or Inside Front Cover)       */}
                                {/* ------------------------------------------------ */}
                                <div
                                    className={`relative flex items-center justify-center overflow-hidden transition-all duration-300 ${
                                        flipDirection === "prev" && isFlipping ? "anim-flip-prev z-30" : "z-10"
                                    }`}
                                    style={{
                                        filter: getThemePaperFilter(),
                                        // Stacked paper edge effect on left
                                        boxShadow:
                                            paperTheme === "night"
                                                ? "-3px 0 0 -1px #1E1E26, -6px 0 0 -2px #181820, -9px 0 0 -3px #121218, -16px 12px 35px rgba(0,0,0,0.7)"
                                                : "-3px 0 0 -1px #E5DFD3, -6px 0 0 -2px #D8D1C4, -9px 0 0 -3px #CAC3B4, -16px 12px 35px rgba(0,0,0,0.6)",
                                    }}
                                >
                                    {leftPageNum ? (
                                        <>
                                            <canvas
                                                ref={leftCanvasRef}
                                                className="bg-white block"
                                            />
                                            {/* Spine inner shadow for left page */}
                                            <div
                                                className="absolute top-0 right-0 bottom-0 w-12 sm:w-16 pointer-events-none"
                                                style={{
                                                    background:
                                                        "linear-gradient(to left, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 35%, transparent 100%)",
                                                }}
                                            />
                                            {/* Left Page Number Badge */}
                                            <div className="absolute bottom-2 left-4 text-[11px] font-semibold text-gray-500/80 pointer-events-none">
                                                {leftPageNum}
                                            </div>
                                        </>
                                    ) : (
                                        /* INSIDE FRONT COVER (Forzats) when on Page 1 */
                                        <div
                                            className="flex flex-col items-center justify-between p-6 sm:p-8 text-center select-none"
                                            style={{
                                                width: `${renderedDims.width}px`,
                                                height: `${renderedDims.height}px`,
                                                background:
                                                    paperTheme === "night"
                                                        ? "radial-gradient(circle at 70% 30%, #1c1d28 0%, #12131b 100%)"
                                                        : "radial-gradient(circle at 70% 30%, #1E2D22 0%, #121C15 100%)",
                                                borderRight: "1px solid rgba(0,0,0,0.4)",
                                            }}
                                        >
                                            {/* Decorative Vintage Border */}
                                            <div className="w-full h-full border border-emerald-500/30 rounded-lg p-5 flex flex-col items-center justify-between relative shadow-inner">
                                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold tracking-wider uppercase">
                                                    <Sparkles size={14} />
                                                    <span>Kutubxona Elektron Mutolaa</span>
                                                </div>

                                                <div className="flex flex-col items-center max-w-[85%] my-auto">
                                                    <div className="w-16 h-22 sm:w-20 sm:h-28 rounded-xl bg-black/40 border border-white/20 overflow-hidden shadow-2xl mb-4 flex items-center justify-center">
                                                        {coverUrl ? (
                                                            <img
                                                                src={coverUrl}
                                                                alt=""
                                                                className="w-full h-full object-cover"
                                                            />
                                                        ) : (
                                                            <BookOpen size={32} className="text-emerald-400" />
                                                        )}
                                                    </div>
                                                    <h3 className="text-base sm:text-lg font-bold text-white line-clamp-2">
                                                        {bookTitle}
                                                    </h3>
                                                    <p className="text-[11px] sm:text-xs text-emerald-300/80 mt-2">
                                                        {language === "uz" ? "Mualliflik nusxasi • To'liq kitob" : "Электронное издание книги"}
                                                    </p>
                                                </div>

                                                <div className="text-[10px] sm:text-[11px] text-gray-400 font-medium">
                                                    {language === "uz"
                                                        ? "O'ng tomonda 1-sahifa (Muqova). Mutolaani boshlash uchun o'ng tomonga bosing →"
                                                        : "Справа страница 1 (Обложка). Нажмите для чтения →"}
                                                </div>
                                            </div>

                                            {/* Spine crease inner shadow */}
                                            <div
                                                className="absolute top-0 right-0 bottom-0 w-12 pointer-events-none"
                                                style={{
                                                    background:
                                                        "linear-gradient(to left, rgba(0,0,0,0.25) 0%, transparent 100%)",
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* ------------------------------------------------ */}
                                {/* RIGHT PAGE (Odd page or Inside Back Cover)        */}
                                {/* ------------------------------------------------ */}
                                <div
                                    className={`relative flex items-center justify-center overflow-hidden transition-all duration-300 ${
                                        flipDirection === "next" && isFlipping ? "anim-flip-next z-30" : "z-10"
                                    }`}
                                    style={{
                                        filter: getThemePaperFilter(),
                                        // Stacked paper edge effect on right
                                        boxShadow:
                                            paperTheme === "night"
                                                ? "3px 0 0 -1px #1E1E26, 6px 0 0 -2px #181820, 9px 0 0 -3px #121218, 16px 12px 35px rgba(0,0,0,0.7)"
                                                : "3px 0 0 -1px #E5DFD3, 6px 0 0 -2px #D8D1C4, 9px 0 0 -3px #CAC3B4, 16px 12px 35px rgba(0,0,0,0.6)",
                                    }}
                                >
                                    {rightPageNum ? (
                                        <>
                                            <canvas
                                                ref={rightCanvasRef}
                                                className="bg-white block"
                                            />
                                            {/* Spine inner shadow for right page */}
                                            <div
                                                className="absolute top-0 left-0 bottom-0 w-12 sm:w-16 pointer-events-none"
                                                style={{
                                                    background:
                                                        "linear-gradient(to right, rgba(0,0,0,0.22) 0%, rgba(0,0,0,0.08) 35%, transparent 100%)",
                                                }}
                                            />
                                            {/* Right Page Number Badge */}
                                            <div className="absolute bottom-2 right-4 text-[11px] font-semibold text-gray-500/80 pointer-events-none">
                                                {rightPageNum}
                                            </div>
                                        </>
                                    ) : (
                                        /* INSIDE BACK COVER when odd final page ends */
                                        <div
                                            className="flex flex-col items-center justify-between p-6 sm:p-8 text-center select-none"
                                            style={{
                                                width: `${renderedDims.width}px`,
                                                height: `${renderedDims.height}px`,
                                                background:
                                                    paperTheme === "night"
                                                        ? "radial-gradient(circle at 30% 30%, #1c1d28 0%, #12131b 100%)"
                                                        : "radial-gradient(circle at 30% 30%, #1E2D22 0%, #121C15 100%)",
                                                borderLeft: "1px solid rgba(0,0,0,0.4)",
                                            }}
                                        >
                                            <div className="w-full h-full border border-emerald-500/30 rounded-lg p-5 flex flex-col items-center justify-center text-center">
                                                <CheckCircle2 size={40} className="text-emerald-400 mb-3" />
                                                <h3 className="text-base sm:text-lg font-bold text-white mb-2">
                                                    {language === "uz" ? "Mutolaa Yakunlandi" : "Конец книги"}
                                                </h3>
                                                <p className="text-xs text-gray-300 max-w-xs mb-4">
                                                    {language === "uz"
                                                        ? "Siz kitobning barcha sahifalarini o'qib tugatdingiz."
                                                        : "Вы прочитали все страницы этой книги."}
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        if (isSoundEnabled) paperSound.play();
                                                        setCurrentPage(1);
                                                    }}
                                                    className="py-2 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold active:scale-95 transition-all shadow-lg shadow-emerald-900/30"
                                                >
                                                    {language === "uz" ? "Boshiga qaytish (1-sahifa)" : "В начало (Стр. 1)"}
                                                </button>
                                            </div>

                                            {/* Spine crease inner shadow */}
                                            <div
                                                className="absolute top-0 left-0 bottom-0 w-12 pointer-events-none"
                                                style={{
                                                    background:
                                                        "linear-gradient(to right, rgba(0,0,0,0.25) 0%, transparent 100%)",
                                                }}
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* =================================================== */
                            /* B. SINGLE PAGE VIEW (Mobile / Tablet or User Pick)  */
                            /* =================================================== */
                            <div
                                className={`relative flex items-center justify-center rounded-sm transition-all ${
                                    isFlipping
                                        ? flipDirection === "next"
                                            ? "anim-flip-next"
                                            : "anim-flip-prev"
                                        : ""
                                }`}
                                style={{
                                    filter: getThemePaperFilter(),
                                    // Stacked paper depth shadow for single sheet
                                    boxShadow:
                                        paperTheme === "night"
                                            ? "0 20px 50px rgba(0,0,0,0.8), -3px 0 0 -1px #1E1E26, 3px 0 0 -1px #1E1E26"
                                            : "0 20px 50px rgba(0,0,0,0.65), -3px 0 0 -1px #E5DFD3, 3px 0 0 -1px #E5DFD3",
                                }}
                            >
                                <canvas
                                    ref={singleCanvasRef}
                                    className="bg-white block rounded-sm"
                                />

                                {/* Single Page Number Badge */}
                                <div className="absolute bottom-2 right-4 text-[11px] font-semibold text-gray-500/80 pointer-events-none">
                                    {currentPage}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* =============================================================== */}
            {/* BOTTOM BAR: LARGE TOUCH BUTTONS & SPREAD NAVIGATION */}
            {/* =============================================================== */}
            {status === "ready" && totalPages > 0 && (
                <footer className="h-16 sm:h-14 bg-[#161E17]/95 backdrop-blur-md border-t border-white/10 px-4 flex items-center justify-between gap-3 shrink-0 shadow-2xl z-30">
                    {/* Previous Page Button */}
                    <button
                        onClick={goToPrevPage}
                        disabled={currentPage <= 1 || isFlipping}
                        className="flex-1 sm:flex-initial py-2.5 px-4 sm:px-6 rounded-xl bg-white/10 hover:bg-white/15 active:scale-95 text-white disabled:opacity-30 disabled:hover:bg-white/10 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all"
                        aria-label="Oldingi sahifa"
                    >
                        <ChevronLeft size={18} strokeWidth={2.5} />
                        <span>{language === "uz" ? "Oldingi" : "Назад"}</span>
                    </button>

                    {/* Page Indicator Badge */}
                    <div className="text-center shrink-0 px-2">
                        <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                            {getPageDisplayLabel()}
                        </span>
                        <div className="text-[10px] text-gray-400 block sm:hidden">
                            {language === "uz" ? "Varaqlash uchun suring" : "Смахните для листания"}
                        </div>
                    </div>

                    {/* Next Page Button */}
                    <button
                        onClick={goToNextPage}
                        disabled={currentPage >= totalPages || isFlipping}
                        className="flex-1 sm:flex-initial py-2.5 px-4 sm:px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white disabled:opacity-30 disabled:hover:bg-emerald-600 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all shadow-lg shadow-emerald-900/30"
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
