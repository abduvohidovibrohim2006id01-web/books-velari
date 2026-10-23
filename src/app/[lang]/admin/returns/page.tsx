"use client";

import { useState, useEffect } from "react";
import { Search, ChevronRight, CheckCircle, Truck, Clock, XCircle, MoreVertical, MapPin, Phone, Package, User, Globe, X, Info, Tag, Layers, Hash, RotateCcw, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Image from "next/image";

export default function AdminReturns() {
    const [returns, setReturns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("pending");
    const [selectedReturn, setSelectedReturn] = useState<any | null>(null);

    useEffect(() => {
        fetchReturns();
    }, []);

    const fetchReturns = async () => {
        try {
            // order_returns RLS bilan himoyalangan — anon client o'qiy olmaydi.
            // Service-role orqali generic CRUD endpoint bilan o'qiymiz.
            const res = await fetch("/api/admin/crud", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    table: "order_returns",
                    action: "select",
                    orderBy: { column: "created_at", ascending: false },
                    limit: 200,
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Qaytarishlarni yuklab bo'lmadi");
            setReturns(json.data || []);
        } catch (error) {
            console.error("Fetch returns error:", error);
        } finally {
            setLoading(false);
        }
    };

    const updateReturnStatus = async (returnId: string, newStatus: string) => {
        try {
            const res = await fetch("/api/admin/returns/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ returnId, status: newStatus }),
            });
            
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
            
            setReturns(returns.map(r => r.id === returnId ? { ...r, status: newStatus } : r));
            if (selectedReturn?.id === returnId) {
                setSelectedReturn({ ...selectedReturn, status: newStatus });
            }
        } catch (error) {
            console.error("Update return status error:", error);
            alert("Holatni yangilashda xatolik yuz berdi.");
        }
    };

    const filteredReturns = filter === "all"
        ? returns
        : returns.filter(r => r.status === filter);

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-12">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 text-orange-600">Qaytarishlar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Ma'lumotlar bazasi • {returns.length} ta so'rov</p>
                </div>

                <div className="flex bg-white p-1.5 rounded-[24px] border border-gray-100 shadow-sm overflow-x-auto max-w-full">
                    {["pending", "approved", "processing", "rejected", "completed", "all"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            className={`px-8 py-3.5 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === tab ? "bg-orange-500 text-white shadow-2xl shadow-orange-500/20" : "text-gray-400 hover:text-black"
                                }`}
                        >
                            {tab === 'pending' ? 'Kutilmoqda' :
                             tab === 'approved' ? 'Tasdiqlangan' :
                             tab === 'processing' ? 'Qayta ishlanmoqda' :
                             tab === 'rejected' ? 'Rad etilgan' :
                             tab === 'completed' ? 'Yakunlangan' : 'Barchasi'}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">ID / Vaqt</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Mijoz / Buyurtma</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Sabab</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Holat</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Boshqarish</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredReturns.map((ret) => (
                            <tr key={ret.id} onClick={() => setSelectedReturn(ret)} className="hover:bg-gray-50/50 transition-colors group cursor-pointer">
                                <td className="p-8">
                                    <div className="font-mono text-[11px] font-black">#{ret.id.slice(0,8)}</div>
                                    <div className="text-[10px] text-gray-400 font-bold mt-1 uppercase">
                                        {new Date(ret.created_at).toLocaleString('uz-UZ')}
                                    </div>
                                </td>
                                <td className="p-8">
                                    <div className="font-black text-sm">{ret.user_phone}</div>
                                    <div className="text-[10px] text-blue-500 font-black uppercase mt-1">Buyurtma: #{ret.order_id}</div>
                                </td>
                                <td className="p-8">
                                    <p className="text-xs font-medium text-gray-600 line-clamp-1 max-w-[200px]">{ret.reason}</p>
                                </td>
                                <td className="p-8">
                                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                        ret.status === 'pending' ? 'bg-orange-100 text-orange-600' :
                                        ret.status === 'approved' ? 'bg-blue-100 text-blue-600' :
                                        ret.status === 'processing' ? 'bg-indigo-100 text-indigo-600' :
                                        ret.status === 'completed' ? 'bg-green-100 text-green-600' :
                                        ret.status === 'rejected' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                                    }`}>
                                        {ret.status === 'pending' ? 'Kutilmoqda' :
                                         ret.status === 'approved' ? 'Tasdiqlangan' :
                                         ret.status === 'processing' ? 'Qayta ishlanmoqda' :
                                         ret.status === 'completed' ? 'Yakunlangan' :
                                         ret.status === 'rejected' ? 'Rad etilgan' : ret.status}
                                    </span>
                                </td>
                                <td className="p-8">
                                    <div className="flex gap-2">
                                        {/* Bosqichli oqim: pending -> approved -> processing -> completed */}
                                        {ret.status === 'pending' && (
                                            <>
                                                <button onClick={(e) => { e.stopPropagation(); updateReturnStatus(ret.id, 'approved'); }} title="Tasdiqlash" className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><CheckCircle size={16} /></button>
                                                <button onClick={(e) => { e.stopPropagation(); updateReturnStatus(ret.id, 'rejected'); }} title="Rad etish" className="p-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"><XCircle size={16} /></button>
                                            </>
                                        )}
                                        {ret.status === 'approved' && (
                                            <button onClick={(e) => { e.stopPropagation(); updateReturnStatus(ret.id, 'processing'); }} className="px-3 py-2.5 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all text-[10px] font-black uppercase">Qayta ishlash</button>
                                        )}
                                        {ret.status === 'processing' && (
                                            <button onClick={(e) => { e.stopPropagation(); updateReturnStatus(ret.id, 'completed'); }} className="px-3 py-2.5 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all text-[10px] font-black uppercase">Yakunlash</button>
                                        )}
                                        {(ret.status === 'completed' || ret.status === 'rejected') && (
                                            <span className="text-[10px] font-black text-gray-300 uppercase">—</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Return Modal */}
            {selectedReturn && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 lg:p-20">
                    <div className="bg-white w-full max-w-4xl h-full max-h-[80vh] rounded-[50px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                        <div className="p-10 border-b border-gray-50 flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl font-black italic tracking-tighter uppercase">Qaytarish so'rovi</h1>
                                <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest mt-1">🆔 {selectedReturn.id}</p>
                            </div>
                            <button onClick={() => setSelectedReturn(null)} className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center hover:bg-black hover:text-white transition-all"><X size={24} /></button>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-10 space-y-10">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Qaytarilayotgan Mahsulotlar</label>
                                    <div className="space-y-4">
                                        {selectedReturn.items.map((item: any, i: number) => (
                                            <div key={i} className="flex gap-4 p-4 bg-gray-50 rounded-3xl border border-gray-100">
                                                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xs font-black ring-1 ring-gray-100">{item.name[0]}</div>
                                                <div>
                                                    <p className="font-black text-xs uppercase italic">{item.name}</p>
                                                    <p className="text-[10px] font-bold text-gray-400 mt-0.5">{item.quantity} x {item.price.toLocaleString()} so'm</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Sabab va Tafsilot</label>
                                    <div className="p-8 bg-orange-50/50 rounded-[40px] border border-orange-100 text-sm font-medium text-orange-900 leading-relaxed italic">
                                        "{selectedReturn.reason}"
                                    </div>
                                    {/* Bosqichli oqim: pending -> approved -> processing -> completed */}
                                    {selectedReturn.status === 'pending' && (
                                        <div className="flex gap-4">
                                            <button onClick={() => updateReturnStatus(selectedReturn.id, 'approved')} className="flex-1 py-4 bg-blue-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20 active:scale-95 transition-all">Tasdiqlash</button>
                                            <button onClick={() => updateReturnStatus(selectedReturn.id, 'rejected')} className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-500/20 active:scale-95 transition-all">Rad etish</button>
                                        </div>
                                    )}
                                    {selectedReturn.status === 'approved' && (
                                        <button onClick={() => updateReturnStatus(selectedReturn.id, 'processing')} className="w-full py-4 bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">Qayta ishlashga o'tkazish</button>
                                    )}
                                    {selectedReturn.status === 'processing' && (
                                        <button onClick={() => updateReturnStatus(selectedReturn.id, 'completed')} className="w-full py-4 bg-green-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-500/20 active:scale-95 transition-all">Yakunlash</button>
                                    )}
                                    {(selectedReturn.status === 'completed' || selectedReturn.status === 'rejected') && (
                                        <div className="w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest text-center">
                                            {selectedReturn.status === 'completed' ? 'Yakunlangan' : 'Rad etilgan'}
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
