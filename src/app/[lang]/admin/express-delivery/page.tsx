"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Truck, Search, Loader2, Zap, Package } from "lucide-react";

interface Prod {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    image?: string;
    price?: number;
    express_delivery?: boolean;
}

export default function AdminExpressDeliveryPage() {
    const [products, setProducts] = useState<Prod[]>([]);
    const [stats, setStats] = useState<{ total: number; express: number }>({ total: 0, express: 0 });
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState("");
    const [savingId, setSavingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (query: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/express-delivery?q=${encodeURIComponent(query)}`, { cache: "no-store" });
            const data = await res.json();
            if (!res.ok || !data.success) {
                setError(data.error || "Yuklashda xatolik. (delivery ustunlari qo'shilganini tekshiring)");
                setProducts([]);
            } else {
                setProducts(data.products || []);
                setStats(data.stats || { total: 0, express: 0 });
            }
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(""); }, [load]);

    // Qidiruv debounce
    useEffect(() => {
        const t = setTimeout(() => load(q.trim()), 350);
        return () => clearTimeout(t);
    }, [q, load]);

    const toggle = async (p: Prod) => {
        const next = !p.express_delivery;
        setSavingId(p.id);
        // Optimistik yangilash
        setProducts(prev => prev.map(x => x.id === p.id ? { ...x, express_delivery: next } : x));
        setStats(s => ({ ...s, express: s.express + (next ? 1 : -1) }));
        try {
            const res = await fetch("/api/admin/express-delivery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "toggle", id: p.id, value: next }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || "Saqlashda xatolik");
        } catch (e: any) {
            // Rollback
            setProducts(prev => prev.map(x => x.id === p.id ? { ...x, express_delivery: !next } : x));
            setStats(s => ({ ...s, express: s.express + (next ? -1 : 1) }));
            setError(e.message);
        } finally {
            setSavingId(null);
        }
    };

    return (
        <div>
            <div className="flex items-center gap-4 mb-2">
                <div className="w-14 h-14 rounded-2xl bg-black flex items-center justify-center text-white">
                    <Zap size={26} />
                </div>
                <div>
                    <h1 className="text-3xl md:text-4xl font-black tracking-tighter italic">Tezkor yetkazish</h1>
                    <p className="text-gray-400 font-bold text-sm">Qaysi mahsulotlar uchun tezkor (express) yetkazish yoqilganini belgilang</p>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 my-8 max-w-md">
                <div className="bg-white border border-gray-100 rounded-3xl p-5">
                    <div className="flex items-center gap-2 text-gray-400 mb-2"><Package size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Jami</span></div>
                    <p className="text-3xl font-black tracking-tighter">{stats.total}</p>
                </div>
                <div className="bg-black text-white rounded-3xl p-5">
                    <div className="flex items-center gap-2 text-gray-400 mb-2"><Truck size={16} /><span className="text-[10px] font-black uppercase tracking-widest">Tezkor yoqilgan</span></div>
                    <p className="text-3xl font-black tracking-tighter">{stats.express}</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-xl mb-6">
                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" />
                <input
                    value={q}
                    onChange={e => setQ(e.target.value)}
                    placeholder="Mahsulot nomi bo'yicha qidirish..."
                    className="w-full bg-white border border-gray-100 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold outline-none focus:border-black transition-colors"
                />
            </div>

            {error && (
                <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-bold">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-gray-300"><Loader2 className="animate-spin" size={32} /></div>
            ) : products.length === 0 ? (
                <div className="text-center py-20 text-gray-400 font-bold">Mahsulot topilmadi</div>
            ) : (
                <div className="space-y-3">
                    {products.map(p => {
                        const on = !!p.express_delivery;
                        return (
                            <div key={p.id} className={`flex items-center gap-4 bg-white border rounded-3xl p-3 pr-5 transition-all ${on ? "border-black/80 shadow-md" : "border-gray-100"}`}>
                                <div className="w-16 h-16 rounded-2xl overflow-hidden bg-gray-50 shrink-0 relative">
                                    {p.image ? (
                                        <Image src={p.image} alt={p.name} fill className="object-cover" sizes="64px" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-gray-200"><Package size={22} /></div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-black text-sm text-gray-900 truncate">{p.name_uz || p.name}</p>
                                    <p className="text-xs font-bold text-gray-400">{(p.price || 0).toLocaleString("ru-RU")} so'm</p>
                                </div>

                                {/* iOS uslubidagi switch */}
                                <button
                                    onClick={() => toggle(p)}
                                    disabled={savingId === p.id}
                                    aria-pressed={on}
                                    className="relative w-[58px] h-[34px] rounded-full transition-colors shrink-0 disabled:opacity-50"
                                    style={{ background: on ? "#2D6E3E" : "#E2E5E0" }}
                                >
                                    <span
                                        className="absolute top-[3px] w-7 h-7 rounded-full bg-white shadow transition-all flex items-center justify-center"
                                        style={{ left: on ? "27px" : "3px" }}
                                    >
                                        {savingId === p.id && <Loader2 size={14} className="animate-spin text-gray-400" />}
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
