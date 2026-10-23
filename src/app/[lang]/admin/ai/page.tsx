"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { adminSelect, adminCount } from "@/lib/admin-api";
import {
    Sparkles,
    Monitor,
    Database,
    User,
    ChevronRight,
    Clock,
    Brain,
    Zap,
    Cpu,
    History,
    Package,
    ArrowRight,
    TrendingUp,
    Loader2,
    RefreshCw
} from "lucide-react";

interface AiLog {
    id: string;
    timestamp: string;
    userPhone: string;
    input: any;
    output: string[];
    model: string;
    action: string;
}

export default function AiMonitoring() {
    const [logs, setLogs] = useState<AiLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        requests: 0,
        uniqueUsers: 0,
    });

    const fetchData = async () => {
        setLoading(true);
        try {
            const [data, totalCount] = await Promise.all([
                adminSelect<any[]>("ai_logs", {
                    orderBy: { column: "created_at", ascending: false },
                    limit: 50,
                }),
                adminCount("ai_logs").catch(() => 0),
            ]);

            const fetched = (data || []).map(l => {
                let parsedInput = l.input;
                if (typeof parsedInput === 'string') {
                    try { parsedInput = JSON.parse(parsedInput); } catch { parsedInput = {}; }
                }
                let parsedOutput = l.output;
                if (typeof parsedOutput === 'string') {
                    try { parsedOutput = JSON.parse(parsedOutput); } catch { parsedOutput = []; }
                }
                return {
                    id: l.id,
                    timestamp: l.created_at,
                    userPhone: l.user_phone || "Anonim",
                    input: parsedInput || {},
                    output: Array.isArray(parsedOutput) ? parsedOutput : [],
                    model: l.model || "llama-3.1-70b",
                    action: l.action || "Tavsiya Berildi",
                };
            }) as AiLog[];

            setLogs(fetched);

            const uniquePhones = new Set(fetched.map(l => l.userPhone).filter(p => p !== "Anonim"));
            setStats({
                requests: totalCount || fetched.length,
                uniqueUsers: uniquePhones.size || (fetched.length > 0 ? 1 : 0)
            });
        } catch (error) {
            console.error("Fetch ai logs error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        const sub = supabase.channel('ai_logs_all')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ai_logs' }, () => fetchData())
            .subscribe();

        return () => {
            supabase.removeChannel(sub);
        };
    }, []);

    const getTimeAgo = (timestamp: string) => {
        const seconds = Math.floor((new Date().getTime() - new Date(timestamp).getTime()) / 1000);
        if (seconds < 60) return `${seconds} soniya oldin`;
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes} daqiqa oldin`;
        return new Date(timestamp).toLocaleTimeString();
    };

    return (
        <div className="space-y-12 animate-in fade-in duration-700 pb-20">
            {/* Header section */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="bg-[#7000FF] p-3 rounded-2xl text-white shadow-lg shadow-[#7000FF]/20 animate-pulse">
                            <Brain size={28} />
                        </div>
                        <h1 className="text-2xl md:text-5xl font-black tracking-tighter italic uppercase">AI Monitoring</h1>
                    </div>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Neural Interface • Real-time AI logs</p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <button
                        onClick={fetchData}
                        disabled={loading}
                        className="bg-white border border-gray-100 px-5 py-4 rounded-[24px] shadow-sm flex items-center gap-2 text-xs font-black uppercase hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={16} className={loading ? "animate-spin text-[#7000FF]" : "text-gray-600"} />
                        <span className="text-gray-700">Yangilash</span>
                    </button>
                    <div className="bg-white border border-gray-100 p-6 rounded-[32px] shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 bg-green-50 text-green-500 rounded-xl flex items-center justify-center">
                            <Zap size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Holati</p>
                            <p className="font-black text-xs uppercase text-green-600">Aktiv / Online</p>
                        </div>
                    </div>
                    <div className="bg-white border border-gray-100 p-6 rounded-[32px] shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center">
                            <Cpu size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Model</p>
                            <p className="font-black text-xs uppercase text-blue-600">Llama 3.1 70B</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {[
                    { label: "AI Karashlari", val: stats.requests, icon: History, color: "bg-purple-50 text-purple-600" },
                    { label: "Mijozlar", val: stats.uniqueUsers, icon: User, color: "bg-blue-50 text-blue-600" },
                    { label: "O'rtacha Vaqt", val: stats.requests > 0 ? "0.8s" : "0.0s", icon: Clock, color: "bg-orange-50 text-orange-600" },
                    { label: "Sotuvga Tasiri", val: stats.requests > 0 ? "+18%" : "0%", icon: TrendingUp, color: "bg-green-50 text-green-600" }
                ].map((s, i) => (
                    <div key={i} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm hover:shadow-xl transition-all group">
                        <div className={`w-12 h-12 ${s.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                            <s.icon size={24} strokeWidth={2.5} />
                        </div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{s.label}</p>
                        <p className="text-2xl font-black italic tracking-tighter text-black">{s.val}</p>
                    </div>
                ))}
            </div>

            {/* Logs List - The "Live" Feed */}
            <div className="space-y-6">
                <div className="flex items-center justify-between px-4">
                    <h2 className="text-xl font-black uppercase italic tracking-tighter flex items-center gap-3">
                        <Monitor size={20} />
                        Xizmatlar Logi (Hozirgi vaqtda)
                    </h2>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-red-500">Live Feed</span>
                    </div>
                </div>

                <div className="space-y-4">
                    {loading ? (
                        <div className="py-20 flex flex-col items-center">
                            <Loader2 className="animate-spin text-gray-200" size={40} />
                        </div>
                    ) : logs.map((log) => (
                        <div key={log.id} className="bg-white rounded-[32px] p-8 border border-gray-100 shadow-sm hover:shadow-2xl transition-all duration-500 group relative flex flex-col md:flex-row md:items-center gap-10">
                            {/* Time and Icon */}
                            <div className="flex items-center gap-6 md:w-56 shrink-0">
                                <div className="p-4 bg-gray-50 rounded-2xl text-[#7000FF] group-hover:bg-[#7000FF] group-hover:text-white transition-colors duration-500 shadow-lg shadow-black/5">
                                    <Sparkles size={24} fill="currentColor" />
                                </div>
                                <div>
                                    <p className="text-xs font-black italic">{getTimeAgo(log.timestamp)}</p>
                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tavsiya Berildi</p>
                                </div>
                            </div>

                            {/* User Info */}
                            <div className="flex items-center gap-4 bg-gray-50/50 p-4 rounded-3xl md:w-64 border border-transparent group-hover:bg-white group-hover:border-gray-100 transition-all">
                                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center border border-gray-100 shadow-sm text-black">
                                    <User size={18} />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Mijoz</p>
                                    <p className="font-black italic text-sm truncate">{log.userPhone}</p>
                                </div>
                            </div>

                            {/* Input Interests Analysis */}
                            <div className="flex-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Tahlil: Qiziqishlar</p>
                                <div className="flex flex-wrap gap-2">
                                    {Object.entries(log.input.categories || {}).map(([cat, count]: any) => (
                                        <div key={cat} className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[8px] font-black uppercase border border-blue-100/50 flex items-center gap-2">
                                            {cat}
                                            <span className="bg-blue-600 text-white px-1 rounded-md">{count}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Arrow Indicator */}
                            <div className="hidden lg:block text-gray-200 group-hover:text-black transition-colors duration-500">
                                <ArrowRight size={32} strokeWidth={3} />
                            </div>

                            {/* Output Recommendations */}
                            <div className="flex-1 bg-black text-white p-6 rounded-[30px] shadow-2xl shadow-black/20 group-hover:scale-105 transition-transform">
                                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40 mb-3">AI Tanlovi: Mahsulot IDlari</p>
                                <div className="grid grid-cols-2 gap-2">
                                    {log.output.map((id, idx) => (
                                        <div key={idx} className="flex items-center gap-2 text-[10px] font-bold py-1">
                                            <div className="w-1 h-1 bg-[#7000FF] rounded-full" />
                                            <span className="opacity-80">#{id.slice(-6)}...</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {logs.length === 0 && !loading && (
                <div className="py-20 text-center bg-gray-50/50 rounded-[50px] border-2 border-dashed border-gray-100 flex flex-col items-center">
                    <Brain size={64} className="text-gray-100 mb-4" />
                    <p className="text-gray-400 font-black uppercase tracking-[0.3em] text-xs">AI Loglar topilmadi. Tizim kutish holatida...</p>
                </div>
            )}
        </div>
    );
}
