"use client";

import { useState, useEffect } from "react";
import { 
    Globe, Instagram, Send, Phone, Save, Loader2, CheckCircle2, 
    Facebook, Youtube, MapPin, Clock, ExternalLink, ShieldCheck 
} from "lucide-react";
import { adminApi } from "@/lib/admin-api";
import { 
    ShopSettings, 
    DEFAULT_SHOP_SETTINGS, 
    formatTelegramLink, 
    formatInstagramLink, 
    formatFacebookLink, 
    formatYoutubeLink, 
    formatPhoneLink 
} from "@/lib/shop-settings";

export default function AdminSettings() {
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [shopData, setShopData] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const val = await adminApi.settings.get("shop");
                if (val) {
                    setShopData({
                        ...DEFAULT_SHOP_SETTINGS,
                        ...val,
                    });
                }
            } catch (error) {
                console.error("Fetch settings error:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSettings();
    }, []);

    const handleSaveShop = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setIsSaving(true);
        try {
            await adminApi.settings.save("shop", shopData);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (e: any) {
            console.error(e);
            alert("Saqlashda xatolik: " + (e?.message || "Noma'lum xatolik"));
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-black" size={32} /></div>;

    return (
        <div className="space-y-10 pb-24 max-w-5xl">
            {/* Header */}
            <div>
                <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-3 italic uppercase flex items-center gap-4">
                    <Globe size={36} /> Do'kon Sozlamalari
                </h1>
                <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                    Saytning barcha sahifalaridagi (Footer, Biz haqimizda, Qaytarish siyosati, SEO) kontaktlarni markaziy boshqarish
                </p>
            </div>

            {showSuccess && (
                <div className="fixed top-10 right-10 z-[100] bg-black text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 animate-in fade-in slide-in-from-right duration-500 shadow-2xl">
                    <CheckCircle2 size={16} className="text-green-400" /> Barcha kontaktlar sayt bo'ylab muvaffaqiyatli yangilandi!
                </div>
            )}

            <form onSubmit={handleSaveShop} className="space-y-8">
                {/* 1. Asosiy Do'kon Ma'lumotlari & Telefonlar */}
                <div className="bg-white rounded-[36px] border border-gray-100 shadow-sm p-8 md:p-10 space-y-6">
                    <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                        <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                            <Phone size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-black italic tracking-tighter uppercase">Telefon va Do'kon Nomi</h2>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Call-center va mijozlar bilan aloqa raqamlari</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 block">Do'kon nomi</label>
                            <input
                                type="text"
                                value={shopData.name}
                                onChange={e => setShopData({ ...shopData, name: e.target.value })}
                                placeholder="Velari"
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                                required
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 block">Asosiy Call-center telefoni</label>
                            <input
                                type="text"
                                value={shopData.phone}
                                onChange={e => setShopData({ ...shopData, phone: e.target.value })}
                                placeholder="+998 95 082 11 88"
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                                required
                            />
                            <p className="text-[10px] text-gray-400 mt-1 ml-2">Saytning hamma joyida chiqadi</p>
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 block">Qo'shimcha telefon (Savdo bo'limi)</label>
                            <input
                                type="text"
                                value={shopData.secondary_phone || ""}
                                onChange={e => setShopData({ ...shopData, secondary_phone: e.target.value })}
                                placeholder="+998 20 014 49 89"
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                            <p className="text-[10px] text-gray-400 mt-1 ml-2">Ixtiyoriy (SEO va qo'shimcha kontakt)</p>
                        </div>
                    </div>
                </div>

                {/* 2. Ijtimoiy Tarmoqlar & Telegram */}
                <div className="bg-white rounded-[36px] border border-gray-100 shadow-sm p-8 md:p-10 space-y-6">
                    <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                        <div className="w-12 h-12 bg-purple-50 text-[#7000FF] rounded-2xl flex items-center justify-center">
                            <Send size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-black italic tracking-tighter uppercase">Ijtimoiy Tarmoqlar va Telegram</h2>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Footer va sahifalardagi rasmiy ssilkalar</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Telegram Admin */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 flex items-center gap-2">
                                <Send size={14} className="text-blue-500" /> Telegram (Admin / Qo'llab-quvvatlash)
                            </label>
                            <input
                                type="text"
                                value={shopData.telegram_admin}
                                onChange={e => setShopData({ ...shopData, telegram_admin: e.target.value })}
                                placeholder="@VELARI_UZ_ADMIN yoki https://t.me/..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                                required
                            />
                            <p className="text-[10px] text-gray-400 mt-1 ml-2">Qaytarish siyosati va Biz haqimizda sahifasida admin bilan to'g'ridan-to'g'ri bog'lanish</p>
                        </div>

                        {/* Telegram Kanal */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 flex items-center gap-2">
                                <Send size={14} className="text-blue-600" /> Telegram (Rasmiy Kanal / Guruh)
                            </label>
                            <input
                                type="text"
                                value={shopData.telegram_channel}
                                onChange={e => setShopData({ ...shopData, telegram_channel: e.target.value })}
                                placeholder="https://t.me/velariuz yoki velariuz"
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                                required
                            />
                            <p className="text-[10px] text-gray-400 mt-1 ml-2">Saytning Footer'dagi Telegram ikonkasi uchun</p>
                        </div>

                        {/* Instagram */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 flex items-center gap-2">
                                <Instagram size={14} className="text-pink-600" /> Instagram
                            </label>
                            <input
                                type="text"
                                value={shopData.instagram}
                                onChange={e => setShopData({ ...shopData, instagram: e.target.value })}
                                placeholder="velari_uz_ yoki https://instagram.com/..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                                required
                            />
                            <p className="text-[10px] text-gray-400 mt-1 ml-2">Footer va Biz haqimizda sahifasi</p>
                        </div>

                        {/* Facebook */}
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 flex items-center gap-2">
                                <Facebook size={14} className="text-blue-700" /> Facebook
                            </label>
                            <input
                                type="text"
                                value={shopData.facebook || ""}
                                onChange={e => setShopData({ ...shopData, facebook: e.target.value })}
                                placeholder="velari.uz yoki https://facebook.com/..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                        </div>

                        {/* YouTube */}
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 flex items-center gap-2">
                                <Youtube size={14} className="text-red-600" /> YouTube
                            </label>
                            <input
                                type="text"
                                value={shopData.youtube || ""}
                                onChange={e => setShopData({ ...shopData, youtube: e.target.value })}
                                placeholder="@velariuz yoki https://youtube.com/..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* 3. Manzil va Ish Tartibi */}
                <div className="bg-white rounded-[36px] border border-gray-100 shadow-sm p-8 md:p-10 space-y-6">
                    <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                        <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center">
                            <MapPin size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg md:text-xl font-black italic tracking-tighter uppercase">Qaytarish Manzili va Ish Vaqti</h2>
                            <p className="text-gray-400 text-[10px] font-black uppercase tracking-widest">Qaytarish siyosati sahifasi va mijozlar xizmati uchun</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 block">Manzil (O'zbekcha)</label>
                            <input
                                type="text"
                                value={shopData.address_uz || ""}
                                onChange={e => setShopData({ ...shopData, address_uz: e.target.value })}
                                placeholder="Toshkent sh., Sergeli tumani, ..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 block">Manzil (Ruscha)</label>
                            <input
                                type="text"
                                value={shopData.address_ru || ""}
                                onChange={e => setShopData({ ...shopData, address_ru: e.target.value })}
                                placeholder="г. Ташкент, Сергелийский район, ..."
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 flex items-center gap-1.5">
                                <Clock size={12} /> Ish tartibi (O'zbekcha)
                            </label>
                            <input
                                type="text"
                                value={shopData.working_hours_uz || ""}
                                onChange={e => setShopData({ ...shopData, working_hours_uz: e.target.value })}
                                placeholder="Har kuni 09:00 dan 21:00 gacha"
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                        </div>

                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 mb-2 flex items-center gap-1.5">
                                <Clock size={12} /> Ish tartibi (Ruscha)
                            </label>
                            <input
                                type="text"
                                value={shopData.working_hours_ru || ""}
                                onChange={e => setShopData({ ...shopData, working_hours_ru: e.target.value })}
                                placeholder="Ежедневно с 09:00 до 21:00"
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-black rounded-2xl px-5 py-3.5 text-sm font-bold outline-none transition-all"
                            />
                        </div>
                    </div>
                </div>

                {/* Live Preview Card */}
                <div className="bg-gray-50 rounded-[32px] p-6 border border-gray-200/70 space-y-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">Saytda qanday chiqadi (Jonli ko'rinish):</div>
                    <div className="flex flex-wrap items-center gap-3">
                        <a href={formatPhoneLink(shopData.phone)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-xs font-bold text-gray-700 shadow-sm hover:bg-black hover:text-white transition-all">
                            <Phone size={14} className="text-green-600" /> {shopData.phone || "Telefon yo'q"}
                        </a>
                        <a href={formatTelegramLink(shopData.telegram_admin)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-xs font-bold text-gray-700 shadow-sm hover:bg-black hover:text-white transition-all">
                            <Send size={14} className="text-blue-500" /> {shopData.telegram_admin || "Admin Telegram"}
                        </a>
                        <a href={formatTelegramLink(shopData.telegram_channel)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-xs font-bold text-gray-700 shadow-sm hover:bg-black hover:text-white transition-all">
                            <Send size={14} className="text-blue-600" /> Kanal: {shopData.telegram_channel || "Kanal"}
                        </a>
                        <a href={formatInstagramLink(shopData.instagram)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-xl text-xs font-bold text-gray-700 shadow-sm hover:bg-black hover:text-white transition-all">
                            <Instagram size={14} className="text-pink-600" /> {shopData.instagram || "Instagram"}
                        </a>
                    </div>
                </div>

                {/* Save button */}
                <button
                    type="submit"
                    disabled={isSaving}
                    className="w-full bg-black text-white py-5 rounded-[24px] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-gray-800 active:scale-95 transition-all shadow-xl shadow-black/10 disabled:opacity-50 cursor-pointer"
                >
                    {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                    Barcha o'zgarishlarni sayt bo'ylab saqlash
                </button>
            </form>
        </div>
    );
}
