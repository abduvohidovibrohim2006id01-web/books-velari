"use client";

// O'lchamlari ProductCard bilan bir xil bo'lishi shart (aks holda yuklanganda layout shift bo'ladi):
// tashqi radius 22, rasm atrofida 12px padding + ichki aspect-[3/4] radius 16, tugma h-42 radius 14.
export const ProductSkeleton = () => {
    return (
        <div
            className="flex flex-col h-full bg-white overflow-hidden animate-pulse"
            style={{ borderRadius: 22, boxShadow: "0 4px 16px rgba(15,20,16,0.05)" }}
        >
            {/* Image Skeleton — to'liq qoplovchi 3/4 nisbat (0 padding) */}
            <div className="relative bg-gray-100 w-full" style={{ aspectRatio: "3 / 4" }} />

            <div className="flex flex-col flex-1" style={{ padding: "10px 14px 12px" }}>
                {/* Title Skeleton */}
                <div className="h-3 bg-gray-100 rounded-full w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded-full w-1/2 mb-3" />

                {/* Rating Skeleton */}
                <div className="flex items-center gap-2 mb-3">
                    <div className="h-3 bg-gray-100 rounded-full w-8" />
                    <div className="h-3 bg-gray-100 rounded-full w-12" />
                </div>

                {/* Price Skeleton */}
                <div className="mt-auto flex flex-col gap-2">
                    <div className="h-4 bg-gray-100 rounded-full w-24" />
                </div>
            </div>

            {/* Button Skeleton — full-bleed 0px padding, h-44 */}
            <div className="w-full bg-gray-100 mt-auto" style={{ height: 44 }} />
        </div>
    );
};
