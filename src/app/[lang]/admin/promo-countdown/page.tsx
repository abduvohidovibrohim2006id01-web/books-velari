"use client";

import { useState, useEffect, useMemo } from "react";
import { adminFrom } from "@/lib/admin-query";
import { adminApi } from "@/lib/admin-api";
import { Timer, ToggleLeft, ToggleRight, Save, CheckCircle2, Loader2, Search, X } from "lucide-react";

interface PromoSettings {
    enabled: boolean;
    start_time: string;
    end_time: string;
    text_uz: string;
    text_ru: string;
    label_uz: string;
    label_ru: string;
    bg_color: string;
    link: string;
    discount_percent: number;
    target_type: "all" | "category" | "brand" | "manual";
    target_ids: string[];
}

const DEFAULT: PromoSettings = {
    enabled: false,
    start_time: new Date(Date.now()).toISOString().slice(0, 16),
    end_time: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16),
    text_uz: "Chegirma tugashiga",
    text_ru: "До конца скидки",
    label_uz: "Maxsus taklif!",
    label_ru: "Специальное предложение!",
    bg_color: "#2D6E3E",
    link: "",
    discount_percent: 0,
    target_type: "all",
    target_ids: [],
};

function pad(n: number) { return String(n).padStart(2, "0"); }

function LivePreview({ settings, language }: { settings: PromoSettings; language: "uz" | "ru" }) {
    const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
    const [isWaiting, setIsWaiting] = useState(false);

    useEffect(() => {
        const calc = () => {
            const now = Date.now();
            const start = new Date(settings.start_time).getTime();
            const end = new Date(settings.end_time).getTime();

            if (now < start) {
                // Boshlanishini kutyapmiz
                setIsWaiting(true);
                const diff = start - now;
                setTimeLeft({
                    days: Math.floor(diff / 86400000),
                    hours: Math.floor((diff % 86400000) / 3600000),
                    minutes: Math.floor((diff % 3600000) / 60000),
                    seconds: Math.floor((diff % 60000) / 1000),
                });
            } else if (now <= end) {
                // Aktiv
                setIsWaiting(false);
                const diff = end - now;
                setTimeLeft({
                    days: Math.floor(diff / 86400000),
                    hours: Math.floor((diff % 86400000) / 3600000),
                    minutes: Math.floor((diff % 3600000) / 60000),
                    seconds: Math.floor((diff % 60000) / 1000),
                });
            } else {
                // Tugagan
                setIsWaiting(false);
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
            }
        };
        calc();
        const id = setInterval(calc, 1000);
        return () => clearInterval(id);
    }, [settings.start_time, settings.end_time]);

    const label = language === "uz" ? settings.label_uz : settings.label_ru;
    // Agar kutish rejimida bo'lsa, text ni o'zgartiramiz
    let text = language === "uz" ? settings.text_uz : settings.text_ru;
    if (isWaiting) {
        text = language === "uz" ? "Aksiya boshlanishiga" : "До начала акции";
    }

    return (
        <div style={{ borderRadius: 20, overflow: "hidden", maxWidth: 400 }}>
            <div style={{ background: settings.bg_color, padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
                        {settings.discount_percent > 0 && (
                            <span style={{ background: "#fff", color: settings.bg_color, padding: "2px 6px", borderRadius: 6, fontSize: 11, fontWeight: 900 }}>
                                -{settings.discount_percent}%
                            </span>
                        )}
                        {text}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    {timeLeft.days > 0 && (
                        <>
                            <Block n={timeLeft.days} l={language === "uz" ? "kun" : "д"} />
                            <Dot />
                        </>
                    )}
                    <Block n={timeLeft.hours} l={language === "uz" ? "soat" : "ч"} />
                    <Dot />
                    <Block n={timeLeft.minutes} l={language === "uz" ? "daq" : "м"} />
                    <Dot />
                    <Block n={timeLeft.seconds} l={language === "uz" ? "son" : "с"} />
                </div>
            </div>
        </div>
    );
}

function Block({ n, l }: { n: number; l: string }) {
    return (
        <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 10, minWidth: 38, padding: "5px 6px", textAlign: "center" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", lineHeight: 1 }}>{pad(n)}</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.65)", fontWeight: 600, marginTop: 2, textTransform: "uppercase" }}>{l}</div>
        </div>
    );
}

function Dot() {
    return <span style={{ fontSize: 16, fontWeight: 800, color: "rgba(255,255,255,0.5)" }}>:</span>;
}

export default function PromoCountdownAdmin() {
    const [settings, setSettings] = useState<PromoSettings>(DEFAULT);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [previewLang, setPreviewLang] = useState<"uz" | "ru">("uz");

    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
    const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
    
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        let isMounted = true;
        const fetchAll = async () => {
            try {
                const [settVal, catRows, brRows] = await Promise.all([
                    adminApi.siteSettings.get("promo_countdown"),
                    adminApi.categories.getAll(),
                    adminApi.brands.getAll(),
                ]);

                if (!isMounted) return;

                if (catRows) setCategories((catRows as any[]).map(x => ({ id: String(x.id), name: x.name })));
                if (brRows) setBrands((brRows as any[]).map(x => ({ id: String(x.id), name: x.name })));

                if (settVal) {
                    const v = settVal as any;
                    setSettings({
                        ...DEFAULT,
                        ...v,
                        start_time: v.start_time ? new Date(v.start_time).toISOString().slice(0, 16) : DEFAULT.start_time,
                        end_time: v.end_time ? new Date(v.end_time).toISOString().slice(0, 16) : DEFAULT.end_time,
                        target_type: v.target_type || "all",
                        target_ids: v.target_ids || [],
                        discount_percent: v.discount_percent || 0
                    });

                    // Agar target_type manual va tanlangan mahsulotlar bo'lsa, faqat ularning nomlarini olib kelamiz
                    if (v.target_type === "manual" && Array.isArray(v.target_ids) && v.target_ids.length > 0) {
                        const { data } = await adminFrom("products")
                            .select("id, name")
                            .in("id", v.target_ids);
                        if (isMounted && data) {
                            setProducts(data);
                        }
                    }
                }
            } catch (err) {
                console.error("Promo countdown fetch error:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };
        fetchAll();
        return () => { isMounted = false; };
    }, []);

    // Manual rejimda qidiruv yoki birinchi marta ochilganda mahsulotlarni tezkor qidirish
    useEffect(() => {
        if (settings.target_type !== "manual") return;

        let active = true;
        const search = searchQuery.trim();

        const timer = setTimeout(async () => {
            try {
                let query = adminFrom("products").select("id, name").eq("is_deleted", false);
                if (search) {
                    query = query.ilike("name", `%${search}%`).limit(20);
                } else {
                    query = query.order("created_at", { ascending: false }).limit(20);
                }
                const { data } = await query;
                if (!active || !data) return;

                setProducts(prev => {
                    const map = new Map(prev.map(p => [p.id, p]));
                    data.forEach(p => map.set(p.id, p));
                    return Array.from(map.values());
                });
            } catch (err) {
                console.error("Product search error:", err);
            }
        }, search ? 250 : 0);

        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [settings.target_type, searchQuery]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const payload = {
                ...settings,
                start_time: new Date(settings.start_time).toISOString(),
                end_time: new Date(settings.end_time).toISOString(),
            };
            await adminApi.siteSettings.save("promo_countdown", payload);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e: any) {
            console.error(e);
            alert("Saqlashda xatolik: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const field = (label: string, key: keyof PromoSettings, type = "text", placeholder = "") => (
        <div>
            <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">{label}</label>
            <input
                type={type}
                value={settings[key] as any}
                onChange={e => setSettings(prev => ({ ...prev, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
                placeholder={placeholder}
                className="w-full px-5 py-3 rounded-2xl border-2 border-gray-100 bg-white text-sm font-semibold focus:outline-none focus:border-black transition-colors"
            />
        </div>
    );

    const filteredOptions = useMemo(() => {
        let list: { id: string; name: string }[] = [];
        if (settings.target_type === "category") list = categories;
        if (settings.target_type === "brand") list = brands;
        if (settings.target_type === "manual") {
            return products.filter(x => !settings.target_ids.includes(x.id)).slice(0, 10);
        }

        if (!searchQuery.trim()) return list.slice(0, 10);
        return list.filter(x => x.name.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10);
    }, [settings.target_type, searchQuery, categories, brands, products, settings.target_ids]);

    const getName = (id: string) => {
        if (settings.target_type === "category") return categories.find(c => c.id === id)?.name;
        if (settings.target_type === "brand") return brands.find(b => b.id === id)?.name;
        if (settings.target_type === "manual") return products.find(p => p.id === id)?.name;
        return id;
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-10 pb-20 max-w-4xl">
            {saved && (
                <div className="fixed top-10 right-10 z-[100] bg-black text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 shadow-2xl">
                    <CheckCircle2 size={16} /> Saqlandi!
                </div>
            )}

            <div>
                <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic uppercase flex items-center gap-4">
                    <Timer size={40} /> Promo Countdown
                </h1>
                <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Aksiya banneri va avtomatik chegirmalar tizimi</p>
            </div>

            {/* Toggle */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 flex items-center justify-between gap-6">
                <div>
                    <div className="font-black text-lg tracking-tight">Banner holati</div>
                    <div className="text-gray-400 text-sm mt-1">{settings.enabled ? "Yoqilgan — muddatiga qarab mijozlarga ko'rinadi" : "O'chirilgan — hech kim ko'rmaydi"}</div>
                </div>
                <button
                    onClick={() => setSettings(p => ({ ...p, enabled: !p.enabled }))}
                    className="flex items-center gap-3 transition-all"
                >
                    {settings.enabled
                        ? <ToggleRight size={52} className="text-green-600" />
                        : <ToggleLeft size={52} className="text-gray-300" />
                    }
                </button>
            </div>

            {/* Vaqt va Chegirma */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 space-y-6">
                <div className="font-black text-lg tracking-tight mb-2">Vaqt va Chegirma</div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Boshlanish vaqti</label>
                        <input
                            type="datetime-local"
                            value={settings.start_time}
                            onChange={e => setSettings(p => ({ ...p, start_time: e.target.value }))}
                            className="w-full px-5 py-3 rounded-2xl border-2 border-gray-100 bg-white text-sm font-semibold focus:outline-none focus:border-black transition-colors"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Tugash vaqti</label>
                        <input
                            type="datetime-local"
                            value={settings.end_time}
                            onChange={e => setSettings(p => ({ ...p, end_time: e.target.value }))}
                            className="w-full px-5 py-3 rounded-2xl border-2 border-gray-100 bg-white text-sm font-semibold focus:outline-none focus:border-black transition-colors"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {field("Chegirma foizi (%)", "discount_percent", "number")}
                    <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Fon rangi</label>
                        <div className="flex gap-3 items-center">
                            <input
                                type="color"
                                value={settings.bg_color}
                                onChange={e => setSettings(p => ({ ...p, bg_color: e.target.value }))}
                                className="w-12 h-12 rounded-xl border-2 border-gray-100 cursor-pointer"
                            />
                            <input
                                type="text"
                                value={settings.bg_color}
                                onChange={e => setSettings(p => ({ ...p, bg_color: e.target.value }))}
                                className="flex-1 px-5 py-3 rounded-2xl border-2 border-gray-100 bg-white text-sm font-semibold focus:outline-none focus:border-black transition-colors font-mono"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Target Products */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 space-y-6">
                <div className="font-black text-lg tracking-tight mb-2">Qaysi mahsulotlarga ta'sir qiladi?</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { id: "all", label: "Barchasi" },
                        { id: "category", label: "Kategoriyalar" },
                        { id: "brand", label: "Brendlar" },
                        { id: "manual", label: "Mahsulotlar (Qo'lda)" }
                    ].map(t => (
                        <button key={t.id}
                            onClick={() => {
                                setSettings(p => ({ ...p, target_type: t.id as any, target_ids: [] }));
                                setSearchQuery("");
                            }}
                            className={`py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border-2 ${
                                settings.target_type === t.id ? "bg-black text-white border-black" : "bg-white text-gray-400 border-gray-100 hover:border-gray-300"
                            }`}>
                            {t.label}
                        </button>
                    ))}
                </div>

                {settings.target_type !== "all" && (
                    <div className="space-y-4 pt-4 border-t border-gray-100 mt-4">
                        <div className="relative">
                            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Qidirish va qo'shish..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl py-4 pl-14 pr-4 text-sm font-bold outline-none" />
                            {searchQuery.trim() && filteredOptions.length > 0 && (
                                <div className="absolute z-20 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                                    {filteredOptions.map(o => (
                                        <button key={o.id}
                                            onClick={() => {
                                                if (!settings.target_ids.includes(o.id)) {
                                                    setSettings(p => ({ ...p, target_ids: [...p.target_ids, o.id] }));
                                                }
                                                setSearchQuery("");
                                            }}
                                            className="w-full text-left px-5 py-3 text-sm font-bold hover:bg-gray-50 transition-colors line-clamp-1">
                                            {o.name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Selected targets */}
                        <div className="flex flex-wrap gap-2">
                            {settings.target_ids.map(id => (
                                <span key={id} className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-xl text-xs font-black">
                                    {getName(id) || id}
                                    <button onClick={() => setSettings(p => ({ ...p, target_ids: p.target_ids.filter(x => x !== id) }))} className="text-gray-400 hover:text-red-500">
                                        <X size={14} />
                                    </button>
                                </span>
                            ))}
                            {settings.target_ids.length === 0 && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 italic">Hech narsa tanlanmagan</span>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Matnlar */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100 space-y-6">
                <div className="font-black text-lg tracking-tight mb-2">Banner matnlari</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {field("Sarlavha (UZ)", "label_uz", "text", "Maxsus taklif!")}
                    {field("Sarlavha (RU)", "label_ru", "text", "Специальное предложение!")}
                    {field("Faol matn (UZ)", "text_uz", "text", "Chegirma tugashiga")}
                    {field("Faol matn (RU)", "text_ru", "text", "До конца скидки")}
                </div>
                {field("Havola (ixtiyoriy) - Mahsulotlar sahifasiga yo'naltirish mumkin", "link", "url", "Masalan: /uz/catalog?promo=true")}
            </div>

            {/* Live Preview */}
            <div className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-6">
                    <div className="font-black text-lg tracking-tight">Ko'rinish</div>
                    <div className="flex gap-2">
                        {(["uz", "ru"] as const).map(l => (
                            <button
                                key={l}
                                onClick={() => setPreviewLang(l)}
                                className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest transition-all ${previewLang === l ? "bg-black text-white" : "bg-gray-100 text-gray-400"}`}
                            >
                                {l.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
                <LivePreview settings={settings} language={previewLang} />
            </div>

            {/* Save */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-3 px-10 py-5 bg-black text-white rounded-[24px] font-black uppercase tracking-widest text-[11px] hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Saqlash
            </button>
        </div>
    );
}
