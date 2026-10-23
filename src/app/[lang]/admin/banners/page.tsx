"use client";

import { useState, useEffect } from "react";
import { adminSelect } from "@/lib/admin-api";
import { Plus, Trash2, Edit2, Save, X, Code2, Loader2, Copy, Sparkles, BookOpen, Check } from "lucide-react";

interface Banner {
    id: string;
    title_uz: string;
    title_ru: string;
    html_uz: string;
    html_ru: string;
    active: boolean;
    order: number;
    tabName_uz?: string;
    tabName_ru?: string;
}

// Responsive HTML banner uchun boshlang'ich andoza (clamp() bilan har qurilmaga moslashadi)
const STARTER_TEMPLATE = `<a href="/uz/catalog" style="display:flex;width:100%;height:100%;box-sizing:border-box;text-decoration:none;align-items:center;justify-content:space-between;gap:16px;padding:clamp(16px,4vw,48px);background:linear-gradient(135deg,#1F5A30,#2D6E3E);color:#fff;">
  <div style="max-width:65%;">
    <div style="font-size:clamp(10px,1.4vw,13px);font-weight:700;letter-spacing:1px;opacity:.8;">YANGI KOLLEKSIYA</div>
    <h2 style="margin:8px 0 14px;font-size:clamp(20px,4vw,44px);font-weight:800;line-height:1.05;">Sarlavhani shu yerga yozing</h2>
    <span style="display:inline-block;background:#fff;color:#1F5A30;padding:clamp(8px,1.2vw,14px) clamp(16px,2vw,28px);border-radius:100px;font-weight:700;font-size:clamp(12px,1.4vw,15px);">Hozir xarid qiling →</span>
  </div>
</a>`;

// AIga (ChatGPT/Claude) beriladigan to'liq prompt. "Nusxalash" tugmasi shuni clipboardga oladi.
const AI_PROMPT = `Sen Velari onlayn-do'koni uchun bosh sahifa bannerining HTML kodini yozasan.
Banner dangerouslySetInnerHTML orqali render qilinadi va konteynerni to'ldiradi.
Faqat tayyor HTML kodini qaytar — markdown (\`\`\`), izoh yoki tushuntirishsiz.

KONTEYNER:
- Kengligi o'zgaruvchan: telefon ~360px, planshet ~700px, desktop ~1100px+.
- Balandligi ham o'zgaruvchan (desktopda ~450px, mobilda 16:10). Qat'iy piksel o'lcham ISHLATMA.
- Burchaklar avtomatik yumaloqlanadi va overflow:hidden qo'llanadi.

MAJBURIY QOIDALAR:
1. Root element: width:100%; height:100%; box-sizing:border-box.
2. Shrift/padding/bo'shliqlar clamp(min,vw,max) bilan. Masalan: font-size:clamp(20px,4vw,44px).
3. Dekor uchun position:absolute mumkin — root elementga position:relative ber.
4. 100vw/100vh ISHLATMA (% ishlat). position:fixed ISHLATMA.
5. Tashqi CSS/JS fayl ulama — stil inline yoki <style> blok ichida.

HAVOLA ULASH (butun bannerni <a href="..."> ga o'ra):
- Bitta mahsulot:      /uz/products/<MAHSULOT_ID>
- Kategoriya:          /uz/?category=<KATEGORIYA_ID>
- Brend:               /uz/?brand=<BREND_ID>
- To'liq katalog:      /uz/catalog
(RU banner uchun /ru/... ishlat. https:// yozma, /uz/ dan boshla.)

ANIMATSIYA (tavsiya etiladi):
- CSS animatsiya ishlaydi: @keyframes, transition, transform, animation.
- @keyframes va class nomlarini UNIKAL qil (masalan b1Float, promoShimmer) — global to'qnashuvni oldini olish.
- @keyframes ni <style> blok ichida yoz.

TAQIQLANGAN:
- <script>, onclick va boshqa inline JS — ishlamaydi.
- position:fixed, 100vw, 100vh, tashqi <link>/<script src>.

Endi men xohlagan bannerni tasvirlab beraman, sen yuqoridagi qoidalarga rioya qilib HTML qaytar.`;

export default function AdminBanners() {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [globalHeight, setGlobalHeight] = useState(450);
    const [globalRadius, setGlobalRadius] = useState(40);

    const [newBanner, setNewBanner] = useState({
        title_uz: "",
        title_ru: "",
        html_uz: "",
        html_ru: "",
        active: true,
        order: 0,
        tabName_uz: "",
        tabName_ru: ""
    });

    const [isGlobalModalOpen, setIsGlobalModalOpen] = useState(false);
    const [globalBanners, setGlobalBanners] = useState<Banner[]>([]);
    const [isGlobalSaving, setIsGlobalSaving] = useState(false);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const copyPrompt = async () => {
        try {
            await navigator.clipboard.writeText(AI_PROMPT);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            alert("Nusxalashda xatolik — qo'lda belgilab nusxalang");
        }
    };

    const fetchData = async () => {
        try {
            const [bannersData, settingsRes] = await Promise.all([
                adminSelect<any[]>("banners", { orderBy: { column: "order_index", ascending: true } }),
                fetch("/api/admin/crud", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        table: "settings",
                        action: "select",
                        matchConfig: { column: "id", value: "banners" },
                        payload: { columns: "data", single: true },
                    }),
                }).then(r => r.json()).catch(() => null)
            ]);

            setBanners((bannersData || []).map(b => ({
                id: b.id,
                title_uz: b.title_uz || "",
                title_ru: b.title_ru || "",
                html_uz: b.html_uz || "",
                html_ru: b.html_ru || "",
                active: b.active,
                order: b.order_index,
                tabName_uz: b.tab_name_uz,
                tabName_ru: b.tab_name_ru
            })) as Banner[]);

            const settingsVal = settingsRes?.data?.data;
            if (settingsVal) {
                setGlobalHeight(settingsVal.desktopHeight || 450);
                setGlobalRadius(settingsVal.borderRadius || 40);
            }
        } catch (error) {
            console.error("Fetch banners data error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const resetForm = () => {
        setNewBanner({
            title_uz: "",
            title_ru: "",
            html_uz: "",
            html_ru: "",
            active: true,
            order: 0,
            tabName_uz: "",
            tabName_ru: ""
        });
        setEditId(null);
        setIsAdding(false);
    };

    const openEditModal = (banner: Banner) => {
        setNewBanner({
            title_uz: banner.title_uz || "",
            title_ru: banner.title_ru || "",
            html_uz: banner.html_uz || "",
            html_ru: banner.html_ru || "",
            active: banner.active,
            order: banner.order,
            tabName_uz: banner.tabName_uz || "",
            tabName_ru: banner.tabName_ru || ""
        });
        setEditId(banner.id);
        setIsAdding(true);
    };

    const handleSave = async () => {
        if (!newBanner.html_uz.trim() && !newBanner.html_ru.trim()) {
            alert("Iltimos, kamida bitta til uchun HTML kod kiriting");
            return;
        }
        try {
            const payload = {
                title_uz: newBanner.title_uz,
                title_ru: newBanner.title_ru,
                html_uz: newBanner.html_uz,
                html_ru: newBanner.html_ru,
                active: newBanner.active,
                order_index: editId ? newBanner.order : banners.length,
                tab_name_uz: newBanner.tabName_uz,
                tab_name_ru: newBanner.tabName_ru
            };

            if (editId) {
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'banners',
                        action: 'update',
                        payload,
                        matchConfig: { column: 'id', value: editId }
                    })
                });
                if (!res.ok) throw new Error("Bannerni yangilashda xatolik");
            } else {
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'banners',
                        action: 'insert',
                        payload: [{ ...payload, id: crypto.randomUUID() }]
                    })
                });
                if (!res.ok) throw new Error("Banner yaratishda xatolik");
            }
            resetForm();
            fetchData();
        } catch (e) {
            console.error(e);
            alert("Saqlashda xatolik yuz berdi");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("O'chirilsinmi?")) return;
        try {
            const res = await fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'banners',
                    action: 'delete',
                    matchConfig: { column: 'id', value: id }
                })
            });
            if (!res.ok) throw new Error("Bannerni o'chirishda xatolik");
            fetchData();
        } catch (e) {
            console.error(e);
        }
    };

    const openGlobalModal = () => {
        setGlobalBanners([...banners]);
        setIsGlobalModalOpen(true);
    };

    const handleGlobalSave = async () => {
        setIsGlobalSaving(true);
        try {
            const bannerUpdates = globalBanners.map(gb => {
                return fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'banners',
                        action: 'update',
                        payload: {
                            order_index: Number(gb.order),
                            tab_name_uz: gb.tabName_uz || "",
                            tab_name_ru: gb.tabName_ru || ""
                        },
                        matchConfig: { column: 'id', value: gb.id }
                    })
                });
            });

            const settingsUpdate = fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'settings',
                    action: 'upsert',
                    payload: {
                        id: "banners",
                        data: {
                            desktopHeight: globalHeight,
                            borderRadius: globalRadius
                        }
                    }
                })
            });

            await Promise.all([...bannerUpdates, settingsUpdate]);
            setIsGlobalModalOpen(false);
            fetchData();
        } catch (e) {
            console.error(e);
            alert("Xatolik!");
        } finally {
            setIsGlobalSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <Loader2 className="animate-spin text-black" size={48} />
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic">Bannerlar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">HTML asosiy sahifa reklamalari</p>
                </div>
                <div className="flex gap-2 md:gap-4">
                    <button
                        onClick={() => setIsGuideOpen(true)}
                        className="bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white px-4 md:px-8 py-3 md:py-4 rounded-[20px] md:rounded-[24px] font-black text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2 transition-all border border-amber-100"
                    >
                        <BookOpen size={16} /> <span className="hidden sm:inline">Qoidalar (AI)</span>
                    </button>
                    <button
                        onClick={openGlobalModal}
                        className="bg-gray-100 text-gray-500 hover:bg-black hover:text-white px-4 md:px-8 py-3 md:py-4 rounded-[20px] md:rounded-[24px] font-black text-[10px] md:text-xs uppercase tracking-widest flex items-center gap-2 transition-all"
                    >
                        <span className="hidden sm:inline">Umumiy sozlamalar</span><span className="sm:hidden">Sozlama</span>
                    </button>
                    <button
                        onClick={() => { resetForm(); setIsAdding(true); }}
                        className="bg-black text-white px-8 py-4 rounded-[24px] font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-all"
                    >
                        <Plus size={18} /> Yangi Banner
                    </button>
                </div>
            </div>

            {/* Guide / AI Prompt Modal */}
            {isGuideOpen && (
                <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 text-black">
                    <div className="bg-white rounded-[40px] p-10 w-full max-w-3xl shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto no-scrollbar">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase flex items-center gap-3">
                                <BookOpen size={28} className="text-amber-500" /> Qoidalar
                            </h2>
                            <button onClick={() => setIsGuideOpen(false)} className="p-3 bg-gray-50 rounded-2xl hover:bg-black hover:text-white transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <p className="text-sm font-bold text-gray-500 leading-relaxed mb-6">
                            Banner HTML kodini AI (ChatGPT/Claude) yordamida yarating. Quyidagi promptni nusxalab AIga bering,
                            keyin qanday banner xohlaganingizni yozing — masalan: <span className="text-black italic">"Yashil gradient fon, suzuvchi doiralar, 'VGR trimmerlar' sarlavhasi, katalogga link"</span>.
                            AI qaytargan HTML ni "Yangi Banner" oynasidagi HTML maydoniga joylashtiring.
                        </p>

                        <div className="relative">
                            <button
                                onClick={copyPrompt}
                                className={`absolute top-4 right-4 flex items-center gap-2 px-4 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all z-10 ${copied ? "bg-green-500 text-white" : "bg-white text-black shadow-lg hover:bg-black hover:text-white"}`}
                            >
                                {copied ? <><Check size={14} /> Nusxalandi</> : <><Copy size={14} /> Nusxalash</>}
                            </button>
                            <pre className="bg-[#0d1117] text-[#c9d1d9] rounded-2xl p-6 pt-16 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words max-h-[55vh] overflow-y-auto">
{AI_PROMPT}
                            </pre>
                        </div>

                        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-bold">
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-gray-400 uppercase tracking-widest text-[9px] mb-1">Mahsulot havolasi</p>
                                <code className="text-black">/uz/products/&lt;ID&gt;</code>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-gray-400 uppercase tracking-widest text-[9px] mb-1">Kategoriya havolasi</p>
                                <code className="text-black">/uz/?category=&lt;ID&gt;</code>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-gray-400 uppercase tracking-widest text-[9px] mb-1">Brend havolasi</p>
                                <code className="text-black">/uz/?brand=&lt;ID&gt;</code>
                            </div>
                            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                <p className="text-gray-400 uppercase tracking-widest text-[9px] mb-1">To'liq katalog</p>
                                <code className="text-black">/uz/catalog</code>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Overlay */}
            {isAdding && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="bg-white rounded-[40px] p-10 w-full max-w-5xl shadow-2xl animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto no-scrollbar">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase">
                                {editId ? "Bannerni Tahrirlash" : "Yangi Banner"}
                            </h2>
                            <button onClick={resetForm} className="p-3 bg-gray-50 rounded-2xl hover:bg-black hover:text-white transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="space-y-8">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                {/* Uzbek HTML */}
                                <div className="space-y-4 p-6 bg-purple-50/30 rounded-[32px] border border-purple-100/50">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-[#7000FF]">Uzbek banner (HTML)</h4>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setNewBanner(p => ({ ...p, html_uz: STARTER_TEMPLATE }))}
                                                className="flex items-center gap-1.5 bg-[#7000FF] text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-80 transition-all"
                                                title="Andoza joylash"
                                            >
                                                <Sparkles size={12} /> Andoza
                                            </button>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={newBanner.title_uz}
                                        onChange={e => setNewBanner({ ...newBanner, title_uz: e.target.value })}
                                        className="w-full bg-white border-none rounded-2xl py-3 px-5 font-bold shadow-sm text-sm"
                                        placeholder="Ichki nom (UZ) — faqat admin uchun"
                                    />
                                    <textarea
                                        value={newBanner.html_uz}
                                        onChange={e => setNewBanner({ ...newBanner, html_uz: e.target.value })}
                                        className="w-full bg-[#0d1117] text-[#c9d1d9] border-none rounded-2xl py-4 px-5 font-mono text-xs shadow-sm h-56 resize-y leading-relaxed"
                                        placeholder="<a href='/uz/catalog' style='...'>...</a>"
                                        spellCheck={false}
                                    />
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-2">Jonli ko'rinish</p>
                                        <div className="rounded-2xl overflow-hidden border-4 border-white shadow-xl bg-gray-100" style={{ aspectRatio: "21/9" }}>
                                            <div className="w-full h-full relative overflow-hidden" dangerouslySetInnerHTML={{ __html: newBanner.html_uz }} />
                                        </div>
                                    </div>
                                </div>

                                {/* Russian HTML */}
                                <div className="space-y-4 p-6 bg-blue-50/30 rounded-[32px] border border-blue-100/50">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-blue-600">Russian banner (HTML)</h4>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setNewBanner(p => ({ ...p, html_ru: p.html_uz }))}
                                                className="flex items-center gap-1.5 bg-gray-200 text-gray-600 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-gray-300 transition-all"
                                                title="UZ dan nusxa olish"
                                            >
                                                <Copy size={12} /> UZ dan
                                            </button>
                                            <button
                                                onClick={() => setNewBanner(p => ({ ...p, html_ru: STARTER_TEMPLATE }))}
                                                className="flex items-center gap-1.5 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest hover:opacity-80 transition-all"
                                                title="Andoza joylash"
                                            >
                                                <Sparkles size={12} /> Andoza
                                            </button>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={newBanner.title_ru}
                                        onChange={e => setNewBanner({ ...newBanner, title_ru: e.target.value })}
                                        className="w-full bg-white border-none rounded-2xl py-3 px-5 font-bold shadow-sm text-sm"
                                        placeholder="Внутреннее имя (RU) — только для админа"
                                    />
                                    <textarea
                                        value={newBanner.html_ru}
                                        onChange={e => setNewBanner({ ...newBanner, html_ru: e.target.value })}
                                        className="w-full bg-[#0d1117] text-[#c9d1d9] border-none rounded-2xl py-4 px-5 font-mono text-xs shadow-sm h-56 resize-y leading-relaxed"
                                        placeholder="<a href='/ru/catalog' style='...'>...</a>"
                                        spellCheck={false}
                                    />
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 mb-2 ml-2">Жонли ko'rinish</p>
                                        <div className="rounded-2xl overflow-hidden border-4 border-white shadow-xl bg-gray-100" style={{ aspectRatio: "21/9" }}>
                                            <div className="w-full h-full relative overflow-hidden" dangerouslySetInnerHTML={{ __html: newBanner.html_ru }} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-5 bg-amber-50 rounded-2xl border border-amber-100">
                                <Code2 size={18} className="text-amber-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-[11px] font-bold text-amber-700 leading-relaxed">
                                        Maslahat: o'lcham har qurilmada moslashishi uchun <code className="bg-amber-100 px-1.5 py-0.5 rounded">clamp()</code> va foiz (%) ishlatib, kenglik/balandlikni <code className="bg-amber-100 px-1.5 py-0.5 rounded">100%</code> qiling. Link uchun <code className="bg-amber-100 px-1.5 py-0.5 rounded">&lt;a href="/uz/..."&gt;</code> dan foydalaning.
                                    </p>
                                    <button
                                        onClick={() => setIsGuideOpen(true)}
                                        className="mt-3 inline-flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-amber-600 transition-all"
                                    >
                                        <BookOpen size={12} /> To'liq qoidalar va AI prompt
                                    </button>
                                </div>
                            </div>

                            <label className="flex items-center gap-3 cursor-pointer select-none ml-2">
                                <input
                                    type="checkbox"
                                    checked={newBanner.active}
                                    onChange={e => setNewBanner({ ...newBanner, active: e.target.checked })}
                                    className="w-5 h-5 accent-black rounded"
                                />
                                <span className="text-xs font-black uppercase tracking-widest text-gray-500">Faol (saytda ko'rsatilsin)</span>
                            </label>

                            <button
                                onClick={handleSave}
                                className="w-full bg-black text-white py-6 rounded-[32px] font-black uppercase tracking-widest shadow-2xl hover:shadow-black/20 hover:-translate-y-1 active:scale-95 transition-all flex items-center justify-center gap-4"
                            >
                                <Save size={24} /> {editId ? "Yangilash" : "Saqlash"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Settings Modal */}
            {isGlobalModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 text-black">
                    <div className="bg-white rounded-[40px] p-10 w-full max-w-2xl shadow-2xl animate-in zoom-in duration-300">
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase">Umumiy sozlamalar</h2>
                            <button onClick={() => setIsGlobalModalOpen(false)} className="p-3 bg-gray-50 rounded-2xl">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="mb-10 p-8 bg-black text-white rounded-[32px] space-y-8">
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Desktop Banner Balandligi</label>
                                    <span className="text-xl font-black italic">{globalHeight}px</span>
                                </div>
                                <input
                                    type="range"
                                    min="100"
                                    max="800"
                                    value={globalHeight}
                                    onChange={(e) => setGlobalHeight(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-white"
                                />
                                <div className="flex justify-between text-[8px] font-black opacity-40 uppercase tracking-widest">
                                    <span>100px (Yupqa)</span>
                                    <span>800px (Katta)</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <label className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Burchak Yumshoqligi (Radius)</label>
                                    <span className="text-xl font-black italic">{globalRadius}px</span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={globalRadius}
                                    onChange={(e) => setGlobalRadius(Number(e.target.value))}
                                    className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-white"
                                />
                                <div className="flex justify-between text-[8px] font-black opacity-40 uppercase tracking-widest">
                                    <span>0px (O'tkir)</span>
                                    <span>100px (Dumaloq)</span>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-6 max-h-[40vh] overflow-y-auto pr-4 no-scrollbar mb-8">
                            {globalBanners.map((gb, idx) => (
                                <div key={gb.id} className="flex items-center gap-6 p-6 bg-gray-50 rounded-[30px] border border-gray-100">
                                    <div className="flex-1 grid grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black uppercase text-gray-400 ml-2">Tab nomi (UZ)</label>
                                            <input
                                                type="text"
                                                value={gb.tabName_uz || ""}
                                                onChange={e => {
                                                    const newArr = [...globalBanners];
                                                    newArr[idx].tabName_uz = e.target.value;
                                                    setGlobalBanners(newArr);
                                                }}
                                                placeholder="Siz uchun"
                                                className="w-full bg-white rounded-xl py-2 px-4 shadow-sm font-bold text-sm outline-none text-black"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[8px] font-black uppercase text-gray-400 ml-2">Tab nomi (RU)</label>
                                            <input
                                                type="text"
                                                value={gb.tabName_ru || ""}
                                                onChange={e => {
                                                    const newArr = [...globalBanners];
                                                    newArr[idx].tabName_ru = e.target.value;
                                                    setGlobalBanners(newArr);
                                                }}
                                                placeholder="Для вас"
                                                className="w-full bg-white rounded-xl py-2 px-4 shadow-sm font-bold text-sm outline-none text-black"
                                            />
                                        </div>
                                    </div>
                                    <div className="w-16 space-y-1">
                                        <label className="text-[8px] font-black uppercase text-gray-400 ml-2">Tartib</label>
                                        <input
                                            type="number"
                                            value={gb.order}
                                            onChange={e => {
                                                const newArr = [...globalBanners];
                                                newArr[idx].order = Number(e.target.value);
                                                setGlobalBanners(newArr);
                                            }}
                                            className="w-full bg-white rounded-xl py-2 px-4 shadow-sm font-bold text-sm outline-none text-black"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <button
                            onClick={handleGlobalSave}
                            disabled={isGlobalSaving}
                            className="w-full bg-black text-white py-5 rounded-3xl font-black uppercase tracking-widest shadow-2xl flex items-center justify-center gap-3 transition-all"
                        >
                            {isGlobalSaving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                            O'zgarishlarni saqlash
                        </button>
                    </div>
                </div>
            )}

            {/* Banners List */}
            <div className="grid grid-cols-1 gap-8">
                {banners.map((banner) => (
                    <div
                        key={banner.id}
                        className="bg-white rounded-[48px] overflow-hidden border border-gray-100 shadow-xl flex flex-col lg:flex-row relative group hover:shadow-2xl transition-all duration-500"
                    >
                        {/* Dual Preview Screens (HTML render) */}
                        <div className="w-full lg:w-[450px] flex flex-col bg-gray-50 border-r border-gray-100">
                            <div className="relative" style={{ aspectRatio: "21/9" }}>
                                <div className="absolute inset-0 overflow-hidden" dangerouslySetInnerHTML={{ __html: banner.html_uz }} />
                                <div className="absolute top-4 left-4 bg-[#7000FF] text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl z-10 pointer-events-none">
                                    UZ
                                </div>
                            </div>
                            <div className="relative border-t border-white/20" style={{ aspectRatio: "21/9" }}>
                                <div className="absolute inset-0 overflow-hidden" dangerouslySetInnerHTML={{ __html: banner.html_ru }} />
                                <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl z-10 pointer-events-none">
                                    RU
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 p-12 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start mb-10">
                                    <div className="space-y-6 flex-1">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-2">
                                                <h3 className="text-2xl font-black italic tracking-tighter text-[#7000FF] uppercase line-clamp-1">{banner.title_uz || "—"}</h3>
                                                <span className="inline-block bg-purple-50 text-[#7000FF] px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-purple-100">TAB: {banner.tabName_uz || "—"}</span>
                                            </div>
                                            <div className="space-y-2 border-l border-gray-100 pl-8">
                                                <h3 className="text-2xl font-black italic tracking-tighter text-blue-600 uppercase line-clamp-1">{banner.title_ru || "—"}</h3>
                                                <span className="inline-block bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border border-blue-100">TAB: {banner.tabName_ru || "—"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-4 ml-10">
                                        <button
                                            onClick={() => openEditModal(banner)}
                                            className="p-4 bg-gray-50 text-gray-400 hover:text-black hover:bg-white border hover:border-black rounded-3xl transition-all shadow-sm"
                                        >
                                            <Edit2 size={24} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(banner.id)}
                                            className="p-4 bg-red-50 text-red-500 hover:bg-red-500 hover:text-white rounded-3xl transition-all shadow-sm"
                                        >
                                            <Trash2 size={24} />
                                        </button>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-4 mt-8 pt-8 border-t border-gray-50">
                                    <div className={`px-8 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] border ${banner.active ? "bg-green-50 text-green-600 border-green-100" : "bg-gray-50 text-gray-400 border-gray-100"}`}>
                                        {banner.active ? "FAOL" : "YASHIRIN"}
                                    </div>
                                    <div className="bg-gray-50 px-8 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 border border-gray-100">
                                        Tartib: #{banner.order + 1}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {banners.length === 0 && (
                    <div className="py-32 text-center bg-gray-50/50 rounded-[50px] border-2 border-dashed border-gray-100 flex flex-col items-center">
                        <Code2 size={64} className="text-gray-100 mb-4" />
                        <p className="text-gray-400 font-black uppercase tracking-[0.3em] text-xs">Bannerlar mavjud emas</p>
                    </div>
                )}
            </div>
        </div>
    );
}
