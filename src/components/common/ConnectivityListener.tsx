"use client";

import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export default function ConnectivityListener() {
    const [isOnline, setIsOnline] = useState(true);
    const [showStatus, setShowStatus] = useState(false);

    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            setShowStatus(true);
            setTimeout(() => setShowStatus(false), 3000);
        };

        const handleOffline = () => {
            setIsOnline(false);
            setShowStatus(true);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    if (!showStatus && isOnline) return null;

    return (
        <div className={`fixed top-4 left-0 right-0 z-[10000] flex justify-center pointer-events-none transition-transform duration-300 ease-out will-change-transform ${showStatus ? 'translate-y-0 opacity-100' : '-translate-y-16 opacity-0'}`}>
            <div className={`pointer-events-auto inline-flex items-center gap-2.5 px-4 py-2 rounded-full backdrop-blur-xl border shadow-lg text-xs font-semibold ${
                isOnline 
                    ? 'bg-white/95 text-emerald-800 border-emerald-500/20 shadow-emerald-900/5' 
                    : 'bg-white/95 text-red-600 border-red-500/20 shadow-red-900/5'
            }`}>
                {isOnline ? (
                    <>
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <Wifi size={14} className="text-[#2D6E3E]" />
                        <span>Internet aloqasi tiklandi</span>
                    </>
                ) : (
                    <>
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <WifiOff size={14} className="text-red-500" />
                        <span>Internet aloqasi mavjud emas</span>
                    </>
                )}
            </div>
        </div>
    );
}
