export default function Loading() {
    return (
        <div className="min-h-screen bg-[#FAFAF6] animate-page-in max-w-[480px] mx-auto">
            <div className="px-5 pt-12 pb-3 flex items-center justify-between border-b border-[rgba(15,20,16,0.06)] bg-[#FAFAF6]/80 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black/5 rounded-2xl animate-pulse" />
                    <div className="space-y-1.5">
                        <div className="h-5 bg-black/5 rounded-xl w-20 animate-pulse" />
                        <div className="h-3 bg-black/5 rounded-lg w-16 animate-pulse" />
                    </div>
                </div>
                <div className="w-10 h-10 bg-black/5 rounded-2xl animate-pulse" />
            </div>
            <div className="p-4 space-y-2.5">
                <div className="h-11 bg-white/80 rounded-2xl mb-4 animate-pulse border border-[rgba(15,20,16,0.06)]" />
                {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="flex items-center gap-3.5 p-3.5 rounded-[22px] bg-white/80 backdrop-blur-md border border-[rgba(15,20,16,0.06)]" style={{ animationDelay: `${i * 0.08}s` }}>
                        <div className="w-12 h-12 bg-black/5 rounded-2xl animate-pulse shrink-0" />
                        <div className="flex-1 space-y-2 py-0.5">
                            <div className="h-4 bg-black/5 rounded-xl w-1/3 animate-pulse" />
                            <div className="h-3 bg-black/5 rounded-xl w-2/3 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
