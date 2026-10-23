"use client";

import { useRef, useState, useEffect } from "react";
import { ChevronLeft, Heart, X, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { MediaItem } from "./MediaItem";
import { Product, MediaItemType } from "@/types";
import { useStore } from "@/store/store";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { getMetaForUrl } from "@/lib/imageVariants";

interface ProductMediaProps {
    allMedia: MediaItemType[];
    activeImage: number;
    setActiveImage: (index: number) => void;
    isWishlisted: boolean;
    toggleWishlist: (p: Product) => void;
    product: Product;
}

export const ProductMedia = ({
    allMedia,
    activeImage,
    setActiveImage,
    isWishlisted,
    toggleWishlist,
    product
}: ProductMediaProps) => {
    const router = useRouter();
    const language = useStore(s => s.language);
    const carouselRef = useRef<HTMLDivElement>(null);
    const lightboxCarouselRef = useRef<HTMLDivElement>(null);
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);

    // Instagram Pinch-to-Zoom & Double-Tap state
    const [pinchScale, setPinchScale] = useState(1);
    const [pinchOrigin, setPinchOrigin] = useState({ x: 50, y: 50 });
    const initialPinchDist = useRef<number>(0);
    const [showHeart, setShowHeart] = useState(false);
    const lastTapTime = useRef<number>(0);

    const onMouseDown = (e: React.MouseEvent, ref: React.RefObject<HTMLDivElement>) => {
        if (!ref.current) return;
        setIsDragging(true);
        setStartX(e.pageX - ref.current.offsetLeft);
        setScrollLeft(ref.current.scrollLeft);
        ref.current.style.scrollBehavior = 'auto';
    };

    const onMouseMove = (e: React.MouseEvent, ref: React.RefObject<HTMLDivElement>) => {
        if (!isDragging || !ref.current) return;
        e.preventDefault();
        const x = e.pageX - ref.current.offsetLeft;
        const walk = (x - startX) * 2;
        ref.current.scrollLeft = scrollLeft - walk;
    };

    const stopDragging = (ref: React.RefObject<HTMLDivElement>) => {
        if (!isDragging) return;
        setIsDragging(false);
        if (ref.current) {
            ref.current.style.scrollBehavior = 'smooth';
            const width = ref.current.offsetWidth * 0.85; 
            const index = Math.round(ref.current.scrollLeft / width);
            handleMediaSelect(Math.min(index, allMedia.length - 1));
        }
    };

    const handleMediaSelect = (index: number) => {
        setActiveImage(index);
        if (carouselRef.current) {
            const width = carouselRef.current.offsetWidth * 0.85;
            carouselRef.current.scrollTo({
                left: index * width,
                behavior: 'smooth'
            });
        }
    };

    const handleScroll = () => {
        if (carouselRef.current && !isDragging) {
            const width = carouselRef.current.offsetWidth * 0.85;
            const index = Math.round(carouselRef.current.scrollLeft / width);
            if (index !== activeImage && index < allMedia.length) {
                setActiveImage(index);
            }
        }
    };

    // Touch Pinch-to-Zoom Gesture (Instagram Style)
    const handleTouchStart = (e: React.TouchEvent) => {
        if (e.touches.length === 2) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            initialPinchDist.current = dist;
            const rect = e.currentTarget.getBoundingClientRect();
            const midX = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) / rect.width * 100;
            const midY = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) / rect.height * 100;
            setPinchOrigin({ x: midX, y: midY });
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (e.touches.length === 2 && initialPinchDist.current > 0) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            const scale = Math.min(3.5, Math.max(1, dist / initialPinchDist.current));
            setPinchScale(scale);
        }
    };

    const handleTouchEnd = () => {
        setPinchScale(1);
        initialPinchDist.current = 0;
    };

    // Double-Tap to Like
    const handleDoubleTap = (e: React.MouseEvent) => {
        const now = Date.now();
        if (now - lastTapTime.current < 280) {
            e.stopPropagation();
            videoPreWarmer.triggerHaptic("double");
            toggleWishlist(product);
            setShowHeart(true);
            setTimeout(() => setShowHeart(false), 800);
        } else {
            if (!isDragging) {
                // Single click to open lightbox
                setTimeout(() => {
                    if (Date.now() - lastTapTime.current >= 280 && pinchScale === 1) {
                        setIsLightboxOpen(true);
                    }
                }, 280);
            }
        }
        lastTapTime.current = now;
    };

    useEffect(() => {
        if (isLightboxOpen && lightboxCarouselRef.current) {
            lightboxCarouselRef.current.scrollTo({
                left: activeImage * lightboxCarouselRef.current.offsetWidth,
                behavior: 'instant' as ScrollBehavior
            });
        }
    }, [isLightboxOpen, activeImage]);

    return (
        <>
            <div className="relative w-full bg-white pt-2 pb-6 overflow-hidden group/media-section select-none">
                {/* Horizontal Carousel with Next Preview (Social Style) */}
                <div
                    ref={carouselRef}
                    onScroll={handleScroll}
                    onMouseDown={(e) => onMouseDown(e, carouselRef)}
                    onMouseMove={(e) => onMouseMove(e, carouselRef)}
                    onMouseUp={() => stopDragging(carouselRef)}
                    onMouseLeave={() => stopDragging(carouselRef)}
                    className={`flex w-full h-full overflow-x-auto no-scrollbar px-5 gap-3 overscroll-x-contain touch-pan-x ${isDragging ? 'cursor-grabbing select-none' : 'cursor-grab'}`}
                    style={{ scrollSnapType: pinchScale > 1 ? 'none' : 'x mandatory', WebkitOverflowScrolling: "touch" }}
                >
                    {allMedia.map((media, i) => {
                        const meta = getMetaForUrl(product.image_metadata, media.url);
                        return (
                        <div
                            key={i}
                            onTouchStart={i === activeImage ? handleTouchStart : undefined}
                            onTouchMove={i === activeImage ? handleTouchMove : undefined}
                            onTouchEnd={i === activeImage ? handleTouchEnd : undefined}
                            onClick={i === activeImage ? handleDoubleTap : undefined}
                            style={{
                                scrollSnapAlign: 'start',
                                ...(i === activeImage ? { viewTransitionName: `product-img-${product.id}` } : {})
                            } as React.CSSProperties}
                            className="min-w-[85vw] aspect-[3/4] rounded-[28px] overflow-hidden bg-gray-50 flex items-center justify-center relative shadow-sm border border-gray-100"
                        >
                            {/* Scalable Container for Pinch-to-Zoom */}
                            <div
                                className="w-full h-full pointer-events-auto transition-transform duration-150 ease-out"
                                style={{
                                    transform: i === activeImage && pinchScale > 1 ? `scale(${pinchScale})` : 'scale(1)',
                                    transformOrigin: `${pinchOrigin.x}% ${pinchOrigin.y}%`,
                                    zIndex: pinchScale > 1 ? 50 : 1,
                                }}
                            >
                                <MediaItem
                                    media={{
                                        ...media,
                                        lowResUrl:   meta?.lowResUrl,
                                        blurDataURL: meta?.blurDataURL,
                                        xs:          meta?.xs,
                                        md:          meta?.md,
                                        lg:          meta?.lg,
                                    }}
                                    isActive={activeImage === i}
                                    isLightbox={false}
                                    onClick={() => {}}
                                    alt={product.name}
                                    priority={i === 0}
                                />
                            </div>

                            {/* Flying Heart on Double Tap */}
                            {showHeart && i === activeImage && (
                                <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
                                    <Heart size={90} className="text-red-500 fill-red-500 animate-in zoom-in-50 fade-out duration-700 drop-shadow-2xl" />
                                </div>
                            )}
                        </div>
                    );})}
                    {/* Extra space at the end */}
                    <div className="min-w-[10vw]" />
                </div>
                
                {/* Instagram Style Dynamic Dots Pagination */}
                {allMedia.length > 1 && (
                    <div className="absolute bottom-10 left-0 right-0 flex items-center justify-center gap-1.5 z-20 pointer-events-none">
                        {allMedia.map((_, i) => {
                            const diff = Math.abs(i - activeImage);
                            let sizeClass = "w-1.5 h-1.5 bg-black/20 rounded-full";
                            if (diff === 0) {
                                sizeClass = "w-5 h-1.5 bg-black rounded-full shadow-sm";
                            } else if (diff === 1) {
                                sizeClass = "w-2 h-2 bg-black/40 rounded-full";
                            } else if (diff === 2) {
                                sizeClass = "w-1.5 h-1.5 bg-black/25 rounded-full";
                            } else {
                                sizeClass = "w-1 h-1 bg-black/15 rounded-full";
                            }

                            return (
                                <div
                                    key={i}
                                    className={`transition-transform duration-200 transition-colors duration-200 ${sizeClass}`}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Floating Top Controls */}
                <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-30 pointer-events-none">
                    {/* Left Group */}
                    <div className="flex flex-col gap-2.5">
                        <button
                            aria-label="Orqaga qaytish"
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                router.back();
                            }}
                            className="glass-icon-button w-11 h-11 text-[#111612] pointer-events-auto"
                        >
                            <ChevronLeft size={20} strokeWidth={2} />
                        </button>
                        <button
                            aria-label="Qidiruv"
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                router.push(`/${language}/?focus=true`);
                            }}
                            className="glass-icon-button w-11 h-11 text-[#111612] pointer-events-auto"
                        >
                            <Search size={19} strokeWidth={2} />
                        </button>
                    </div>

                    {/* Right Group */}
                    <div className="flex flex-col gap-2.5">
                        <button 
                            aria-label="Ulashish"
                            onClick={async () => {
                                videoPreWarmer.triggerHaptic("light");
                                try {
                                    await navigator.share({
                                        title: product.name,
                                        text: product.description,
                                        url: window.location.href,
                                    });
                                } catch (err) {
                                    console.warn("Sharing failed", err);
                                }
                            }} 
                            className="glass-icon-button w-11 h-11 text-[#111612] pointer-events-auto"
                        >
                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                        </button>
                        <button 
                            aria-label="Saralanganlarga qo'shish"
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                toggleWishlist(product);
                            }} 
                            className="glass-icon-button w-11 h-11 text-[#111612] pointer-events-auto"
                        >
                            <Heart size={19} strokeWidth={2} fill={isWishlisted ? "#FF3B30" : "none"} color={isWishlisted ? "#FF3B30" : "currentColor"} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Lightbox */}
            {isLightboxOpen && (
                <div className="fixed inset-0 bg-black z-[100] flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setIsLightboxOpen(false);
                        }}
                        className="absolute top-10 right-10 p-4 bg-white/10 text-white rounded-full backdrop-blur-xl ios-icon-tap active:scale-90 transition-transform duration-150 ease-out will-change-transform z-[110] border border-white/10"
                    >
                        <X size={24} strokeWidth={3} />
                    </button>
                    <div className="w-full h-full flex items-center justify-center relative">
                        <div ref={lightboxCarouselRef} className="flex w-full h-full overflow-x-auto snap-x snap-mandatory no-scrollbar">
                            {allMedia.map((media, i) => {
                                const meta = getMetaForUrl(product.image_metadata, media.url);
                                return (
                                <div key={i} className="min-w-full h-full flex items-center justify-center snap-center select-none">
                                    <div className="relative w-full h-full">
                                        <MediaItem
                                            media={{
                                                ...media,
                                                lowResUrl:   meta?.lowResUrl,
                                                blurDataURL: meta?.blurDataURL,
                                                xs:          meta?.xs,
                                                md:          meta?.md,
                                                lg:          meta?.lg,
                                            }}
                                            isActive={activeImage === i}
                                            isLightbox={true}
                                            alt={product.name}
                                        />
                                    </div>
                                </div>
                            );})}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
