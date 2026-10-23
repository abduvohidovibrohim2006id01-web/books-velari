"use client";

import { useState, useEffect } from "react";
import { adminSelect } from "@/lib/admin-api";
import { Plus, Trash2, Edit2, Save, X, Loader2, Home as WarehouseIcon, MapPin, Truck, Clock, Calendar, Image as ImageIcon } from "lucide-react";
import { uploadToYandexS3 } from "@/lib/yandex-s3";
import { UZBEKISTAN_REGIONS, getDefaultRegionsDelivery } from "@/lib/regions";

interface Warehouse {
    id: string;
    name: string;
    address: string;
    logo?: string;
    type: "DBS" | "FBS" | "FBO";
    dbs: {
        cutoffHour: number;
        processingDays: number;
        deliveryDays: number;
        regionsDelivery: Record<string, number>;
        offDays: number[];
        holidays: string[];
    };
    active: boolean;
}

export default function AdminWarehouses() {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [editId, setEditId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        address: "",
        logo: "",
        type: "DBS" as "DBS" | "FBS" | "FBO",
        dbs: {
            cutoffHour: 16,
            processingDays: 0,
            deliveryDays: 1,
            regionsDelivery: getDefaultRegionsDelivery(),
            offDays: [0],
            holidays: [] as string[]
        },
        active: true
    });

    const [holidayInput, setHolidayInput] = useState("");
    const [isUploading, setIsUploading] = useState(false);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsUploading(true);
        try {
            const { url } = await uploadToYandexS3(file);
            setFormData(prev => ({ ...prev, logo: url }));
        } catch (err: any) {
            alert("Logo yuklashda xatolik: " + (err.message || ""));
        } finally {
            setIsUploading(false);
        }
    };

    const fetchWarehouses = async () => {
        try {
            const data = await adminSelect<any[]>("warehouses", { orderBy: { column: "name", ascending: true } });
            const defaultDelivery = getDefaultRegionsDelivery();

            setWarehouses(data.map(w => {
                const rawDbs = w.dbs_config || {};
                return {
                    id: w.id,
                    name: w.name,
                    address: w.address,
                    logo: w.logo,
                    type: w.type,
                    dbs: {
                        cutoffHour: Number(rawDbs.cutoffHour ?? 16),
                        processingDays: Number(rawDbs.processingDays ?? 0),
                        deliveryDays: Number(rawDbs.deliveryDays ?? 1),
                        regionsDelivery: {
                            ...defaultDelivery,
                            ...(rawDbs.regionsDelivery || {})
                        },
                        offDays: Array.isArray(rawDbs.offDays) ? rawDbs.offDays : [0],
                        holidays: Array.isArray(rawDbs.holidays) ? rawDbs.holidays : []
                    },
                    active: w.active
                };
            }) as Warehouse[]);
        } catch (error) {
            console.error("Fetch warehouses error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchWarehouses();
    }, []);

    const resetForm = () => {
        setFormData({
            name: "",
            address: "",
            logo: "",
            type: "DBS" as "DBS" | "FBS" | "FBO",
            dbs: {
                cutoffHour: 16,
                processingDays: 0,
                deliveryDays: 1,
                regionsDelivery: getDefaultRegionsDelivery(),
                offDays: [0],
                holidays: []
            },
            active: true
        });
        setEditId(null);
        setIsAdding(false);
    };

    const handleSave = async () => {
        if (!formData.name) return alert("Nomini kiriting");
        setIsSaving(true);
        try {
            const payload = {
                name: formData.name,
                address: formData.address,
                logo: formData.logo || null,
                type: formData.type,
                dbs_config: formData.dbs,
                active: formData.active
            };

            if (editId) {
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'warehouses',
                        action: 'update',
                        payload,
                        matchConfig: { column: 'id', value: editId }
                    })
                });
                if (!res.ok) throw new Error("Omborni yangilashda xatolik");
            } else {
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'warehouses',
                        action: 'insert',
                        payload: [{ 
                            ...payload,
                            id: crypto.randomUUID()
                        }]
                    })
                });
                if (!res.ok) throw new Error("Omborni yaratishda xatolik");
            }
            resetForm();
            fetchWarehouses();
        } catch (e) {
            console.error(e);
            alert("Xatolik!");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("O'chirilsinmi?")) return;
        try {
            const res = await fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'warehouses',
                    action: 'delete',
                    matchConfig: { column: 'id', value: id }
                })
            });
            if (!res.ok) throw new Error("Omborni o'chirishda xatolik");
            fetchWarehouses();
        } catch (e) {
            console.error(e);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-12">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic uppercase">Omborlar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Logistika nuqtalari boshqaruvi</p>
                </div>
                <button
                    onClick={() => setIsAdding(true)}
                    className="bg-black text-white px-10 py-5 rounded-[28px] font-black text-xs uppercase tracking-widest flex items-center gap-3 shadow-2xl hover:scale-105 active:scale-95 transition-all"
                >
                    <Plus size={18} /> Yangi Ombor
                </button>
            </div>

            {isAdding && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6">
                    <div className="bg-white rounded-[40px] p-10 w-full max-w-4xl shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar">
                        <div className="flex justify-between items-center mb-10">
                            <h2 className="text-3xl font-black italic tracking-tighter uppercase">{editId ? "Omborni Tahrirlash" : "Yangi Ombor"}</h2>
                            <button onClick={resetForm} className="p-3 bg-gray-50 rounded-2xl hover:bg-black hover:text-white transition-all"><X size={20} /></button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Ombor Nomi</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full bg-gray-50 border-none rounded-2xl py-4 px-6 font-bold"
                                        placeholder="Masalan: Asosiy Ombor Toshkent"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Manzil</label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={e => setFormData({ ...formData, address: e.target.value })}
                                        className="w-full bg-gray-50 border-none rounded-2xl py-4 px-6 font-bold"
                                        placeholder="Toshkent sh., Chilonzor..."
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Do'kon logosi</label>
                                    <div className="flex items-center gap-4">
                                        <div className="w-20 h-20 rounded-2xl bg-gray-50 border border-gray-100 overflow-hidden flex items-center justify-center shrink-0">
                                            {formData.logo ? (
                                                <img src={formData.logo} alt="logo" className="w-full h-full object-cover" />
                                            ) : (
                                                <WarehouseIcon size={26} className="text-gray-300" />
                                            )}
                                        </div>
                                        <div className="relative flex-1">
                                            <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={isUploading}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
                                            <div className="w-full bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl py-4 px-6 flex items-center justify-center gap-2 text-gray-400 font-bold text-xs">
                                                {isUploading ? <Loader2 size={16} className="animate-spin" /> : <ImageIcon size={16} />}
                                                {isUploading ? "Yuklanmoqda..." : (formData.logo ? "Logoni almashtirish" : "Logo yuklash")}
                                            </div>
                                        </div>
                                        {formData.logo && (
                                            <button type="button" onClick={() => setFormData({ ...formData, logo: "" })}
                                                className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={18} /></button>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Ombor Turi</label>
                                    <div className="flex gap-2">
                                        {["DBS", "FBS", "FBO"].map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => {
                                                    if (t === "DBS") {
                                                        setFormData({ ...formData, type: t as any });
                                                    } else {
                                                        alert(`${t} rejimi hozircha mavjud emas`);
                                                    }
                                                }}
                                                className={`flex-1 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border-2 ${formData.type === t ? "bg-black border-black text-white" : "bg-gray-50 border-transparent text-gray-400"}`}
                                            >
                                                {t} {t !== "DBS" && <span className="text-[8px] block opacity-40">soon</span>}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {formData.type === "DBS" && (
                                    <div className="pt-6 border-t border-gray-100">
                                        <h3 className="text-xs font-black uppercase tracking-widest text-black mb-6 flex items-center gap-2">
                                            <Truck size={16} /> DBS Sozlamalari
                                        </h3>
                                        <div className="space-y-6">
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center px-1">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Cut-off Soati</label>
                                                    <span className="text-sm font-black italic bg-gray-50 px-3 py-1 rounded-lg">{formData.dbs.cutoffHour}:00</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="23"
                                                    value={formData.dbs.cutoffHour}
                                                    onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs, cutoffHour: Number(e.target.value) } })}
                                                    className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-black"
                                                />
                                                <p className="text-[8px] text-gray-400 font-bold italic uppercase tracking-tighter">
                                                    Mijoz shu soatdan keyin buyurtma bersa, yetkazish +1 kunga suriladi.
                                                </p>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center px-1">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Qayta ishlash muddati (Omborda tayyorlash)</label>
                                                    <span className="text-sm font-black italic bg-gray-50 px-3 py-1 rounded-lg">{formData.dbs.processingDays} kun</span>
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="14"
                                                        value={formData.dbs.processingDays}
                                                        onChange={e => setFormData({ ...formData, dbs: { ...formData.dbs, processingDays: Math.max(0, Number(e.target.value)) } })}
                                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl p-4 font-black transition-all outline-none"
                                                    />
                                                    <Clock size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                                </div>
                                                <p className="text-[8px] text-gray-400 font-bold italic uppercase tracking-tighter">
                                                    Omborda buyurtmani yig'ish va kuryerga topshirish uchun ketadigan vaqt (kunlarda).
                                                </p>
                                            </div>
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-center px-1">
                                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Umumiy fallback yetkazish muddati</label>
                                                    <span className="text-sm font-black italic bg-gray-50 px-3 py-1 rounded-lg">{formData.dbs.deliveryDays} kun</span>
                                                </div>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        max="30"
                                                        value={formData.dbs.deliveryDays}
                                                        onChange={e => {
                                                            const val = Math.max(0, Number(e.target.value));
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                dbs: {
                                                                    ...prev.dbs,
                                                                    deliveryDays: val,
                                                                    regionsDelivery: {
                                                                        ...prev.dbs.regionsDelivery,
                                                                        tashkent_city: val,
                                                                        tashkent_region: val
                                                                    }
                                                                }
                                                            }));
                                                        }}
                                                        className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl p-4 font-black transition-all outline-none"
                                                    />
                                                    <Clock size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" />
                                                </div>
                                                <p className="text-[8px] text-gray-400 font-bold italic uppercase tracking-tighter">
                                                    Agar viloyat sozlanmagan bo'lsa ishlatiladigan standart muddat.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Dam olish kunlari (Haftalik)</label>
                                    <div className="flex flex-wrap gap-2">
                                        {["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"].map((day, idx) => {
                                            const dayNum = (idx + 1) % 7;
                                            const isOff = formData.dbs.offDays.includes(dayNum);
                                            return (
                                                <button
                                                    key={day}
                                                    type="button"
                                                    onClick={() => {
                                                        const newOff = isOff ? formData.dbs.offDays.filter(d => d !== dayNum) : [...formData.dbs.offDays, dayNum];
                                                        setFormData({ ...formData, dbs: { ...formData.dbs, offDays: newOff } });
                                                    }}
                                                    className={`w-10 h-10 rounded-xl text-[10px] font-black uppercase transition-all border-2 ${isOff ? "bg-red-500 border-red-500 text-white" : "bg-white border-gray-100 text-gray-400"}`}
                                                >
                                                    {day}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">Bayramlar (Kalendar)</label>
                                    <div className="flex gap-2">
                                        <input type="date" value={holidayInput} onChange={e => setHolidayInput(e.target.value)} className="flex-1 bg-gray-50 rounded-xl p-3 text-sm font-bold" />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (!holidayInput || formData.dbs.holidays.includes(holidayInput)) return;
                                                setFormData({ ...formData, dbs: { ...formData.dbs, holidays: [...formData.dbs.holidays, holidayInput].sort() } });
                                                setHolidayInput("");
                                            }}
                                            className="bg-black text-white px-4 rounded-xl font-black text-[10px]"
                                        >
                                            Qo'shish
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {formData.dbs.holidays.map(h => (
                                            <div key={h} className="bg-gray-100 px-3 py-1.5 rounded-lg text-[9px] font-black flex items-center gap-2">
                                                {h}
                                                <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => setFormData({ ...formData, dbs: { ...formData.dbs, holidays: formData.dbs.holidays.filter(x => x !== h) } })} />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {formData.type === "DBS" && (
                            <div className="mt-10 pt-8 border-t border-gray-100 space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-xs font-black uppercase tracking-widest text-black flex items-center gap-2">
                                            <MapPin size={16} /> Viloyatlar bo'yicha yetkazish muddatlari
                                        </h3>
                                        <p className="text-[10px] text-gray-400 font-bold mt-1">
                                            14 ta hudud uchun kuryer yetkazish muddati (kunlarda).
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updated: Record<string, number> = {};
                                                UZBEKISTAN_REGIONS.forEach(r => { updated[r.id] = formData.dbs.deliveryDays; });
                                                setFormData(prev => ({ ...prev, dbs: { ...prev.dbs, regionsDelivery: updated } }));
                                            }}
                                            className="px-3.5 py-2 bg-gray-100 hover:bg-black hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                        >
                                            Barchasini umumiy kunga ({formData.dbs.deliveryDays} kun) sozlash
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const updated: Record<string, number> = {};
                                                UZBEKISTAN_REGIONS.forEach(r => { updated[r.id] = 2; });
                                                setFormData(prev => ({ ...prev, dbs: { ...prev.dbs, regionsDelivery: updated } }));
                                            }}
                                            className="px-3.5 py-2 bg-gray-100 hover:bg-black hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                        >
                                            Barcha viloyatlarni 2 kunga sozlash
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setFormData(prev => ({ ...prev, dbs: { ...prev.dbs, regionsDelivery: getDefaultRegionsDelivery() } }));
                                            }}
                                            className="px-3.5 py-2 bg-gray-100 hover:bg-black hover:text-white rounded-xl text-[10px] font-black uppercase tracking-wider transition-all"
                                        >
                                            Standart (Toshkent 1, boshqalar 2)
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {UZBEKISTAN_REGIONS.map(region => (
                                        <div key={region.id} className="flex items-center justify-between p-3.5 bg-gray-50 rounded-2xl border border-gray-100/80 hover:border-gray-200 transition-all">
                                            <div className="min-w-0 pr-2">
                                                <p className="text-xs font-bold text-gray-800 truncate">{region.name_uz}</p>
                                                <p className="text-[10px] text-gray-400 font-medium truncate">{region.name_ru}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="30"
                                                    value={formData.dbs.regionsDelivery[region.id] ?? region.defaultDays}
                                                    onChange={e => {
                                                        const val = Math.max(0, Number(e.target.value));
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            dbs: {
                                                                ...prev.dbs,
                                                                regionsDelivery: {
                                                                    ...prev.dbs.regionsDelivery,
                                                                    [region.id]: val
                                                                }
                                                            }
                                                        }));
                                                    }}
                                                    className="w-14 bg-white border border-gray-200 focus:border-black rounded-xl py-2 px-1 text-center font-black text-sm outline-none transition-all shadow-sm"
                                                />
                                                <span className="text-[10px] font-bold text-gray-400">kun</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="w-full bg-black text-white py-6 rounded-[30px] font-black uppercase tracking-widest shadow-2xl mt-12 flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                            {editId ? "Yangilash" : "Saqlash"}
                        </button>
                    </div>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {warehouses.map(w => (
                    <div key={w.id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center text-black group-hover:bg-black group-hover:text-white transition-all overflow-hidden">
                                {w.logo ? (
                                    <img src={w.logo} alt={w.name} className="w-full h-full object-cover" />
                                ) : (
                                    <WarehouseIcon size={24} />
                                )}
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => { setFormData(w as any); setEditId(w.id); setIsAdding(true); }} className="p-2 text-gray-400 hover:text-black"><Edit2 size={18} /></button>
                                <button onClick={() => handleDelete(w.id)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={18} /></button>
                            </div>
                        </div>
                        <h3 className="text-xl font-black italic uppercase tracking-tighter mb-2">{w.name}</h3>
                        <div className="flex items-center gap-2 mb-4">
                            <span className="bg-black text-white px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest">{w.type}</span>
                            <p className="text-xs font-bold text-gray-400 flex items-center gap-2"><MapPin size={12} /> {w.address}</p>
                        </div>

                        {w.type === "DBS" && (
                            <div className="grid grid-cols-3 gap-3 border-t border-gray-50 pt-6">
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase text-gray-300">Cut-off</p>
                                    <p className="text-sm font-black italic">{w.dbs.cutoffHour}:00</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase text-gray-300">Tayyorlash</p>
                                    <p className="text-sm font-black italic">{w.dbs.processingDays || 0} kun</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[8px] font-black uppercase text-gray-300">Toshkent / Vil.</p>
                                    <p className="text-sm font-black italic">{w.dbs.regionsDelivery?.tashkent_city ?? 1} / {w.dbs.regionsDelivery?.samarkand ?? 2} kun</p>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
