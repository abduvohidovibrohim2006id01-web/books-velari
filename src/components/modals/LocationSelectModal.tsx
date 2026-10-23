"use client";

import { useState, useMemo, useEffect } from "react";
import { X, MapPin, Navigation, Check, Loader2, Search } from "lucide-react";
import { useStore } from "@/store/store";
import { UZBEKISTAN_REGIONS, getClosestRegion, Region } from "@/lib/regions";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface LocationSelectModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function LocationSelectModal({ isOpen, onClose }: LocationSelectModalProps) {
    const { language, selectedRegion, setSelectedRegion, user, showToast } = useStore();
    const [searchQuery, setSearchQuery] = useState("");
    const [isDetectingGps, setIsDetectingGps] = useState(false);

    // Escape klavishi bilan yopish
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, onClose]);

    // Modal ochilganda scrollni to'xtatish
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    const filteredRegions = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return UZBEKISTAN_REGIONS;
        return UZBEKISTAN_REGIONS.filter(r =>
            r.name_uz.toLowerCase().includes(q) ||
            r.name_ru.toLowerCase().includes(q)
        );
    }, [searchQuery]);

    if (!isOpen) return null;

    const handleSelectRegion = async (regionId: string) => {
        videoPreWarmer.triggerHaptic("selection");
        setSelectedRegion(regionId);

        // Qo'lda tanlanganligini belgilash — avtomatik IP hech qachon qayta yozib yubormaydi!
        try {
            localStorage.setItem("velari_region_manually_set", "true");
        } catch {}

        // Foydalanuvchi ma'lumotlarini serverga sinxronlash
        fetch("/api/user/region", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                region: regionId,
                phone: user?.phone || null
            })
        }).catch(() => {});

        onClose();
    };

    const handleDetectGps = () => {
        videoPreWarmer.triggerHaptic("medium");
        if (typeof window === "undefined" || !navigator.geolocation) {
            showToast(
                language === "ru"
                    ? "Геолокация не поддерживается вашим браузером"
                    : "Brauzeringiz geolokatsiyani qo'llab-quvvatlamaydi",
                "error"
            );
            return;
        }

        setIsDetectingGps(true);
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setIsDetectingGps(false);
                const { latitude, longitude } = pos.coords;
                const closest = getClosestRegion(latitude, longitude);

                showToast(
                    language === "ru"
                        ? `Определен регион: ${closest.name_ru}`
                        : `Aniqlangan hudud: ${closest.name_uz}`,
                    "success"
                );

                handleSelectRegion(closest.id);
            },
            (err) => {
                setIsDetectingGps(false);
                console.warn("GPS error:", err);
                showToast(
                    language === "ru"
                        ? "Не удалось определить местоположение. Пожалуйста, выберите вручную."
                        : "Joylashuvni aniqlab bo'lmadi. Iltimos, ro'yxatdan tanlang.",
                    "error"
                );
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    };

    return (
        <div
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
            style={{ background: "rgba(0, 0, 0, 0.45)", backdropFilter: "blur(6px)" }}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className="w-full max-w-lg bg-[#FAFAF6] rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[88vh] animate-in slide-in-from-bottom duration-250"
                style={{ border: "1px solid rgba(15,20,16,0.08)" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-5 pb-3 bg-white border-b border-gray-100 flex-shrink-0">
                    <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3 sm:hidden" />
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-base sm:text-lg font-bold text-[#111612]">
                                {language === "ru" ? "Выберите регион доставки" : "Yetkazib berish hududingizni tanlang"}
                            </h2>
                            <p className="text-xs text-[#737D75] mt-0.5">
                                {language === "ru" ? "Сроки и пункты выдачи зависят от региона" : "Muddat va topshirish punktlari shunga bog'liq"}
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                onClose();
                            }}
                            className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-[#737D75] hover:text-[#111612] hover:bg-gray-200 transition-colors"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* GPS Tugmasi */}
                    <button
                        type="button"
                        onClick={handleDetectGps}
                        disabled={isDetectingGps}
                        className="w-full mt-4 flex items-center justify-between p-3.5 bg-[#EAF3EC] hover:bg-[#DDF0E1] active:scale-[0.99] rounded-2xl transition-all border border-emerald-100/60"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-[#2D6E3E] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                                {isDetectingGps ? <Loader2 size={18} className="animate-spin" /> : <Navigation size={18} />}
                            </div>
                            <div className="text-left">
                                <p className="text-xs font-bold text-[#111612]">
                                    {language === "ru" ? "Определить по GPS" : "Hozirgi joylashuvimni aniqlash (GPS)"}
                                </p>
                                <p className="text-[11px] text-[#2D6E3E] font-medium">
                                    {isDetectingGps
                                        ? (language === "ru" ? "Определение..." : "Joylashuv aniqlanmoqda...")
                                        : (language === "ru" ? "Автоматический выбор ближайшего региона" : "Eng yaqin viloyatni avtomatik tanlash")}
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-bold text-[#2D6E3E] px-2 py-1 bg-white/70 rounded-lg">
                            GPS
                        </span>
                    </button>

                    {/* Qidiruv */}
                    <div className="relative mt-3">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={language === "ru" ? "Поиск региона..." : "Viloyat nomini qidirish..."}
                            className="w-full bg-[#F5F5F0] border-none rounded-xl py-2.5 pl-10 pr-4 text-xs sm:text-sm font-medium text-[#111612] placeholder-gray-400 outline-none focus:ring-1 focus:ring-[#2D6E3E]"
                        />
                    </div>
                </div>

                {/* Viloyatlar ro'yxati */}
                <div className="p-4 space-y-2 overflow-y-auto max-h-[50vh] no-scrollbar">
                    {filteredRegions.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 text-xs">
                            {language === "ru" ? "Регион не найден" : "Bunday viloyat topilmadi"}
                        </div>
                    ) : (
                        filteredRegions.map((region) => {
                            const isSelected = selectedRegion === region.id;
                            return (
                                <button
                                    key={region.id}
                                    type="button"
                                    onClick={() => handleSelectRegion(region.id)}
                                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition-all text-left ${
                                        isSelected
                                            ? "bg-white border-2 border-[#2D6E3E] shadow-sm"
                                            : "bg-white/80 hover:bg-white border border-gray-100/80 active:scale-[0.99]"
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${isSelected ? "bg-[#EAF3EC] text-[#2D6E3E]" : "bg-gray-100 text-gray-400"}`}>
                                            <MapPin size={16} />
                                        </div>
                                        <div>
                                            <span className={`text-sm ${isSelected ? "font-bold text-[#111612]" : "font-semibold text-gray-700"}`}>
                                                {language === "ru" ? region.name_ru : region.name_uz}
                                            </span>
                                            <p className="text-[10px] text-gray-400 font-medium">
                                                {region.id === "tashkent_city"
                                                    ? (language === "ru" ? "1 день (доступен экспресс)" : "1 kun (tezkor mavjud)")
                                                    : (language === "ru" ? `Срок: ${region.defaultDays} дня` : `Muddat: ${region.defaultDays} kun`)}
                                            </p>
                                        </div>
                                    </div>
                                    {isSelected && (
                                        <div className="w-5 h-5 rounded-full bg-[#2D6E3E] flex items-center justify-center text-white flex-shrink-0">
                                            <Check size={12} strokeWidth={3} />
                                        </div>
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
