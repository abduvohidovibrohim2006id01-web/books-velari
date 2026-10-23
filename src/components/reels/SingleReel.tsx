"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
    Heart,
    MessageCircle,
    Send,
    Bookmark,
    MoreHorizontal,
    ShoppingBag,
    Volume2,
    VolumeX,
    Loader2,
    AlertCircle,
    ChevronRight,
    CheckCircle2,
    Music,
    Copy,
} from "lucide-react";
import { useStore } from "@/store/store";
import { supabase } from "@/lib/supabase";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { sanitizeVideoUrl } from "@/lib/video-url";
import dynamic from "next/dynamic";
const QuickBuySheet = dynamic(() => import("@/components/reels/QuickBuySheet").then((m) => m.QuickBuySheet), { ssr: false });

interface SingleReelProps {
    reel: any;
    isActive: boolean;
    isNearby?: boolean;
    isImmediateNext?: boolean;
    isMuted: boolean;
    toggleMute: () => void;
    onCommentOpen: (productId: string) => void;
    onModalStateChange?: (isOpen: boolean) => void;
    language: "uz" | "ru";
    t: any;
}

interface FlyingHeart {
    id: number;
    x: number;
    y: number;
}

export const SingleReel = ({
    reel,
    isActive,
    isNearby,
    isImmediateNext,
    isMuted,
    toggleMute,
    onCommentOpen,
    onModalStateChange,
    language,
    t,
}: SingleReelProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);

    const { user, showToast } = useStore();

    // Interaction states
    const [liked, setLiked] = useState(false);
    const [likesCount, setLikesCount] = useState(Number(reel.likesCount) || 0);
    const [saved, setSaved] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [hasError, setHasError] = useState(false);

    // Instagram UI states
    const [isQuickBuyOpen, setIsQuickBuyOpen] = useState(false);
    const [isOptionsOpen, setIsOptionsOpen] = useState(false);
    const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
    const [flyingHearts, setFlyingHearts] = useState<FlyingHeart[]>([]);
    const [soundBadge, setSoundBadge] = useState<{ visible: boolean; isMuted: boolean } | null>(null);
    const [isHolding, setIsHolding] = useState(false);

    // Synchronize modal open state to parent so Reels snap container scrolling freezes
    useEffect(() => {
        onModalStateChange?.(isQuickBuyOpen || isOptionsOpen);
    }, [isQuickBuyOpen, isOptionsOpen, onModalStateChange]);

    // Touch & tap tracking
    const lastTapRef = useRef<number>(0);
    const tapTimerRef = useRef<NodeJS.Timeout | null>(null);
    const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
    const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    const cleanVideoUrl = sanitizeVideoUrl(reel.videoUrl);

    // Faol bo'lganda avvalgi xatolik holatini tozalash
    useEffect(() => {
        if (isActive) {
            setHasError(false);
            setIsBuffering(true);
        } else {
            setIsPlaying(false);
            setIsBuffering(false);
        }
    }, [isActive]);

    // ─────────────────────────────────────────────────────────────
    // 1. Video Initialization Effect (faqat isActive/cleanVideoUrl o'zgarganda)
    //    Video manbani yuklab, metadata tayyor bo'lgach play() chaqiradi.
    //    QuickBuySheet yoki Hold — bu effectga ta'sir QILMAYDI.
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !cleanVideoUrl) return;

        if (!isActive) {
            try {
                v.pause();
            } catch {}
            setIsPlaying(false);
            setIsBuffering(false);
            return;
        }

        let isCancelled = false;

        const attemptPlay = () => {
            if (isCancelled || !v) return;

            v.defaultMuted = isMuted;
            v.muted = isMuted;

            const playPromise = v.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        if (!isCancelled) {
                            setIsPlaying(true);
                            setIsBuffering(false);
                            setHasError(false);
                        }
                    })
                    .catch((err) => {
                        if (isCancelled) return;
                        console.warn("[SingleReel] Autoplay rejected, retrying muted:", err.message);
                        if (v) {
                            v.muted = true;
                            v.play()
                                .then(() => {
                                    if (!isCancelled) {
                                        setIsPlaying(true);
                                        setIsBuffering(false);
                                        setHasError(false);
                                    }
                                })
                                .catch(() => {
                                    if (!isCancelled) {
                                        setIsPlaying(false);
                                        setIsBuffering(false);
                                    }
                                });
                        }
                    });
            }
        };

        if (v.readyState >= 1) {
            attemptPlay();
        } else {
            const onReady = () => {
                v.removeEventListener("loadedmetadata", onReady);
                v.removeEventListener("canplay", onReady);
                v.removeEventListener("error", onFail);
                attemptPlay();
            };

            const onFail = () => {
                v.removeEventListener("loadedmetadata", onReady);
                v.removeEventListener("canplay", onReady);
                v.removeEventListener("error", onFail);
            };

            v.addEventListener("loadedmetadata", onReady);
            v.addEventListener("canplay", onReady);
            v.addEventListener("error", onFail);

            const failsafeTimer = setTimeout(() => {
                v.removeEventListener("loadedmetadata", onReady);
                v.removeEventListener("canplay", onReady);
                v.removeEventListener("error", onFail);
                if (!isCancelled && v.readyState === 0) {
                    v.src = cleanVideoUrl;
                }
                attemptPlay();
            }, 8000);

            return () => {
                isCancelled = true;
                clearTimeout(failsafeTimer);
                v.removeEventListener("loadedmetadata", onReady);
                v.removeEventListener("canplay", onReady);
                v.removeEventListener("error", onFail);
                // isActive false bo'lganda React <video> ni DOM'dan olib tashlaydi,
                // shuning uchun bu yerda faqat pause qilsak kifoya
                if (v) {
                    try { v.pause(); } catch {}
                }
            };
        }

        return () => {
            isCancelled = true;
            if (v) {
                try { v.pause(); } catch {}
            }
        };
    }, [isActive, cleanVideoUrl]);

    // ─────────────────────────────────────────────────────────────
    // 2. Pause/Resume Effect (QuickBuySheet yoki Long Press Hold uchun)
    //    Video src'ni BUZMAYDI — faqat pause/play qiladi.
    // ─────────────────────────────────────────────────────────────
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !isActive) return;

        if (isQuickBuyOpen || isHolding) {
            v.pause();
            setIsPlaying(false);
        } else {
            // Sheet yopildi yoki hold tugadi — videoni davom ettirish
            if (v.readyState >= 1 && v.paused) {
                v.muted = isMuted;
                v.play()
                    .then(() => {
                        setIsPlaying(true);
                        setIsBuffering(false);
                    })
                    .catch(() => {});
            }
        }
    }, [isQuickBuyOpen, isHolding, isActive]);

    // Ovoz o'zgarganda faol videoga to'g'ridan-to'g'ri berish
    useEffect(() => {
        const v = videoRef.current;
        if (v && isActive) {
            v.muted = isMuted;
            if (v.paused && !isHolding && !isQuickBuyOpen) {
                v.play().then(() => setIsPlaying(true)).catch(() => {});
            }
        }
    }, [isMuted, isActive, isHolding, isQuickBuyOpen]);

    // Progress Bar (requestAnimationFrame with GPU transform)
    useEffect(() => {
        const v = videoRef.current;
        if (!v || !isActive) {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            return;
        }

        const tick = () => {
            if (v.paused || v.ended || document.hidden) {
                rafRef.current = requestAnimationFrame(tick);
                return;
            }
            if (v.duration > 0 && progressRef.current) {
                const ratio = Math.min(1, Math.max(0, v.currentTime / v.duration));
                progressRef.current.style.transform = `scaleX(${ratio})`;
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);

        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
    }, [isActive]);

    // ─────────────────────────────────────────────────────────────
    // 2. Instagram Gestures (Single Tap Sound, Double Tap Like, Long Press Hold)
    // ─────────────────────────────────────────────────────────────
    const SINGLE_TAP_DELAY = 160;
    const HOLD_DELAY = 320;

    const clearGestureTimers = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (tapTimerRef.current) {
            clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
        }
    };

    useEffect(() => {
        return () => clearGestureTimers();
    }, []);

    const handlePointerDown = (e: React.PointerEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("[data-interactive='true']")) return;

        touchStartPos.current = { x: e.clientX, y: e.clientY };

        holdTimerRef.current = setTimeout(() => {
            setIsHolding(true);
            videoPreWarmer.triggerHaptic("light");
            if (videoRef.current && !videoRef.current.paused) {
                videoRef.current.pause();
            }
        }, HOLD_DELAY);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!holdTimerRef.current) return;
        const dx = Math.abs(e.clientX - touchStartPos.current.x);
        const dy = Math.abs(e.clientY - touchStartPos.current.y);
        if (dx > 8 || dy > 8) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
    };

    const handlePointerCancel = () => {
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (isHolding) {
            setIsHolding(false);
            if (videoRef.current && isActive && !isQuickBuyOpen) {
                videoRef.current.play().catch(() => {});
            }
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest("button") || target.closest("[data-interactive='true']")) {
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
            return;
        }

        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }

        if (isHolding) {
            setIsHolding(false);
            if (videoRef.current && isActive && !isQuickBuyOpen) {
                videoRef.current.play().catch(() => {});
            }
            return;
        }

        const now = Date.now();
        const diff = now - lastTapRef.current;

        if (diff < 280) {
            // Double Tap: Like + Flying Heart
            if (tapTimerRef.current) {
                clearTimeout(tapTimerRef.current);
                tapTimerRef.current = null;
            }

            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const heartId = Date.now();

            setFlyingHearts((prev) => [...prev, { id: heartId, x, y }]);
            handleLike(true);

            setTimeout(() => {
                setFlyingHearts((prev) => prev.filter((h) => h.id !== heartId));
            }, 850);
        } else {
            // Single Tap: Snappy sound toggle (160ms)
            tapTimerRef.current = setTimeout(() => {
                videoPreWarmer.triggerHaptic("light");
                const nextMuted = !isMuted;
                toggleMute();
                setSoundBadge({ visible: true, isMuted: nextMuted });
                setTimeout(() => setSoundBadge(null), 750);
            }, SINGLE_TAP_DELAY);
        }

        lastTapRef.current = now;
    };

    // ─────────────────────────────────────────────────────────────
    // 3. User Actions (Like, Save, Share, Comments)
    // ─────────────────────────────────────────────────────────────
    const handleLike = useCallback(
        async (forcedLike?: boolean) => {
            const nextLiked = forcedLike !== undefined ? forcedLike : !liked;
            if (nextLiked === liked && forcedLike !== undefined) return;

            const diff = nextLiked ? 1 : -1;
            setLiked(nextLiked);
            setLikesCount((prev) => Math.max(0, prev + diff));
            videoPreWarmer.triggerHaptic(nextLiked ? "double" : "light");

            try {
                await supabase.rpc("increment_reel_likes", { reel_id: reel.id, diff });
            } catch (error) {
                console.error("[SingleReel] Like sync error:", error);
            }
        },
        [liked, reel.id]
    );

    const handleSave = () => {
        videoPreWarmer.triggerHaptic("light");
        const next = !saved;
        setSaved(next);
        showToast(
            next
                ? (language === "uz" ? "Saqlanganlarga qo'shildi" : "Сохранено в закладки")
                : (language === "uz" ? "Saqlanganlardan olib tashlandi" : "Удалено из закладок"),
            "info"
        );
    };

    const handleShare = () => {
        videoPreWarmer.triggerHaptic("light");
        const url = typeof window !== "undefined" ? window.location.href : "";
        const title = reel[`name_${language}`] || reel.name || "Velari Reels";

        if (navigator.share) {
            navigator.share({ title, url }).catch(() => {});
        } else {
            navigator.clipboard.writeText(url);
            showToast(language === "uz" ? "Havola nusxalandi!" : "Ссылка скопирована!", "info");
        }
    };

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        setHasError(false);
        setIsBuffering(true);
        const v = videoRef.current;
        if (v) {
            v.src = cleanVideoUrl;
            // Brauzer manbani parse qilguncha kutamiz
            const onCanPlay = () => {
                v.removeEventListener("canplay", onCanPlay);
                v.play().catch(() => {});
            };
            v.addEventListener("canplay", onCanPlay);
        }
    };

    const fmtPrice = (n?: number) => {
        if (!n) return "0 so'm";
        return n.toLocaleString("ru-RU") + (language === "ru" ? " сум" : " so'm");
    };

    const formatCount = (n: number) => {
        if (!n || n <= 0) return "0";
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return (n / 1000).toFixed(1) + "K";
        return String(n);
    };

    const reelProduct = {
        id: reel.productId || reel.id,
        productId: reel.productId || reel.id,
        name: reel.name,
        name_uz: reel.name_uz || reel.name,
        name_ru: reel.name_ru || reel.name,
        price: reel.price,
        oldPrice: reel.oldPrice || 0,
        image: reel.image,
        imageUrl: reel.image,
        images: reel.images || (reel.image ? [reel.image] : []),
        image_metadata: reel.image_metadata,
        rawImage: reel.rawImage,
        category: reel.category || "Velari",
        stockDetails: reel.stockDetails || null,
        stock: reel.stock || 0,
        colorName: reel.colorName || "",
        model: reel.model || "",
        groupId: reel.groupId || "",
        article: reel.article || "",
    };

    const reelTitle = reel[`name_${language}`] || reel.name || "";

    return (
        <div className="relative w-full h-full bg-black overflow-hidden flex flex-col items-center justify-center select-none">
            {/* Main Interactive Screen */}
            <div
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onPointerLeave={handlePointerCancel}
                className="relative w-full h-full bg-black flex items-center justify-center cursor-pointer overflow-hidden"
            >
                {/* Poster Background: smooth GPU crossfade */}
                {reel.image && (
                    <img
                        src={reel.image}
                        alt=""
                        className={`absolute inset-0 w-full h-full object-cover select-none pointer-events-none transition-opacity duration-200 ease-out ${
                            isActive && isPlaying ? "opacity-0" : "opacity-100"
                        }`}
                        style={{ transform: "translate3d(0, 0, 0)", backfaceVisibility: "hidden" }}
                    />
                )}

                {/* Hardware Accelerated Native Video Element (rendered when isActive or isNearby for zero-lag preloading) */}
                {(isActive || isNearby) && cleanVideoUrl ? (
                    <video
                        ref={videoRef}
                        src={cleanVideoUrl}
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-200 ease-out ${
                            isActive && isPlaying ? "opacity-100" : "opacity-0"
                        }`}
                        style={{
                            transform: "translate3d(0, 0, 0)",
                            backfaceVisibility: "hidden",
                            willChange: isActive || isImmediateNext ? "opacity" : "auto",
                        }}
                        loop
                        playsInline
                        webkit-playsinline="true"
                        muted={!isActive || isMuted}
                        preload={isActive || isImmediateNext ? "auto" : "metadata"}
                        onWaiting={() => { if (isActive) setIsBuffering(true); }}
                        onPlaying={() => {
                            if (isActive) {
                                setIsBuffering(false);
                                setIsPlaying(true);
                                setHasError(false);
                            }
                        }}
                        onCanPlay={() => { if (isActive) setIsBuffering(false); }}
                        onPause={() => { if (isActive) setIsPlaying(false); }}
                        onError={(e) => {
                            // Faqat faol vaqtda xatolik bo'lsa ko'rsatiladi (unmount abort'larni hisobga olmaydi)
                            if (!isActive) return;
                            console.error("[SingleReel] Video playback error:", cleanVideoUrl, e);
                            setIsBuffering(false);
                            setHasError(true);
                        }}
                    />
                ) : null}

                {/* Video Error Recovery Screen */}
                {hasError && isActive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-3 p-6 text-center z-30">
                        <AlertCircle size={36} className="text-red-400" />
                        <p className="text-xs font-medium text-white/90">
                            {language === "uz" ? "Videoni yuklab bo'lmadi" : "Не удалось загрузить видео"}
                        </p>
                        <button
                            data-interactive="true"
                            onClick={handleRetry}
                            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold active:scale-95 transition-transform duration-150 transition-colors"
                        >
                            {language === "uz" ? "Qayta urinish" : "Повторить"}
                        </button>
                    </div>
                )}

                {/* Subtle Buffering Spinner */}
                {isBuffering && !hasError && isActive && !isPlaying && (
                    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                        <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10">
                            <Loader2 size={24} className="text-white animate-spin opacity-90" />
                        </div>
                    </div>
                )}

                {/* Instagram Center Speaker Badge (Pops in on Tap) */}
                {soundBadge && (
                    <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                        <div className="w-18 h-18 bg-black/60 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/20 shadow-2xl animate-ig-speaker-badge">
                            {soundBadge.isMuted ? (
                                <VolumeX size={34} className="text-white" />
                            ) : (
                                <Volume2 size={34} className="text-white" />
                            )}
                        </div>
                    </div>
                )}

                {/* Instagram Flying Red Hearts on Double Tap */}
                {flyingHearts.map((heart) => (
                    <div
                        key={heart.id}
                        className="absolute pointer-events-none z-50 flex items-center justify-center animate-ig-flying-heart"
                        style={{
                            left: `${heart.x}px`,
                            top: `${heart.y}px`,
                        }}
                    >
                        <Heart
                            size={92}
                            className="fill-[#FF3040] text-[#FF3040] drop-shadow-[0_12px_28px_rgba(255,48,64,0.65)]"
                        />
                    </div>
                ))}
            </div>

            {/* Top Gradient & Progress Bar */}
            <div
                className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/75 via-black/25 to-transparent pointer-events-none z-30 transition-opacity duration-200 ${
                    isHolding ? "opacity-0" : "opacity-100"
                }`}
            />

            {/* Ultra-thin Instagram Progress Bar */}
            <div
                className={`absolute top-0 left-0 right-0 h-[2px] bg-white/20 z-40 transition-opacity duration-200 ${
                    isHolding ? "opacity-0" : "opacity-100"
                }`}
            >
                <div ref={progressRef} className="h-full w-full bg-white transition-none origin-left will-change-transform" style={{ transform: "scaleX(0)" }} />
            </div>

            {/* ─────────────────────────────────────────────────────────────
                Instagram Right Action Rail (Vertical Icons)
                ───────────────────────────────────────────────────────────── */}
            <div
                className={`absolute bottom-6 right-3 flex flex-col items-center gap-4.5 z-40 transition-opacity duration-200 ${
                    isHolding ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
            >
                {/* Like Button */}
                <div className="flex flex-col items-center gap-1">
                    <button
                        data-interactive="true"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleLike();
                        }}
                        className="p-1 active:scale-75 transition-transform"
                        aria-label="Like"
                    >
                        <Heart
                            size={29}
                            className={
                                liked
                                    ? "fill-[#FF3040] text-[#FF3040] drop-shadow-[0_2px_8px_rgba(255,48,64,0.5)] scale-105 transition-transform"
                                    : "text-white stroke-[2.2] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                            }
                        />
                    </button>
                    <span className="text-[12px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                        {formatCount(likesCount)}
                    </span>
                </div>

                {/* Comment Button */}
                <div className="flex flex-col items-center gap-1">
                    <button
                        data-interactive="true"
                        onClick={(e) => {
                            e.stopPropagation();
                            videoPreWarmer.triggerHaptic("light");
                            onCommentOpen(reelProduct.id);
                        }}
                        className="p-1 active:scale-75 transition-transform"
                        aria-label="Comments"
                    >
                        <MessageCircle
                            size={28}
                            strokeWidth={2.2}
                            className="text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                        />
                    </button>
                    <span className="text-[12px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                        {formatCount(reel.commentCount || 0)}
                    </span>
                </div>

                {/* Share (Paper Airplane) */}
                <div className="flex flex-col items-center gap-1">
                    <button
                        data-interactive="true"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleShare();
                        }}
                        className="p-1 active:scale-75 transition-transform"
                        aria-label="Share"
                    >
                        <Send
                            size={26}
                            strokeWidth={2.2}
                            className="text-white -rotate-12 drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                        />
                    </button>
                    <span className="text-[11px] font-medium text-white/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                        {language === "uz" ? "Ulashish" : "Поделиться"}
                    </span>
                </div>

                {/* Bookmark / Save */}
                <div className="flex flex-col items-center gap-1">
                    <button
                        data-interactive="true"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleSave();
                        }}
                        className="p-1 active:scale-75 transition-transform"
                        aria-label="Save"
                    >
                        <Bookmark
                            size={27}
                            strokeWidth={2.2}
                            className={
                                saved
                                    ? "fill-white text-white drop-shadow-[0_2px_8px_rgba(255,255,255,0.4)]"
                                    : "text-white stroke-[2.2] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                            }
                        />
                    </button>
                    <span className="text-[11px] font-medium text-white/95 drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
                        {language === "uz" ? "Saqlash" : "Сохранить"}
                    </span>
                </div>

                {/* Three Dots More Options */}
                <button
                    data-interactive="true"
                    onClick={(e) => {
                        e.stopPropagation();
                        videoPreWarmer.triggerHaptic("light");
                        setIsOptionsOpen(true);
                    }}
                    className="p-1 text-white active:scale-75 transition-transform drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]"
                    aria-label="More options"
                >
                    <MoreHorizontal size={24} strokeWidth={2.4} />
                </button>

                {/* Spinning Vinyl Music Disc with rising notes */}
                <div className="relative mt-1 flex items-center justify-center">
                    <span className="absolute -top-3 left-0 text-white text-[11px] animate-ig-note-1 select-none pointer-events-none">
                        ♪
                    </span>
                    <span className="absolute -top-4 right-0 text-white text-[9px] animate-ig-note-2 select-none pointer-events-none">
                        ♫
                    </span>
                    <div className="w-8 h-8 rounded-full border-[1.5px] border-white/80 overflow-hidden bg-zinc-900 animate-ig-disc shadow-xl flex items-center justify-center ring-2 ring-black/40">
                        {reel.image ? (
                            <img src={reel.image} alt="" className="w-full h-full object-cover rounded-full" />
                        ) : (
                            <div className="w-2.5 h-2.5 rounded-full bg-white/80" />
                        )}
                    </div>
                </div>
            </div>

            {/* ─────────────────────────────────────────────────────────────
                Instagram Bottom-Left Area (Shoppable Pill, Author, Caption, Music)
                ───────────────────────────────────────────────────────────── */}
            <div
                className={`absolute bottom-4 left-3.5 right-18 z-40 space-y-2.5 transition-opacity duration-200 ${
                    isHolding ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
            >
                {/* 1. Shoppable Product Tag (Instagram Product Pill) */}
                {reelProduct.price > 0 && (
                    <div>
                        <div
                            data-interactive="true"
                            onClick={(e) => {
                                e.stopPropagation();
                                videoPreWarmer.triggerHaptic("medium");
                                setIsQuickBuyOpen(true);
                            }}
                            className="inline-flex items-center gap-2 bg-black/65 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white shadow-xl active:scale-95 transition-transform duration-150 cursor-pointer group"
                        >
                            <ShoppingBag size={14} className="text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
                            <span className="text-[11.5px] font-bold tracking-tight">
                                {language === "uz" ? "Mahsulotni ko'rish" : "Смотреть товар"}
                            </span>
                            <span className="text-white/40 text-[10px]">•</span>
                            <span className="text-[11.5px] font-extrabold text-emerald-300">
                                {fmtPrice(reelProduct.price)}
                            </span>
                            <ChevronRight size={13} className="text-white/70 shrink-0 ml-0.5" />
                        </div>
                    </div>
                )}

                {/* 2. Channel / Author Row */}
                <div className="flex items-center gap-2.5">
                    <div className="relative w-9 h-9 rounded-full ring-1.5 ring-white/60 overflow-hidden bg-black/50 shrink-0 shadow-md">
                        <img
                            src={reel.image || "/favicon-120x120.png"}
                            alt="Velari"
                            className="w-full h-full object-cover"
                        />
                    </div>

                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[13.5px] font-bold text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] truncate">
                            velari.uz
                        </span>
                        <CheckCircle2 size={13} className="text-[#0095F6] fill-[#0095F6] shrink-0" />
                    </div>

                    {/* Follow / Obuna bo'lish Button */}
                    <button
                        data-interactive="true"
                        onClick={(e) => {
                            e.stopPropagation();
                            videoPreWarmer.triggerHaptic("light");
                            const next = !isFollowing;
                            setIsFollowing(next);
                            showToast(
                                next
                                    ? (language === "uz" ? "Obuna bo'ldingiz!" : "Вы подписались!")
                                    : (language === "uz" ? "Obuna bekor qilindi" : "Подписка отменена"),
                                "info"
                            );
                        }}
                        className={`ml-1 text-[11px] font-bold px-3 py-1 rounded-lg border transition-transform duration-150 active:scale-90 ${
                            isFollowing
                                ? "bg-white/20 border-white/30 text-white/90"
                                : "bg-transparent border-white/80 text-white hover:bg-white/10"
                        }`}
                    >
                        {isFollowing
                            ? (language === "uz" ? "Obunadasiz" : "Подписки")
                            : (language === "uz" ? "Obuna bo'lish" : "Подписаться")}
                    </button>
                </div>

                {/* 3. Caption Text with Expandable "...ko'proq / more" */}
                {reelTitle && (
                    <div className="text-[13px] text-white/95 leading-relaxed drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] font-normal pr-2">
                        <p className={isCaptionExpanded ? "" : "line-clamp-2"}>
                            {reelTitle}
                            <span className="text-white/60 text-xs ml-1 font-medium">#velari #tashkent #gadgets</span>
                        </p>
                        {reelTitle.length > 60 && (
                            <button
                                data-interactive="true"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsCaptionExpanded(!isCaptionExpanded);
                                }}
                                className="text-[12px] font-semibold text-white/70 hover:text-white mt-0.5"
                            >
                                {isCaptionExpanded
                                    ? (language === "uz" ? "Yopish" : "Скрыть")
                                    : (language === "uz" ? "...ko'proq" : "...ещё")}
                            </button>
                        )}
                    </div>
                )}

                {/* 4. Audio Marquee Ticker */}
                <div className="flex items-center gap-2 overflow-hidden max-w-[240px]">
                    <Music size={12} className="text-white/90 shrink-0 animate-pulse" />
                    <div className="overflow-hidden whitespace-nowrap text-[11px] text-white/90 font-medium">
                        <div className="animate-ig-marquee flex gap-6">
                            <span>Velari • Original audio • velari.uz • Asl audio</span>
                            <span>Velari • Original audio • velari.uz • Asl audio</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Gradient overlay */}
            <div
                className={`absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-black/90 via-black/45 to-transparent pointer-events-none z-20 transition-opacity duration-200 ${
                    isHolding ? "opacity-0" : "opacity-100"
                }`}
            />

            {/* ─────────────────────────────────────────────────────────────
                Quick Buy Sheet Modal
                ───────────────────────────────────────────────────────────── */}
            {isQuickBuyOpen && (
                <QuickBuySheet
                    product={reelProduct}
                    onClose={() => setIsQuickBuyOpen(false)}
                    language={language}
                    t={t}
                />
            )}

            {/* ─────────────────────────────────────────────────────────────
                Instagram Options Action Sheet (Three dots menu)
                ───────────────────────────────────────────────────────────── */}
            <ReelOptionsSheet
                open={isOptionsOpen}
                onClose={() => setIsOptionsOpen(false)}
                language={language}
                saved={saved}
                onOpenProduct={() => setIsQuickBuyOpen(true)}
                onShare={handleShare}
                onSave={handleSave}
            />
        </div>
    );
};

function ReelOptionsSheet({
    open,
    onClose,
    language,
    saved,
    onOpenProduct,
    onShare,
    onSave,
}: {
    open: boolean;
    onClose: () => void;
    language: "uz" | "ru";
    saved: boolean;
    onOpenProduct: () => void;
    onShare: () => void;
    onSave: () => void;
}) {
    const [mounted, setMounted] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const dragStartY = useRef(0);
    const lastTouchY = useRef(0);
    const dragStartTime = useRef(0);
    const velocity = useRef(0);
    const currentTranslateY = useRef(0);
    const isDragging = useRef(false);

    useEffect(() => {
        const el = sheetRef.current;
        if (!el) return;
        const onNativeTouchMove = (e: TouchEvent) => {
            if (isDragging.current && e.cancelable) {
                e.preventDefault();
            }
        };
        el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
        return () => el.removeEventListener("touchmove", onNativeTouchMove);
    }, []);

    const handleCloseWithAnimation = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        if (sheetRef.current) {
            sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out";
            sheetRef.current.style.transform = "translate3d(0, 100%, 0)";
            sheetRef.current.style.opacity = "0";
        }
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 250);
    }, [isClosing, onClose]);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const y = e.clientY;
        dragStartY.current = y;
        lastTouchY.current = y;
        dragStartTime.current = performance.now();
        velocity.current = 0;
        isDragging.current = true;
        if (sheetRef.current) {
            sheetRef.current.style.animation = "none";
            sheetRef.current.style.transition = "none";
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        const y = e.clientY;
        const delta = y - dragStartY.current;

        if (delta < 0) {
            if (sheetRef.current) sheetRef.current.style.transform = "translate3d(0, 0, 0)";
            currentTranslateY.current = 0;
            return;
        }

        const now = performance.now();
        const dt = Math.max(1, now - dragStartTime.current);
        const dy = y - lastTouchY.current;
        velocity.current = dy / dt;
        lastTouchY.current = y;
        dragStartTime.current = now;

        if (sheetRef.current) {
            currentTranslateY.current = delta;
            sheetRef.current.style.transform = `translate3d(0, ${delta}px, 0)`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
        isDragging.current = false;

        if (currentTranslateY.current > 80 || velocity.current > 0.45) {
            videoPreWarmer.triggerHaptic("light");
            handleCloseWithAnimation();
        } else if (sheetRef.current) {
            sheetRef.current.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
            sheetRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        currentTranslateY.current = 0;
        velocity.current = 0;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        const y = e.touches[0].clientY;
        dragStartY.current = y;
        lastTouchY.current = y;
        dragStartTime.current = performance.now();
        velocity.current = 0;
        isDragging.current = true;
        if (sheetRef.current) {
            sheetRef.current.style.animation = "none";
            sheetRef.current.style.transition = "none";
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        const y = e.touches[0].clientY;
        const delta = y - dragStartY.current;

        if (delta < 0) return;

        const now = performance.now();
        const dt = Math.max(1, now - dragStartTime.current);
        const dy = y - lastTouchY.current;
        velocity.current = dy / dt;
        lastTouchY.current = y;
        dragStartTime.current = now;

        if (sheetRef.current) {
            currentTranslateY.current = delta;
            sheetRef.current.style.transform = `translate3d(0, ${delta}px, 0)`;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (!isDragging.current || !sheetRef.current) {
            isDragging.current = false;
            return;
        }
        isDragging.current = false;

        if (currentTranslateY.current > 80 || velocity.current > 0.45) {
            videoPreWarmer.triggerHaptic("light");
            handleCloseWithAnimation();
        } else {
            sheetRef.current.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
            sheetRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        currentTranslateY.current = 0;
        velocity.current = 0;
    };

    if (!open || !mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[120] flex flex-col justify-end pointer-events-auto"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: "none" }}
        >
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-250 ease-out ${
                    isClosing ? "opacity-0" : "opacity-100 animate-in fade-in"
                }`}
                style={{ touchAction: "none" }}
                onClick={handleCloseWithAnimation}
            />
            <div
                ref={sheetRef}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                style={{
                    willChange: "transform",
                    WebkitOverflowScrolling: "touch",
                    overscrollBehavior: "contain",
                    transition: isClosing ? "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out" : undefined,
                    transform: isClosing ? "translate3d(0, 100%, 0)" : undefined,
                    animation: (!isClosing && !isDragging.current && currentTranslateY.current === 0)
                        ? "velari-sheet-up 300ms cubic-bezier(0.22, 1, 0.36, 1)"
                        : "none",
                }}
                className="relative bg-[#262626] text-white rounded-t-3xl overflow-hidden p-3 pb-[max(24px,env(safe-area-inset-bottom))] space-y-1 shadow-2xl max-w-md mx-auto w-full will-change-transform overscroll-contain"
            >
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="w-full flex items-center justify-center pt-1 pb-3 cursor-grab select-none"
                    style={{ touchAction: "none" }}
                >
                    <div className="w-10 h-1 bg-white/20 rounded-full" />
                </div>

                {/* Mahsulotga o'tish */}
                <button
                    onClick={() => {
                        handleCloseWithAnimation();
                        onOpenProduct();
                    }}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-white/10 rounded-2xl active:scale-98 transition-colors duration-150"
                >
                    <span className="text-sm font-semibold">
                        {language === "uz" ? "Mahsulotni ko'rish" : "Посмотреть товар"}
                    </span>
                    <ShoppingBag size={19} className="text-white/80" />
                </button>

                {/* Havolani nusxalash */}
                <button
                    onClick={() => {
                        handleCloseWithAnimation();
                        onShare();
                    }}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-white/10 rounded-2xl active:scale-98 transition-colors duration-150"
                >
                    <span className="text-sm font-semibold">
                        {language === "uz" ? "Havolani nusxalash" : "Копировать ссылку"}
                    </span>
                    <Copy size={19} className="text-white/80" />
                </button>

                {/* Saqlash */}
                <button
                    onClick={() => {
                        handleCloseWithAnimation();
                        onSave();
                    }}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-white/10 rounded-2xl active:scale-98 transition-colors duration-150"
                >
                    <span className="text-sm font-semibold">
                        {saved
                            ? (language === "uz" ? "Saqlanganlardan o'chirish" : "Удалить из сохраненных")
                            : (language === "uz" ? "Saqlash" : "Сохранить")}
                    </span>
                    <Bookmark size={19} className="text-white/80" />
                </button>

                {/* Bekor qilish */}
                <div className="pt-2">
                    <button
                        onClick={handleCloseWithAnimation}
                        className="w-full p-3.5 bg-white/10 hover:bg-white/15 rounded-2xl text-center text-sm font-bold text-red-400 active:scale-98 transition-colors duration-150"
                    >
                        {language === "uz" ? "Yopish" : "Отмена"}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
