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
    Moon,
    Palette
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
            const duration = 0.24;
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

            // Bandpass filter to match paper sliding frequencies (~1450Hz -> ~750Hz)
            const bandpass = ctx.createBiquadFilter();
            bandpass.type = "bandpass";
            bandpass.frequency.setValueAtTime(1450, now);
            bandpass.frequency.exponentialRampToValueAtTime(750, now + duration);
            bandpass.Q.setValueAtTime(2.2, now);

            // Lowpass filter to smooth out static crackles
            const lowpass = ctx.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.setValueAtTime(2600, now);

            // Volume gain envelope
            const gain = ctx.createGain();
            gain.gain.setValueAtTime(0.001, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.03);
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

interface FlipState {
    direction: "next" | "prev";
    frontSnapshot: string | null;
    backSnapshot: string | null;
    underlyingSnapshot: string | null;
    underlyingPageNum: number | null;
    backPageNum: number | null;
}

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
    const pdfDocRef = useRef<any>(null);
    const leftRenderTaskRef = useRef<any>(null);
    const rightRenderTaskRef = useRef<any>(null);
    const singleRenderTaskRef = useRef<any>(null);

    // Page snapshots cache (for instantaneous 0ms 3D flip textures)
    const pageSnapshotsRef = useRef<Map<number, string>>(new Map());

    // Loading & Network States
    const [status, setStatus] = useState<"checking" | "downloading" | "rendering" | "ready" | "error">("checking");
    const [downloadPercent, setDownloadPercent] = useState<number>(0);
    const [loadedBytes, setLoadedBytes] = useState<number>(0);
    const [totalBytes, setTotalBytes] = useState<number>(0);
    const [isFromCache, setIsFromCache] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // PDF Pages, View Mode & Zoom
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [totalPages, setTotalPages] = useState<number>(0);
    const [pageInputValue, setPageInputValue] = useState<string>("1");
    const [zoom, setZoom] = useState<number>(1.0);
    const [isFitWidth, setIsFitWidth] = useState<boolean>(false);
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
    const [isPageRendering, setIsPageRendering] = useState<boolean>(false);

    // Realtime pinch visual scale (CSS transform during finger gesture)
    const [pinchVisualScale, setPinchVisualScale] = useState<number>(1.0);

    // Responsive Spread & View Preferences
    const [isNarrowScreen, setIsNarrowScreen] = useState<boolean>(false);
    const [viewMode, setViewMode] = useState<ViewMode>("double");
    const [paperTheme, setPaperTheme] = useState<PaperTheme>("sepia");
    const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(true);
    const [showThemeMenu, setShowThemeMenu] = useState<boolean>(false);

    // 3D Flip Animation State
    const [isFlipping, setIsFlipping] = useState<boolean>(false);
    const [flipState, setFlipState] = useState<FlipState | null>(null);

    // Rendered Page Dimensions (for matching Inside Cover placeholders)
    const [renderedDims, setRenderedDims] = useState<{ width: number; height: number }>({ width: 440, height: 620 });

    // Touch, Swipe, Double-Tap & Pinch Zoom refs
    const touchStartCoords = useRef<{ x: number; y: number } | null>(null);
    const pendingScrollCenterRef = useRef<{ x: number; y: number } | null>(null);
    const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
    const isPinchingRef = useRef<boolean>(false);
    const pinchStartDistRef = useRef<number>(0);
    const pinchStartZoomRef = useRef<number>(1.0);
    const pinchCurrentFactorRef = useRef<number>(1.0);

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
    // Restore last read page helper
    // ------------------------------------------------------------------------
    const initReaderPage = (docNumPages: number) => {
        let initialPage = 1;
        try {
            const saved = localStorage.getItem(`book_page_${productId}`);
            if (saved) {
                const parsed = parseInt(saved, 10);
                if (parsed >= 1 && parsed <= docNumPages) {
                    initialPage = parsed;
                }
            }
        } catch (_) {}
        setCurrentPage(initialPage);
        setPageInputValue(String(initialPage));
    };

    // ------------------------------------------------------------------------
    // 1. Initial Load: Progressive HTTP Range Streaming with Background Cache
    // ------------------------------------------------------------------------
    const startLoadingBook = useCallback(async () => {
        setStatus("checking");
        setErrorMessage(null);
        setDownloadPercent(0);
        setLoadedBytes(0);
        setTotalBytes(0);

        try {
            const pdfjs = await loadPdfJs();

            // 1. Check IndexedDB first for instant 0ms offline opening
            const cachedBuffer = await getCachedBook(productId);
            if (cachedBuffer && cachedBuffer.byteLength > 1000) {
                setIsFromCache(true);
                setStatus("rendering");
                const loadingTask = pdfjs.getDocument({
                    data: cachedBuffer,
                    cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
                    cMapPacked: true,
                });
                const doc = await loadingTask.promise;
                pdfDocRef.current = doc;
                setTotalPages(doc.numPages);
                initReaderPage(doc.numPages);
                setStatus("ready");
                return;
            }

            // 2. Not in cache -> Progressive Range Request Streaming!
            // Opens in 0.5 - 1.0s without downloading whole 20MB file upfront
            setIsFromCache(false);
            setStatus("downloading");

            const streamUrl = `/api/read/${encodeURIComponent(productId)}`;

            const loadingTask = pdfjs.getDocument({
                url: streamUrl,
                disableAutoFetch: true,
                disableStream: false,
                rangeChunkSize: 65536, // 64KB range chunks
                cMapUrl: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/",
                cMapPacked: true,
            });

            loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
                if (total > 0) {
                    setLoadedBytes(loaded);
                    setTotalBytes(total);
                    setDownloadPercent(Math.min(100, Math.round((loaded / total) * 100)));
                } else {
                    setLoadedBytes(loaded);
                    setDownloadPercent((prev) => (prev < 90 ? prev + 10 : 90));
                }
            };

            const doc = await loadingTask.promise;
            pdfDocRef.current = doc;
            setTotalPages(doc.numPages);
            initReaderPage(doc.numPages);
            setStatus("ready");

            // 3. Background Caching: Fetch full PDF in idle background & persist to IndexedDB
            fetch(streamUrl)
                .then((res) => {
                    if (res.ok) return res.arrayBuffer();
                    return null;
                })
                .then((buffer) => {
                    if (buffer && buffer.byteLength > 1000) {
                        saveBookToCache(productId, buffer).catch(() => {});
                        setIsFromCache(true);
                    }
                })
                .catch((bgErr) => {
                    console.warn("[BookCanvasReader] Background caching info:", bgErr);
                });

        } catch (err: any) {
            console.error("[BookCanvasReader] Load/Stream error:", err);
            setStatus("error");
            setErrorMessage(
                language === "uz"
                    ? "Kitobni oqimli yuklab ochib bo'lmadi. Aloqani tekshirib qayta urining."
                    : "Не удалось открыть книгу. Проверьте подключение к сети."
            );
        }
    }, [productId, language]);

    // Trigger initial loading on mount
    useEffect(() => {
        startLoadingBook();

        return () => {
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
    // 2. Render Canvas Pages (HiDPI Retina + Realistic Book Scaling)
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
            const canvasBgColor = paperTheme === "night" ? "#1E1E24" : paperTheme === "sepia" ? "#F5EEDB" : "#FFFFFF";

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
                const vertPadding = 80; // room for top and bottom bars
                const spineWidth = 8;

                const maxAvailableWidth = Math.max(220, (containerWidth - horizPadding - spineWidth) / 2);
                const maxAvailableHeight = Math.max(300, containerHeight - vertPadding);

                // Scale: Fit to page or fit-width
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
                        ctx.fillStyle = canvasBgColor;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        const task = page.render({
                            canvasContext: ctx,
                            viewport,
                            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                        });
                        leftRenderTaskRef.current = task;
                        await task.promise;
                        // Snapshot cache for 3D flip
                        try {
                            pageSnapshotsRef.current.set(leftNum, canvas.toDataURL("image/jpeg", 0.9));
                        } catch (_) {}
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
                        ctx.fillStyle = canvasBgColor;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        const task = page.render({
                            canvasContext: ctx,
                            viewport,
                            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                        });
                        rightRenderTaskRef.current = task;
                        await task.promise;
                        // Snapshot cache for 3D flip
                        try {
                            pageSnapshotsRef.current.set(rightNum, canvas.toDataURL("image/jpeg", 0.9));
                        } catch (_) {}
                    }
                }

                // Background idle prefetch of upcoming pages for instantaneous 0ms flip
                setTimeout(async () => {
                    const nextNum1 = (rightNum || 0) + 1;
                    const nextNum2 = (rightNum || 0) + 2;
                    for (const num of [nextNum1, nextNum2]) {
                        if (num >= 1 && num <= totalPages && !pageSnapshotsRef.current.has(num)) {
                            try {
                                const p = await doc.getPage(num);
                                const vp = p.getViewport({ scale: finalScale });
                                const offCanvas = document.createElement("canvas");
                                offCanvas.width = Math.floor(vp.width * dpr);
                                offCanvas.height = Math.floor(vp.height * dpr);
                                const offCtx = offCanvas.getContext("2d", { alpha: false });
                                if (offCtx) {
                                    offCtx.fillStyle = canvasBgColor;
                                    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
                                    await p.render({
                                        canvasContext: offCtx,
                                        viewport: vp,
                                        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                                    }).promise;
                                    pageSnapshotsRef.current.set(num, offCanvas.toDataURL("image/jpeg", 0.85));
                                }
                            } catch (_) {}
                        }
                    }
                }, 100);

            } else {
                // Single-page clean view
                if (singleCanvasRef.current) {
                    const page = await doc.getPage(currentPage);
                    const unscaledViewport = page.getViewport({ scale: 1 });

                    const padding = window.innerWidth < 640 ? 16 : 48;
                    const availableWidth = Math.max(260, containerWidth - padding);
                    const availableHeight = Math.max(300, containerHeight - padding - 60);

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
                        ctx.fillStyle = canvasBgColor;
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        const task = page.render({
                            canvasContext: ctx,
                            viewport,
                            transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                        });
                        singleRenderTaskRef.current = task;
                        await task.promise;
                        try {
                            pageSnapshotsRef.current.set(currentPage, canvas.toDataURL("image/jpeg", 0.9));
                        } catch (_) {}
                    }

                    setRenderedDims({
                        width: Math.floor(viewport.width),
                        height: Math.floor(viewport.height),
                    });

                    // Background prefetch next single page
                    setTimeout(async () => {
                        const nextP = currentPage + 1;
                        if (nextP <= totalPages && !pageSnapshotsRef.current.has(nextP)) {
                            try {
                                const p = await doc.getPage(nextP);
                                const vp = p.getViewport({ scale: finalScale });
                                const offCanvas = document.createElement("canvas");
                                offCanvas.width = Math.floor(vp.width * dpr);
                                offCanvas.height = Math.floor(vp.height * dpr);
                                const offCtx = offCanvas.getContext("2d", { alpha: false });
                                if (offCtx) {
                                    offCtx.fillStyle = canvasBgColor;
                                    offCtx.fillRect(0, 0, offCanvas.width, offCanvas.height);
                                    await p.render({
                                        canvasContext: offCtx,
                                        viewport: vp,
                                        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
                                    }).promise;
                                    pageSnapshotsRef.current.set(nextP, offCanvas.toDataURL("image/jpeg", 0.85));
                                }
                            } catch (_) {}
                        }
                    }, 100);
                }
            }

            setIsPageRendering(false);

            // Persist current page to localStorage
            try {
                localStorage.setItem(`book_page_${productId}`, String(currentPage));
            } catch (_) {}

            // Smoothly align scroll after double-tap zoom
            if (pendingScrollCenterRef.current && scrollContainerRef.current) {
                const { x, y } = pendingScrollCenterRef.current;
                setTimeout(() => {
                    if (scrollContainerRef.current) {
                        scrollContainerRef.current.scrollTo({
                            left: Math.max(0, x),
                            top: Math.max(0, y),
                            behavior: "smooth",
                        });
                    }
                }, 50);
                pendingScrollCenterRef.current = null;
            }
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
    // 3. True 3D Flip Mechanics without Black Gaps (Underlying Page Pre-rendered)
    // ------------------------------------------------------------------------
    const goToNextPage = useCallback(() => {
        if (currentPage >= totalPages || isFlipping) return;

        if (isSoundEnabled) {
            paperSound.play();
        }

        // Calculate next target page and underlying snapshot
        let nextTargetPage: number;
        let underlyingNum: number | null = null;
        let backNum: number | null = null;
        let frontSnapshot: string | null = null;

        if (effectiveIsDouble) {
            if (currentPage === 1) {
                nextTargetPage = 2;
                backNum = 2;
                underlyingNum = 3 <= totalPages ? 3 : null;
            } else {
                const left = currentPage % 2 === 0 ? currentPage : currentPage - 1;
                nextTargetPage = Math.min(totalPages, left + 2);
                backNum = left + 2 <= totalPages ? left + 2 : null;
                underlyingNum = left + 3 <= totalPages ? left + 3 : null;
            }
            frontSnapshot = rightCanvasRef.current ? rightCanvasRef.current.toDataURL() : (pageSnapshotsRef.current.get(rightPageNum || 1) || null);
        } else {
            nextTargetPage = Math.min(totalPages, currentPage + 1);
            underlyingNum = nextTargetPage;
            frontSnapshot = singleCanvasRef.current ? singleCanvasRef.current.toDataURL() : (pageSnapshotsRef.current.get(currentPage) || null);
        }

        const backSnapshot = backNum ? (pageSnapshotsRef.current.get(backNum) || null) : null;
        const underlyingSnapshot = underlyingNum ? (pageSnapshotsRef.current.get(underlyingNum) || null) : null;

        setFlipState({
            direction: "next",
            frontSnapshot,
            backSnapshot,
            underlyingSnapshot,
            underlyingPageNum: underlyingNum,
            backPageNum: backNum,
        });

        setIsFlipping(true);

        setTimeout(() => {
            setCurrentPage(nextTargetPage);
            setIsFlipping(false);
            setFlipState(null);
        }, 400);
    }, [currentPage, totalPages, isFlipping, effectiveIsDouble, rightPageNum, isSoundEnabled]);

    const goToPrevPage = useCallback(() => {
        if (currentPage <= 1 || isFlipping) return;

        if (isSoundEnabled) {
            paperSound.play();
        }

        let prevTargetPage: number;
        let underlyingNum: number | null = null;
        let backNum: number | null = null;
        let frontSnapshot: string | null = null;

        if (effectiveIsDouble) {
            if (currentPage <= 2) {
                prevTargetPage = 1;
                backNum = 1;
                underlyingNum = null;
            } else {
                const left = currentPage % 2 === 0 ? currentPage : currentPage - 1;
                prevTargetPage = Math.max(1, left - 2);
                backNum = left - 1;
                underlyingNum = prevTargetPage;
            }
            frontSnapshot = leftCanvasRef.current ? leftCanvasRef.current.toDataURL() : (pageSnapshotsRef.current.get(leftPageNum || 1) || null);
        } else {
            prevTargetPage = Math.max(1, currentPage - 1);
            underlyingNum = prevTargetPage;
            frontSnapshot = singleCanvasRef.current ? singleCanvasRef.current.toDataURL() : (pageSnapshotsRef.current.get(currentPage) || null);
        }

        const backSnapshot = backNum ? (pageSnapshotsRef.current.get(backNum) || null) : null;
        const underlyingSnapshot = underlyingNum ? (pageSnapshotsRef.current.get(underlyingNum) || null) : null;

        setFlipState({
            direction: "prev",
            frontSnapshot,
            backSnapshot,
            underlyingSnapshot,
            underlyingPageNum: underlyingNum,
            backPageNum: backNum,
        });

        setIsFlipping(true);

        setTimeout(() => {
            setCurrentPage(prevTargetPage);
            setIsFlipping(false);
            setFlipState(null);
        }, 400);
    }, [currentPage, isFlipping, effectiveIsDouble, leftPageNum, isSoundEnabled]);

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

    // ------------------------------------------------------------------------
    // 4. Zoom & Reading Comfort Controls
    // ------------------------------------------------------------------------
    const handleZoomIn = () => {
        setIsFitWidth(false);
        setZoom((prev) => Math.min(3.0, +(prev + 0.25).toFixed(2)));
    };

    const handleZoomOut = () => {
        setIsFitWidth(false);
        setZoom((prev) => Math.max(0.6, +(prev - 0.25).toFixed(2)));
    };

    const handleToggleFitWidth = () => {
        if (isFitWidth) {
            setIsFitWidth(false);
            setZoom(1.0);
        } else if (zoom !== 1.0) {
            setZoom(1.0);
            setIsFitWidth(false);
        } else {
            setIsFitWidth(true);
        }
    };

    // Double-Tap / Double-Click Zoom (harflarni 1.9x ga kattalashtirish yoki 1.0x ga qaytarish)
    const handleDoubleTapZoom = useCallback((clientX: number, clientY: number) => {
        if (status !== "ready") return;
        const container = scrollContainerRef.current;
        if (!container) return;

        if (zoom > 1.25) {
            setZoom(1.0);
            setIsFitWidth(false);
            container.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            const targetZoom = 1.9;
            const rect = container.getBoundingClientRect();
            const clickRelX = clientX - rect.left;
            const clickRelY = clientY - rect.top;

            const currentContentX = container.scrollLeft + clickRelX;
            const currentContentY = container.scrollTop + clickRelY;

            const scaleRatio = targetZoom / zoom;
            const targetScrollLeft = currentContentX * scaleRatio - (rect.width / 2);
            const targetScrollTop = currentContentY * scaleRatio - (rect.height / 2);

            pendingScrollCenterRef.current = {
                x: Math.max(0, targetScrollLeft),
                y: Math.max(0, targetScrollTop),
            };

            setIsFitWidth(false);
            setZoom(targetZoom);
        }
    }, [status, zoom]);

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
        setShowThemeMenu(false);
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

    // ------------------------------------------------------------------------
    // Touch Events: Double-Tap, Pinch-to-Zoom & Swipe Navigation
    // ------------------------------------------------------------------------
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            isPinchingRef.current = true;
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            pinchStartDistRef.current = dist;
            pinchStartZoomRef.current = zoom;
            pinchCurrentFactorRef.current = 1.0;
            touchStartCoords.current = null;
            return;
        }

        if (e.touches.length === 1) {
            touchStartCoords.current = {
                x: e.touches[0].clientX,
                y: e.touches[0].clientY,
            };
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (isPinchingRef.current && e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            if (pinchStartDistRef.current > 0) {
                const factor = dist / pinchStartDistRef.current;
                pinchCurrentFactorRef.current = factor;
                setPinchVisualScale(factor);
            }
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (isPinchingRef.current) {
            isPinchingRef.current = false;
            const finalFactor = pinchCurrentFactorRef.current;
            setPinchVisualScale(1.0);
            pinchCurrentFactorRef.current = 1.0;

            if (Math.abs(finalFactor - 1.0) > 0.08) {
                setIsFitWidth(false);
                const newZoom = Math.min(3.0, Math.max(0.6, +(pinchStartZoomRef.current * finalFactor).toFixed(2)));
                setZoom(newZoom);
            }
            touchStartCoords.current = null;
            return;
        }

        const touch = e.changedTouches[0];
        if (touch) {
            const now = Date.now();
            if (lastTapRef.current && now - lastTapRef.current.time < 320) {
                const dx = Math.abs(touch.clientX - lastTapRef.current.x);
                const dy = Math.abs(touch.clientY - lastTapRef.current.y);
                if (dx < 40 && dy < 40) {
                    handleDoubleTapZoom(touch.clientX, touch.clientY);
                    lastTapRef.current = null;
                    touchStartCoords.current = null;
                    return;
                }
            }
            lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
        }

        if (!touchStartCoords.current || !touch) return;
        const diffX = touch.clientX - touchStartCoords.current.x;
        const diffY = touch.clientY - touchStartCoords.current.y;
        touchStartCoords.current = null;

        if (zoom > 1.2) {
            return;
        }

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
                // Rich, warm vintage paper filter: deeply saturated and eye-friendly
                return "sepia(0.68) contrast(0.94) brightness(0.96) saturate(1.4)";
            case "night":
                return "invert(0.91) hue-rotate(180deg) contrast(1.1) brightness(0.92)";
            case "white":
            default:
                return "none";
        }
    };

    const getThemePaperBgColor = () => {
        switch (paperTheme) {
            case "sepia":
                return "#F5EEDB";
            case "night":
                return "#1E1E24";
            case "white":
            default:
                return "#FFFFFF";
        }
    };

    const getThemeContainerBg = () => {
        switch (paperTheme) {
            case "sepia":
                return "bg-[#14120E]";
            case "night":
                return "bg-[#0A0B0E]";
            case "white":
            default:
                return "bg-[#111417]";
        }
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
            {/* CSS Animation Keyframes for Realistic 3D Page Flip with Front & Backfaces */}
            <style jsx>{`
                .book-scene {
                    perspective: 2600px;
                    transform-style: preserve-3d;
                }
                .book-leaf {
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    width: 100%;
                    height: 100%;
                    transform-style: preserve-3d;
                }
                .leaf-face {
                    position: absolute;
                    inset: 0;
                    backface-visibility: hidden;
                    -webkit-backface-visibility: hidden;
                    overflow: hidden;
                }
                .leaf-back {
                    transform: rotateY(180deg);
                }
                @keyframes flipNext3D {
                    0% {
                        transform: rotateY(0deg);
                    }
                    100% {
                        transform: rotateY(-180deg);
                    }
                }
                @keyframes flipPrev3D {
                    0% {
                        transform: rotateY(0deg);
                    }
                    100% {
                        transform: rotateY(180deg);
                    }
                }
                .anim-flip-leaf-next {
                    transform-origin: left center;
                    animation: flipNext3D 400ms cubic-bezier(0.24, 0.85, 0.32, 1) forwards;
                }
                .anim-flip-leaf-prev {
                    transform-origin: right center;
                    animation: flipPrev3D 400ms cubic-bezier(0.24, 0.85, 0.32, 1) forwards;
                }
            `}</style>

            {/* =============================================================== */}
            {/* 1. TOP HEADER BAR: Minimal & Clean (Title + Theme, FS, Close) */}
            {/* =============================================================== */}
            <header className="h-14 bg-[#14120E]/95 backdrop-blur-md border-b border-white/10 px-3 sm:px-6 flex items-center justify-between gap-3 shrink-0 shadow-md z-40">
                {/* Left: Book Title & Status Pill */}
                <div className="flex items-center gap-2.5 min-w-0 max-w-[55%] sm:max-w-md md:max-w-xl">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/25 shadow-sm">
                        <BookOpen size={17} strokeWidth={2.4} />
                    </div>
                    <div className="min-w-0">
                        <h1
                            className="text-xs sm:text-sm font-bold text-white truncate"
                            title={bookTitle}
                        >
                            {bookTitle}
                        </h1>
                        <div className="flex items-center gap-2 text-[10px] text-emerald-400 font-medium">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                <span>{language === "uz" ? "Elektron kitob" : "Электронная книга"}</span>
                            </span>
                            {isFromCache ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] font-semibold">
                                    <Zap size={10} className="text-yellow-400 fill-yellow-400" />
                                    <span>{language === "uz" ? "Oflayn kesh" : "Кэш"}</span>
                                </span>
                            ) : (
                                <span className="hidden xs:inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-300 text-[9px] font-semibold">
                                    <Sparkles size={10} className="text-blue-400" />
                                    <span>{language === "uz" ? "Tezkor oqim" : "Стриминг"}</span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right: Theme Selector + Fullscreen + Close */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                    {/* Theme Picker Dropdown / Switcher */}
                    <div className="relative">
                        <button
                            onClick={() => setShowThemeMenu((v) => !v)}
                            className="h-9 px-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-gray-200 hover:text-white text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all"
                            title={language === "uz" ? "Kitob qog'ozi rangi" : "Цвет бумаги"}
                            aria-label="Theme selector"
                        >
                            <span
                                className="w-3.5 h-3.5 rounded-full border border-black/20 shadow-xs shrink-0"
                                style={{ backgroundColor: getThemePaperBgColor() }}
                            />
                            <span className="hidden sm:inline capitalize">
                                {paperTheme === "sepia" ? "Sepia" : paperTheme === "white" ? (language === "uz" ? "Oq" : "Белая") : (language === "uz" ? "Tungi" : "Ночь")}
                            </span>
                        </button>

                        {/* Theme Popup Menu */}
                        {showThemeMenu && (
                            <div className="absolute right-0 top-11 z-50 bg-[#1C1814] border border-white/15 rounded-2xl p-1.5 shadow-2xl flex flex-col gap-1 min-w-[140px] animate-in fade-in zoom-in-95 duration-150">
                                <button
                                    onClick={() => handleSetTheme("sepia")}
                                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                                        paperTheme === "sepia"
                                            ? "bg-[#F5EEDB] text-[#2C2416] font-bold shadow-sm"
                                            : "text-gray-300 hover:bg-white/10"
                                    }`}
                                >
                                    <span className="w-3.5 h-3.5 rounded-full bg-[#F5EEDB] border border-[#C5B496]" />
                                    <span>{language === "uz" ? "Issiq Sepia" : "Сепия"}</span>
                                </button>
                                <button
                                    onClick={() => handleSetTheme("white")}
                                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                                        paperTheme === "white"
                                            ? "bg-white text-gray-900 font-bold shadow-sm"
                                            : "text-gray-300 hover:bg-white/10"
                                    }`}
                                >
                                    <Sun size={14} className="text-amber-500" />
                                    <span>{language === "uz" ? "Oq qog'oz" : "Белая"}</span>
                                </button>
                                <button
                                    onClick={() => handleSetTheme("night")}
                                    className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-2.5 transition-colors ${
                                        paperTheme === "night"
                                            ? "bg-indigo-950 text-indigo-200 border border-indigo-700/50 font-bold shadow-sm"
                                            : "text-gray-300 hover:bg-white/10"
                                    }`}
                                >
                                    <Moon size={14} className="text-indigo-300" />
                                    <span>{language === "uz" ? "Tungi rejim" : "Ночной"}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Fullscreen Toggle */}
                    <button
                        onClick={toggleFullscreen}
                        className="h-9 w-9 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white flex items-center justify-center active:scale-95 transition-colors"
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
                        className="h-9 w-9 rounded-xl bg-white/10 hover:bg-red-500/85 active:scale-95 text-white flex items-center justify-center transition-colors"
                        title={language === "uz" ? "Yopish (Esc)" : "Закрыть (Esc)"}
                    >
                        <X size={18} strokeWidth={2.4} />
                    </button>
                </div>
            </header>

            {/* =============================================================== */}
            {/* MAIN CANVAS SPREAD OR LOADING SCREEN */}
            {/* =============================================================== */}
            <main
                ref={scrollContainerRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onDoubleClick={(e) => handleDoubleTapZoom(e.clientX, e.clientY)}
                onClick={() => {
                    if (showThemeMenu) setShowThemeMenu(false);
                }}
                className={`flex-1 w-full h-full relative overflow-auto flex flex-col items-center justify-start pt-4 pb-28 sm:pb-24 px-2 sm:px-4 ${
                    zoom > 1.25 ? "cursor-zoom-out" : "cursor-zoom-in"
                }`}
                style={{
                    WebkitOverflowScrolling: "touch",
                    perspective: "2600px",
                }}
            >
                {/* 1. PROGRESSIVE STREAMING LOADING INDICATOR */}
                {(status === "checking" || status === "downloading" || status === "rendering") && (
                    <div className="my-auto flex flex-col items-center justify-center p-6 sm:p-8 max-w-sm sm:max-w-md w-full bg-[#181512] border border-white/10 rounded-3xl shadow-2xl text-center animate-in zoom-in-95 duration-200">
                        <div className="w-20 h-28 sm:w-24 sm:h-32 rounded-2xl overflow-hidden shadow-2xl border-2 border-emerald-500/30 bg-black/40 mb-4 relative flex items-center justify-center">
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

                        <h2 className="text-sm sm:text-base font-bold text-white mb-1 line-clamp-2">
                            {bookTitle}
                        </h2>

                        {status === "checking" && (
                            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
                                <Loader2 size={14} className="animate-spin text-emerald-400" />
                                {language === "uz" ? "Tezkor mutolaa tayyorlanmoqda..." : "Подготовка книги..."}
                            </p>
                        )}

                        {status === "downloading" && (
                            <div className="w-full mt-4">
                                <div className="flex items-center justify-between text-xs font-semibold text-gray-300 mb-2">
                                    <span className="flex items-center gap-1.5 text-emerald-400">
                                        <Loader2 size={13} className="animate-spin" />
                                        {language === "uz" ? "Birinchi sahifalar ochilmoqda..." : "Открытие страниц..."}
                                    </span>
                                    <span className="font-bold text-white text-xs">
                                        {downloadPercent > 0 ? `${downloadPercent}%` : "Oqimli"}
                                    </span>
                                </div>
                                <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden p-0.5 shadow-inner">
                                    <div
                                        className="h-full bg-gradient-to-r from-emerald-500 via-green-400 to-emerald-400 rounded-full transition-all duration-200 ease-out relative overflow-hidden"
                                        style={{ width: `${Math.max(15, downloadPercent)}%` }}
                                    >
                                        <div className="absolute inset-0 bg-white/25 animate-pulse" />
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-2 text-[10px] text-gray-400">
                                    <span>
                                        {loadedBytes > 0 ? `${formatBytes(loadedBytes)}` : "Tezkor ochish (0.5s)"}
                                    </span>
                                    <span className="text-emerald-400 font-medium">
                                        {language === "uz" ? "Darhol boshlanadi" : "Мгновенный старт"}
                                    </span>
                                </div>
                            </div>
                        )}

                        {status === "rendering" && (
                            <div className="mt-4 flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                                    <CheckCircle2 size={16} />
                                    {language === "uz" ? "Haqiqiy sahifalar ochilmoqda..." : "Страницы готовы..."}
                                </div>
                                <div className="w-full h-1.5 bg-emerald-500/20 rounded-full overflow-hidden mt-1">
                                    <div className="h-full bg-emerald-400 rounded-full animate-indeterminate" />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* 2. ERROR SCREEN */}
                {status === "error" && (
                    <div className="my-auto flex flex-col items-center justify-center p-6 sm:p-8 max-w-sm sm:max-w-md w-full bg-[#1E1717] border border-red-500/30 rounded-3xl shadow-2xl text-center animate-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 rounded-2xl bg-red-500/20 text-red-400 flex items-center justify-center mb-4">
                            <AlertCircle size={28} />
                        </div>
                        <h3 className="text-base font-bold text-white mb-2">
                            {language === "uz" ? "Kitobni ochishda xatolik" : "Ошибка открытия"}
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

                {/* 3. READY STATE: TRUE 3D BOOK SPREAD OR SINGLE PAGE */}
                {status === "ready" && (
                    <div
                        className="relative my-auto flex flex-col items-center justify-center transition-transform select-none book-scene"
                        style={{
                            transform: pinchVisualScale !== 1.0 ? `scale(${pinchVisualScale})` : undefined,
                            transformOrigin: "center center",
                            transition: isPinchingRef.current ? "none" : "transform 0.15s ease-out",
                        }}
                    >
                        {/* Rendering Spinner Overlay during page transitions */}
                        {isPageRendering && !isFlipping && (
                            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/15 backdrop-blur-[1px] rounded-lg pointer-events-none">
                                <div className="p-2.5 rounded-2xl bg-black/80 text-emerald-400 flex items-center gap-2 text-xs font-semibold shadow-2xl border border-white/10">
                                    <Loader2 size={15} className="animate-spin text-emerald-400" />
                                    <span>{language === "uz" ? "Sahifa yangilanmoqda..." : "Загрузка..."}</span>
                                </div>
                            </div>
                        )}

                        {/* Hint Pill for Double-Tap Zoom Comfort */}
                        {zoom > 1.25 && (
                            <div className="mb-2 sm:mb-3 px-3 py-1 rounded-full bg-black/60 border border-emerald-500/30 text-emerald-300 text-[10px] sm:text-xs font-medium shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
                                {language === "uz"
                                    ? `🔍 Zoom: ${Math.round(zoom * 100)}% • Normal holatga qaytish uchun 2 marta bosing`
                                    : `🔍 Масштаб: ${Math.round(zoom * 100)}% • Нажмите дважды для возврата`}
                            </div>
                        )}

                        {/* =================================================== */}
                        {/* A. TWO-PAGE BOOK SPREAD (Desktop & Tablet >= 860px) */}
                        {/* =================================================== */}
                        {effectiveIsDouble ? (
                            <div
                                className="relative flex items-center justify-center rounded-sm book-scene"
                                style={{
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
                                                : paperTheme === "sepia"
                                                    ? "linear-gradient(145deg, #2A2016, #15110B)"
                                                    : "linear-gradient(145deg, #242426, #141416)",
                                        boxShadow:
                                            "0 25px 60px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255,255,255,0.06), 0 10px 20px rgba(0,0,0,0.5)",
                                    }}
                                />

                                {/* Realistic Center Spine Crease Overlay */}
                                <div
                                    className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-8 sm:w-10 z-30 pointer-events-none"
                                    style={{
                                        background:
                                            paperTheme === "sepia"
                                                ? "linear-gradient(to right, transparent, rgba(50,32,16,0.18) 46%, rgba(35,22,10,0.4) 50%, rgba(50,32,16,0.18) 54%, transparent)"
                                                : "linear-gradient(to right, transparent, rgba(0,0,0,0.15) 46%, rgba(0,0,0,0.32) 50%, rgba(0,0,0,0.15) 54%, transparent)",
                                    }}
                                />

                                {/* ------------------------------------------------ */}
                                {/* LEFT WING (Even page or Inside Front Cover)       */}
                                {/* ------------------------------------------------ */}
                                <div
                                    className="relative flex items-center justify-center overflow-hidden z-10"
                                    style={{
                                        filter: getThemePaperFilter(),
                                        backgroundColor: getThemePaperBgColor(),
                                        boxShadow:
                                            paperTheme === "night"
                                                ? "-3px 0 0 -1px #1E1E26, -6px 0 0 -2px #181820, -9px 0 0 -3px #121218, -16px 12px 35px rgba(0,0,0,0.7)"
                                                : paperTheme === "sepia"
                                                    ? "-3px 0 0 -1px #E7DEC8, -6px 0 0 -2px #DDD1BA, -9px 0 0 -3px #CFC2A7, -16px 12px 35px rgba(0,0,0,0.65)"
                                                    : "-3px 0 0 -1px #E5DFD3, -6px 0 0 -2px #D8D1C4, -9px 0 0 -3px #CAC3B4, -16px 12px 35px rgba(0,0,0,0.6)",
                                    }}
                                >
                                    {leftPageNum ? (
                                        <>
                                            <canvas
                                                ref={leftCanvasRef}
                                                className="block"
                                                style={{ backgroundColor: getThemePaperBgColor() }}
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
                                            <div className="absolute bottom-2 left-4 text-[11px] font-semibold text-gray-600/90 pointer-events-none">
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
                                                        : paperTheme === "sepia"
                                                            ? "radial-gradient(circle at 70% 30%, #2A2016 0%, #17120C 100%)"
                                                            : "radial-gradient(circle at 70% 30%, #1E2D22 0%, #121C15 100%)",
                                                borderRight: "1px solid rgba(0,0,0,0.4)",
                                            }}
                                        >
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
                                                        {language === "uz" ? "Mualliflik nashri • To'liq kitob" : "Электронное издание книги"}
                                                    </p>
                                                </div>

                                                <div className="text-[10px] sm:text-[11px] text-gray-400 font-medium">
                                                    {language === "uz"
                                                        ? "O'ng tomonda 1-sahifa (Muqova). Varaqlash uchun pastdagi tugmani bosing →"
                                                        : "Справа 1-я страница. Нажмите Далее для чтения →"}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* PREV FLIP LEAF (turning from Left to Right) */}
                                    {isFlipping && flipState?.direction === "prev" && (
                                        <div className="book-leaf anim-flip-leaf-prev z-40">
                                            {/* Front Face: Current Left Page */}
                                            <div
                                                className="leaf-face"
                                                style={{
                                                    backgroundColor: getThemePaperBgColor(),
                                                }}
                                            >
                                                {flipState.frontSnapshot ? (
                                                    <img
                                                        src={flipState.frontSnapshot}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
                                                        {leftPageNum || 1}
                                                    </div>
                                                )}
                                                {/* Turning page dynamic shadow */}
                                                <div
                                                    className="absolute inset-0 pointer-events-none"
                                                    style={{
                                                        background:
                                                            "linear-gradient(to left, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.08) 40%, transparent 100%)",
                                                    }}
                                                />
                                            </div>

                                            {/* Back Face: Previous Right Page */}
                                            <div
                                                className="leaf-face leaf-back"
                                                style={{
                                                    backgroundColor: getThemePaperBgColor(),
                                                }}
                                            >
                                                {flipState.backSnapshot ? (
                                                    <img
                                                        src={flipState.backSnapshot}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-600 font-bold text-sm">
                                                        {flipState.backPageNum || ""}
                                                    </div>
                                                )}
                                                <div
                                                    className="absolute inset-0 pointer-events-none"
                                                    style={{
                                                        background:
                                                            "linear-gradient(to right, rgba(0,0,0,0.25) 0%, transparent 60%)",
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* ------------------------------------------------ */}
                                {/* RIGHT WING (Odd page or Inside Back Cover)       */}
                                {/* ------------------------------------------------ */}
                                <div
                                    className="relative flex items-center justify-center overflow-hidden z-10"
                                    style={{
                                        filter: getThemePaperFilter(),
                                        backgroundColor: getThemePaperBgColor(),
                                        boxShadow:
                                            paperTheme === "night"
                                                ? "3px 0 0 -1px #1E1E26, 6px 0 0 -2px #181820, 9px 0 0 -3px #121218, 16px 12px 35px rgba(0,0,0,0.7)"
                                                : paperTheme === "sepia"
                                                    ? "3px 0 0 -1px #E7DEC8, 6px 0 0 -2px #DDD1BA, 9px 0 0 -3px #CFC2A7, 16px 12px 35px rgba(0,0,0,0.65)"
                                                    : "3px 0 0 -1px #E5DFD3, 6px 0 0 -2px #D8D1C4, 9px 0 0 -3px #CAC3B4, 16px 12px 35px rgba(0,0,0,0.6)",
                                    }}
                                >
                                    {/* UNDERLYING NEXT PAGE (Eliminates the black gap during next flip!) */}
                                    {isFlipping && flipState?.direction === "next" && (
                                        <div
                                            className="absolute inset-0 z-0 flex items-center justify-center"
                                            style={{
                                                backgroundColor: getThemePaperBgColor(),
                                            }}
                                        >
                                            {flipState.underlyingSnapshot ? (
                                                <img
                                                    src={flipState.underlyingSnapshot}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-gray-500">
                                                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                                                        {language === "uz" ? "Sahifa" : "Страница"} {flipState.underlyingPageNum}
                                                    </span>
                                                </div>
                                            )}
                                            {/* Shadow on underlying page from lifting leaf */}
                                            <div
                                                className="absolute inset-0 pointer-events-none"
                                                style={{
                                                    background:
                                                        "linear-gradient(to right, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.06) 30%, transparent 100%)",
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Main Right Page Canvas */}
                                    {rightPageNum ? (
                                        <>
                                            <canvas
                                                ref={rightCanvasRef}
                                                className="block"
                                                style={{ backgroundColor: getThemePaperBgColor() }}
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
                                            <div className="absolute bottom-2 right-4 text-[11px] font-semibold text-gray-600/90 pointer-events-none">
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
                                                        : paperTheme === "sepia"
                                                            ? "radial-gradient(circle at 30% 30%, #2A2016 0%, #17120C 100%)"
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
                                                    className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold active:scale-95 transition-all shadow-lg shadow-emerald-900/30"
                                                >
                                                    {language === "uz" ? "Boshiga qaytish (1-sahifa)" : "В начало (Стр. 1)"}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* NEXT FLIP LEAF (turning from Right to Left) */}
                                    {isFlipping && flipState?.direction === "next" && (
                                        <div className="book-leaf anim-flip-leaf-next z-40">
                                            {/* Front Face: Current Right Page */}
                                            <div
                                                className="leaf-face"
                                                style={{
                                                    backgroundColor: getThemePaperBgColor(),
                                                }}
                                            >
                                                {flipState.frontSnapshot ? (
                                                    <img
                                                        src={flipState.frontSnapshot}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
                                                        {rightPageNum || 1}
                                                    </div>
                                                )}
                                                {/* Turning gradient shadow overlay */}
                                                <div
                                                    className="absolute inset-0 pointer-events-none"
                                                    style={{
                                                        background:
                                                            "linear-gradient(to right, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.08) 40%, transparent 100%)",
                                                    }}
                                                />
                                            </div>

                                            {/* Back Face: Upcoming Left Page */}
                                            <div
                                                className="leaf-face leaf-back"
                                                style={{
                                                    backgroundColor: getThemePaperBgColor(),
                                                }}
                                            >
                                                {flipState.backSnapshot ? (
                                                    <img
                                                        src={flipState.backSnapshot}
                                                        alt=""
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-600 font-bold text-sm">
                                                        {flipState.backPageNum || ""}
                                                    </div>
                                                )}
                                                <div
                                                    className="absolute inset-0 pointer-events-none"
                                                    style={{
                                                        background:
                                                            "linear-gradient(to left, rgba(0,0,0,0.25) 0%, transparent 60%)",
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* =================================================== */
                            /* B. SINGLE PAGE VIEW (Mobile / Tablet or Picked)     */
                            /* =================================================== */
                            <div
                                className="relative flex items-center justify-center rounded-sm transition-all book-scene"
                                style={{
                                    filter: getThemePaperFilter(),
                                    backgroundColor: getThemePaperBgColor(),
                                    boxShadow:
                                        paperTheme === "night"
                                            ? "0 20px 50px rgba(0,0,0,0.8), -3px 0 0 -1px #1E1E26, 3px 0 0 -1px #1E1E26"
                                            : paperTheme === "sepia"
                                                ? "0 20px 50px rgba(0,0,0,0.7), -3px 0 0 -1px #E7DEC8, 3px 0 0 -1px #E7DEC8"
                                                : "0 20px 50px rgba(0,0,0,0.65), -3px 0 0 -1px #E5DFD3, 3px 0 0 -1px #E5DFD3",
                                }}
                            >
                                {/* Underlying Next Page during single flip (No Black Gap!) */}
                                {isFlipping && (
                                    <div
                                        className="absolute inset-0 z-0 flex items-center justify-center"
                                        style={{ backgroundColor: getThemePaperBgColor() }}
                                    >
                                        {flipState?.underlyingSnapshot ? (
                                            <img
                                                src={flipState.underlyingSnapshot}
                                                alt=""
                                                className="w-full h-full object-cover rounded-sm"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-500 font-bold text-sm">
                                                {flipState?.underlyingPageNum}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div
                                    className={`relative z-10 ${
                                        isFlipping
                                            ? flipState?.direction === "next"
                                                ? "anim-flip-leaf-next"
                                                : "anim-flip-leaf-prev"
                                            : ""
                                    }`}
                                    style={{
                                        transformStyle: "preserve-3d",
                                        backgroundColor: getThemePaperBgColor(),
                                    }}
                                >
                                    <canvas
                                        ref={singleCanvasRef}
                                        className="block rounded-sm"
                                        style={{ backgroundColor: getThemePaperBgColor() }}
                                    />
                                    <div className="absolute bottom-2 right-4 text-[11px] font-semibold text-gray-600/90 pointer-events-none">
                                        {currentPage}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>

            {/* =============================================================== */}
            {/* 4. FLOATING RESPONSIVE BOTTOM CONTROL DOCK (40-44px Touch Targets) */}
            {/* =============================================================== */}
            {status === "ready" && totalPages > 0 && (
                <div className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-50 w-[94vw] max-w-fit pointer-events-auto">
                    <nav
                        aria-label="Book Reader Navigation"
                        className="bg-[#181512]/95 backdrop-blur-xl border border-white/15 px-2.5 sm:px-4 py-2 rounded-2xl sm:rounded-full shadow-2xl flex flex-wrap items-center justify-center gap-1.5 sm:gap-3"
                    >
                        {/* 1. Page Turn: PREVIOUS */}
                        <button
                            onClick={goToPrevPage}
                            disabled={currentPage <= 1 || isFlipping}
                            className="h-11 px-3 sm:px-4 rounded-xl sm:rounded-full bg-white/10 hover:bg-white/15 active:scale-95 text-white disabled:opacity-25 disabled:hover:bg-white/10 text-xs sm:text-sm font-bold flex items-center justify-center gap-1 transition-all shrink-0 shadow-sm"
                            title={language === "uz" ? "Oldingi sahifa (ArrowLeft)" : "Предыдущая (ArrowLeft)"}
                            aria-label="Previous Page"
                        >
                            <ChevronLeft size={18} strokeWidth={2.5} />
                            <span className="hidden xs:inline">{language === "uz" ? "Oldingi" : "Назад"}</span>
                        </button>

                        {/* 2. Page Counter with Direct Jump Input */}
                        <form
                            onSubmit={handlePageInputSubmit}
                            className="h-11 flex items-center gap-1 bg-black/45 border border-white/15 rounded-xl sm:rounded-full px-2.5 sm:px-3.5 shadow-inner shrink-0"
                            title={language === "uz" ? "Sahifa raqamini yozib Enter bosing" : "Введите номер страницы"}
                        >
                            <span className="text-[11px] text-gray-400 font-medium hidden sm:inline">
                                {language === "uz" ? "Sahifa:" : "Стр:"}
                            </span>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={pageInputValue}
                                onChange={(e) => setPageInputValue(e.target.value)}
                                onBlur={handlePageInputSubmit}
                                className="w-8 sm:w-12 text-center bg-transparent border-0 text-xs sm:text-sm font-extrabold text-white focus:outline-none focus:ring-0"
                                aria-label="Current page number"
                            />
                            <span className="text-gray-400 text-xs font-semibold">/</span>
                            <span className="text-gray-200 text-xs sm:text-sm font-bold">{totalPages}</span>
                        </form>

                        {/* 3. Page Turn: NEXT */}
                        <button
                            onClick={goToNextPage}
                            disabled={currentPage >= totalPages || isFlipping}
                            className="h-11 px-3 sm:px-4 rounded-xl sm:rounded-full bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white disabled:opacity-25 disabled:hover:bg-emerald-600 text-xs sm:text-sm font-bold flex items-center justify-center gap-1 transition-all shrink-0 shadow-lg shadow-emerald-900/30"
                            title={language === "uz" ? "Keyingi sahifa (ArrowRight)" : "Следующая (ArrowRight)"}
                            aria-label="Next Page"
                        >
                            <span className="hidden xs:inline">{language === "uz" ? "Keyingi" : "Вперед"}</span>
                            <ChevronRight size={18} strokeWidth={2.5} />
                        </button>

                        {/* Divider */}
                        <div className="h-6 w-px bg-white/15 hidden md:block shrink-0" />

                        {/* 4. Zoom Group: [ - ] [ 100% / Fit ] [ + ] */}
                        <div className="h-11 flex items-center gap-0.5 bg-black/45 border border-white/15 rounded-xl sm:rounded-full p-1 shadow-inner shrink-0">
                            <button
                                onClick={handleZoomOut}
                                className="h-9 w-9 rounded-lg sm:rounded-full text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 flex items-center justify-center transition-colors"
                                title={language === "uz" ? "Kichraytirish (-)" : "Уменьшить (-)"}
                                aria-label="Zoom Out"
                            >
                                <ZoomOut size={16} />
                            </button>
                            <button
                                onClick={handleToggleFitWidth}
                                className={`h-9 px-2.5 rounded-lg sm:rounded-full text-xs font-bold transition-all ${
                                    isFitWidth
                                        ? "bg-emerald-600 text-white shadow-xs"
                                        : zoom > 1.15
                                            ? "bg-emerald-500/25 text-emerald-300 font-extrabold"
                                            : "text-gray-300 hover:text-white"
                                }`}
                                title={language === "uz" ? "Kenglikka moslash / 100% ga qaytarish" : "По ширине / Масштаб"}
                            >
                                {isFitWidth ? (language === "uz" ? "Kenglik" : "Ширина") : `${Math.round(zoom * 100)}%`}
                            </button>
                            <button
                                onClick={handleZoomIn}
                                className="h-9 w-9 rounded-lg sm:rounded-full text-gray-300 hover:text-white hover:bg-white/10 active:scale-95 flex items-center justify-center transition-colors"
                                title={language === "uz" ? "Kattalashtirish (+)" : "Увеличить (+)"}
                                aria-label="Zoom In"
                            >
                                <ZoomIn size={16} />
                            </button>
                        </div>

                        {/* 5. View Mode: [ 📖 Kitob / 📄 Sahifa ] */}
                        {!isNarrowScreen && (
                            <button
                                onClick={toggleViewMode}
                                className="h-11 px-3 rounded-xl sm:rounded-full bg-white/10 hover:bg-white/15 border border-white/10 text-gray-200 hover:text-white text-xs font-semibold hidden md:flex items-center gap-1.5 active:scale-95 transition-all shrink-0"
                                title={
                                    viewMode === "double"
                                        ? language === "uz" ? "Yakka sahifa rejimiga o'tish" : "В одну страницу"
                                        : language === "uz" ? "Kitob ko'rinishiga (2 sahifa) o'tish" : "Разворот книги"
                                }
                            >
                                {viewMode === "double" ? (
                                    <>
                                        <Book size={16} className="text-emerald-400" />
                                        <span className="hidden lg:inline">{language === "uz" ? "Kitob (2 bet)" : "Разворот"}</span>
                                    </>
                                ) : (
                                    <>
                                        <FileText size={16} className="text-blue-400" />
                                        <span className="hidden lg:inline">{language === "uz" ? "Yakka bet" : "1 страница"}</span>
                                    </>
                                )}
                            </button>
                        )}

                        {/* 6. Sound Toggle: [ 🔊 / 🔇 ] */}
                        <button
                            onClick={toggleSound}
                            className={`h-11 w-11 rounded-xl sm:rounded-full border active:scale-95 flex items-center justify-center transition-all shrink-0 ${
                                isSoundEnabled
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/35"
                                    : "bg-white/10 text-gray-400 hover:text-white border-white/10"
                            }`}
                            title={
                                isSoundEnabled
                                    ? language === "uz" ? "Varaqlash tovushi: Yoqiq" : "Звук страниц: Вкл"
                                    : language === "uz" ? "Varaqlash tovushi: O'chiq" : "Звук страниц: Выкл"
                            }
                            aria-label="Toggle Sound"
                        >
                            {isSoundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
                        </button>
                    </nav>
                </div>
            )}
        </div>
    );
}

export default BookCanvasReader;
