"use client";

import { useEffect, useRef } from "react";
import { Play } from "lucide-react";
import Image from "next/image";
import { makeVariantLoader, hasVariants } from "@/lib/imageVariants";
import { sanitizeVideoUrl } from "@/lib/video-url";

interface MediaItemProps {
    media: {
        type: "video" | "image";
        url: string;
        lowResUrl?: string;
        blurDataURL?: string;
        xs?: string;
        md?: string;
        lg?: string;
    };
    isActive: boolean;
    isLightbox: boolean;
    onClick?: () => void;
    alt?: string;
    priority?: boolean;
    onLoadComplete?: () => void;
}

export const MediaItem = ({ media, isActive, isLightbox, onClick, alt, priority = false, onLoadComplete }: MediaItemProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (media.type === 'video' && videoRef.current) {
            if (isActive) {
                videoRef.current.play().catch(() => { });
            } else {
                videoRef.current.pause();
                videoRef.current.currentTime = 0;
            }
        }
    }, [isActive, media.type]);

    if (media.type === 'video') {
        return (
            <div
                className={`w-full h-full relative flex items-center justify-center cursor-pointer overflow-hidden ${isLightbox ? 'bg-black' : ''}`}
                onClick={onClick}
            >
                {/* Blurred Background for Lightbox */}
                {isLightbox && (
                    <video
                        src={sanitizeVideoUrl(media.url)}
                        className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl opacity-40"
                        muted
                        loop
                        playsInline
                    />
                )}
                
                <video
                    ref={videoRef}
                    src={sanitizeVideoUrl(media.url)}
                    className="w-full h-full object-cover"
                    muted={!isLightbox}
                    loop
                    playsInline
                />
                {!isLightbox && !isActive && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity">
                        <div className="w-20 h-20 bg-white/30 backdrop-blur-xl rounded-full flex items-center justify-center border border-white/30">
                            <Play size={32} className="text-white fill-white ml-1" />
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Lightbox uses native img for pinch-zoom and full resolution
    if (isLightbox) {
        const fullResUrl = media.lg || media.md || media.lowResUrl || media.url;
        const blurUrl = media.lowResUrl || media.xs || fullResUrl;
        return (
            <div
                className="w-full h-full flex items-center justify-center cursor-pointer relative overflow-hidden bg-black"
                onClick={onClick}
            >
                <img
                    src={blurUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover scale-150 blur-3xl opacity-50"
                    draggable={false}
                />
                <img
                    src={fullResUrl}
                    alt={alt || "Velari product image"}
                    className="relative max-w-[95%] max-h-[90%] object-contain animate-in zoom-in-95 duration-500 shadow-2xl rounded-lg"
                    draggable={false}
                />
            </div>
        );
    }

    const metaForUrl = { [media.url]: { xs: media.xs, md: media.md, lg: media.lg, lowResUrl: media.lowResUrl, blurDataURL: media.blurDataURL } };
    const hasV = hasVariants(metaForUrl, media.url);
    const optimizedSrc = media.md || media.lg || media.xs || media.lowResUrl || media.url;
    const srcSetParts = [
        media.xs ? `${media.xs} 640w` : null,
        media.md ? `${media.md} 828w` : null,
        media.lg ? `${media.lg} 1080w` : null,
    ].filter(Boolean).join(", ");

    return (
        <div
            className="w-full h-full flex items-center justify-center cursor-pointer relative overflow-hidden bg-gray-50"
            onClick={onClick}
        >
            <Image
                src={optimizedSrc}
                alt={alt || "Velari mahsulotlari - Sifatli elektronika va maishiy texnika"}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 85vw, 50vw"
                priority={priority}
                loader={hasV ? makeVariantLoader(metaForUrl) : undefined}
                placeholder={media.blurDataURL ? "blur" : "empty"}
                blurDataURL={media.blurDataURL}
                onLoad={() => onLoadComplete?.()}
                referrerPolicy="no-referrer"
            />
        </div>
    );
};


