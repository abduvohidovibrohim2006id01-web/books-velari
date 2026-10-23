"use client";

import { useState, useEffect } from "react";
import { adminSelect } from "@/lib/admin-api";
import { Search, User, Phone, ShoppingBag, DollarSign, Calendar, Loader2, Globe, Monitor, MapPin, X, Heart, Eye, TrendingUp, Sparkles, Clock, ShoppingCart, History, Ban, Unlock } from "lucide-react";

interface Customer {
    id: string;
    phone: string;
    name: string;
    createdAt?: any;
    totalOrders: number;
    totalSpent: number;
    ipAddress?: string;
    locationString?: string;
    locationType?: string;
    isOnline?: boolean;
    lastSeen?: any;
    currentPath?: string;
    username?: string;
    walletBalance?: number;
    ordersList?: any[];
    bannedUntil?: any;
}

export default function AdminCustomers() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerInterests, setCustomerInterests] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [allProducts, setAllProducts] = useState<any[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Faqat kerakli ustunlar: items (katta JSON) va ortiqcha maydonlar olib tashlandi
                const [usersData, ordersData, statusRows] = await Promise.all([
                    adminSelect<any[]>("users", {
                        columns: "id, phone, name, created_at, ip_address, username, banned_until",
                        limit: 1000,
                    }),
                    adminSelect<any[]>("orders", { columns: "user_phone, total", limit: 5000 }),
                    adminSelect<any[]>("user_status", { limit: 1000 }),
                ]);

                // Hash Map: O(U * O) sekin filtr o'rniga O(1) chaqmoqdek tez hisoblash
                const orderStatsMap = new Map<string, { count: number; spent: number }>();
                (ordersData || []).forEach((order) => {
                    if (!order.user_phone) return;
                    const prev = orderStatsMap.get(order.user_phone) || { count: 0, spent: 0 };
                    prev.count += 1;
                    prev.spent += Number(order.total) || 0;
                    orderStatsMap.set(order.user_phone, prev);
                });

                const statusData: Record<string, any> = {};
                (statusRows || []).forEach((s) => {
                    if (s?.id) statusData[s.id] = s;
                });

                const merged = (usersData || []).map((user: any) => {
                    const stats = orderStatsMap.get(user.phone) || { count: 0, spent: 0 };
                    const activity = statusData[user.phone] || {};

                    return {
                        id: user.id,
                        phone: user.phone,
                        name: user.name || "Nomsiz Mijoz",
                        createdAt: user.created_at,
                        ipAddress: activity.ip_address || user.ip_address || "Aniqlanmadi",
                        locationString: activity.location_string || "Aniqlanmadi",
                        locationType: activity.location_type || "ip",
                        isOnline: activity.is_online || false,
                        lastSeen: activity.last_seen || null,
                        currentPath: activity.current_path || "/",
                        totalOrders: stats.count,
                        totalSpent: stats.spent,
                        username: user.username || null,
                        bannedUntil: user.banned_until || null
                    };
                });

                merged.sort((a, b) => b.totalSpent - a.totalSpent);
                setCustomers(merged as Customer[]);
            } catch (error) {
                console.error("Error fetching customers data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    const fetchCustomerDetails = async (customer: Customer) => {
        setSelectedCustomer(customer);
        setLoadingDetails(true);
        try {
            const [interestsData, walletData, ordersData] = await Promise.all([
                adminSelect<any>("user_interests", { match: { column: "id", value: customer.phone }, single: true }),
                adminSelect<any>("user_wallets", { columns: "balance", match: { column: "user_phone", value: customer.phone }, single: true }),
                adminSelect<any[]>("orders", { match: { column: "user_phone", value: customer.phone }, orderBy: { column: "created_at", ascending: false } })
            ]);

            if (interestsData) setCustomerInterests(interestsData);

            setSelectedCustomer(prev => prev ? ({
                ...prev,
                walletBalance: walletData?.balance || 0,
                ordersList: ordersData || []
            }) : null);

        } catch (e) {
            console.error("Error fetching customer details:", e);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleToggleBan = async (customer: Customer) => {
        const isBanned = !!customer.bannedUntil;
        const confirmMsg = isBanned ? "Mijozni blokdan chiqarasizmi?" : "Mijozni bloklaysizmi? U orqali xarid qila olmaydi.";
        if (!window.confirm(confirmMsg)) return;

        try {
            const res = await fetch("/api/admin/users/ban", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userPhone: customer.phone, ban: !isBanned })
            });
            const data = await res.json();
            if (data.success) {
                // Update local state
                const updatedBannedUntil = data.banned_until;
                setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, bannedUntil: updatedBannedUntil } : c));
                if (selectedCustomer?.id === customer.id) {
                    setSelectedCustomer(prev => prev ? { ...prev, bannedUntil: updatedBannedUntil } : null);
                }
                alert(isBanned ? "Mijoz blokdan chiqarildi." : "Mijoz bloklandi.");
            } else {
                alert("Xatolik: " + data.error);
            }
        } catch (e) {
            console.error("Ban action error:", e);
        }
    };

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
    );

    const getProductName = (id: string) => {
        return allProducts.find(p => p.id === id)?.name || id;
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-black" size={48} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Mijozlar yuklanmoqda...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-12 animate-in fade-in duration-700 pb-20">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic uppercase">Mijozlar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Mijozlar • {customers.length} ta umumiy</p>
                </div>

                <div className="relative w-full lg:w-96">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                        type="text"
                        placeholder="Ism yoki telefon orqali qidirish..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-gray-100 rounded-[28px] py-5 pl-16 pr-6 font-bold shadow-sm focus:ring-4 focus:ring-black/5 outline-none transition-all"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-8">
                {filteredCustomers.map((customer) => (
                    <div
                        key={customer.id}
                        onClick={() => fetchCustomerDetails(customer)}
                        className="bg-white rounded-[28px] md:rounded-[40px] p-5 md:p-8 border border-gray-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group relative overflow-hidden cursor-pointer"
                    >
                        <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-150 group-hover:rotate-12 transition-transform duration-1000">
                            <User size={120} strokeWidth={1} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-center gap-5 mb-8">
                                <div className="w-16 h-16 bg-black text-white rounded-2xl flex items-center justify-center shadow-xl shadow-black/20 group-hover:rotate-12 transition-transform">
                                    <User size={28} strokeWidth={2.5} />
                                </div>                                 
                                <div>
                                    <h3 className="text-xl font-black tracking-tight uppercase italic">{customer.name}</h3>
                                    <div className="flex items-center gap-3 mt-1">
                                        <p className="text-[10px] font-black text-blue-500 lowercase tracking-tight">@{customer.username || 'nomas'}</p>
                                        <div className="w-1 h-1 bg-gray-300 rounded-full" />
                                        {customer.isOnline ? (
                                            <p className="text-[10px] font-black text-green-500 uppercase tracking-widest flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                                                Online
                                            </p>
                                        ) : (
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-1.5">
                                                <div className="w-1.5 h-1.5 bg-gray-300 rounded-full" />
                                                Oflayn
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex items-center gap-4 text-gray-500 font-bold text-sm bg-gray-50 p-4 rounded-2xl">
                                    <Phone size={18} className="text-black" />
                                    <span>{customer.phone}</span>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-4 rounded-2xl">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Buyurtmalar</p>
                                        <div className="font-black text-lg italic">{customer.totalOrders} ta</div>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-2xl">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-1">Jami Savdo</p>
                                        <div className="font-black text-lg italic text-green-600">{customer.totalSpent.toLocaleString()} $</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Customer Details Modal */}
            {selectedCustomer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-end animate-in fade-in duration-300 bg-black/40 backdrop-blur-sm">
                    <div className="w-full max-w-2xl h-full bg-white rounded-l-[50px] shadow-2xl overflow-y-auto animate-in slide-in-from-right duration-500 p-10">
                        <div className="flex justify-between items-center mb-12">
                            <h2 className="text-3xl font-black uppercase italic tracking-tighter">Mijoz Profili</h2>
                            <button onClick={() => setSelectedCustomer(null)} className="p-4 bg-gray-100 rounded-3xl hover:bg-black hover:text-white transition-all">
                                <X size={24} />
                            </button>
                        </div>

                        <div className="space-y-12">
                            {/* General Info Card */}
                            <div className="bg-black text-white p-10 rounded-[40px] shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-48 h-48 bg-white/5 rounded-full -mr-24 -mt-24 blur-3xl" />
                                <div className="flex items-center gap-8 relative z-10">
                                    <div className="w-24 h-24 bg-white/10 rounded-[36px] flex items-center justify-center text-3xl font-black backdrop-blur-md border border-white/10">
                                        {selectedCustomer.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-2xl font-black italic uppercase tracking-tight mb-1">{selectedCustomer.name}</h3>
                                        <div className="flex items-center gap-4 text-white/50 mb-3">
                                            <p className="text-[11px] font-black tracking-widest text-[#7000FF] lowercase bg-white/10 px-3 py-1 rounded-lg">@{selectedCustomer.username || 'nomas'}</p>
                                            <p className="text-[12px] font-bold flex items-center gap-2"><Phone size={12} /> {selectedCustomer.phone}</p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="px-4 py-1.5 bg-emerald-500 text-white rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20">
                                                Balans: {selectedCustomer.walletBalance?.toLocaleString()} so'm
                                            </div>
                                            <div className="px-4 py-1.5 bg-white/10 rounded-full text-[9px] font-black uppercase tracking-widest border border-white/5">
                                                {selectedCustomer.totalSpent > 1000000 ? "VIP Mijoz" : "Sodiq Mijoz"}
                                            </div>
                                            <button
                                                onClick={() => handleToggleBan(selectedCustomer)}
                                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all ${
                                                    selectedCustomer.bannedUntil 
                                                        ? 'bg-red-500/20 text-red-500 border-red-500/30 hover:bg-red-500/30' 
                                                        : 'bg-white/10 text-white border-white/10 hover:bg-white/20'
                                                }`}
                                            >
                                                {selectedCustomer.bannedUntil ? <Unlock size={10} /> : <Ban size={10} />}
                                                {selectedCustomer.bannedUntil ? 'BLOKLANGAN (Ochish)' : 'BLOKLASH'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Technical & Location */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="bg-gray-50 p-8 rounded-[40px] border border-gray-100">
                                    <div className="flex items-center gap-4 text-gray-400 mb-6">
                                        <Globe size={20} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Texnik ma'lumotlar</span>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">IP Manzil</p>
                                            <p className="font-mono text-sm font-bold">{selectedCustomer.ipAddress}</p>
                                        </div>
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Oxirgi marta</p>
                                            <p className="text-sm font-black italic">{selectedCustomer.currentPath === '/' ? 'Bosh sahifa' : selectedCustomer.currentPath}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-gray-50 p-8 rounded-[40px] border border-gray-100">
                                    <div className="flex items-center gap-4 text-gray-400 mb-6">
                                        <MapPin size={20} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Joylashuv</span>
                                    </div>
                                    <p className="text-sm font-bold leading-relaxed mb-4">{selectedCustomer.locationString}</p>
                                    <span className="bg-black text-white px-3 py-1 rounded-lg text-[8px] font-black uppercase">
                                        {selectedCustomer.locationType?.toUpperCase()} orqali
                                    </span>
                                </div>
                            </div>

                            {/* AI INTERESTS SECTION */}
                            <div className="bg-[#f5f0ff] p-10 rounded-[50px] border-2 border-[#7000FF]/10 relative overflow-hidden">
                                <div className="absolute top-6 right-8 text-[#7000FF] opacity-20">
                                    <Sparkles size={48} />
                                </div>
                                <h3 className="text-xl font-black italic uppercase tracking-tighter mb-8 text-[#7000FF] flex items-center gap-3">
                                    <Sparkles size={20} fill="#7000FF" />
                                    AI Raqamli Portret (Dossier)
                                </h3>

                                {loadingDetails ? (
                                    <div className="flex items-center gap-4 text-[#7000FF]">
                                        <Loader2 className="animate-spin" />
                                        <span className="text-xs font-black uppercase tracking-widest">AI Tahlil qilinmoqda...</span>
                                    </div>
                                ) : customerInterests ? (
                                    <div className="space-y-10">
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Sevimli Kategoriyalar</p>
                                            <div className="space-y-4">
                                                {Object.entries(customerInterests.categories || {}).map(([cat, count]: any) => (
                                                    <div key={cat}>
                                                        <div className="flex justify-between text-xs font-black uppercase italic mb-2">
                                                            <span>{cat}</span>
                                                            <span className="text-[#7000FF]">{count} marta</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-white rounded-full overflow-hidden">
                                                            <div
                                                                className="h-full bg-gradient-to-r from-[#7000FF] to-[#BD00FF] rounded-full"
                                                                style={{ width: `${Math.min(100, count * 10)}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-6">
                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <Eye size={12} /> Oxirgi ko'rilgan mahsulotlar
                                                </p>
                                                <div className="flex flex-wrap gap-2">
                                                    {customerInterests.viewedProducts?.slice(-6).reverse().map((id: string) => (
                                                        <div key={id} className="bg-white px-4 py-2 rounded-2xl text-[10px] font-bold border border-[#7000FF]/5 hover:bg-black hover:text-white transition-colors">
                                                            {getProductName(id)}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                                    <Clock size={12} /> Oxirgi faollik
                                                </p>
                                                <div className="text-sm font-black italic">
                                                    {customerInterests.lastInteraction ? new Date(customerInterests.lastInteraction).toLocaleString('uz-UZ') : "Aniq emas"}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">Mijoz haqida hali yetarli AI tahlil mavjud emas.</p>
                                    </div>
                                )}
                            </div>

                            {/* Sales Summary */}
                            <div className="grid grid-cols-2 gap-8 pb-10">
                                <div className="bg-gray-50 p-8 rounded-[40px] text-center border border-gray-100">
                                    <TrendingUp className="mx-auto mb-4 text-purple-500" />
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Jami Xarid</p>
                                    <p className="text-2xl font-black italic underline decoration-[#7000FF]/20 underline-offset-8">{selectedCustomer.totalSpent.toLocaleString()} $</p>
                                </div>
                                <div className="bg-gray-50 p-8 rounded-[40px] text-center border border-gray-100">
                                    <ShoppingCart className="mx-auto mb-4 text-blue-500" />
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Buyurtmalar</p>
                                    <p className="text-2xl font-black italic">{selectedCustomer.totalOrders} ta</p>
                                </div>
                            </div>

                            {/* ORDER HISTORY SECTION */}
                            <div className="space-y-6">
                                <h3 className="text-xl font-black italic uppercase tracking-tighter flex items-center gap-3">
                                    <History size={20} />
                                    Buyurtmalar Tarixi
                                </h3>
                                
                                <div className="space-y-4">
                                    {loadingDetails ? (
                                        <div className="flex justify-center p-10"><Loader2 className="animate-spin text-gray-200" /></div>
                                    ) : selectedCustomer.ordersList && selectedCustomer.ordersList.length > 0 ? (
                                        selectedCustomer.ordersList.map((order: any) => (
                                            <div key={order.id} className="bg-white border border-gray-100 p-6 rounded-[32px] flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-xl transition-all group">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-black text-gray-400 group-hover:bg-black group-hover:text-white transition-all">
                                                        #{order.id.slice(-4)}
                                                    </div>
                                                    <div>
                                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{new Date(order.created_at).toLocaleString('uz-UZ')}</p>
                                                        <div className="flex flex-wrap gap-2 mt-1">
                                                            {order.items?.map((item: any, i: number) => (
                                                                <span key={i} className="text-[9px] font-bold bg-gray-50 px-2 py-0.5 rounded-lg text-gray-600 border border-gray-100">
                                                                    {item.quantity}x {item.name.slice(0, 15)}...
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-black italic tracking-tighter">{order.total?.toLocaleString()} so'm</p>
                                                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                                        order.status === 'Yetkazildi' ? 'bg-green-50 text-green-600' : 
                                                        order.status === 'Bekor qilingan' ? 'bg-red-50 text-red-600' : 
                                                        'bg-orange-50 text-orange-600'
                                                    }`}>
                                                        {order.status}
                                                    </span>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-10 bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-100">
                                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Buyurtmalar mavjud emas</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
