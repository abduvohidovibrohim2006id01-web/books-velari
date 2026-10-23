"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/store/store";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/translations";
import { Loader2, ChevronLeft, Camera, Volume2, VolumeX } from "lucide-react";
import { useRouter } from "next/navigation";
import { Reel } from "@/types";
import { SingleReel } from "@/components/reels/SingleReel";
import { CommentsSheet } from "@/components/reels/CommentsSheet";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { sanitizeVideoUrl } from "@/lib/video-url";
import { getOptimizedImageUrl } from "@/lib/imageVariants";

// Active reel atrofida 2 ta oldingi va 2 ta keyingi reel DOMda saqlanadi
const WINDOW = 2;

export default function ReelsPage() {
    const router = useRouter();
    const { language, showToast } = useStore();
    const t = translations[language];

    const PAGE_SIZE = 15;
    const [reels, setReels] = useState<Reel[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeIndex, setActiveIndex] = useState(0);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [commentProductId, setCommentProductId] = useState<string | null>(null);
    const [isChildModalOpen, setIsChildModalOpen] = useState(false);
    const isModalActive = Boolean(commentProductId || isChildModalOpen);
    const containerRef = useRef<HTMLDivElement>(null);

    const fetchBatch = useCallback(async (pageIndex: number) => {
        const from = pageIndex * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const [reelsRes, productsRes] = await Promise.all([
            supabase
                .from("reels")
                .select("*")
                .order("created_at", { ascending: false })
                .range(from, to),
            supabase
                .from("products")
                .select("id,name,name_uz,name_ru,price,old_price,images,image,video_url,stock_details,category_id,color_name,model,group_id,article,stock,created_at")
                .not("video_url", "is", null)
                .eq("is_deleted", false)
                .neq("video_url", "")
                .order("created_at", { ascending: false })
                .range(from, to),
        ]);

        const reelItems: Reel[] = [];
        for (const r of reelsRes.data || []) {
            if (!r.video_url) continue;
            const rawImg = r.image || r.thumbnail_url || "/placeholder.png";
            const poster = getOptimizedImageUrl(r.image_metadata, rawImg, 'xs');
            const rawUrls = String(r.video_url).split(/[;,]/).map((u) => sanitizeVideoUrl(u)).filter(Boolean);
            rawUrls.forEach((vUrl, uIdx) => {
                reelItems.push({
                    id: `reel-${r.id}-${uIdx}`,
                    videoUrl: vUrl,
                    likesCount: Number(r.likes_count) || 0,
                    commentCount: Number(r.comment_count) || 0,
                    productId: r.product_id ? String(r.product_id) : undefined,
                    name: r.name || "",
                    price: Number(r.price) || 0,
                    image: poster,
                    rawImage: rawImg,
                    image_metadata: r.image_metadata,
                });
            });
        }

        const productItems: Reel[] = [];
        for (const p of productsRes.data || []) {
            if (!p.video_url) continue;
            const rawImg = p.image || (Array.isArray(p.images) ? p.images[0] : null) || "/placeholder.png";
            const poster = rawImg;
            const rawUrls = String(p.video_url).split(/[;,]/).map((u) => sanitizeVideoUrl(u)).filter(Boolean);
            rawUrls.forEach((vUrl, uIdx) => {
                productItems.push({
                    id: `${p.id}-${uIdx}`,
                    videoUrl: vUrl,
                    productId: String(p.id),
                    name: p.name || "",
                    name_uz: p.name_uz || p.name || "",
                    name_ru: p.name_ru || p.name || "",
                    price: Number(p.price) || 0,
                    oldPrice: Number(p.old_price) || 0,
                    image: poster,
                    rawImage: rawImg,
                    image_metadata: undefined,
                    images: Array.isArray(p.images) ? p.images : (rawImg ? [rawImg] : []),
                    stockDetails: p.stock_details || null,
                    stock: Number(p.stock) || 0,
                    colorName: p.color_name || "",
                    model: p.model || "",
                    groupId: p.group_id || "",
                    article: p.article || "",
                });
            });
        }

        // Interleave (1 ta reel, 1 ta mahsulot videosi)
        const maxLen = Math.max(reelItems.length, productItems.length);
        const combined: Reel[] = [];
        for (let i = 0; i < maxLen; i++) {
            if (i < reelItems.length) combined.push(reelItems[i]);
            if (i < productItems.length) combined.push(productItems[i]);
        }

        const moreAvailable =
            (reelsRes.data?.length === PAGE_SIZE) ||
            (productsRes.data?.length === PAGE_SIZE);

        return { items: combined, hasMore: moreAvailable };
    }, []);

    useEffect(() => {
        let isMounted = true;
        const loadInitial = async () => {
            try {
                const { items, hasMore: more } = await fetchBatch(0);
                if (!isMounted) return;

                const seenUrls = new Set<string>();
                const unique: Reel[] = [];
                for (const item of items) {
                    if (item.videoUrl && !seenUrls.has(item.videoUrl)) {
                        seenUrls.add(item.videoUrl);
                        unique.push(item);
                    }
                }

                setReels(unique);
                setHasMore(more);
                setPage(0);

                const urls = unique.map((s) => s.videoUrl).filter(Boolean);
                videoPreWarmer.prewarmUpcoming(urls, 0);
            } catch (error) {
                console.error("[ReelsPage] Error fetching reels:", error);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        loadInitial();
        return () => {
            isMounted = false;
        };
    }, [fetchBatch]);

    // Skroll oxiriga yetganda keyingi sahifani yuklash (Infinite Scroll)
    useEffect(() => {
        if (activeIndex >= reels.length - 3 && hasMore && !isLoadingMore && !loading && reels.length > 0) {
            const loadMore = async () => {
                setIsLoadingMore(true);
                try {
                    const nextPage = page + 1;
                    const { items: newItems, hasMore: more } = await fetchBatch(nextPage);
                    if (newItems.length > 0) {
                        setReels((prev) => {
                            const seen = new Set(prev.map((r) => r.videoUrl));
                            const uniqueNew = newItems.filter((r) => !seen.has(r.videoUrl));
                            return [...prev, ...uniqueNew];
                        });
                        setPage(nextPage);
                    }
                    setHasMore(more);
                } catch (err) {
                    console.error("[ReelsPage] Failed to load more reels:", err);
                } finally {
                    setIsLoadingMore(false);
                }
            };
            loadMore();
        }
    }, [activeIndex, reels.length, hasMore, isLoadingMore, loading, page, fetchBatch]);

    // ActiveIndex o'zgarganda navbatdagi videolarni orqa fonda isitish
    useEffect(() => {
        if (reels.length > 0) {
            const urls = reels.map((r) => r.videoUrl).filter(Boolean);
            videoPreWarmer.prewarmUpcoming(urls, activeIndex);
        }
    }, [activeIndex, reels]);

    // Aniq va tezkor skroll kuzatuvchi: 50% chegaradan o'tishi bilan darhol yangi reel faollashadi (zero lag)
    const handleScroll = useCallback(() => {
        const el = containerRef.current;
        if (!el) return;

        const h = el.clientHeight;
        if (h <= 0) return;

        const newIndex = Math.round(el.scrollTop / h);
        if (newIndex !== activeIndex && newIndex >= 0 && newIndex < reels.length) {
            setActiveIndex(newIndex);
        }
    }, [activeIndex, reels.length]);

    if (loading) {
        return (
            <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-black">
                <Loader2 size={40} className="text-white animate-spin mb-3 opacity-80" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-white/50">Loading Reels</p>
            </div>
        );
    }

    if (reels.length === 0) {
        return (
            <div className="h-[100dvh] w-full flex flex-col items-center justify-center bg-black text-white gap-3 p-4">
                <p className="text-sm font-semibold opacity-70">
                    {language === "uz" ? "Hech qanday video topilmadi" : "Видео не найдены"}
                </p>
                <button
                    onClick={() => router.back()}
                    className="px-4 py-2 bg-white/20 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                >
                    {language === "uz" ? "Orqaga qaytish" : "Назад"}
                </button>
            </div>
        );
    }

    return (
        <div className="h-[calc(100dvh-58px)] md:h-[calc(100vh-40px)] w-full bg-black relative flex flex-col items-center justify-center overflow-hidden py-0 md:py-3">
            {/* Main Instagram Phone Frame Container */}
            <div
                className="w-full max-w-[480px] h-full relative overflow-hidden bg-black md:rounded-[32px] md:border md:border-white/15 md:shadow-[0_25px_60px_rgba(0,0,0,0.9)] flex flex-col"
            >
                {/* ── Official Instagram Top Header ── */}
                <div className="absolute top-0 left-0 right-0 z-50 px-4 pt-3.5 pb-8 flex items-center justify-between bg-gradient-to-b from-black/75 via-black/30 to-transparent pointer-events-auto">
                    <div className="flex items-center gap-2.5">
                        <button
                            onClick={() => router.back()}
                            className="p-1 active:scale-75 transition-transform text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
                            aria-label="Back"
                        >
                            <ChevronLeft size={27} strokeWidth={2.6} />
                        </button>
                        <h1 className="text-[20px] font-extrabold tracking-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]">
                            Reels
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Quick Mute / Unmute Indicator Button */}
                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                setIsMuted(!isMuted);
                            }}
                            className="p-2 bg-black/40 backdrop-blur-md text-white rounded-full border border-white/20 active:scale-90 transition-transform shadow-lg"
                            aria-label="Toggle sound"
                        >
                            {isMuted ? <VolumeX size={17} /> : <Volume2 size={17} />}
                        </button>

                        {/* Instagram Camera Icon */}
                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                showToast(
                                    language === "uz" ? "Tez orada video yuklash imkoni ochiladi!" : "Скоро появится загрузка видео!",
                                    "info"
                                );
                            }}
                            className="p-2 text-white active:scale-90 transition-transform drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
                            aria-label="Camera"
                        >
                            <Camera size={23} strokeWidth={2.2} />
                        </button>
                    </div>
                </div>

                {/* ── Main Reels Vertical Snap Container ── */}
                <div
                    ref={containerRef}
                    onScroll={handleScroll}
                    className={`w-full h-full no-scrollbar bg-black relative flex flex-col ${
                        isModalActive
                            ? "overflow-hidden"
                            : "overflow-y-scroll snap-y snap-mandatory overscroll-contain touch-pan-y"
                    }`}
                    style={{
                        scrollbarWidth: "none",
                        msOverflowStyle: "none",
                        WebkitOverflowScrolling: isModalActive ? "auto" : "touch",
                        overscrollBehaviorY: "none",
                    }}
                >
                    {reels.map((reel, index) => {
                        const inWindow = index >= activeIndex - WINDOW && index <= activeIndex + WINDOW;
                        const isNearby = index >= activeIndex - 1 && index <= activeIndex + 1;
                        const isImmediateNext = index === activeIndex + 1;

                        if (!inWindow) {
                            return (
                                <div
                                    key={reel.id}
                                    className="w-full h-full snap-start shrink-0 bg-black"
                                />
                            );
                        }

                        return (
                            <div
                                key={reel.id}
                                className="w-full h-full snap-start shrink-0 relative [contain:layout_paint]"
                            >
                                <SingleReel
                                    reel={reel}
                                    isActive={activeIndex === index && !isModalActive}
                                    isNearby={isNearby}
                                    isImmediateNext={isImmediateNext}
                                    isMuted={isMuted}
                                    toggleMute={() => setIsMuted(!isMuted)}
                                    onCommentOpen={(pid) => setCommentProductId(pid)}
                                    onModalStateChange={setIsChildModalOpen}
                                    language={language}
                                    t={t}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Comments Overlay */}
            {commentProductId && (
                <CommentsSheet
                    productId={commentProductId}
                    onClose={() => setCommentProductId(null)}
                    language={language}
                    t={t}
                />
            )}
        </div>
    );
}
