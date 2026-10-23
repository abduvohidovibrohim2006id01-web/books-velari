"use client";

import { useState, useEffect } from "react";
import { adminSelect } from "@/lib/admin-api";
import { mapBlog, mapProduct } from "@/lib/mappers";
import { 
    Plus, Search, Edit, Trash2, LayoutGrid, List, 
    Clock, Eye, ArrowLeft, Save, Loader2, Sparkles,
    Image as ImageIcon, Check, X, BookOpen, Package
} from "lucide-react";
import Image from "next/image";
import { Blog, Product } from "@/types";
import { uploadToYandexS3 } from "@/lib/yandex-s3";

export default function AdminBlogs() {
    const [blogs, setBlogs] = useState<Blog[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [view, setView] = useState<"grid" | "list">("grid");
    const [activeTab, setActiveTab] = useState<"active" | "trash">("active");

    const [editingBlog, setEditingBlog] = useState<Partial<Blog>>({
        title_uz: "", title_ru: "",
        excerpt_uz: "", excerpt_ru: "",
        content_uz: "", content_ru: "",
        image: "", category: "Insights", slug: "",
        readTime: 5, linkedProductIds: []
    });

    useEffect(() => {
        fetchData();
    }, []);

    async function fetchData() {
        setLoading(true);
        try {
            const [bData, pData] = await Promise.all([
                adminSelect<any[]>("blogs", { orderBy: { column: "created_at", ascending: false } }),
                adminSelect<any[]>("products", {
                    columns: "id, name, image, price",
                    match: { column: "is_deleted", value: false },
                    limit: 1000,
                }),
            ]);
            if (bData) setBlogs(bData.map(mapBlog));
            if (pData) setProducts(pData.map(mapProduct));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }

    // Sarlavhadan URL-uchun mos slug yasaydi (slug bo'sh qoldirilsa)
    const makeSlug = (s: string) =>
        (s || "")
            .toLowerCase()
            .trim()
            .replace(/['’`]/g, "")
            .replace(/[^a-z0-9\s-]/g, "")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "");

    const handleSave = async () => {
        if (!editingBlog.title_uz) {
            alert("Sarlavha (O'zbekcha) shart!");
            return;
        }

        // Slug kiritilmagan bo'lsa — sarlavhadan avtomatik yasaymiz
        let slug = makeSlug(editingBlog.slug || "");
        if (!slug) slug = makeSlug(editingBlog.title_uz || "");
        if (!slug) slug = `maqola-${Date.now()}`;

        setIsSaving(true);
        // Map camelCase UI state back to snake_case for Database
        const blogDataForDB: any = {
            title: editingBlog.title_uz,
            content: editingBlog.content_uz || editingBlog.content_ru || "",
            title_uz: editingBlog.title_uz,
            title_ru: editingBlog.title_ru || editingBlog.title_uz,
            excerpt_uz: editingBlog.excerpt_uz,
            excerpt_ru: editingBlog.excerpt_ru || editingBlog.excerpt_uz,
            content_uz: editingBlog.content_uz,
            content_ru: editingBlog.content_ru || editingBlog.content_uz,
            slug,
            image: editingBlog.image,
            category: editingBlog.category,
            read_time: editingBlog.readTime || 5,
            linked_product_ids: editingBlog.linkedProductIds || [],
            blur_data_url: editingBlog.blurDataURL || null,
            updated_at: new Date().toISOString()
        };

        try {
            if (editingBlog.id) {
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'blogs',
                        action: 'update',
                        payload: blogDataForDB,
                        matchConfig: { column: 'id', value: editingBlog.id }
                    })
                });
                if (!res.ok) throw new Error("Maqolani yangilashda xatolik");
            } else {
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'blogs',
                        action: 'insert',
                        payload: [{ 
                            ...blogDataForDB, 
                            views: 0, 
                            is_deleted: false,
                            created_at: new Date().toISOString()
                        }]
                    })
                });
                if (!res.ok) throw new Error("Maqolani yaratishda xatolik");
            }
            setIsModalOpen(false);
            fetchData();
        } catch (err: any) {
            console.error(err);
            alert("Xatolik: " + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const toggleDelete = async (id: string, currentStatus: boolean) => {
        if (!window.confirm(currentStatus ? "Tiklamoqchimisiz?" : "Savatga tashlamoqchimisiz?")) return;
        await fetch('/api/admin/crud', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                table: 'blogs',
                action: 'update',
                payload: { is_deleted: !currentStatus },
                matchConfig: { column: 'id', value: id }
            })
        });
        fetchData();
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const { url, blurDataURL } = await uploadToYandexS3(file);
        setEditingBlog(prev => ({ ...prev, image: url, blurDataURL }));
    };



    const filteredBlogs = blogs.filter(b => 
        (activeTab === "active" ? !b.is_deleted : (b.is_deleted === true)) &&
        (b.title_uz.toLowerCase().includes(searchTerm.toLowerCase()) || 
         b.slug.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return (
        <div className="p-4 md:p-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                <div>
                    <h1 className="text-2xl md:text-4xl font-black tracking-tighter uppercase italic flex items-center gap-4">
                        <BookOpen size={32} className="text-emerald-500" /> Maqolalar Boshqaruvi
                    </h1>
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px] mt-2">Kontent va marketing markazi</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100">
                        <button 
                            onClick={() => setActiveTab("active")}
                            className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'active' ? 'bg-black text-white' : 'text-gray-400 hover:text-black'}`}
                        >
                            Faol ({blogs.filter(b => !b.is_deleted).length})
                        </button>
                        <button 
                            onClick={() => setActiveTab("trash")}
                            className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === 'trash' ? 'bg-red-500 text-white' : 'text-gray-400 hover:text-red-500'}`}
                        >
                            Savat ({blogs.filter(b => b.is_deleted).length})
                        </button>
                    </div>
                    <button 
                        onClick={() => {
                            setEditingBlog({ title_uz: "", title_ru: "", excerpt_uz: "", excerpt_ru: "", content_uz: "", content_ru: "", image: "", category: "Insights", slug: "", readTime: 5, linkedProductIds: [] });
                            setIsModalOpen(true);
                        }}
                        className="bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
                    >
                        <Plus size={20} /> Yangi Maqola
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-6 mb-10">
                <div className="flex-1 relative group">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                    <input 
                        type="text" 
                        placeholder="Maqola nomi yoki slug bo'yicha qidirish..."
                        className="w-full bg-white border border-gray-100 rounded-[28px] py-5 pl-14 pr-6 font-bold text-sm focus:ring-4 focus:ring-emerald-500/5 outline-none shadow-sm transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex bg-white rounded-2xl p-1.5 shadow-sm border border-gray-100">
                    <button onClick={() => setView("grid")} className={`p-3 rounded-xl ${view === 'grid' ? 'bg-black text-white' : 'text-gray-400'}`}><LayoutGrid size={20} /></button>
                    <button onClick={() => setView("list")} className={`p-3 rounded-xl ${view === 'list' ? 'bg-black text-white' : 'text-gray-400'}`}><List size={20} /></button>
                </div>
            </div>

            {/* List */}
            {loading ? (
                <div className="py-40 text-center"><Loader2 className="animate-spin mx-auto text-emerald-500" size={48} /></div>
            ) : filteredBlogs.length === 0 ? (
                <div className="py-40 text-center border-4 border-dashed border-gray-50 rounded-[64px]">
                    <Sparkles className="mx-auto text-gray-200 mb-6" size={80} />
                    <p className="text-gray-400 font-black uppercase tracking-widest italic">Maqolalar topilmadi</p>
                </div>
            ) : (
                <div className={view === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" : "space-y-4"}>
                    {filteredBlogs.map(blog => (
                        <div key={blog.id} className="bg-white rounded-[40px] p-6 border border-gray-50 shadow-sm hover:shadow-2xl transition-all group overflow-hidden">
                            <div className="aspect-[16/9] rounded-[32px] overflow-hidden mb-6 relative bg-gray-50">
                                {blog.image && <img src={blog.image} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />}
                                <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-md px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest">{blog.category}</div>
                            </div>
                            <h3 className="text-xl font-black italic tracking-tighter mb-4 line-clamp-2">{blog.title_uz}</h3>
                            <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-gray-400 mb-8 mt-auto">
                                <span className="flex items-center gap-2"><Clock size={14} className="text-emerald-500" /> {blog.readTime} min</span>
                                <span className="flex items-center gap-2"><Eye size={14} className="text-emerald-500" /> {blog.views}</span>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => { setEditingBlog(blog); setIsModalOpen(true); }}
                                    className="flex-1 bg-gray-50 hover:bg-black hover:text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-2"
                                >
                                    <Edit size={14} /> Tahrirlash
                                </button>
                                <button 
                                    onClick={() => toggleDelete(blog.id, blog.is_deleted || false)}
                                    className={`p-4 rounded-2xl transition-all flex items-center justify-center ${blog.is_deleted ? 'bg-green-50 text-green-600 hover:bg-green-600 hover:text-white' : 'bg-red-50 text-red-500 hover:bg-red-500 hover:text-white'}`}
                                >
                                    {blog.is_deleted ? <Sparkles size={16} /> : <Trash2 size={16} />}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-3xl p-4 md:p-10 overflow-y-auto">
                    <div className="max-w-6xl mx-auto bg-white rounded-[64px] min-h-full overflow-hidden shadow-2xl flex flex-col">
                        <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-3xl font-black italic uppercase tracking-tighter flex items-center gap-4">
                                <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white"><Edit size={24} /></div>
                                Maqola {editingBlog.id ? "Tahrirlash" : "Yaratish"}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-5 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-[32px] transition-all"><X size={32} /></button>
                        </div>
                        
                        <div className="flex-1 p-10 grid grid-cols-1 lg:grid-cols-12 gap-12 overflow-y-auto">
                            {/* Left: General Settings */}
                            <div className="lg:col-span-4 space-y-10">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-4">Muqova rasmi</label>
                                    <div className="relative aspect-[16/10] bg-gray-50 rounded-[40px] overflow-hidden border-4 border-white shadow-xl group">
                                        {editingBlog.image ? (
                                            <img src={editingBlog.image} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 gap-4">
                                                <ImageIcon size={48} strokeWidth={1} />
                                                <span className="text-[10px] font-black uppercase tracking-widest">Rasm tanlang</span>
                                            </div>
                                        )}
                                        <input type="file" onChange={handleImageUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-4">URL Slug (velari.uz/blog/...)</label>
                                    <input 
                                        type="text" 
                                        placeholder="masalan: iphone-15-sharhi"
                                        className="w-full bg-gray-50 border-none rounded-2xl py-4 px-6 font-bold"
                                        value={editingBlog.slug}
                                        onChange={(e) => setEditingBlog({...editingBlog, slug: e.target.value})}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-4">Kategoriya</label>
                                        <select 
                                            className="w-full bg-gray-50 border-none rounded-2xl py-4 px-6 font-bold"
                                            value={editingBlog.category}
                                            onChange={(e) => setEditingBlog({...editingBlog, category: e.target.value})}
                                        >
                                            <option>Insights</option>
                                            <option>Sharhlar</option>
                                            <option>Yangiliklar</option>
                                            <option>Maslahatlar</option>
                                        </select>
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-4">O'qish vaqti (min)</label>
                                        <input 
                                            type="number" 
                                            className="w-full bg-gray-50 border-none rounded-2xl py-4 px-6 font-bold"
                                            value={editingBlog.readTime}
                                            onChange={(e) => setEditingBlog({...editingBlog, readTime: Number(e.target.value)})}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 ml-4">Bog'langan mahsulotlar</label>
                                    <div className="max-h-[300px] overflow-y-auto p-4 bg-gray-50 rounded-[32px] space-y-2 scrollbar-hide">
                                        {products.map(p => {
                                            const isSelected = editingBlog.linkedProductIds?.includes(p.id);
                                            return (
                                                <button 
                                                    key={p.id}
                                                    onClick={() => {
                                                        const current = editingBlog.linkedProductIds || [];
                                                        setEditingBlog({
                                                            ...editingBlog,
                                                            linkedProductIds: isSelected ? current.filter(id => id !== p.id) : [...current, p.id]
                                                        });
                                                    }}
                                                    className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all ${isSelected ? 'bg-emerald-600 text-white shadow-lg' : 'bg-white text-black hover:bg-gray-100'}`}
                                                >
                                                    <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0"><img src={p.image} className="w-full h-full object-cover" /></div>
                                                    <span className="text-[10px] font-bold uppercase truncate flex-1 text-left">{p.name}</span>
                                                    {isSelected && <Check size={16} />}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Right: Bilingual Content */}
                            <div className="lg:col-span-8 space-y-12">
                                {/* UZBEK */}
                                <div className="bg-emerald-50/30 p-8 rounded-[48px] space-y-6 border border-emerald-100/50">
                                    <div className="flex items-center gap-3 mb-2"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">O'zbek tili (UZ)</span></div>
                                    <input 
                                        type="text" 
                                        placeholder="Sarlavha (O'zbekcha)"
                                        className="w-full bg-white border-none rounded-2xl py-6 px-8 text-xl font-black italic tracking-tighter"
                                        value={editingBlog.title_uz}
                                        onChange={(e) => setEditingBlog({...editingBlog, title_uz: e.target.value})}
                                    />
                                    <textarea 
                                        placeholder="Qisqacha tavsif (O'zbekcha)"
                                        className="w-full bg-white border-none rounded-2xl py-6 px-8 text-sm font-medium min-h-[100px]"
                                        value={editingBlog.excerpt_uz}
                                        onChange={(e) => setEditingBlog({...editingBlog, excerpt_uz: e.target.value})}
                                    />
                                    <textarea 
                                        placeholder="Asosiy matn (O'zbekcha)..."
                                        className="w-full bg-white border-none rounded-[32px] py-8 px-10 text-base font-medium min-h-[400px]"
                                        value={editingBlog.content_uz}
                                        onChange={(e) => setEditingBlog({...editingBlog, content_uz: e.target.value})}
                                    />
                                </div>

                                {/* RUSSIAN */}
                                <div className="bg-blue-50/30 p-8 rounded-[48px] space-y-6 border border-blue-100/50">
                                    <div className="flex items-center gap-3 mb-2"><div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" /> <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">Rus tili (RU)</span></div>
                                    <input 
                                        type="text" 
                                        placeholder="Заголовок (на русском)"
                                        className="w-full bg-white border-none rounded-2xl py-6 px-8 text-xl font-black italic tracking-tighter"
                                        value={editingBlog.title_ru}
                                        onChange={(e) => setEditingBlog({...editingBlog, title_ru: e.target.value})}
                                    />
                                    <textarea 
                                        placeholder="Краткое описание (на русском)"
                                        className="w-full bg-white border-none rounded-2xl py-6 px-8 text-sm font-medium min-h-[100px]"
                                        value={editingBlog.excerpt_ru}
                                        onChange={(e) => setEditingBlog({...editingBlog, excerpt_ru: e.target.value})}
                                    />
                                    <textarea 
                                        placeholder="Основной контент (на русском)..."
                                        className="w-full bg-white border-none rounded-[32px] py-8 px-10 text-base font-medium min-h-[400px]"
                                        value={editingBlog.content_ru}
                                        onChange={(e) => setEditingBlog({...editingBlog, content_ru: e.target.value})}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-10 bg-gray-50/50 border-t border-gray-100 flex justify-end gap-6">
                            <button onClick={() => setIsModalOpen(false)} className="px-10 py-5 rounded-2xl font-black text-sm uppercase tracking-widest text-gray-400 hover:text-black transition-all">Bekor qilish</button>
                            <button 
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-black text-white px-16 py-5 rounded-2xl font-black text-sm uppercase tracking-widest shadow-2xl hover:scale-105 active:scale-95 transition-all flex items-center gap-4 disabled:opacity-50"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                                Saqlash
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
