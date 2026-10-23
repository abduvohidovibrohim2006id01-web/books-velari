"use client";

import { useState, useEffect } from "react";
import { Search, Plus, Trash2, Edit2, Check, X, Tag, Calculator, Calendar, Hash, ToggleLeft, ToggleRight, Loader2, DollarSign, Percent } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminPromoCodes() {
    const [promos, setPromos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromo, setEditingPromo] = useState<any>(null);
    const [formData, setFormData] = useState({
        code: "",
        discount_type: "fixed",
        discount_value: 0,
        min_order_amount: 0,
        max_discount_amount: 0,
        usage_limit: 100,
        per_user_limit: 1,
        expires_at: "",
        active: true
    });

    useEffect(() => {
        fetchPromos();
    }, []);

    const fetchPromos = async () => {
        try {
            const res = await fetch("/api/admin/promo-codes");
            const data = await res.json();
            if (data.success) {
                setPromos(data.data);
            }
        } catch (error) {
            console.error("Fetch promos error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch("/api/admin/promo-codes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(editingPromo ? { ...formData, id: editingPromo.id } : formData)
            });
            const data = await res.json();
            if (data.success) {
                fetchPromos();
                setIsModalOpen(false);
                setEditingPromo(null);
                setFormData({
                    code: "",
                    discount_type: "fixed",
                    discount_value: 0,
                    min_order_amount: 0,
                    max_discount_amount: 0,
                    usage_limit: 100,
                    per_user_limit: 1,
                    expires_at: "",
                    active: true
                });
            } else {
                alert(data.error || "Saqlashda xatolik yuz berdi");
            }
        } catch (error) {
            console.error("Submit promo error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Haqiqatan ham ushbu promo kodni o'chirmoqchimisiz?")) return;
        try {
            const res = await fetch("/api/admin/promo-codes", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id })
            });
            const data = await res.json();
            if (data.success) fetchPromos();
        } catch (error) {
            console.error("Delete promo error:", error);
        }
    };

    const toggleStatus = async (promo: any) => {
        try {
            const res = await fetch("/api/admin/promo-codes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...promo, active: !promo.active })
            });
            const data = await res.json();
            if (data.success) fetchPromos();
        } catch (error) {
            console.error("Toggle status error:", error);
        }
    };

    if (loading && promos.length === 0) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <Loader2 className="w-12 h-12 text-black animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-12">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 text-purple-600">Promo Kodlar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Ma'lumotlar bazasi • {promos.length} ta promo kod</p>
                </div>

                <button 
                    onClick={() => { setEditingPromo(null); setIsModalOpen(true); }}
                    className="px-10 py-5 bg-black text-white rounded-[32px] font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-black/20"
                >
                    <Plus size={20} />
                    Yangi Promo Kod
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {promos.map((promo) => (
                    <div key={promo.id} className={`bg-white p-8 rounded-[40px] shadow-xl border-2 transition-all relative overflow-hidden group ${promo.active ? 'border-gray-50' : 'border-red-50 grayscale'}`}>
                        {/* Status Toggle Header */}
                        <div className="flex justify-between items-start mb-8">
                            <div onClick={() => toggleStatus(promo)} className="cursor-pointer">
                                {promo.active ? <ToggleRight className="text-green-500" size={32} /> : <ToggleLeft className="text-gray-300" size={32} />}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setEditingPromo(promo); setFormData(promo); setIsModalOpen(true); }} className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:bg-black hover:text-white transition-all"><Edit2 size={16} /></button>
                                <button onClick={() => handleDelete(promo.id)} className="p-3 bg-red-50 text-red-300 rounded-2xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                            </div>
                        </div>

                        {/* Code Display */}
                        <div className="mb-8">
                            <div className="flex items-center gap-2 text-purple-500 font-black text-[10px] uppercase tracking-widest mb-1"><Tag size={12} /> Promo Kod</div>
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase">{promo.code}</h2>
                        </div>

                        {/* Details Grid */}
                        <div className="grid grid-cols-2 gap-6 mb-8">
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Chegirma</p>
                                <p className="text-xl font-black italic tracking-tighter text-black">
                                    {promo.discount_type === 'percent' ? `${promo.discount_value}%` : `${promo.discount_value.toLocaleString()} so'm`}
                                </p>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Foydalanilgan</p>
                                <p className="text-xl font-black italic tracking-tighter text-black">
                                    {promo.usage_count} / {promo.usage_limit || '∞'}
                                </p>
                                <p className="text-[9px] font-black text-purple-400 uppercase tracking-widest mt-1">
                                    Har biriga: {promo.per_user_limit ? `${promo.per_user_limit}x` : '∞'}
                                </p>
                            </div>
                        </div>

                        {/* Footer Status */}
                        <div className="flex items-center justify-between pt-6 border-t border-gray-50">
                            <div className="flex items-center gap-2">
                                <Calendar size={14} className="text-gray-300" />
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">
                                    {promo.expires_at ? new Date(promo.expires_at).toLocaleDateString() : 'Cheksiz muddat'}
                                </span>
                            </div>
                            {promo.active ? (
                                <span className="text-[9px] font-black text-green-500 uppercase tracking-widest px-3 py-1 bg-green-50 rounded-full">Faol</span>
                            ) : (
                                <span className="text-[9px] font-black text-red-400 uppercase tracking-widest px-3 py-1 bg-red-50 rounded-full">To'xtatilgan</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Promo Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-2xl rounded-[50px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-500">
                        <div className="p-10 border-b border-gray-50 flex justify-between items-center">
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase">{editingPromo ? 'Tahrirlash' : 'Yangi Promo Kod'}</h2>
                            <button onClick={() => setIsModalOpen(false)} className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center hover:bg-black hover:text-white transition-all"><X size={24} /></button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="p-10 space-y-8 overflow-y-auto max-h-[70vh]">
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Promo Kod Nomi</label>
                                <input 
                                    required
                                    type="text"
                                    value={formData.code}
                                    onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                                    placeholder="MASALAN: CHEGIRMA10"
                                    className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-3xl p-6 text-xl font-black italic outline-none transition-all uppercase tracking-tighter"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Chegirma Turi</label>
                                    <div className="flex bg-gray-50 p-1.5 rounded-[24px] border border-gray-100">
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({ ...formData, discount_type: 'fixed' })}
                                            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${formData.discount_type === 'fixed' ? 'bg-black text-white shadow-xl' : 'text-gray-400'}`}
                                        >
                                            <DollarSign size={14} /> So'm
                                        </button>
                                        <button 
                                            type="button"
                                            onClick={() => setFormData({ ...formData, discount_type: 'percent' })}
                                            className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-[20px] text-[10px] font-black uppercase tracking-widest transition-all ${formData.discount_type === 'percent' ? 'bg-black text-white shadow-xl' : 'text-gray-400'}`}
                                        >
                                            <Percent size={14} /> Foiz
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Chegirma Miqdori</label>
                                    <input 
                                        required
                                        type="number"
                                        value={formData.discount_value}
                                        onChange={(e) => setFormData({ ...formData, discount_value: Number(e.target.value) })}
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-3xl p-5 text-lg font-black outline-none transition-all"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Minimal Buyurtma</label>
                                    <input 
                                        type="number"
                                        value={formData.min_order_amount}
                                        onChange={(e) => setFormData({ ...formData, min_order_amount: Number(e.target.value) })}
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-3xl p-5 text-base font-bold outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Maksimal Chegirma (Faqat % uchun)</label>
                                    <input 
                                        type="number"
                                        disabled={formData.discount_type === 'fixed'}
                                        value={formData.max_discount_amount}
                                        onChange={(e) => setFormData({ ...formData, max_discount_amount: Number(e.target.value) })}
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-3xl p-5 text-base font-bold outline-none transition-all disabled:opacity-30"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Soni (Limit)</label>
                                    <input 
                                        type="number"
                                        value={formData.usage_limit}
                                        onChange={(e) => setFormData({ ...formData, usage_limit: Number(e.target.value) })}
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-3xl p-5 text-base font-bold outline-none transition-all"
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Amal qilish muddati</label>
                                    <input
                                        type="date"
                                        value={formData.expires_at}
                                        onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })}
                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-3xl p-5 text-base font-bold outline-none transition-all uppercase"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Har bir foydalanuvchi uchun limit</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={(formData as any).per_user_limit ?? ""}
                                    onChange={(e) => setFormData({ ...formData, per_user_limit: e.target.value === "" ? 0 : Number(e.target.value) } as any)}
                                    placeholder="0"
                                    className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-3xl p-5 text-base font-bold outline-none transition-all"
                                />
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest ml-2">
                                    Bitta odam necha marta ishlatishi mumkin. <span className="text-black">0 = cheksiz</span>
                                </p>
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-black text-white py-6 rounded-[32px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-black/20 hover:scale-[1.02] active:scale-95 transition-all mt-4"
                            >
                                {editingPromo ? 'SAQLASH' : 'PROMO KODNI YARATISH'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
