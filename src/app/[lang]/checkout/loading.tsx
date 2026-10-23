export default function Loading() {
    return (
        <div className="min-h-screen bg-white animate-page-in p-6 pt-20">
            <div className="h-8 bg-gray-100 rounded-2xl w-48 mb-8 animate-pulse" />
            <div className="space-y-6">
                <div className="h-20 bg-gray-50 rounded-[28px] animate-pulse" />
                <div className="h-20 bg-gray-50 rounded-[28px] animate-pulse" style={{ animationDelay: '0.1s' }} />
                <div className="h-40 bg-gray-50 rounded-[32px] animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="h-16 bg-gray-100 rounded-[28px] animate-pulse" style={{ animationDelay: '0.3s' }} />
            </div>
        </div>
    );
}
