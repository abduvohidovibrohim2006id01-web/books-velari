export default function Loading() {
    return (
        <div className="min-h-screen bg-white animate-page-in p-6 pt-20">
            <div className="h-8 bg-gray-100 rounded-2xl w-40 mb-8 animate-pulse" />
            <div className="space-y-4">
                {[0,1,2].map(i => (
                    <div key={i} className="p-6 rounded-[32px] border border-gray-100 space-y-3" style={{ animationDelay: `${i * 0.1}s` }}>
                        <div className="flex justify-between">
                            <div className="h-4 bg-gray-100 rounded-xl w-24 animate-pulse" />
                            <div className="h-4 bg-gray-100 rounded-xl w-20 animate-pulse" />
                        </div>
                        <div className="h-3 bg-gray-50 rounded-lg w-1/2 animate-pulse" />
                        <div className="h-5 bg-gray-100 rounded-xl w-1/3 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
