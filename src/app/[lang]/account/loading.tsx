export default function Loading() {
    return (
        <div className="min-h-screen bg-white animate-page-in p-8 pt-12">
            <div className="h-8 bg-gray-100 rounded-2xl w-32 mb-8 animate-pulse" />
            <div className="bg-gray-100 rounded-[40px] h-40 mb-10 animate-pulse" />
            <div className="space-y-6 mb-12">
                <div className="h-16 bg-gray-50 rounded-[28px] animate-pulse" />
                <div className="h-16 bg-gray-50 rounded-[28px] animate-pulse" style={{ animationDelay: '0.1s' }} />
                <div className="h-16 bg-gray-100 rounded-[28px] animate-pulse" style={{ animationDelay: '0.2s' }} />
            </div>
            <div className="space-y-4">
                {[0,1,2,3].map(i => (
                    <div key={i} className="h-20 bg-gray-50 rounded-[32px] animate-pulse" style={{ animationDelay: `${i * 0.1}s` }} />
                ))}
            </div>
        </div>
    );
}
