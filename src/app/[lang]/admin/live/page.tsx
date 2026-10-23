"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { adminSelect } from "@/lib/admin-api";
import { Users, Monitor, Smartphone, Globe, MapPin, MousePointer2, Clock, Zap, UserCheck, Activity } from "lucide-react";

interface ActiveUser {
    id: string;
    name: string;
    phone?: string;
    ipAddress: string;
    currentPath: string;
    lastSeen: any;
    isOnline: boolean;
    type: "user" | "visitor";
    lastAction?: string;
}

export default function AdminLiveMonitoring() {
    const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        try {
            const data = await adminSelect<any[]>("user_status", {
                match: { column: "is_online", value: true },
                limit: 100,
            });

            const now = Date.now();
            const fetched = (data || []).map(u => ({
                id: u.id,
                name: u.name,
                phone: u.user_phone,
                ipAddress: u.ip_address,
                currentPath: u.current_path,
                lastSeen: { toMillis: () => new Date(u.last_seen).getTime() },
                isOnline: u.is_online,
                type: u.type as any,
                lastAction: u.last_action
            } as ActiveUser));

            // Filter users who were seen in the last 5 minutes
            const trulyActive = fetched.filter(u => {
                const lastSeenTime = u.lastSeen?.toMillis?.() || Date.now();
                return (now - lastSeenTime) < 300000;
            });

            trulyActive.sort((a, b) => (b.lastSeen?.toMillis?.() || 0) - (a.lastSeen?.toMillis?.() || 0));
            setActiveUsers(trulyActive);
        } catch (error) {
            console.error("Live monitoring error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        // Realtime RLS tufayli ishlamasligi mumkin — ishonchli polling fallback
        const interval = setInterval(fetchData, 8000);

        const sub = supabase.channel('user_status_live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'user_status' }, () => fetchData())
            .subscribe();

        return () => {
            clearInterval(interval);
            supabase.removeChannel(sub);
        };
    }, []);

    const userCount = activeUsers.filter(u => u.type === "user").length;
    const visitorCount = activeUsers.filter(u => u.type === "visitor").length;

    return (
        <div className="space-y-10 pb-20">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic uppercase flex items-center gap-4">
                        Live <span className="text-red-500 animate-pulse"><Zap size={40} fill="currentColor" /></span>
                    </h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Foydalanuvchi harakatlarini real-vaqtda kuzatish</p>
                </div>
                <div className="flex gap-4">
                    <div className="bg-white border border-gray-100 rounded-[24px] px-8 py-5 shadow-sm flex items-center gap-4">
                        <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                            <Users size={20} />
                        </div>
                        <div>
                            <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest">Jami faol</p>
                            <p className="text-2xl font-black italic">{activeUsers.length}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-black text-white rounded-[40px] p-8 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 text-white/5 group-hover:scale-110 transition-transform duration-700">
                        <UserCheck size={160} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50 mb-2">A'zolar</p>
                    <h3 className="text-6xl font-black italic tracking-tighter">{userCount}</h3>
                </div>
                <div className="bg-white border border-gray-100 rounded-[40px] p-8 shadow-sm relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 text-gray-50 group-hover:scale-110 transition-transform duration-700">
                        <Globe size={160} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400 mb-2">Mehmonlar</p>
                    <h3 className="text-6xl font-black italic tracking-tighter text-black">{visitorCount}</h3>
                </div>
                <div className="bg-blue-600 text-white rounded-[40px] p-8 shadow-xl relative overflow-hidden group">
                    <div className="absolute -right-4 -bottom-4 text-white/10 group-hover:scale-110 transition-transform duration-700">
                        <Activity size={160} />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 mb-2">Aktivlik</p>
                    <h3 className="text-6xl font-black italic tracking-tighter">FAOL</h3>
                </div>
            </div>

            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                    <h2 className="text-xl font-black italic uppercase tracking-tighter">Jonli Harakatlar Oqimi</h2>
                    <span className="bg-green-50 text-green-600 px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-ping" />
                        Live Update
                    </span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Foydalanuvchi</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Manzil</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Hozirgi Harakati</th>
                                <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {activeUsers.map((u) => (
                                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black italic text-lg ${u.type === "user" ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}>
                                                {u.name?.[0] || "?"}
                                            </div>
                                            <div>
                                                <p className="font-black text-sm uppercase tracking-tight">{u.name}</p>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                                    {u.ipAddress}
                                                </p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center gap-2 text-xs font-bold text-black uppercase tracking-tighter">
                                                <MapPin size={12} className="text-red-500" />
                                                {u.currentPath}
                                            </div>
                                            <p className="text-[10px] text-gray-400 font-mono pl-5">{u.phone || "Anonim seans"}</p>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-3 bg-gray-50 px-4 py-2 rounded-xl w-fit border border-gray-100">
                                            <div className="p-1.5 bg-white rounded-lg shadow-sm">
                                                <MousePointer2 size={12} className="text-blue-600" />
                                            </div>
                                            <span className="text-[11px] font-black text-blue-600 uppercase tracking-widest animate-in fade-in zoom-in duration-500" key={u.lastAction}>
                                                {u.lastAction || "Ko'rmoqda"}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <div className="flex items-center justify-end gap-2 text-[10px] font-black uppercase tracking-widest text-green-500">
                                            <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                            Online
                                        </div>
                                        <p className="text-[9px] text-gray-300 font-bold uppercase mt-1">
                                            {u.lastSeen ? new Date(u.lastSeen.toMillis()).toLocaleTimeString() : "Hozir"}
                                        </p>
                                    </td>
                                </tr>
                            ))}
                            {activeUsers.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={4} className="px-8 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <Users size={48} className="text-gray-100" />
                                            <p className="text-gray-400 font-black uppercase tracking-widest text-xs">Hozirda hech kim yo'q</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
