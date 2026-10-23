"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { adminSelect } from "@/lib/admin-api";
import { Plus, Trash2, Folder, Subtitles, Loader2, ChevronRight, Hash, Edit2, X, Save } from "lucide-react";

interface Category {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    parentId: string | null;
    iconUrl?: string; // 100x100px square icon
    isDeleted?: boolean;
}

import { uploadToYandexS3 } from "@/lib/yandex-s3";

export default function AdminCategories() {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [name_uz, setNameUz] = useState("");
    const [name_ru, setNameRu] = useState("");
    const [catId, setCatId] = useState(""); // Custom ID state
    const [parentId, setParentId] = useState<string>("none");
    const [iconUrl, setIconUrl] = useState("");
    const [iconMeta, setIconMeta] = useState<{ xs?: string; md?: string; lg?: string; lowResUrl?: string; blurDataURL?: string } | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<"active" | "trash">("active");
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [selectionPath, setSelectionPath] = useState<string[]>([]); // Stepped selection path
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [bulkJson, setBulkJson] = useState("");
    const [importLoading, setImportLoading] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    const handleCancelEdit = () => {
        setEditingId(null);
        setCatId("");
        setNameUz("");
        setNameRu("");
        setParentId("none");
        setSelectionPath([]);
        setIconUrl("");
        setIconMeta(null);
    };

    const handleIconUpload = async (file: File | undefined) => {
        if (!file) return;

        setIsUploading(true);
        try {
            // Agar avvalgi rasm bo'lsa va u Yandex-da bo'lsa, o'chirib tashlaymiz
            if (iconUrl && iconUrl.includes("yandexcloud.net")) {
                 fetch('/api/upload', {
                    method: 'DELETE',
                    body: JSON.stringify({ fileUrl: iconUrl }),
                    headers: { 'Content-Type': 'application/json' }
                 }).catch(e => console.error("Eski rasmni o'chirishda xatolik:", e));
            }
            const { url, blurDataURL, lowResUrl, xs, md, lg } = await uploadToYandexS3(file);
            setIconUrl(url);
            setIconMeta({ xs, md, lg, lowResUrl, blurDataURL });
        } catch (error: any) {
            console.error("Upload failed:", error);
            alert("Ikonka yuklashda xatolik: " + (error.message || "Noma'lum xato"));
        } finally {
            setIsUploading(false);
            setIsDragOver(false);
        }
    };

    useEffect(() => {
        fetchCategories(true);
    }, []);

    const fetchCategories = async (isInitial = false) => {
        if (isInitial) setLoading(true);
        try {
            const data = await adminSelect<any[]>("categories", {
                columns: "id, name, name_uz, name_ru, parent_id, image, is_deleted"
            });

            const fetched = data.map(c => ({
                id: c.id,
                name: c.name,
                name_uz: c.name_uz,
                name_ru: c.name_ru,
                parentId: c.parent_id,
                iconUrl: c.image,
                isDeleted: c.is_deleted
            })) as Category[];

            // Natural sort by ID
            fetched.sort((a, b) => {
                const idA = a.id;
                const idB = b.id;
                const isNumA = !isNaN(Number(idA));
                const isNumB = !isNaN(Number(idB));

                if (isNumA && isNumB) return Number(idA) - Number(idB);
                return idA.localeCompare(idB);
            });

            setCategories(fetched);
        } catch (error) {
            console.error("Error fetching categories:", error);
        } finally {
            if (isInitial) setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name_uz.trim()) return;

        setIsSaving(true);
        try {
            let finalId = catId.trim();

            if (!finalId && !editingId) {
                const numericIds = categories
                    .map(c => Number(c.id))
                    .filter(n => !isNaN(n));
                const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 100;
                finalId = (maxId + 1).toString();
            } else if (editingId) {
                finalId = editingId;
            }

            const res = await fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'categories',
                    action: 'upsert',
                    payload: {
                        id: finalId,
                        name: name_uz.trim(),
                        name_uz: name_uz.trim(),
                        name_ru: name_ru.trim(),
                        parent_id: parentId === "none" ? null : parentId,
                        image: iconUrl.trim() || null,
                        image_meta: iconMeta || null,
                        is_deleted: false
                    }
                })
            });

            if (!res.ok) throw new Error("Kategoriya saqlashda xatolik");

            handleCancelEdit();
            fetchCategories();
        } catch (error) {
            console.error("Error saving category:", error);
            alert("Xatolik yuz berdi");
        } finally {
            setIsSaving(false);
        }
    };

    const handleEdit = (cat: Category) => {
        setEditingId(cat.id);
        setCatId(cat.id);
        setNameUz(cat.name_uz || cat.name);
        setNameRu(cat.name_ru || "");
        setIconUrl(cat.iconUrl || "");
        setIconMeta((cat as any).image_meta || null);

        const path: string[] = [];
        let curr = cat.parentId;
        while (curr && curr !== "none") {
            path.unshift(curr);
            const parent = categories.find(c => c.id === curr);
            curr = parent?.parentId || null;
        }
        setSelectionPath(path);
        setParentId(cat.parentId || "none");
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };


    const handleBulkUpload = async () => {
        if (!bulkJson.trim()) return;

        try {
            setImportLoading(true);
            const data = JSON.parse(bulkJson);
            if (!data.categories || !Array.isArray(data.categories)) {
                throw new Error("JSON formati noto'g'ri. 'categories' massivi bo'lishi kerak.");
            }

            const saveRecursive = async (cats: any[], pId: string | null = null) => {
                for (const cat of cats) {
                    const id = cat.id ? String(cat.id) : Math.random().toString(36).substr(2, 9);
                    const res = await fetch('/api/admin/crud', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            table: 'categories',
                            action: 'upsert',
                            payload: {
                                id,
                                name: cat.name_uz,
                                name_uz: cat.name_uz,
                                name_ru: cat.name_ru || "",
                                image: cat.image || null,
                                parent_id: pId === "none" ? null : pId,
                                is_deleted: false
                            }
                        })
                    });

                    if (!res.ok) throw new Error("Kategoriya ommaviy yuklashda xatolik");

                    if (cat.subcategories && Array.isArray(cat.subcategories)) {
                        await saveRecursive(cat.subcategories, id);
                    }
                }
            };

            await saveRecursive(data.categories);
            alert("Kategoriyalar muvaffaqiyatli yuklandi!");
            setIsBulkModalOpen(false);
            setBulkJson("");
            fetchCategories();
        } catch (error: any) {
            console.error("Bulk upload error:", error);
            alert("Xatolik (JSON): " + error.message);
        } finally {
            setImportLoading(false);
        }
    };


    // Helper to get full name path for a category
    const getFullName = (cat: Category, allItems: Category[]): string => {
        const names = [cat.name_uz || cat.name];
        let current = cat;
        while (current.parentId) {
            const parent = allItems.find(c => c.id === current.parentId);
            if (parent) {
                names.unshift(parent.name_uz || parent.name);
                current = parent;
            } else {
                break;
            }
        }
        return names.join(" > ");
    };

    const getFullNamesMap = (allItems: Category[]) => {
        const map: { [key: string]: string } = {};
        allItems.forEach(c => {
            map[c.id] = getFullName(c, allItems);
        });
        return map;
    };

    const namesMap = getFullNamesMap(categories);

    const getAllChildIds = (id: string, allItems: Category[]): string[] => {
        let ids: string[] = [];
        const children = allItems.filter(c => c.parentId === id);
        for (const child of children) {
            ids.push(child.id);
            ids = [...ids, ...getAllChildIds(child.id, allItems)];
        }
        return ids;
    };

    const moveToTrash = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!id || isActionLoading) return;

        try {
            if (window.confirm("Ushbu kategoriya va uning barcha sub-kategoriyalarini savatga (Trash) olib o'tmoqchimisiz?")) {
                setIsActionLoading(true);
                const idsToTrash = [id, ...getAllChildIds(id, categories)];
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'categories',
                        action: 'update',
                        payload: { is_deleted: true },
                        inConfig: { column: 'id', values: idsToTrash }
                    })
                });
                if (!res.ok) throw new Error("Savatga o'tkazishda xatolik");
                await fetchCategories(false);
            }
        } catch (error: any) {
            console.error("Error moving category to trash:", error);
            alert("Xatolik (Trash): " + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const restoreCategory = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!id || isActionLoading) return;

        try {
            if (window.confirm("Kategoriyani tiklamoqchimisiz?")) {
                setIsActionLoading(true);
                // Simple restore for now, can be recursive if needed
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'categories',
                        action: 'update',
                        payload: { is_deleted: false },
                        matchConfig: { column: 'id', value: id }
                    })
                });
                if (!res.ok) throw new Error("Tiklashda xatolik");
                await fetchCategories(false);
            }
        } catch (error: any) {
            console.error("Error restoring category:", error);
            alert("Xatolik (Tiklash): " + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const deletePermanent = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!id || isActionLoading) return;

        try {
            if (window.confirm("DIQQAT! Kategoriya va uning barcha sub-kategoriyalari o'chiriladi. Rozimisiz?")) {
                setIsActionLoading(true);
                const idsToDelete = [id, ...getAllChildIds(id, categories)];
                
                // Also hide related products
                await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'products',
                        action: 'update',
                        payload: { is_deleted: true },
                        inConfig: { column: 'category_id', values: idsToDelete }
                    })
                });
                
                // Hard delete categories
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'categories',
                        action: 'delete',
                        inConfig: { column: 'id', values: idsToDelete }
                    })
                });
                if (!res.ok) throw new Error("O'chirishda xatolik");
                
                await fetchCategories(false);
            }
        } catch (error: any) {
            console.error("Error deleting category permanently:", error);
            alert("Xatolik (O'chirish): " + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const CategoryNode = ({ item, level = 0 }: { item: Category, level?: number }) => {
        const children = categories.filter(c => 
            c.parentId === item.id &&
            (activeTab === "trash" ? c.isDeleted === true : (c.isDeleted === false || !c.isDeleted))
        );

        return (
            <div className={`space-y-4 ${level > 0 ? "ml-8 mt-4 border-l-2 border-gray-50 pl-6" : ""}`}>
                <div className={`bg-white rounded-[32px] border border-gray-100 overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 group ${level === 0 ? "p-8" : "p-4"}`}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div className={`${level === 0 ? "w-12 h-12" : "w-10 h-10"} bg-gray-100 text-black border border-gray-200 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-all overflow-hidden`}>
                                {item.iconUrl ? (
                                    <img src={item.iconUrl} className="w-full h-full object-contain p-2" />
                                ) : (
                                    <Folder size={level === 0 ? 20 : 16} />
                                )}
                            </div>
                            <div>
                                <h3 className={`${level === 0 ? "text-xl" : "text-sm"} font-black tracking-tight flex items-center gap-2 text-black`}>
                                    <span className="text-gray-300 font-normal text-[10px] px-2 py-0.5 border rounded-lg">#{item.id}</span>
                                    {item.name_uz}
                                </h3>
                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">{children.length} ta sub-kategoriya</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {activeTab === "active" ? (
                                <>
                                    <button
                                        onClick={() => handleEdit(item)}
                                        className="p-3 text-gray-300 hover:text-blue-500 transition-colors"
                                        title="Tahrirlash"
                                    >
                                        <Edit2 size={level === 0 ? 18 : 16} />
                                    </button>
                                    <button
                                        onClick={(e) => moveToTrash(item.id, e)}
                                        className="p-3 text-gray-300 hover:text-red-500 transition-colors"
                                        title="Trashga o'tkazish"
                                    >
                                        <Trash2 size={level === 0 ? 20 : 18} />
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={(e) => restoreCategory(item.id, e)}
                                        className="p-3 text-green-500 hover:bg-green-50 rounded-xl transition-all"
                                        title="Tiklash"
                                    >
                                        <Plus size={level === 0 ? 20 : 18} />
                                    </button>
                                    <button
                                        onClick={(e) => deletePermanent(item.id, e)}
                                        className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                        title="Butunlay o'chirish"
                                    >
                                        <Trash2 size={level === 0 ? 20 : 18} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                {children.length > 0 && (
                    <div className="space-y-4">
                        {children.map(child => <CategoryNode key={child.id} item={child} level={level + 1} />)}
                    </div>
                )}
            </div>
        );
    };

    const filteredCategories = categories.filter(c =>
        (activeTab === "trash" ? c.isDeleted === true : (c.isDeleted === false || !c.isDeleted))
    );

    // Get root nodes (nodes whose parents are NOT in the current tab's view)
    const rootNodes = filteredCategories.filter(c => {
        if (!c.parentId) return true;
        // If parent is not in the filtered list, treat as root for this view
        return !filteredCategories.some(cat => cat.id === c.parentId);
    });

    return (
        <div className="space-y-12 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic text-black uppercase">Kategoriyalar</h1>
                    <div className="flex items-center gap-4">
                        <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Ierarxiya va Boshqaruv • {categories.length} ta umumiy</p>
                        <button
                            onClick={() => setIsBulkModalOpen(true)}
                            className="bg-green-500 text-white px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center gap-2 hover:bg-green-600 transition-all shadow-lg active:scale-95"
                        >
                            <Plus size={12} strokeWidth={3} />
                            Ommaviy yuklash (JSON)
                        </button>
                    </div>
                </div>
                <div className="flex bg-white rounded-3xl p-1 shadow-xl border border-gray-50">
                    <button
                        onClick={() => setActiveTab("active")}
                        className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === "active" ? "bg-black text-white shadow-lg" : "text-gray-400 hover:text-black"}`}
                    >
                        Asosiylar ({categories.filter(c => !c.isDeleted).length})
                    </button>
                    <button
                        onClick={() => setActiveTab("trash")}
                        className={`px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "trash" ? "bg-red-500 text-white shadow-lg" : "text-gray-400 hover:text-red-500"}`}
                    >
                        <Trash2 size={14} />
                        Trash ({categories.filter(c => c.isDeleted).length})
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10 items-start">
                {/* Form Section */}
                <div className="lg:col-span-1 bg-white p-5 md:p-10 rounded-[32px] md:rounded-[48px] border border-gray-100 shadow-xl shadow-black/5 lg:sticky lg:top-32">
                    <div className="flex justify-between items-center mb-8">
                        <h2 className="text-2xl font-black tracking-tight text-black">{editingId ? "Tahrirlash" : "Yangi qo'shish"}</h2>
                        {editingId && (
                            <button onClick={handleCancelEdit} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400">
                                <X size={20} />
                            </button>
                        )}
                    </div>
                    <form onSubmit={handleSave} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Kategoriya ID</label>
                            <input
                                value={catId}
                                onChange={e => setCatId(e.target.value)}
                                type="text"
                                disabled={!!editingId}
                                className="w-full bg-gray-50 rounded-[20px] px-6 py-4 outline-none border-none focus:ring-2 focus:ring-black font-bold disabled:opacity-50 text-black shadow-inner"
                                placeholder={editingId ? "" : "ID bo'sh qolsa, avtomatik yaratiladi"}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Nomi (UZ)</label>
                                <input
                                    required
                                    value={name_uz}
                                    onChange={e => setNameUz(e.target.value)}
                                    type="text"
                                    className="w-full bg-gray-50 rounded-[20px] px-6 py-4 outline-none border-none focus:ring-2 focus:ring-black font-bold text-black"
                                    placeholder="Erkaklar"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Название (RU)</label>
                                <input
                                    required
                                    value={name_ru}
                                    onChange={e => setNameRu(e.target.value)}
                                    type="text"
                                    className="w-full bg-gray-50 rounded-[20px] px-6 py-4 outline-none border-none focus:ring-2 focus:ring-black font-bold text-black"
                                    placeholder="Мужское"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Ikonka (100x100px) - Sudrab tashlash (Drag & Drop) mavjud</label>
                            <div className="flex items-center gap-4">
                                <div 
                                    className={`relative group w-24 h-24 rounded-2xl border-2 border-dashed transition-all overflow-hidden flex-shrink-0 ${isDragOver ? "border-blue-500 bg-blue-50 shadow-xl scale-105" : (iconUrl ? "border-gray-100 bg-gray-100 shadow-sm" : "border-gray-200 bg-gray-50 hover:border-black")} flex flex-col items-center justify-center`}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        setIsDragOver(true);
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        setIsDragOver(false);
                                    }}
                                    onDrop={async (e) => {
                                        e.preventDefault();
                                        setIsDragOver(false);
                                        const file = e.dataTransfer.files?.[0];
                                        if(file) await handleIconUpload(file);
                                    }}
                                >
                                    {isUploading ? (
                                        <Loader2 className="animate-spin text-black" size={24} />
                                    ) : iconUrl ? (
                                        <>
                                            <img src={iconUrl} className="w-full h-full object-contain p-4 transition-opacity group-hover:opacity-30" />
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm bg-black/20 gap-2">
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIconUrl("");
                                                    }}
                                                    className="p-1.5 bg-red-500 text-white rounded-lg hover:scale-110 transition-transform relative z-20"
                                                    title="Rasmni o'chirish"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                                <div className="p-1.5 bg-blue-500 text-white rounded-lg hover:scale-110 transition-transform flex items-center justify-center pointer-events-none relative z-10" title="Yangi yuklash ustiga bosish orqali">
                                                    <Plus size={16} />
                                                </div>
                                            </div>
                                            <input
                                                type="file"
                                                title="Ustiga bosib yoki rasmni sudrab tashlab yangilash"
                                                className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                                onChange={(e) => handleIconUpload(e.target.files?.[0])}
                                                accept="image/*"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <Plus size={24} className={`${isDragOver ? "text-blue-500" : "text-gray-300 group-hover:text-black"} transition-colors`} />
                                            <input
                                                type="file"
                                                title="Rasmni yuklash uchun bosing yoki shu yerga tashlang"
                                                className="absolute inset-0 opacity-0 cursor-pointer"
                                                onChange={(e) => handleIconUpload(e.target.files?.[0])}
                                                accept="image/*"
                                            />
                                        </>
                                    )}
                                </div>
                                <div className="flex-1">
                                    <p className="text-[9px] font-bold text-gray-300 leading-tight mb-2 uppercase tracking-tight">Yandex Cloudga yuklash va URL manzilini olish</p>
                                    <input
                                        type="text"
                                        value={iconUrl}
                                        onChange={e => setIconUrl(e.target.value)}
                                        placeholder="yoki URL kiriting..."
                                        className="w-full bg-gray-50 rounded-xl px-4 py-2 outline-none border-none text-[11px] font-bold text-gray-400 truncate"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 italic">Ota Kategoriya (Ierarxiya)</label>

                            {/* Stepped Selection */}
                            <div className="space-y-3">
                                {/* Level 1 */}
                                <select
                                    value={selectionPath[0] || "none"}
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (val === "none") {
                                            setSelectionPath([]);
                                            setParentId("none");
                                        } else {
                                            setSelectionPath([val]);
                                            setParentId(val);
                                        }
                                    }}
                                    className="w-full bg-gray-50 rounded-[20px] px-6 py-4 outline-none border-none focus:ring-2 focus:ring-black font-bold appearance-none text-black cursor-pointer shadow-inner"
                                >
                                    <option value="none">Asosiy (Eng yuqori)</option>
                                    {categories
                                        .filter(c => !c.parentId && !c.isDeleted && c.id !== editingId)
                                        .map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name_uz}</option>
                                        ))}
                                </select>

                                {/* Subsequent levels */}
                                {selectionPath.map((selectedId, index) => {
                                    const children = categories.filter(c => c.parentId === selectedId && !c.isDeleted && c.id !== editingId);
                                    if (children.length === 0) return null;

                                    return (
                                        <div key={index} className="pl-6 border-l-2 border-gray-100 space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <select
                                                value={selectionPath[index + 1] || "none"}
                                                onChange={e => {
                                                    const val = e.target.value;
                                                    const newPath = selectionPath.slice(0, index + 1);
                                                    if (val !== "none") {
                                                        newPath.push(val);
                                                        setParentId(val);
                                                    } else {
                                                        setParentId(selectedId);
                                                    }
                                                    setSelectionPath(newPath);
                                                }}
                                                className="w-full bg-gray-50 rounded-[20px] px-6 py-4 outline-none border-none focus:ring-2 focus:ring-black font-bold appearance-none text-black cursor-pointer shadow-inner"
                                            >
                                                <option value="none">Ichki toifani tanlang (Select sub-category)</option>
                                                {children.map(cat => (
                                                    <option key={cat.id} value={cat.id}>{cat.name_uz}</option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <button
                            disabled={isSaving}
                            type="submit"
                            className={`w-full text-white py-5 rounded-full font-black text-lg shadow-2xl flex items-center justify-center gap-3 disabled:opacity-50 hover:-translate-y-1 active:scale-95 transition-all ${editingId ? "bg-blue-600" : "bg-black"}`}
                        >
                            {isSaving ? <Loader2 className="animate-spin" /> : editingId ? <Save size={20} /> : <Plus size={20} strokeWidth={3} />}
                            {editingId ? "Yangilash" : "Saqlash"}
                        </button>
                    </form>
                </div>

                {/* List Section - Tree View */}
                <div className="lg:col-span-2 space-y-6">
                    {loading ? (
                        <div className="flex justify-center p-20">
                            <Loader2 className="animate-spin text-black" size={48} />
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            {rootNodes.map((root) => (
                                <CategoryNode key={root.id} item={root} />
                            ))}

                            {categories.length === 0 && (
                                <div className="py-20 text-center bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-200">
                                    <Hash size={48} className="mx-auto mb-4 text-gray-200" />
                                    <p className="text-gray-400 font-bold uppercase tracking-widest">Kategoriyalar mavjud emas</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Bulk Upload Modal */}
            {isBulkModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-gray-100">
                        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <div>
                                <h2 className="text-2xl font-black tracking-tighter uppercase italic text-black">Ommaviy yuklash (Bulk)</h2>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">JSON formatidagi ma'lumotlarni kiriting</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setBulkJson(JSON.stringify({
                                        "categories": [
                                            {
                                                "id": 1,
                                                "name_uz": "Soch parvarishi texnikasi",
                                                "name_ru": "Техника для ухода за волосами",
                                                "subcategories": [
                                                    { "id": 101, "name_uz": "Soch dazmollari", "name_ru": "Выпрямители для волос" }
                                                ]
                                            }
                                        ]
                                    }, null, 2))}
                                    className="bg-gray-100 hover:bg-gray-200 text-black px-4 py-2 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                                >
                                    Namuna nusxalash
                                </button>
                                <button onClick={() => setIsBulkModalOpen(false)} className="p-4 hover:bg-white rounded-full transition-all shadow-sm text-black">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 italic">JSON Ma'lumotlari</label>
                                <textarea
                                    value={bulkJson}
                                    onChange={(e) => setBulkJson(e.target.value)}
                                    placeholder={`{\n  "categories": [\n    {\n      "id": 1,\n      "name_uz": "Nomi",\n      "subcategories": [...]\n    }\n  ]\n}`}
                                    className="w-full h-80 bg-gray-50 border-none rounded-[32px] p-8 text-xs font-mono focus:ring-2 focus:ring-black outline-none transition-all shadow-inner text-black scrollbar-hide"
                                />
                            </div>
                            <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 flex items-start gap-4">
                                <div className="p-2 bg-blue-500 text-white rounded-lg"><Folder size={16} /></div>
                                <div className="text-[10px] font-medium text-blue-800 leading-relaxed uppercase tracking-wider">
                                    Diqqat! JSON formati siz kiritgan namunadagidek bo'lishi shart. Agar ID mavjud bo'lsa, u yangilanadi, aks holda yangi kategoriya yaratiladi.
                                </div>
                            </div>
                            <button
                                onClick={handleBulkUpload}
                                disabled={importLoading || !bulkJson.trim()}
                                className="w-full bg-black text-white py-6 rounded-3xl font-black uppercase tracking-[0.2em] text-xs shadow-2xl hover:bg-gray-900 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {importLoading ? <Loader2 className="animate-spin" size={20} /> : <Save size={18} />}
                                {importLoading ? "YUKLANMOQDA..." : "YUKLASHNI BOSHLASH"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
