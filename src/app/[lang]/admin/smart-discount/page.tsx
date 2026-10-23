"use client";

import { useState, useEffect, useMemo } from "react";
import {
    Loader2, ToggleLeft, ToggleRight, Save, History,
    Search, X, Ban, Settings2, UserPlus, Trash2, Infinity as InfinityIcon, Bot, Hand
} from "lucide-react";
import { adminFrom } from "@/lib/admin-query";
import { adminApi } from "@/lib/admin-api";

type Config = {
    enabled: boolean;
    min_percent: number;
    max_percent: number;
    intent_threshold: number;
    offer_ttl_hours: number;
    cooldown_hours: number;
    max_active_offers_per_user: number;
    excluded_product_ids: string[];
    excluded_category_ids: string[];
};

type Offer = {
    id: string;
    user_identifier: string;
    product_id: string;
    product_name: string;
    percent: number;
    intent_score: number;
    signals: any;
    status: string;
    source?: string;
    created_at: string;
    expires_at: string | null;
};

type Usr = { phone: string; name?: string };

const STATUS_STYLE: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-600",
    redeemed: "bg-blue-50 text-blue-600",
    expired: "bg-gray-100 text-gray-400",
    revoked: "bg-red-50 text-red-500",
};
const STATUS_UZ: Record<string, string> = {
    active: "Aktiv", redeemed: "Ishlatilgan", expired: "Muddati o'tgan", revoked: "Bekor qilingan",
};

export default function AdminSmartDiscountPage() {
    const [config, setConfig] = useState<Config | null>(null);
    const [offers, setOffers] = useState<Offer[]>([]);
    const [stats, setStats] = useState<any>({});
    const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
    const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
    const [users, setUsers] = useState<Usr[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [prodSearch, setProdSearch] = useState("");

    // Qo'lda chegirma formasi
    const [mUser, setMUser] = useState<Usr | null>(null);
    const [mUserSearch, setMUserSearch] = useState("");
    const [mProduct, setMProduct] = useState<{ id: string; name: string } | null>(null);
    const [mProdSearch, setMProdSearch] = useState("");
    const [mPercent, setMPercent] = useState(10);
    const [mPermanent, setMPermanent] = useState(false);
    const [mExpires, setMExpires] = useState("");
    const [mCreating, setMCreating] = useState(false);

    useEffect(() => { fetchAll(); }, []);

    // Mahsulot qidirilganda bazadan tezkor qidirish (initial blocking yuklash o'rniga)
    useEffect(() => {
        const term = (prodSearch || mProdSearch).trim();
        if (!term) return;

        const timer = setTimeout(async () => {
            try {
                const { data } = await adminFrom("products")
                    .select("id, name")
                    .eq("is_deleted", false)
                    .ilike("name", `%${term}%`)
                    .limit(20);
                if (data) {
                    setProducts(prev => {
                        const map = new Map(prev.map(p => [p.id, p]));
                        data.forEach(p => map.set(p.id, p));
                        return Array.from(map.values());
                    });
                }
            } catch (err) {
                console.error("Smart discount search error:", err);
            }
        }, 250);

        return () => clearTimeout(timer);
    }, [prodSearch, mProdSearch]);

    const fetchAll = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/smart-discount");
            const json = await res.json();
            if (json.success) {
                const c = json.config;
                setConfig({
                    enabled: !!c.enabled,
                    min_percent: Number(c.min_percent),
                    max_percent: Number(c.max_percent),
                    intent_threshold: Number(c.intent_threshold),
                    offer_ttl_hours: Number(c.offer_ttl_hours),
                    cooldown_hours: Number(c.cooldown_hours),
                    max_active_offers_per_user: Number(c.max_active_offers_per_user),
                    excluded_product_ids: c.excluded_product_ids || [],
                    excluded_category_ids: c.excluded_category_ids || [],
                });
                setOffers(json.offers || []);
                setStats(json.stats || {});
                setUsers(json.users || []);
            }
            const cats = await adminApi.categories.getAll();
            if (cats) {
                setCategories(cats.map((c: any) => ({ id: String(c.id), name: c.name })));
            }

            // Faqat allaqachon istisno qilingan mahsulotlarning nomlarini olib kelamiz
            const excluded = json?.config?.excluded_product_ids || [];
            if (Array.isArray(excluded) && excluded.length > 0) {
                const { data: prods } = await adminFrom("products")
                    .select("id, name")
                    .in("id", excluded);
                if (prods) setProducts(prods);
            }
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const save = async () => {
        if (!config) return;
        setSaving(true);
        try {
            const res = await fetch("/api/admin/smart-discount", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "save_config", config }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            alert("Saqlandi!");
            fetchAll();
        } catch (e: any) { alert("Xatolik: " + e.message); } finally { setSaving(false); }
    };

    const revoke = async (offerId: string) => {
        if (!confirm("Bu taklifni bekor qilasizmi?")) return;
        const res = await fetch("/api/admin/smart-discount", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "revoke_offer", offerId }),
        });
        const json = await res.json();
        if (json.success) fetchAll(); else alert("Xatolik: " + json.error);
    };

    const createManualOffer = async () => {
        if (!mUser || !mProduct) { alert("Mijoz va mahsulotni tanlang"); return; }
        if (!mPermanent && !mExpires) { alert("Tugash sanasini tanlang yoki 'doimiy'ni yoqing"); return; }
        setMCreating(true);
        try {
            const res = await fetch("/api/admin/smart-discount", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "create_manual_offer",
                    user_identifier: mUser.phone,
                    product_id: mProduct.id,
                    percent: mPercent,
                    permanent: mPermanent,
                    expires_at: mPermanent ? null : new Date(mExpires).toISOString(),
                }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            alert("Shaxsiy chegirma berildi! Mijozga ko'rinadi.");
            setMUser(null); setMProduct(null); setMUserSearch(""); setMProdSearch(""); setMExpires("");
            fetchAll();
        } catch (e: any) { alert("Xatolik: " + e.message); } finally { setMCreating(false); }
    };

    const deleteOffer = async (offerId: string) => {
        if (!confirm("Bu chegirmani butunlay o'chirasizmi?")) return;
        const res = await fetch("/api/admin/smart-discount", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete_offer", offerId }),
        });
        const json = await res.json();
        if (json.success) fetchAll(); else alert("Xatolik: " + json.error);
    };

    const prodNameMap = useMemo(() => Object.fromEntries(products.map(p => [p.id, p.name])), [products]);
    const catNameMap = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c.name])), [categories]);
    const searchResults = useMemo(() => {
        if (!prodSearch.trim() || !config) return [];
        const q = prodSearch.toLowerCase();
        return products
            .filter(p => p.name?.toLowerCase().includes(q) && !config.excluded_product_ids.includes(p.id))
            .slice(0, 6);
    }, [prodSearch, products, config]);

    const mUserResults = useMemo(() => {
        if (!mUserSearch.trim()) return [];
        const q = mUserSearch.toLowerCase();
        return users.filter(u => (u.phone || "").toLowerCase().includes(q) || (u.name || "").toLowerCase().includes(q)).slice(0, 6);
    }, [mUserSearch, users]);
    const mProdResults = useMemo(() => {
        if (!mProdSearch.trim()) return [];
        const q = mProdSearch.toLowerCase();
        return products.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 6);
    }, [mProdSearch, products]);
    const manualOffers = useMemo(() => offers.filter(o => o.source === "manual"), [offers]);

    if (loading || !config) return (
        <div className="p-10 flex items-center justify-center min-h-[400px]"><Loader2 className="animate-spin" size={40} /></div>
    );

    const toggleCat = (id: string) => {
        const has = config.excluded_category_ids.includes(id);
        setConfig({ ...config, excluded_category_ids: has ? config.excluded_category_ids.filter(x => x !== id) : [...config.excluded_category_ids, id] });
    };

    return (
        <div className="p-4 md:p-10 space-y-12 max-w-[1200px] mx-auto">
            <div>
                <h1 className="text-2xl md:text-5xl font-black italic tracking-tighter uppercase mb-1 md:mb-4 text-indigo-600">SMART CHEGIRMA</h1>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Sotib olishga yaqinlashgan mijozga shaxsiy, vaqtli bonus taklif — to'liq nazorat va audit</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: "Jami", value: stats.total, color: "text-gray-900" },
                    { label: "Aktiv", value: stats.active, color: "text-emerald-600" },
                    { label: "Ishlatilgan", value: stats.redeemed, color: "text-blue-600" },
                    { label: "Muddati o'tgan", value: stats.expired, color: "text-gray-400" },
                    { label: "Bekor", value: stats.revoked, color: "text-red-500" },
                ].map(s => (
                    <div key={s.label} className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100 text-center">
                        <p className={`text-3xl font-black italic ${s.color}`}>{s.value ?? 0}</p>
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{s.label}</p>
                    </div>
                ))}
            </div>

            {/* Global config */}
            <div className="bg-white p-10 rounded-[50px] shadow-2xl border-2 border-gray-50 space-y-10">
                <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="w-16 h-16 bg-indigo-50 text-indigo-500 rounded-[28px] flex items-center justify-center shrink-0"><Settings2 className="w-8 h-8" /></div>
                        <div>
                            <h3 className="text-2xl font-black italic tracking-tighter uppercase">Tizim Sozlamasi</h3>
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Smart chegirma {config.enabled ? "yoqilgan" : "o'chirilgan"}</p>
                        </div>
                    </div>
                    <button onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                        className={`p-4 rounded-2xl transition-all ${config.enabled ? "bg-emerald-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                        {config.enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                    </button>
                </div>

                {/* Foiz oralig'i */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Field label="Eng kichik foiz (%)" hint="AI shu qiymatdan past bermaydi">
                        <NumInput value={config.min_percent} onChange={v => setConfig({ ...config, min_percent: v })} suffix="%" />
                    </Field>
                    <Field label="Eng katta foiz (%)" hint="Himoya chegarasi — AI shundan oshmaydi">
                        <NumInput value={config.max_percent} onChange={v => setConfig({ ...config, max_percent: v })} suffix="%" />
                    </Field>
                </div>

                <Field label={`Niyat chegarasi: ${config.intent_threshold.toFixed(2)}`} hint="0..1 — taklif berish uchun minimal sotib olish niyati bali. Yuqori = kamroq, lekin aniqroq takliflar">
                    <input type="range" min={0} max={1} step={0.01} value={config.intent_threshold}
                        onChange={e => setConfig({ ...config, intent_threshold: Number(e.target.value) })}
                        className="w-full accent-indigo-600" />
                    <div className="flex justify-between text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">
                        <span>Ko'p taklif (0)</span><span>Kam, aniq taklif (1)</span>
                    </div>
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <Field label="Amal qilish (soat)" hint="Taklif necha soat amal qiladi">
                        <NumInput value={config.offer_ttl_hours} onChange={v => setConfig({ ...config, offer_ttl_hours: v })} suffix="soat" />
                    </Field>
                    <Field label="Qayta taklif oralig'i (soat)" hint="Bitta mahsulotga qayta taklif berishdan oldin kutish">
                        <NumInput value={config.cooldown_hours} onChange={v => setConfig({ ...config, cooldown_hours: v })} suffix="soat" />
                    </Field>
                    <Field label="Bir userga max aktiv taklif" hint="Bir vaqtda nechta aktiv taklif bo'lishi mumkin">
                        <NumInput value={config.max_active_offers_per_user} onChange={v => setConfig({ ...config, max_active_offers_per_user: v })} />
                    </Field>
                </div>

                <button onClick={save} disabled={saving}
                    className="w-full bg-black text-white py-6 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                    {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} SOZLAMANI SAQLASH
                </button>
            </div>

            {/* Istisnolar */}
            <div className="bg-white p-10 rounded-[50px] shadow-sm border border-gray-100 space-y-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-red-50 text-red-500 rounded-[24px] flex items-center justify-center"><Ban className="w-7 h-7" /></div>
                    <div>
                        <h3 className="text-2xl font-black italic tracking-tighter uppercase">Istisnolar</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Bu mahsulot/kategoriyalarga chegirma berilmaydi</p>
                    </div>
                </div>

                {/* Mahsulot istisnolari */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Taqiqlangan mahsulotlar</label>
                    <div className="relative">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                        <input value={prodSearch} onChange={e => setProdSearch(e.target.value)} placeholder="Mahsulot qidirish..."
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl py-4 pl-14 pr-4 text-sm font-bold outline-none" />
                        {searchResults.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                                {searchResults.map(p => (
                                    <button key={p.id} onClick={() => { setConfig({ ...config, excluded_product_ids: [...config.excluded_product_ids, p.id] }); setProdSearch(""); }}
                                        className="w-full text-left px-5 py-3 text-sm font-bold hover:bg-indigo-50 transition-colors line-clamp-1">{p.name}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                        {config.excluded_product_ids.length === 0 && <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest italic">Bo'sh</span>}
                        {config.excluded_product_ids.map(id => (
                            <span key={id} className="inline-flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2 rounded-full text-[11px] font-black">
                                {prodNameMap[id] || id}
                                <button onClick={() => setConfig({ ...config, excluded_product_ids: config.excluded_product_ids.filter(x => x !== id) })}><X size={14} /></button>
                            </span>
                        ))}
                    </div>
                </div>

                {/* Kategoriya istisnolari */}
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Taqiqlangan kategoriyalar</label>
                    <div className="flex flex-wrap gap-2">
                        {categories.map(c => {
                            const on = config.excluded_category_ids.includes(c.id);
                            return (
                                <button key={c.id} onClick={() => toggleCat(c.id)}
                                    className={`px-4 py-2 rounded-full text-[11px] font-black transition-all ${on ? "bg-red-500 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                                    {c.name}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <button onClick={save} disabled={saving}
                    className="w-full bg-gray-900 text-white py-4 rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50">
                    ISTISNOLARNI SAQLASH
                </button>
            </div>

            {/* Qo'lda chegirma — aniq mijozga, aniq mahsulotga */}
            <div className="bg-white p-10 rounded-[50px] shadow-sm border border-gray-100 space-y-8">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-[24px] flex items-center justify-center"><Hand className="w-7 h-7" /></div>
                    <div>
                        <h3 className="text-2xl font-black italic tracking-tighter uppercase">Qo'lda chegirma</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Aniq mijozga, aniq mahsulotga shaxsiy chegirma — doimiy yoki vaqtli. Mijozga ko'rinadi.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Mijoz tanlash */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Mijoz</label>
                        {mUser ? (
                            <div className="flex items-center justify-between bg-indigo-50 rounded-2xl px-5 py-4">
                                <span className="font-black text-sm">{mUser.name || mUser.phone} <span className="text-gray-400 font-bold">· {mUser.phone}</span></span>
                                <button onClick={() => setMUser(null)}><X size={18} /></button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                <input value={mUserSearch} onChange={e => setMUserSearch(e.target.value)} placeholder="Telefon yoki ism..."
                                    className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl py-4 pl-14 pr-4 text-sm font-bold outline-none" />
                                {mUserResults.length > 0 && (
                                    <div className="absolute z-20 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                                        {mUserResults.map(u => (
                                            <button key={u.phone} onClick={() => { setMUser(u); setMUserSearch(""); }}
                                                className="w-full text-left px-5 py-3 text-sm font-bold hover:bg-indigo-50 transition-colors">
                                                {u.name || "—"} <span className="text-gray-400">· {u.phone}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Mahsulot tanlash */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-2">Mahsulot</label>
                        {mProduct ? (
                            <div className="flex items-center justify-between bg-indigo-50 rounded-2xl px-5 py-4">
                                <span className="font-black text-sm line-clamp-1">{mProduct.name}</span>
                                <button onClick={() => setMProduct(null)}><X size={18} /></button>
                            </div>
                        ) : (
                            <div className="relative">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                                <input value={mProdSearch} onChange={e => setMProdSearch(e.target.value)} placeholder="Mahsulot qidirish..."
                                    className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl py-4 pl-14 pr-4 text-sm font-bold outline-none" />
                                {mProdResults.length > 0 && (
                                    <div className="absolute z-20 left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                                        {mProdResults.map(p => (
                                            <button key={p.id} onClick={() => { setMProduct(p); setMProdSearch(""); }}
                                                className="w-full text-left px-5 py-3 text-sm font-bold hover:bg-indigo-50 transition-colors line-clamp-1">{p.name}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    <Field label="Chegirma foizi (%)">
                        <NumInput value={mPercent} onChange={setMPercent} suffix="%" />
                    </Field>
                    <Field label="Muddat">
                        <button onClick={() => setMPermanent(!mPermanent)}
                            className={`w-full flex items-center justify-center gap-2 rounded-2xl p-4 font-black text-xs uppercase tracking-widest transition-all ${mPermanent ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-500"}`}>
                            <InfinityIcon size={16} /> {mPermanent ? "Doimiy" : "Vaqtli"}
                        </button>
                    </Field>
                    <Field label="Tugash sanasi">
                        <input type="datetime-local" disabled={mPermanent} value={mExpires} onChange={e => setMExpires(e.target.value)}
                            className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl p-4 text-sm font-bold outline-none disabled:opacity-30" />
                    </Field>
                </div>

                <button onClick={createManualOffer} disabled={mCreating}
                    className="w-full bg-indigo-600 text-white py-5 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:scale-[1.01] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-3">
                    {mCreating ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />} SHAXSIY CHEGIRMA BERISH
                </button>

                {/* Mavjud qo'lda chegirmalar */}
                {manualOffers.length > 0 && (
                    <div className="space-y-2 pt-4 border-t border-gray-100">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Berilgan qo'lda chegirmalar ({manualOffers.length})</p>
                        {manualOffers.map(o => (
                            <div key={o.id} className="flex items-center justify-between gap-4 bg-gray-50 rounded-2xl px-5 py-3">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="font-black italic text-indigo-600 shrink-0">{o.percent}%</span>
                                    <span className="font-bold text-sm text-gray-700 shrink-0">{o.user_identifier}</span>
                                    <span className="text-gray-400">→</span>
                                    <span className="font-bold text-sm line-clamp-1">{o.product_name}</span>
                                    <span className="shrink-0 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full bg-white text-gray-500">
                                        {o.expires_at ? new Date(o.expires_at).toLocaleDateString("uz") + " gacha" : "Doimiy"}
                                    </span>
                                    <span className={`shrink-0 px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${STATUS_STYLE[o.status]}`}>{STATUS_UZ[o.status] || o.status}</span>
                                </div>
                                <button onClick={() => deleteOffer(o.id)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={16} /></button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Audit */}
            <div className="bg-white p-6 md:p-10 rounded-[50px] shadow-sm border border-gray-100 space-y-6">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-gray-100 text-gray-700 rounded-[24px] flex items-center justify-center"><History className="w-7 h-7" /></div>
                    <div>
                        <h3 className="text-2xl font-black italic tracking-tighter uppercase">Audit — qarorlar tarixi</h3>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Kim, qaysi mahsulot, qancha %, qaysi signal, qachon</p>
                    </div>
                </div>

                {offers.length === 0 ? (
                    <div className="py-16 text-center bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200">
                        <p className="text-sm font-black text-gray-300 uppercase tracking-widest italic">Hozircha taklif berilmagan</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-left border-b border-gray-100">
                                    <th className="py-3 pr-4">Mijoz</th>
                                    <th className="py-3 pr-4">Mahsulot</th>
                                    <th className="py-3 pr-4">Tur</th>
                                    <th className="py-3 pr-4">%</th>
                                    <th className="py-3 pr-4">Niyat</th>
                                    <th className="py-3 pr-4">Signal</th>
                                    <th className="py-3 pr-4">Holat</th>
                                    <th className="py-3 pr-4">Sana</th>
                                    <th className="py-3"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {offers.map(o => (
                                    <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                                        <td className="py-3 pr-4 font-bold text-gray-700">{o.user_identifier}</td>
                                        <td className="py-3 pr-4 font-bold line-clamp-1 max-w-[180px]">{o.product_name}</td>
                                        <td className="py-3 pr-4">
                                            {o.source === "manual"
                                                ? <span className="inline-flex items-center gap-1 text-[10px] font-black text-indigo-600"><Hand size={12} /> Qo'lda</span>
                                                : <span className="inline-flex items-center gap-1 text-[10px] font-black text-gray-500"><Bot size={12} /> AI</span>}
                                        </td>
                                        <td className="py-3 pr-4 font-black italic text-indigo-600">{o.percent}%</td>
                                        <td className="py-3 pr-4 font-bold text-gray-500">{Number(o.intent_score).toFixed(2)}</td>
                                        <td className="py-3 pr-4 text-[11px] font-bold text-gray-500">{o.signals?.dominant || "—"}</td>
                                        <td className="py-3 pr-4">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${STATUS_STYLE[o.status] || "bg-gray-100 text-gray-400"}`}>
                                                {STATUS_UZ[o.status] || o.status}
                                            </span>
                                        </td>
                                        <td className="py-3 pr-4 text-[11px] font-bold text-gray-400">{new Date(o.created_at).toLocaleDateString("uz")}</td>
                                        <td className="py-3">
                                            {o.status === "active" && (
                                                <button onClick={() => revoke(o.id)} className="text-[9px] font-black text-red-500 uppercase tracking-widest hover:underline">Bekor</button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-700 uppercase tracking-widest ml-1">{label}</label>
            {children}
            {hint && <p className="text-[9px] font-bold text-gray-400 tracking-wide ml-1 leading-relaxed">{hint}</p>}
        </div>
    );
}

function NumInput({ value, onChange, suffix }: { value: number; onChange: (v: number) => void; suffix?: string }) {
    return (
        <div className="relative">
            <input type="number" value={value} onChange={e => onChange(Number(e.target.value))}
                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl p-4 text-lg font-black italic outline-none transition-all" />
            {suffix && <span className="absolute right-4 top-1/2 -translate-y-1/2 font-black italic text-indigo-500 text-xs">{suffix}</span>}
        </div>
    );
}
