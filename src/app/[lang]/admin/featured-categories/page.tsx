"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { adminApi } from "@/lib/admin-api";
import { Loader2, CheckCircle2, Save, Eye, EyeOff, GripVertical } from "lucide-react";

interface Category {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    parent_id?: string | null;
    image?: string;
    icon?: string;
    color?: string;
}

const PALETTE = [
    "#FFE0EC", "#E0E7FF", "#D1FAE5", "#FEF3C7",
    "#FCE7F3", "#DBEAFE", "#ECFDF5", "#FEF9C3",
    "#F3E8FF", "#CFFAFE", "#FEE2E2", "#E0F2FE",
];

const EMOJI_OPTIONS = [
    "📱", "💻", "🎧", "⌚", "🎮", "📷", "🖥️", "🔌",
    "🎵", "🏠", "👕", "👟", "💄", "🧴", "🍎", "🥗",
    "📦", "⚡", "🌿", "💎", "🛒", "🎯", "🔥", "✨",
    "🎁", "🏋️", "🚗", "🧸", "📚", "🧹", "🍳", "☕",
];

export default function AdminFeaturedCategoriesPage() {
    const [allCategories, setAllCategories] = useState<Category[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [showOnHome, setShowOnHome] = useState(true);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    // Kategoriya uchun icon/color o'zgartirishlar
    const [editingIcon, setEditingIcon] = useState<string | null>(null);
    const [editingColor, setEditingColor] = useState<string | null>(null);
    const [pendingIconChanges, setPendingIconChanges] = useState<Record<string, string>>({});
    const [pendingColorChanges, setPendingColorChanges] = useState<Record<string, string>>({});

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [catRows, val] = await Promise.all([
                adminApi.categories.getAll(),
                adminApi.settings.get("featured_categories"),
            ]);

            if (catRows) setAllCategories(catRows);

            if (val) {
                setSelectedIds(val.category_ids || []);
                setShowOnHome(val.show_on_home !== false);
            }
        } catch {}
        setLoading(false);
    };

    const adminCrud = async (table: string, action: string, payload: any, matchConfig?: any) => {
        const res = await fetch("/api/admin/crud", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ table, action, payload, matchConfig }),
        });
        if (!res.ok) throw new Error("Saqlashda xatolik");
        return res.json();
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            // 1) Settings saqlash
            await adminApi.settings.save("featured_categories", {
                category_ids: selectedIds,
                show_on_home: showOnHome,
            });

            // 2) Har bir kategoriya uchun icon/color yangilash
            const iconEntries = Object.entries(pendingIconChanges);
            const colorEntries = Object.entries(pendingColorChanges);

            for (const [catId, icon] of iconEntries) {
                await adminCrud("categories", "update", { icon }, { column: "id", value: catId });
            }
            for (const [catId, color] of colorEntries) {
                await adminCrud("categories", "update", { color }, { column: "id", value: catId });
            }

            setPendingIconChanges({});
            setPendingColorChanges({});

            setSaved(true);
            setTimeout(() => setSaved(false), 2500);

            // Refresh data
            fetchData();
        } catch (e: any) {
            alert("Xatolik: " + e.message);
        }
        setSaving(false);
    };

    const toggleCategory = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const moveCategory = (idx: number, dir: -1 | 1) => {
        const next = idx + dir;
        if (next < 0 || next >= selectedIds.length) return;
        const updated = [...selectedIds];
        [updated[idx], updated[next]] = [updated[next], updated[idx]];
        setSelectedIds(updated);
    };

    const getIcon = (cat: Category) => pendingIconChanges[cat.id] ?? cat.icon ?? "";
    const getColor = (cat: Category) => pendingColorChanges[cat.id] ?? cat.color ?? "";

    // Barcha kategoriyalar tanlash uchun (parent + subkategoriyalar).
    // Parent nomini ko'rsatish uchun map.
    const parentNameById = new Map(
        allCategories.filter(c => !c.parent_id).map(c => [c.id, c.name_uz || c.name])
    );
    // Avval parentlar, keyin har biri ostidagi subkategoriyalar tartibida.
    const orderedCategories = (() => {
        const parents = allCategories.filter(c => !c.parent_id);
        const result: Category[] = [];
        for (const p of parents) {
            result.push(p);
            result.push(...allCategories.filter(c => c.parent_id === p.id));
        }
        // Parent topilmagan (orphan) subkategoriyalar
        const seen = new Set(result.map(c => c.id));
        result.push(...allCategories.filter(c => !seen.has(c.id)));
        return result;
    })();

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" size={32} /></div>;

    return (
        <div className="space-y-10 pb-20 max-w-5xl">
            {saved && (
                <div className="fixed top-10 right-10 z-[100] bg-black text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-2xl">
                    <CheckCircle2 size={16} /> Saqlandi!
                </div>
            )}

            <div>
                <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic uppercase">Kategoriya Vitrina</h1>
                <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                    Bosh sahifada ko'rinadigan kategoriyalarni tanlang va tartibini belgilang
                </p>
            </div>

            {/* Ko'rsatish / yashirish */}
            <div className="bg-white rounded-[28px] p-6 border border-gray-100 shadow-sm flex items-center justify-between">
                <div>
                    <div className="font-black text-sm">Bosh sahifada ko'rsatish</div>
                    <div className="text-xs text-gray-400 mt-1">Kategoriyalar qatorini bosh sahifada ko'rsatish yoki yashirish</div>
                </div>
                <button
                    onClick={() => setShowOnHome(!showOnHome)}
                    className={`p-3 rounded-xl transition-colors ${showOnHome ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-400"}`}
                >
                    {showOnHome ? <Eye size={20} /> : <EyeOff size={20} />}
                </button>
            </div>

            {/* Tanlangan kategoriyalar (tartib bilan) */}
            {selectedIds.length > 0 && (
                <div className="space-y-4">
                    <div className="font-black text-sm uppercase tracking-widest text-gray-400">
                        Tanlangan ({selectedIds.length} ta) — tartibni ↑↓ bilan o'zgartiring
                    </div>
                    <div className="space-y-2">
                        {selectedIds.map((id, idx) => {
                            const cat = allCategories.find(c => c.id === id);
                            if (!cat) return null;
                            const icon = getIcon(cat);
                            const color = getColor(cat) || PALETTE[idx % PALETTE.length];

                            return (
                                <div key={id} className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex items-center gap-4">
                                    <GripVertical size={16} className="text-gray-300 shrink-0" />

                                    {/* Icon preview + edit */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setEditingIcon(editingIcon === id ? null : id)}
                                            style={{ background: cat.image ? "#fff" : color, width: 48, height: 48, borderRadius: 14, overflow: "hidden" }}
                                            className="flex items-center justify-center text-2xl hover:scale-105 transition-transform"
                                        >
                                            {cat.image
                                                ? <img src={cat.image} alt="" className="w-full h-full object-cover" />
                                                : (icon || "📦")}
                                        </button>
                                        {editingIcon === id && (
                                            <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-72"
                                                style={{ animation: "velari-pop-in 200ms ease both" }}>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Emoji tanlang</div>
                                                <div className="grid grid-cols-8 gap-1">
                                                    {EMOJI_OPTIONS.map(e => (
                                                        <button key={e}
                                                            onClick={() => {
                                                                setPendingIconChanges(prev => ({ ...prev, [id]: e }));
                                                                setEditingIcon(null);
                                                            }}
                                                            className={`text-xl p-1.5 rounded-lg hover:bg-gray-100 transition-colors ${icon === e ? "bg-green-50 ring-2 ring-green-400" : ""}`}
                                                        >{e}</button>
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Yoki emoji yozing..."
                                                    className="w-full mt-2 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-black"
                                                    maxLength={4}
                                                    onChange={e => {
                                                        if (e.target.value.trim()) {
                                                            setPendingIconChanges(prev => ({ ...prev, [id]: e.target.value.trim() }));
                                                        }
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Kategoriya nomi */}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-sm truncate">{cat.name_uz || cat.name}</div>
                                        <div className="text-xs text-gray-400 truncate">{cat.name_ru || ""}</div>
                                    </div>

                                    {/* Rang tanlash */}
                                    <div className="relative">
                                        <button
                                            onClick={() => setEditingColor(editingColor === id ? null : id)}
                                            style={{ background: color, width: 28, height: 28, borderRadius: 8, border: "2px solid rgba(0,0,0,0.1)" }}
                                            className="hover:scale-110 transition-transform"
                                        />
                                        {editingColor === id && (
                                            <div className="absolute top-full right-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-3 w-56"
                                                style={{ animation: "velari-pop-in 200ms ease both" }}>
                                                <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Rang tanlang</div>
                                                <div className="grid grid-cols-6 gap-1.5">
                                                    {PALETTE.map(c => (
                                                        <button key={c}
                                                            onClick={() => {
                                                                setPendingColorChanges(prev => ({ ...prev, [id]: c }));
                                                                setEditingColor(null);
                                                            }}
                                                            style={{ background: c, width: 32, height: 32, borderRadius: 8, border: color === c ? "2px solid #000" : "2px solid transparent" }}
                                                            className="hover:scale-110 transition-transform"
                                                        />
                                                    ))}
                                                </div>
                                                <input
                                                    type="color"
                                                    className="w-full mt-2 h-8 rounded-lg cursor-pointer"
                                                    value={color}
                                                    onChange={e => setPendingColorChanges(prev => ({ ...prev, [id]: e.target.value }))}
                                                />
                                            </div>
                                        )}
                                    </div>

                                    {/* Tartib tugmalari */}
                                    <div className="flex flex-col gap-1 shrink-0">
                                        <button onClick={() => moveCategory(idx, -1)} disabled={idx === 0}
                                            className="px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-500 disabled:opacity-30 hover:bg-gray-200 transition-colors font-bold">↑</button>
                                        <button onClick={() => moveCategory(idx, 1)} disabled={idx === selectedIds.length - 1}
                                            className="px-2 py-1 text-xs rounded-lg bg-gray-100 text-gray-500 disabled:opacity-30 hover:bg-gray-200 transition-colors font-bold">↓</button>
                                    </div>

                                    {/* O'chirish */}
                                    <button
                                        onClick={() => toggleCategory(id)}
                                        className="px-3 py-1.5 rounded-xl bg-red-50 text-red-500 text-xs font-bold hover:bg-red-100 transition-colors"
                                    >✕</button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Barcha kategoriyalar ro'yxati */}
            <div className="space-y-4">
                <div className="font-black text-sm uppercase tracking-widest text-gray-400">
                    Barcha kategoriyalar — tanlang
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {orderedCategories.map((cat, idx) => {
                        const isSelected = selectedIds.includes(cat.id);
                        const icon = getIcon(cat);
                        const color = getColor(cat) || PALETTE[idx % PALETTE.length];
                        const isParent = !cat.parent_id;
                        const parentName = cat.parent_id ? parentNameById.get(cat.parent_id) : null;

                        return (
                            <button
                                key={cat.id}
                                onClick={() => toggleCategory(cat.id)}
                                className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                                    isSelected
                                        ? "border-green-400 bg-green-50 shadow-md"
                                        : "border-gray-100 bg-white hover:border-gray-300 hover:shadow-sm"
                                }`}
                            >
                                <div
                                    style={{ background: cat.image ? "#fff" : color, width: 40, height: 40, borderRadius: 12, overflow: "hidden" }}
                                    className="flex items-center justify-center text-xl shrink-0"
                                >
                                    {cat.image
                                        ? <img src={cat.image} alt="" className="w-full h-full object-cover" />
                                        : (icon || "📦")}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="font-bold text-sm truncate">{cat.name_uz || cat.name}</div>
                                    {isParent ? (
                                        <div className="text-[9px] text-green-600 font-black uppercase tracking-wider truncate">Asosiy</div>
                                    ) : parentName ? (
                                        <div className="text-[10px] text-gray-400 truncate">{parentName}</div>
                                    ) : cat.name_ru ? (
                                        <div className="text-[10px] text-gray-400 truncate">{cat.name_ru}</div>
                                    ) : null}
                                </div>
                                {isSelected && (
                                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                                        <span className="text-white text-xs font-black">✓</span>
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Saqlash tugmasi */}
            <div className="sticky bottom-6 flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-3 px-10 py-5 bg-black text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-gray-800 transition-all disabled:opacity-50 shadow-2xl"
                >
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Saqlash
                </button>
            </div>

            {/* Eslatma */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800 font-semibold">
                <strong>Eslatma:</strong> Kategoriya ikonkalari (emoji) va ranglari <code className="bg-amber-100 px-1 rounded">categories</code> jadvalining{" "}
                <code className="bg-amber-100 px-1 rounded">icon</code> va{" "}
                <code className="bg-amber-100 px-1 rounded">color</code> ustunlarida saqlanadi.
                Agar bu ustunlar mavjud bo'lmasa, Supabase Table Editor orqali qo'shing (text, nullable).
            </div>
        </div>
    );
}
