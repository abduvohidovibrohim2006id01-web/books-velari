import { isUzbekistanHoliday } from "@/lib/holidays";
import { getRegionById } from "@/lib/regions";

// Ombor `dbs_config` (cutoffHour/deliveryDays/processingDays/regionsDelivery/offDays/holidays) ni date-utils kutadigan
// formatga ({cutoff, processingDays, days, regionsDelivery, offDays, holidays}) o'tkazadi.
export const normalizeDbsConfig = (dbs: any) => ({
    cutoff: Number(dbs?.cutoffHour ?? dbs?.cutoff ?? 16),
    processingDays: Number(dbs?.processingDays ?? 0),
    days: Number(dbs?.deliveryDays ?? dbs?.days ?? 1),
    regionsDelivery: (dbs?.regionsDelivery && typeof dbs.regionsDelivery === 'object') ? dbs.regionsDelivery : {},
    offDays: Array.isArray(dbs?.offDays) ? dbs.offDays : [],
    holidays: Array.isArray(dbs?.holidays) ? dbs.holidays : [],
});

// Mahsulot kartochkasi uchun qisqa yetkazish matni:
// "Bugun yetkaziladi" / "Ertaga yetkaziladi" / "Indinga yetkaziladi" / "3-iyunda yetkaziladi"
export const getDeliveryCardText = (language: string, dbs: any, selectedRegion: string = "tashkent_city"): string => {
    const s = normalizeDbsConfig(dbs);
    const now = new Date();
    const defaultRegionDays = getRegionById(selectedRegion).defaultDays;
    const isTashkent = selectedRegion === "tashkent_city" || selectedRegion === "tashkent_region";
    // Toshkent bo'lsa: ombor deliveryDays yoki regionsDelivery['tashkent_city'], aks holda default
    // Viloyatlar bo'lsa: regionsDelivery[selectedRegion] yoki viloyat defaultDays (2 kun)
    const regionDays = Number(
        isTashkent 
            ? (s.regionsDelivery[selectedRegion] ?? s.days ?? defaultRegionDays)
            : (s.regionsDelivery[selectedRegion] ?? defaultRegionDays)
    );
    let totalDays = s.processingDays + regionDays;
    if (now.getHours() >= s.cutoff) {
        totalDays += 1;
    }
    const d = new Date();
    d.setDate(now.getDate() + totalDays);

    const isOff = (date: Date) => {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");
        return s.offDays.includes(date.getDay()) || s.holidays.includes(`${y}-${m}-${dd}`) || isUzbekistanHoliday(date);
    };
    let i = 0;
    while (isOff(d) && i < 30) { d.setDate(d.getDate() + 1); i++; }

    const start = new Date(); start.setHours(0, 0, 0, 0);
    const target = new Date(d); target.setHours(0, 0, 0, 0);
    const diff = Math.round((target.getTime() - start.getTime()) / 86400000);

    if (language === "ru") {
        if (diff <= 0) return "Доставим сегодня";
        if (diff === 1) return "Доставим завтра";
        if (diff === 2) return "Доставим послезавтра";
        const monthsRu = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
        return `Доставим ${d.getDate()} ${monthsRu[d.getMonth()]}`;
    }
    if (diff <= 0) return "Bugun yetkaziladi";
    if (diff === 1) return "Ertaga yetkaziladi";
    if (diff === 2) return "Indinga yetkaziladi";
    const monthsUz = ["yanvar","fevral","mart","aprel","may","iyun","iyul","avgust","sentabr","oktabr","noyabr","dekabr"];
    return `${d.getDate()}-${monthsUz[d.getMonth()]}da yetkaziladi`;
};

export const getDeliveryDateText = (language: string, deliverySettings: any, selectedRegion: string = "tashkent_city") => {
    const s = normalizeDbsConfig(deliverySettings);
    const defaultRegionDays = getRegionById(selectedRegion).defaultDays;
    const isTashkent = selectedRegion === "tashkent_city" || selectedRegion === "tashkent_region";
    // Toshkent bo'lsa: ombor deliveryDays yoki regionsDelivery['tashkent_city'], aks holda default
    // Viloyatlar bo'lsa: regionsDelivery[selectedRegion] yoki viloyat defaultDays (2 kun)
    const regionDays = Number(
        isTashkent 
            ? (s.regionsDelivery[selectedRegion] ?? s.days ?? defaultRegionDays)
            : (s.regionsDelivery[selectedRegion] ?? defaultRegionDays)
    );
    
    const now = new Date();
    let totalDays = s.processingDays + regionDays;
    if (now.getHours() >= s.cutoff) {
        totalDays += 1;
    }
    
    const deliveryDate = new Date();
    deliveryDate.setDate(now.getDate() + totalDays);
    
    const isOff = (date: Date) => {
        const dayNum = date.getDay();
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        return s.offDays.includes(dayNum) || s.holidays.includes(dateStr) || isUzbekistanHoliday(date);
    };

    let iterations = 0;
    while (isOff(deliveryDate) && iterations < 30) {
        deliveryDate.setDate(deliveryDate.getDate() + 1);
        iterations++;
    }

    const months = language === 'uz' 
        ? ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"] 
        : ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    
    const dayName = deliveryDate.getDate();
    const monthName = months[deliveryDate.getMonth()];
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfDelivery = new Date(deliveryDate);
    startOfDelivery.setHours(0, 0, 0, 0);
    
    const diffDays = Math.round((startOfDelivery.getTime() - startOfToday.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return language === 'uz' ? "Bugun" : "Сегодня";
    if (diffDays === 1) return language === 'uz' ? `Ertaga, ${dayName}-${monthName}` : `Завтра, ${dayName}-${monthName}`;
    if (diffDays === 2) return language === 'uz' ? `Indinga, ${dayName}-${monthName}` : `Послезавтра, ${dayName}-${monthName}`;
    return `${dayName}-${monthName}`;
};
