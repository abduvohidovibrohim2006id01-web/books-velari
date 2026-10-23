export default function Loading() {
    return (
        <div className="min-h-screen bg-white animate-page-in p-6 pt-20">
            <div className="h-8 bg-gray-100 rounded-2xl w-32 mb-8 animate-pulse" />
            <div className="grid grid-cols-2 gap-3">
                {[0,1,2,3].map(i => (
                    <div key={i} className="rounded-xl overflow-hidden border border-gray-50" style={{ animationDelay: `${i * 0.08}s` }}>
                        <div className="aspect-[3/4] bg-gray-100 animate-pulse" />
                        <div className="p-3 space-y-2">
                            <div className="h-3 bg-gray-100 rounded-lg w-3/4 animate-pulse" />
                            <div className="h-4 bg-gray-100 rounded-lg w-1/2 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
