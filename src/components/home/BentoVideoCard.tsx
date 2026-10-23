"use client";

import { useState, useRef, useEffect, memo } from "react";
import Link from "next/link";
import { Heart, Volume2, VolumeX, Sparkles, Zap, Clapperboard, ShoppingBag, Plus, Check } from "lucide-react";
import { Product, CartItem } from "@/types";
import { TranslationKeys } from "@/lib/translations";
import { getProductSlug } from "@/lib/slugify";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { sanitizeVideoUrl } from "@/lib/video-url";
import { getOptimizedImageUrl } from "@/lib/imageVariants";
import { QuickBuySheet } from "@/components/reels/QuickBuySheet";

interface BentoVideoCardProps {
    item: Product;
    language: "uz" | "ru";
    t: TranslationKeys;
    cart: CartItem[];
    wishlist: Product[];
    toggleWishlist: (product: Product) => void;
    addToCart: (product: Product) => void;
}

export const BentoVideoCard = memo(({
    item, language, t, cart, wishlist, toggleWishlist, addToCart
}: BentoVideoCardProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isQuickBuyOpen, setIsQuickBuyOpen] = useState(false);
    const [liked, setLiked] = useState(false);
    const [showHeart, setShowHeart] = useState(false);
    const lastTap = useRef<number>(0);

    const isWished = wishlist.some(w => w.id === item.id);
    const isInCart = cart.some(c => c.id === item.id);
    const rawVideoUrl = item.videoUrl || (item as any).video_url;
    const videoUrl = sanitizeVideoUrl(rawVideoUrl);
    const rawImg = item.imageUrl || item.image || (Array.isArray(item.images) ? item.images[0] : undefined);
    const productImage = getOptimizedImageUrl(item.image_metadata, rawImg, 'xs');
    const productName = (item as any)[`name_${language}`] || item.name;

    // IntersectionObserver: Faqat ekranda ko'ringandagina o'ynatish (akkumulyator va trafikni asrash)
    useEffect(() => {
        const el = containerRef.current;
        const v = videoRef.current;
        if (!el || !v || !videoUrl) return;

        const observer = new IntersectionObserver((entries) => {
            const entry = entries[0];
            if (entry.isIntersecting) {
                v.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
            } else {
                v.pause();
                setIsPlaying(false);
            }
        }, { threshold: 0.5 });

        observer.observe(el);
        return () => observer.disconnect();
    }, [videoUrl]);

    // Double Tap Like
    const handleTap = (e: React.MouseEvent) => {
        const now = Date.now();
        if (now - lastTap.current < 280) {
            e.preventDefault();
            e.stopPropagation();
            videoPreWarmer.triggerHaptic("double");
            toggleWishlist(item);
            setShowHeart(true);
            setTimeout(() => setShowHeart(false), 800);
        }
        lastTap.current = now;
    };

    if (!videoUrl) return null;

    return (
        <div
            ref={containerRef}
            onClick={handleTap}
            className="col-span-2 row-span-2 relative aspect-[3/4] sm:aspect-[4/5] rounded-[30px] overflow-hidden bg-black shadow-xl group border border-gray-100/10 select-none cursor-pointer"
        >
            {/* Background Autoplaying Video */}
            <video
                ref={videoRef}
                src={videoUrl}
                poster={productImage}
                muted={isMuted}
                loop
                playsInline
                preload="metadata"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ transform: "translateZ(0)" }}
            />

            {/* Top Gradient */}
            <div className="absolute top-0 left-0 right-0 h-28 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10" />

            {/* Bottom Gradient */}
            <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10" />

            {/* Top Badge (Instagram Explore Tag) */}
            <div className="absolute top-3.5 left-3.5 z-20 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white text-[11px] font-medium tracking-wide">
                <Clapperboard size={12} className="text-emerald-400" />
                <span>Explore Reel</span>
            </div>

            {/* Top Right Controls */}
            <div className="absolute top-3.5 right-3.5 z-20 flex items-center gap-2">
                <button
                    type="button"
                    aria-label={isMuted ? "Ovozni yoqish" : "Ovozni o'chirish"}
                    onClick={(e) => {
                        e.stopPropagation();
                        videoPreWarmer.triggerHaptic("light");
                        setIsMuted(!isMuted);
                    }}
                    className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white flex items-center justify-center active:scale-90 transition-transform duration-150"
                >
                    {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
                </button>

                <button
                    type="button"
                    aria-label={isWished ? "Saralanganlardan o'chirish" : "Saralanganlarga qo'shish"}
                    onClick={(e) => {
                        e.stopPropagation();
                        videoPreWarmer.triggerHaptic("light");
                        toggleWishlist(item);
                    }}
                    className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 text-white flex items-center justify-center active:scale-90 transition-transform duration-150"
                >
                    <Heart size={15} fill={isWished ? "#ef4444" : "none"} className={isWished ? "text-red-500" : "text-white"} />
                </button>
            </div>

            {/* Double Tap Floating Heart */}
            {showHeart && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <Heart size={80} className="text-red-500 fill-red-500 animate-in zoom-in-50 fade-out duration-700" />
                </div>
            )}

            {/* Bottom Floating Info & Quick Buy Action */}
            <div className="absolute bottom-3.5 left-3.5 right-3.5 z-20 space-y-2">
                <Link
                    href={`/${language}/products/${getProductSlug(item, language)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="block"
                >
                    <h3 className="text-white text-[13.5px] font-semibold tracking-normal line-clamp-1 drop-shadow-sm">
                        {productName}
                    </h3>
                    <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-white text-[15px] font-bold drop-shadow-sm">
                            {Number(item.price).toLocaleString()} {language === "uz" ? "so'm" : "сум"}
                        </span>
                        {item.oldPrice && item.oldPrice > item.price && (
                            <span className="text-white/70 text-xs line-through">
                                {Number(item.oldPrice).toLocaleString()}
                            </span>
                        )}
                    </div>
                </Link>

                {/* Action Buttons */}
                <div className="flex items-center gap-2 pt-1">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            videoPreWarmer.triggerHaptic("medium");
                            setIsQuickBuyOpen(true);
                        }}
                        className="flex-1 py-2.5 bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] hover:brightness-105 text-white rounded-xl text-[12.5px] font-semibold flex items-center justify-center gap-1.5 shadow-md shadow-[#2D6E3E]/30 active:scale-95 transition-transform duration-150"
                    >
                        <Zap size={13} fill="currentColor" />
                        <span>{language === "uz" ? "Tezkor Xarid" : "Купить"}</span>
                    </button>

                    <button
                        type="button"
                        aria-label={isInCart ? "Savatda mavjud" : "Savatga qo'shish"}
                        onClick={(e) => {
                            e.stopPropagation();
                            videoPreWarmer.triggerHaptic("light");
                            addToCart(item);
                        }}
                        className={`w-10 h-10 rounded-xl flex items-center justify-center active:scale-90 transition-transform duration-150 border ${
                            isInCart
                                ? "bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] text-white border-transparent shadow-md"
                                : "bg-white/20 backdrop-blur-md text-white border-white/30 hover:bg-white hover:text-black"
                        }`}
                    >
                        {isInCart ? <Check size={16} strokeWidth={3} /> : <Plus size={16} strokeWidth={3} />}
                    </button>
                </div>
            </div>

            {/* Quick Buy Bottom Sheet */}
            {isQuickBuyOpen && (
                <QuickBuySheet
                    product={item}
                    onClose={() => setIsQuickBuyOpen(false)}
                    language={language}
                    t={t}
                />
            )}
        </div>
    );
});

BentoVideoCard.displayName = "BentoVideoCard";
