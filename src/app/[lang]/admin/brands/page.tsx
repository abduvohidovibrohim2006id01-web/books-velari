"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { adminSelect } from "@/lib/admin-api";
import { Plus, Trash2, Tag, Loader2, Hash, Edit2, X, Save, Image as ImageIcon } from "lucide-react";
import { uploadToYandexS3 } from "@/lib/yandex-s3";

interface Brand {
    id: string;
    name: string;
    logoUrl?: string;
    isDeleted?: boolean;
}

export default function AdminBrands() {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [name, setName] = useState("");
    const [brandId, setBrandId] = useState("");
    const [logoUrl, setLogoUrl] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<"active" | "trash">("active");
    const [editingId, setEditingId] = useState<string | null>(null);

    const fetchBrands = async (isInitial = false) => {
        if (isInitial) setLoading(true);
        try {
            const data = await adminSelect<any[]>("brands", { columns: "id, name, image, is_deleted" });

            const fetched = data.map(b => ({
                id: b.id,
                name: b.name,
                logoUrl: b.image,
                isDeleted: b.is_deleted
            })) as Brand[];

            // Sort by ID
            fetched.sort((a, b) => {
                const idA = a.id;
                const idB = b.id;
                const isNumA = !isNaN(Number(idA));
                const isNumB = !isNaN(Number(idB));
                if (isNumA && isNumB) return Number(idA) - Number(idB);
                return idA.localeCompare(idB);
            });

            setBrands(fetched);
        } catch (error) {
            console.error("Error fetching brands:", error);
        } finally {
            if (isInitial) setLoading(false);
        }
    };

    useEffect(() => {
        fetchBrands(true);
    }, []);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const { url } = await uploadToYandexS3(file);
            setLogoUrl(url);
        } catch (error: any) {
            console.error("Upload failed:", error);
            alert("Logo yuklashda xatolik: " + (error.message || "Noma'lum xato"));
        } finally {
            setIsUploading(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setBrandId("");
        setName("");
        setLogoUrl("");
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setIsSaving(true);
        try {
            let finalId = brandId.trim();

            if (!finalId && !editingId) {
                const numericIds = brands
                    .map(b => Number(b.id))
                    .filter(n => !isNaN(n));
                const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 1000;
                finalId = (maxId + 1).toString();
            } else if (editingId) {
                finalId = editingId;
            }

            const res = await fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'brands',
                    action: 'upsert',
                    payload: {
                        id: finalId,
                        name: name.trim(),
                        image: logoUrl.trim() || null,
                        is_deleted: false
                    }
                })
            });

            if (!res.ok) throw new Error("Brendni saqlashda xatolik");

            handleCancelEdit();
            fetchBrands();
        } catch (error) {
            console.error("Error saving brand:", error);
            alert("Xatolik yuz berdi");
        } finally {
            setIsSaving(false);
        }
    };

    const moveToTrash = async (id: string) => {
        if (window.confirm("Brendni o'chirmoqchimisiz?")) {
            await fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'brands',
                    action: 'update',
                    payload: { is_deleted: true },
                    matchConfig: { column: 'id', value: id }
                })
            });
            fetchBrands();
        }
    };

    const restoreBrand = async (id: string) => {
        await fetch('/api/admin/crud', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: 'brands',
                action: 'update',
                payload: { is_deleted: false },
                matchConfig: { column: 'id', value: id }
            })
        });
        fetchBrands();
    };

    const deletePermanent = async (id: string) => {
        if (window.confirm("BUNYUNLAY o'chirmoqchimisiz?")) {
            await fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'brands',
                    action: 'delete',
                    matchConfig: { column: 'id', value: id }
                })
            });
            fetchBrands();
        }
    };

    const filteredBrands = brands.filter(b =>
        activeTab === "trash" ? b.isDeleted : !b.isDeleted
    );

    return (
        <div className="space-y-12 pb-20 p-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic text-black uppercase">Brendlar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Brendlar Boshqaruvi • {brands.length} ta umumiy</p>
                </div>
                <div className="flex bg-white rounded-3xl p-1 shadow-xl border border-gray-50">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === "active" ? "bg-black text-white shadow-lg" : "text-gray-400 hover:text-black"}`}
                    >
                        Asosiylar ({brands.filter(b => !b.isDeleted).length})
                    </button>
                    <button
                        onClick={() => setActiveTab("trash")}
                        className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "trash" ? "bg-red-500 text-white shadow-lg" : "text-gray-400 hover:text-red-500"}`}
                    >
                        <Trash2 size={14} />
                        Trash ({brands.filter(b => b.isDeleted).length})
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
                {/* Form Section */}
                <div className="lg:col-span-1 bg-white p-10 rounded-[48px] border border-gray-100 shadow-xl shadow-black/5 sticky top-32">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-black tracking-tight text-black">{editingId ? "Tahrirlash" : "Yangi Brend"}</h2>
                        {editingId && (
                            <button onClick={handleCancelEdit} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400">
                                <X size={20} />
                            </button>
                        )}
                    </div>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Brend ID</label>
                            <input
                                value={brandId}
                                onChange={e => setBrandId(e.target.value)}
                                type="text"
                                disabled={!!editingId}
                                className="w-full bg-gray-50 rounded-[20px] px-6 py-4 outline-none border-none focus:ring-2 focus:ring-black font-bold disabled:opacity-50 text-black shadow-inner"
                                placeholder={editingId ? "" : "ID bo'sh qolsa, avtomatik yaratiladi"}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Brend Nomi</label>
                            <input
                                required
                                value={name}
                                onChange={e => setName(e.target.value)}
                                type="text"
                                className="w-full bg-gray-50 rounded-[20px] px-6 py-4 outline-none border-none focus:ring-2 focus:ring-black font-bold text-black"
                                placeholder="Masalan: Apple"
                            />
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Brend Logosi</label>
                            <div className="grid grid-cols-1 gap-4">
                                <label className="relative group cursor-pointer">
                                    <div className="w-full h-40 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 transition-all group-hover:bg-gray-100 group-hover:border-black/20 overflow-hidden">
                                        {logoUrl ? (
                                            <img src={logoUrl} className="w-full h-full object-contain p-4" alt="Brend logo" />
                                        ) : (
                                            <>
                                                <div className="p-4 bg-white rounded-2xl shadow-sm text-gray-400 group-hover:text-black transition-colors">
                                                    {isUploading ? <Loader2 className="animate-spin" /> : <Plus size={24} />}
                                                </div>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Logo yuklash</span>
                                            </>
                                        )}
                                    </div>
                                    <input type="file" className="hidden" onChange={handleLogoUpload} accept="image/*" />
                                </label>
                                {logoUrl && (
                                    <button
                                        type="button"
                                        onClick={() => setLogoUrl("")}
                                        className="text-red-500 text-[10px] font-black uppercase tracking-widest hover:underline"
                                    >
                                        Logoni o'chirish
                                    </button>
                                )}
                            </div>
                        </div>

                        <button
                            disabled={isSaving || isUploading}
                            type="submit"
                            className={`w-full text-white py-5 rounded-full font-black text-lg shadow-2xl flex items-center justify-center gap-3 disabled:opacity-50 hover:-translate-y-1 active:scale-95 transition-all ${editingId ? "bg-blue-600" : "bg-black"}`}
                        >
                            {isSaving ? <Loader2 className="animate-spin" /> : editingId ? <Save size={20} /> : <Plus size={20} strokeWidth={3} />}
                            {editingId ? "Yangilash" : "Brendni Saqlash"}
                        </button>
                    </form>
                </div>

                {/* List Section */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    {loading ? (
                        <div className="col-span-full flex justify-center p-20">
                            <Loader2 className="animate-spin text-black" size={48} />
                        </div>
                    ) : (
                        <>
                            {filteredBrands.map((brand) => (
                                <div key={brand.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm hover:shadow-xl transition-all group flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center overflow-hidden border border-gray-100 shadow-inner">
                                            {brand.logoUrl ? (
                                                <img src={brand.logoUrl} className="w-full h-full object-contain p-2" />
                                            ) : (
                                                <Tag className="text-gray-300" size={24} />
                                            )}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[8px] font-black bg-gray-100 px-2 py-0.5 rounded text-gray-400">#{brand.id}</span>
                                                <h3 className="font-black text-black text-lg">{brand.name}</h3>
                                            </div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Brend Ma'lumoti</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {activeTab === "active" ? (
                                            <>
                                                <button
                                                    onClick={() => {
                                                        setEditingId(brand.id);
                                                        setBrandId(brand.id);
                                                        setName(brand.name);
                                                        setLogoUrl(brand.logoUrl || "");
                                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                                    }}
                                                    className="p-3 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-xl transition-all"
                                                >
                                                    <Edit2 size={18} />
                                                </button>
                                                <button
                                                    onClick={() => moveToTrash(brand.id)}
                                                    className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => restoreBrand(brand.id)}
                                                    className="p-3 text-green-500 hover:bg-green-50 rounded-xl transition-all"
                                                >
                                                    <Plus size={20} />
                                                </button>
                                                <button
                                                    onClick={() => deletePermanent(brand.id)}
                                                    className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                                >
                                                    <Trash2 size={20} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}

                            {filteredBrands.length === 0 && (
                                <div className="col-span-full py-20 text-center bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-200">
                                    <Hash size={48} className="mx-auto mb-4 text-gray-200" />
                                    <p className="text-gray-400 font-bold uppercase tracking-widest">Brendlar mavjud emas</p>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
