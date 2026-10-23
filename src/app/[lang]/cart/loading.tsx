export default function Loading() {
    return (
        <div className="min-h-screen bg-white animate-page-in p-6 pt-20">
            <div className="h-8 bg-gray-100 rounded-2xl w-32 mb-8 animate-pulse" />
            <div className="space-y-4">
                {[0,1,2].map(i => (
                    <div key={i} className="flex gap-4 p-4 rounded-3xl border border-gray-50" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="w-24 h-24 bg-gray-100 rounded-2xl animate-pulse" />
                        <div className="flex-1 space-y-3 py-1">
                            <div className="h-4 bg-gray-100 rounded-xl w-3/4 animate-pulse" />
                            <div className="h-3 bg-gray-100 rounded-xl w-1/2 animate-pulse" />
                            <div className="h-5 bg-gray-100 rounded-xl w-1/3 animate-pulse" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
