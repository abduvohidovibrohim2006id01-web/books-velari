"use client";

import { useState, useEffect, useCallback } from "react";
import {
    Activity, Search, Filter, Trash2, RefreshCw,
    LogIn, LogOut, Globe, Monitor, Smartphone, Tablet,
    ChevronLeft, ChevronRight, Download, MapPin, Wifi
} from "lucide-react";

interface LogEntry {
    id: number;
    session_id: string;
    user_phone: string | null;
    name: string;
    event_type: "login" | "logout" | "visit" | "register";
    ip_address: string;
    city: string | null;
    region: string | null;
    country: string | null;
    isp: string | null;
    latitude: number | null;
    longitude: number | null;
    device_type: string | null;
    screen_resolution: string | null;
    device_memory: number | null;
    cpu_cores: number | null;
    current_path: string | null;
    created_at: string;
}

const EVENT_STYLES: Record<string, { label: string; color: string; icon: any }> = {
    login:    { label: "Kirdi",    color: "bg-green-100 text-green-700",  icon: LogIn },
    logout:   { label: "Chiqdi",   color: "bg-red-100 text-red-700",     icon: LogOut },
    visit:    { label: "Tashrif",  color: "bg-blue-100 text-blue-700",   icon: Globe },
    register: { label: "Ro'yxat", color: "bg-purple-100 text-purple-700", icon: Activity },
};

const DEVICE_ICON: Record<string, any> = {
    Mobile: Smartphone,
    Tablet: Tablet,
    Desktop: Monitor,
};

export default function AdminLogsPage() {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [limit] = useState(50);
    const [search, setSearch] = useState("");
    const [eventFilter, setEventFilter] = useState("");
    const [isClearing, setIsClearing] = useState(false);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(limit),
                ...(search && { search }),
                ...(eventFilter && { event: eventFilter }),
            });
            const res = await fetch(`/api/admin/logs?${params}`);
            const data = await res.json();
            setLogs(data.logs || []);
            setTotal(data.total || 0);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [page, limit, search, eventFilter]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    // Qidiruvda debounce
    useEffect(() => {
        const t = setTimeout(() => {
            if (page !== 1) setPage(1);
            else fetchLogs();
        }, 500);
        return () => clearTimeout(t);
    }, [search, eventFilter]);

    const clearOldLogs = async () => {
        if (!confirm("30 kundan eski loglarni o'chirasizmi?")) return;
        setIsClearing(true);
        try {
            await fetch("/api/admin/logs", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ olderThanDays: 30 }),
            });
            fetchLogs();
        } finally {
            setIsClearing(false);
        }
    };

    const exportCsv = () => {
        const headers = ["Vaqt", "Hodisa", "Ism", "Telefon", "IP", "Shahar", "Mamlakat", "ISP", "Qurilma", "Ekran", "Sahifa"];
        const rows = logs.map(l => [
            new Date(l.created_at).toLocaleString("uz-UZ"),
            EVENT_STYLES[l.event_type]?.label || l.event_type,
            l.name,
            l.user_phone || "Mehmon",
            l.ip_address,
            l.city || "",
            l.country || "",
            l.isp || "",
            l.device_type || "",
            l.screen_resolution || "",
            l.current_path || "",
        ]);
        const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
        const blob = new Blob([csv], { type: "text/csv" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url;
        a.download = `logs_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="p-6 text-black min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic flex items-center gap-3">
                        <Activity size={28} strokeWidth={3} />
                        Tashrif Jurnali
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Jami: <span className="font-bold text-black">{total.toLocaleString()}</span> ta yozuv
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={fetchLogs}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all"
                    >
                        <RefreshCw size={14} strokeWidth={3} className={loading ? "animate-spin" : ""} />
                        Yangilash
                    </button>
                    <button
                        onClick={exportCsv}
                        className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-900 transition-all"
                    >
                        <Download size={14} strokeWidth={3} />
                        CSV
                    </button>
                    <button
                        onClick={clearOldLogs}
                        disabled={isClearing}
                        className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-red-600 transition-all disabled:opacity-50"
                    >
                        <Trash2 size={14} strokeWidth={3} />
                        Eski loglar
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col md:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={3} />
                    <input
                        type="text"
                        placeholder="Telefon, ism, IP yoki shahar bo'yicha qidirish..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
                <div className="flex gap-2">
                    {["", "login", "logout", "visit", "register"].map(ev => (
                        <button
                            key={ev}
                            onClick={() => { setEventFilter(ev); setPage(1); }}
                            className={`px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all border ${eventFilter === ev ? "bg-black text-white border-black" : "bg-white border-gray-200 text-gray-500 hover:border-black hover:text-black"}`}
                        >
                            {ev ? (EVENT_STYLES[ev]?.label || ev) : "Barchasi"}
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-100 bg-gray-50">
                                <th className="text-left p-4 font-black text-[10px] uppercase tracking-widest text-gray-400">Vaqt</th>
                                <th className="text-left p-4 font-black text-[10px] uppercase tracking-widest text-gray-400">Hodisa</th>
                                <th className="text-left p-4 font-black text-[10px] uppercase tracking-widest text-gray-400">Foydalanuvchi</th>
                                <th className="text-left p-4 font-black text-[10px] uppercase tracking-widest text-gray-400">IP / Geo</th>
                                <th className="text-left p-4 font-black text-[10px] uppercase tracking-widest text-gray-400">ISP</th>
                                <th className="text-left p-4 font-black text-[10px] uppercase tracking-widest text-gray-400">Qurilma</th>
                                <th className="text-left p-4 font-black text-[10px] uppercase tracking-widest text-gray-400">Sahifa</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <tr key={i} className="border-b border-gray-50">
                                        {Array.from({ length: 7 }).map((_, j) => (
                                            <td key={j} className="p-4">
                                                <div className="h-4 bg-gray-100 rounded animate-pulse" />
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-16 text-center">
                                        <Activity size={32} className="mx-auto mb-3 text-gray-200" />
                                        <p className="text-gray-400 font-medium">Hali loglar yo'q</p>
                                    </td>
                                </tr>
                            ) : logs.map(log => {
                                const ev = EVENT_STYLES[log.event_type] || { label: log.event_type, color: "bg-gray-100 text-gray-600", icon: Activity };
                                const EvIcon = ev.icon;
                                const DevIcon = DEVICE_ICON[log.device_type || "Desktop"] || Monitor;
                                return (
                                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                                        {/* Vaqt */}
                                        <td className="p-4">
                                            <div className="text-xs font-medium text-gray-700">
                                                {new Date(log.created_at).toLocaleDateString("uz-UZ")}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">
                                                {new Date(log.created_at).toLocaleTimeString("uz-UZ")}
                                            </div>
                                        </td>
                                        {/* Hodisa */}
                                        <td className="p-4">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide ${ev.color}`}>
                                                <EvIcon size={11} strokeWidth={3} />
                                                {ev.label}
                                            </span>
                                        </td>
                                        {/* Foydalanuvchi */}
                                        <td className="p-4">
                                            <div className="font-semibold text-xs">{log.name}</div>
                                            <div className="text-[10px] text-gray-400 mt-0.5">{log.user_phone || "—"}</div>
                                        </td>
                                        {/* IP / Geo */}
                                        <td className="p-4">
                                            <div className="font-mono text-xs text-gray-700">{log.ip_address || "—"}</div>
                                            {(log.city || log.country) && (
                                                <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-0.5">
                                                    <MapPin size={9} />
                                                    {[log.city, log.country].filter(Boolean).join(", ")}
                                                </div>
                                            )}
                                        </td>
                                        {/* ISP */}
                                        <td className="p-4">
                                            {log.isp ? (
                                                <div className="flex items-center gap-1 text-[10px] text-gray-500">
                                                    <Wifi size={10} />
                                                    <span className="truncate max-w-[120px]">{log.isp}</span>
                                                </div>
                                            ) : <span className="text-gray-300">—</span>}
                                        </td>
                                        {/* Qurilma */}
                                        <td className="p-4">
                                            <div className="flex items-center gap-1.5 text-xs text-gray-700">
                                                <DevIcon size={13} strokeWidth={2} />
                                                <span>{log.device_type || "—"}</span>
                                            </div>
                                            {log.screen_resolution && (
                                                <div className="text-[10px] text-gray-400 mt-0.5">{log.screen_resolution}</div>
                                            )}
                                        </td>
                                        {/* Sahifa */}
                                        <td className="p-4">
                                            <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                                                {log.current_path || "—"}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between p-4 border-t border-gray-100">
                        <span className="text-xs text-gray-400">
                            {((page - 1) * limit) + 1}–{Math.min(page * limit, total)} / {total}
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-all"
                            >
                                <ChevronLeft size={16} strokeWidth={3} />
                            </button>
                            <span className="text-xs font-bold px-2">{page} / {totalPages}</span>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 transition-all"
                            >
                                <ChevronRight size={16} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
