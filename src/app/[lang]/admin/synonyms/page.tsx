"use client";

import { useState, useEffect } from "react";
import { BookA, Search, Plus, Trash2, Loader2, RefreshCw } from "lucide-react";
import { useStore } from "@/store/store";

interface Synonym {
    id: number;
    keyword: string;
    maps_to: string;
    created_at: string;
}

export default function SynonymsPage() {
    const [synonyms, setSynonyms] = useState<Synonym[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [newKeyword, setNewKeyword] = useState("");
    const [newMapsTo, setNewMapsTo] = useState("");
    const { showToast } = useStore();

    const fetchSynonyms = async (search = "") => {
        setLoading(true);
        try {
            const res = await fetch(`/api/admin/synonyms?search=${search}`);
            const data = await res.json();
            if (data.synonyms) {
                setSynonyms(data.synonyms);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchSynonyms(searchTerm);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newKeyword.trim() || !newMapsTo.trim()) return;

        setIsAdding(true);
        try {
            const res = await fetch("/api/admin/synonyms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keyword: newKeyword, maps_to: newMapsTo }),
            });
            const data = await res.json();

            if (data.success) {
                setSynonyms([data.synonym, ...synonyms]);
                setNewKeyword("");
                setNewMapsTo("");
                showToast("Yangi sinonim qo'shildi", "success");
            } else {
                showToast(data.error || "Xatolik yuz berdi", "error");
            }
        } catch (error) {
            showToast("Server xatosi", "error");
        } finally {
            setIsAdding(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("O'chirmoqchimisiz?")) return;

        try {
            const res = await fetch(`/api/admin/synonyms?id=${id}`, { method: "DELETE" });
            const data = await res.json();
            if (data.success) {
                setSynonyms(synonyms.filter(s => s.id !== id));
                showToast("O'chirildi", "success");
            } else {
                showToast(data.error || "Xatolik", "error");
            }
        } catch (error) {
            showToast("Server xatosi", "error");
        }
    };

    return (
        <div className="p-6 min-h-screen text-black">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase italic flex items-center gap-3">
                        <BookA size={28} strokeWidth={3} />
                        Qidiruv Lug'ati
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Xaridorlar xato yoki boshqacha yozsa ham to'g'ri topishi uchun sinonimlar
                    </p>
                </div>
                <button
                    onClick={() => fetchSynonyms(searchTerm)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50"
                >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    Yangilash
                </button>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* QO'SHISH FORMASI */}
                <div className="lg:col-span-1">
                    <form onSubmit={handleAdd} className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm sticky top-24">
                        <h2 className="text-sm font-black uppercase tracking-widest mb-4">Yangi qo'shish</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Xaridor yozadigan so'z</label>
                                <input
                                    type="text"
                                    value={newKeyword}
                                    onChange={e => setNewKeyword(e.target.value)}
                                    placeholder="Masalan: ayfon, nout"
                                    className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:outline-none transition-all text-sm font-medium"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-gray-400 font-bold mb-1 block">Aslida bazadan izlanadigan so'z</label>
                                <input
                                    type="text"
                                    value={newMapsTo}
                                    onChange={e => setNewMapsTo(e.target.value)}
                                    placeholder="Masalan: iphone, laptop"
                                    className="w-full px-4 py-3 bg-gray-50 border border-transparent rounded-xl focus:bg-white focus:border-black focus:outline-none transition-all text-sm font-medium"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isAdding || !newKeyword.trim() || !newMapsTo.trim()}
                                className="w-full flex items-center justify-center gap-2 bg-black text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-900 transition-all disabled:opacity-50"
                            >
                                {isAdding ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                Qo'shish
                            </button>
                        </div>

                        <div className="mt-6 p-4 bg-blue-50 rounded-xl text-blue-800 text-xs leading-relaxed font-medium">
                            <span className="font-bold">Qoida:</span> "ayfon" deb izlanganda "iphone" natijalari chiqishi uchun yuqoriga "ayfon", pastga "iphone" yozing.
                        </div>
                    </form>
                </div>

                {/* RO'YXAT */}
                <div className="lg:col-span-2">
                    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                        <div className="p-4 border-b border-gray-100 relative">
                            <Search size={16} className="absolute left-7 top-1/2 -translate-y-1/2 text-gray-400" strokeWidth={3} />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="So'zni qidirish..."
                                className="w-full pl-10 pr-4 py-2 border-none bg-gray-50 rounded-lg text-sm font-medium focus:ring-0"
                            />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        <th className="text-left p-4">Xaridor yozadigan</th>
                                        <th className="text-left p-4">Asl qidiruv</th>
                                        <th className="text-right p-4">Harakat</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={3} className="p-8 text-center text-gray-400">Yuklanmoqda...</td></tr>
                                    ) : synonyms.length === 0 ? (
                                        <tr><td colSpan={3} className="p-8 text-center text-gray-400">Hech narsa topilmadi</td></tr>
                                    ) : (
                                        synonyms.map(item => (
                                            <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                                                <td className="p-4 font-bold text-red-500">{item.keyword}</td>
                                                <td className="p-4 font-bold text-green-600">→ {item.maps_to}</td>
                                                <td className="p-4 text-right">
                                                    <button 
                                                        onClick={() => handleDelete(item.id)}
                                                        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
