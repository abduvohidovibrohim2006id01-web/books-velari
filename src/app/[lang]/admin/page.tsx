"use client";

import { useState, useEffect } from "react";
import { adminSelect } from "@/lib/admin-api";
import { TrendingUp, Users, ShoppingBag, DollarSign, Clock, ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";
import { mapOrder } from "@/lib/mappers";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboard() {
    const [stats, setStats] = useState({
        totalOrders: 0,
        totalRevenue: 0,
        totalUsers: 0,
        pendingOrders: 0
    });
    const [recentOrders, setRecentOrders] = useState<any[]>([]);
    const [chartData, setChartData] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [embedStatus, setEmbedStatus] = useState<{ activeProducts: number; missingText: number; missingImage: number; command: string } | null>(null);

    useEffect(() => {
        fetchDashboardData();
        // Qidiruv embedding'lari holati (yangi mahsulotlar qo'lda embedding qilinadi — cron yo'q)
        fetch("/api/admin/embedding-status").then(r => (r.ok ? r.json() : null)).then(setEmbedStatus).catch(() => {});
    }, []);

    const fetchDashboardData = async () => {
        try {
            // Parallel so'rovlar: barcha kerakli ma'lumotlar bir vaqtda (0-waterfall) olinadi
            const [recentOrdersData, allUsersData, statsOrdersData] = await Promise.all([
                adminSelect<any[]>("orders", {
                    orderBy: { column: "created_at", ascending: false },
                    limit: 5,
                }),
                adminSelect<any[]>("users", { columns: "id" }),
                adminSelect<any[]>("orders", {
                    columns: "total, status, created_at",
                    orderBy: { column: "created_at", ascending: false },
                    limit: 1000,
                }),
            ]);

            const revenue = statsOrdersData?.reduce((sum, order) => sum + (Number(order.total) || 0), 0) || 0;
            const pending = statsOrdersData?.filter(order =>
                ["Kutilmoqda", "To'lov kutilmoqda", "Ожидание", "Ожидание оплаты"].some(s => order.status?.includes(s))
            ).length || 0;

            setStats({
                totalOrders: statsOrdersData?.length || 0,
                totalRevenue: revenue,
                totalUsers: allUsersData?.length || 0,
                pendingOrders: pending
            });

            // CHART DATA: Last 7 days revenue
            const last7Days = Array.from({length: 7}).map((_, i) => {
                const d = new Date();
                d.setDate(d.getDate() - (6 - i));
                return { 
                    dateStr: d.toISOString().split('T')[0], 
                    display: d.toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric' }),
                    daromad: 0 
                };
            });

            statsOrdersData?.forEach(o => {
                if (!o.created_at) return;
                const dateOnly = o.created_at.split('T')[0];
                const dayMatch = last7Days.find(d => d.dateStr === dateOnly);
                if (dayMatch && o.status !== 'Bekor qilindi') {
                    dayMatch.daromad += Number(o.total) || 0;
                }
            });
            setChartData(last7Days);

            if (recentOrdersData) setRecentOrders(recentOrdersData.map(mapOrder));

        } catch (error) {
            console.error("Dashboard error:", error);
        } finally {
            setLoading(false);
        }
    };

    const cards = [
        { name: "Jami Buyurtmalar", value: stats.totalOrders, icon: ShoppingBag, color: "bg-blue-500" },
        { name: "Jami Savdo", value: `${stats.totalRevenue.toLocaleString()} so'm`, icon: DollarSign, color: "bg-green-500" },
        { name: "Mijozlar", value: stats.totalUsers, icon: Users, color: "bg-purple-500" },
        { name: "Kutilmoqda", value: stats.pendingOrders, icon: Clock, color: "bg-orange-500" },
    ];

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="w-10 h-10 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-10">
            <div>
                <h1 className="text-2xl md:text-4xl font-black tracking-tighter mb-1 md:mb-2">Dashboard</h1>
                <p className="text-sm md:text-base text-gray-500 font-medium">Do'koningizdagi bugungi holat bilan tanishing.</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6">
                {cards.map((card) => {
                    const Icon = card.icon;
                    return (
                        <div key={card.name} className="bg-white p-4 md:p-6 rounded-[24px] md:rounded-[32px] shadow-sm border border-gray-100 group hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                            <div className={`w-10 h-10 md:w-12 md:h-12 ${card.color} text-white rounded-xl md:rounded-2xl flex items-center justify-center mb-3 md:mb-4`}>
                                <Icon size={20} />
                            </div>
                            <p className="text-[10px] md:text-sm font-bold text-gray-400 uppercase tracking-widest mb-1">{card.name}</p>
                            <h3 className="text-lg md:text-2xl font-black">{card.value}</h3>
                        </div>
                    );
                })}
            </div>

            {/* Qidiruv embedding'lari: yangi/o'zgargan mahsulotlar qo'lda embedding qilinadi */}
            {embedStatus && (
                <div className={`p-4 md:p-6 rounded-[24px] md:rounded-[32px] border flex flex-col md:flex-row md:items-center gap-3 md:gap-6 ${embedStatus.missingText + embedStatus.missingImage > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-gray-100 shadow-sm"}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white ${embedStatus.missingText + embedStatus.missingImage > 0 ? "bg-amber-500" : "bg-emerald-500"}`}>
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <p className="text-[10px] md:text-sm font-bold text-gray-400 uppercase tracking-widest">Embedding&apos;i yo&apos;q mahsulotlar</p>
                            <h3 className="text-lg md:text-2xl font-black">
                                matn: {embedStatus.missingText} · rasm: {embedStatus.missingImage}
                                <span className="text-sm text-gray-400 font-bold"> / {embedStatus.activeProducts}</span>
                            </h3>
                        </div>
                    </div>
                    {embedStatus.missingText + embedStatus.missingImage > 0 && (
                        <p className="text-sm text-amber-800 font-medium">
                            Yangi mahsulotlar qidiruvda to&apos;liq ishlashi uchun kompyuterda <code className="px-1.5 py-0.5 bg-white rounded border border-amber-200 font-mono text-xs">{embedStatus.command}</code> ni
                            (yoki EMBEDDING-YANGILASH.bat ni) ishga tushiring.
                        </p>
                    )}
                </div>
            )}

            {/* Analytics Chart */}
            <div className="bg-white p-4 md:p-8 rounded-[28px] md:rounded-[40px] shadow-sm border border-gray-100">
                <div className="mb-4 md:mb-6 flex items-center justify-between">
                    <div>
                        <h2 className="text-base md:text-xl font-black tracking-tight flex items-center gap-2">
                            <TrendingUp size={18} className="text-blue-500" />
                            So'nggi 7 kunlik daromad
                        </h2>
                        <p className="text-xs md:text-sm text-gray-400 font-medium mt-1">Sotuvlar dinamikasi</p>
                    </div>
                </div>
                <div className="h-[220px] md:h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorDaromad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis 
                                dataKey="display" 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }} 
                                dy={10} 
                            />
                            <YAxis 
                                axisLine={false} 
                                tickLine={false} 
                                tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }}
                                tickFormatter={(val) => `${(val / 1000000).toFixed(1)}M`}
                                dx={-10}
                            />
                            <Tooltip 
                                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', padding: '12px 16px' }}
                                formatter={(value: any) => [`${Number(value || 0).toLocaleString()} so'm`, "Daromad"]}
                                labelStyle={{ fontWeight: 900, marginBottom: '8px', color: '#1e293b' }}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="daromad" 
                                stroke="#3B82F6" 
                                strokeWidth={4}
                                fillOpacity={1} 
                                fill="url(#colorDaromad)" 
                                activeDot={{ r: 8, fill: "#3B82F6", stroke: "#fff", strokeWidth: 3 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Orders */}
            <div className="bg-white rounded-[28px] md:rounded-[40px] shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 md:p-8 border-b border-gray-50 flex justify-between items-center">
                    <h2 className="text-base md:text-xl font-black tracking-tight">Oxirgi Buyurtmalar</h2>
                    <Link href="/admin/orders" className="text-xs md:text-sm font-bold text-gray-400 hover:text-black flex items-center gap-1 md:gap-2 group">
                        Barchasi <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
                {/* Mobile: card view */}
                <div className="divide-y divide-gray-50 md:hidden">
                    {recentOrders.map((order) => (
                        <div key={order.id} className="p-4 flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <div className="font-bold text-sm text-gray-900 truncate">{order.userPhone}</div>
                                <div className="text-[10px] text-gray-400 font-bold">#{order.id?.slice(0, 8)}</div>
                            </div>
                            <div className="text-right">
                                <div className="font-black text-sm">{order.total?.toLocaleString()} so'm</div>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${order.status === 'Kutilmoqda' ? 'bg-orange-100 text-orange-600' :
                                    order.status === 'Yetkazildi' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {order.status}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
                {/* Desktop: table view */}
                <div className="overflow-x-auto hidden md:block">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50">
                                <th className="p-6 text-xs font-black text-gray-400 uppercase tracking-widest">Mijoz</th>
                                <th className="p-6 text-xs font-black text-gray-400 uppercase tracking-widest">Miqdor</th>
                                <th className="p-6 text-xs font-black text-gray-400 uppercase tracking-widest">Vaqt</th>
                                <th className="p-6 text-xs font-black text-gray-400 uppercase tracking-widest">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {recentOrders.map((order) => (
                                <tr key={order.id} className="hover:bg-gray-50 transition-colors cursor-pointer">
                                    <td className="p-6">
                                        <div className="font-bold text-gray-900">{order.userPhone}</div>
                                        <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">#{order.id}</div>
                                    </td>
                                    <td className="p-6 font-black text-lg">{order.total?.toLocaleString()} so'm</td>
                                    <td className="p-6 text-sm text-gray-500 font-medium">
                                        {order.createdAt ? new Date(order.createdAt).toLocaleDateString('uz-UZ') : ""}
                                    </td>
                                    <td className="p-6">
                                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${order.status === 'Kutilmoqda' ? 'bg-orange-100 text-orange-600' :
                                            order.status === 'Yetkazildi' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                                            }`}>
                                            {order.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
