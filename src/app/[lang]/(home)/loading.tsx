export default function Loading() {
    return (
        <div className="min-h-screen bg-white max-w-7xl mx-auto px-4 md:px-8 pt-2 pb-24">
            {/* Header / Search Skeleton */}
            <div className="flex items-center gap-3 h-12 my-2">
                <div className="w-9 h-9 bg-gray-100 rounded-full shrink-0 animate-pulse" />
                <div className="flex-1 h-10 bg-gray-100 rounded-full animate-pulse" />
                <div className="w-9 h-9 bg-gray-100 rounded-full shrink-0 animate-pulse" />
            </div>

            {/* Banner Skeleton */}
            <div className="mt-3 w-full h-[150px] sm:h-[200px] md:h-[280px] bg-gray-100 rounded-[24px] md:rounded-[32px] animate-pulse" />

            {/* Category pills Skeleton */}
            <div className="mt-4 flex gap-2.5 overflow-hidden py-1">
                {[...Array(6)].map((_, i) => (
                    <div key={i} className="w-20 h-8 bg-gray-100 rounded-full shrink-0 animate-pulse" />
                ))}
            </div>

            {/* 4 Product Cards Skeleton (Mobile 2-column grid, Above the Fold) */}
            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-2.5 md:gap-x-6 gap-y-5">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="flex flex-col bg-white rounded-[22px] overflow-hidden">
                        <div className="w-full aspect-[3/4] bg-gray-100 rounded-[22px] animate-pulse" />
                        <div className="p-2 space-y-2">
                            <div className="h-3.5 bg-gray-100 rounded-md w-3/4 animate-pulse" />
                            <div className="h-4 bg-gray-100 rounded-md w-1/2 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
