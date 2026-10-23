export interface Region {
    id: string;
    name_uz: string;
    name_ru: string;
    defaultDays: number;
    lat: number;
    lng: number;
}

export const UZBEKISTAN_REGIONS: Region[] = [
    { id: "tashkent_city", name_uz: "Toshkent shahri", name_ru: "г. Ташкент", defaultDays: 1, lat: 41.311081, lng: 69.240562 },
    { id: "tashkent_region", name_uz: "Toshkent viloyati", name_ru: "Ташкентская область", defaultDays: 1, lat: 41.2825, lng: 69.8300 },
    { id: "andijan", name_uz: "Andijon", name_ru: "Андижан", defaultDays: 2, lat: 40.782060, lng: 72.344238 },
    { id: "bukhara", name_uz: "Buxoro", name_ru: "Бухара", defaultDays: 2, lat: 39.774720, lng: 64.428610 },
    { id: "fergana", name_uz: "Farg'ona", name_ru: "Фергана", defaultDays: 2, lat: 40.384210, lng: 71.784320 },
    { id: "jizzakh", name_uz: "Jizzax", name_ru: "Джизак", defaultDays: 2, lat: 40.115830, lng: 67.842220 },
    { id: "khorezm", name_uz: "Xorazm", name_ru: "Хорезм", defaultDays: 2, lat: 41.550000, lng: 60.633333 },
    { id: "namangan", name_uz: "Namangan", name_ru: "Наманган", defaultDays: 2, lat: 40.998300, lng: 71.672570 },
    { id: "navoiy", name_uz: "Navoiy", name_ru: "Навои", defaultDays: 2, lat: 40.084440, lng: 65.379170 },
    { id: "kashkadarya", name_uz: "Qashqadaryo", name_ru: "Кашкадарья", defaultDays: 2, lat: 38.860560, lng: 65.789050 },
    { id: "samarkand", name_uz: "Samarqand", name_ru: "Самарканд", defaultDays: 2, lat: 39.654170, lng: 66.959720 },
    { id: "sirdaryo", name_uz: "Sirdaryo", name_ru: "Сырдарья", defaultDays: 2, lat: 40.490000, lng: 68.780000 },
    { id: "surkhandarya", name_uz: "Surxondaryo", name_ru: "Сурхандарья", defaultDays: 2, lat: 37.224170, lng: 67.278330 },
    { id: "karakalpakstan", name_uz: "Qoraqalpog'iston Resp.", name_ru: "Респ. Каракалпакстан", defaultDays: 2, lat: 42.460280, lng: 59.616670 },
];

export const DEFAULT_REGION_ID = "tashkent_city";

export function getRegionById(id?: string): Region {
    return UZBEKISTAN_REGIONS.find(r => r.id === id) || UZBEKISTAN_REGIONS[0];
}

export function getDefaultRegionsDelivery(): Record<string, number> {
    const map: Record<string, number> = {};
    for (const r of UZBEKISTAN_REGIONS) {
        map[r.id] = r.defaultDays;
    }
    return map;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

export function getClosestRegion(lat: number, lng: number): Region {
    // Agar Toshkent markaziga 25 km ichida bo'lsa — Toshkent shahri
    const distToTashkentCity = haversineKm(lat, lng, 41.311081, 69.240562);
    if (distToTashkentCity <= 25) {
        return UZBEKISTAN_REGIONS[0]; // tashkent_city
    }

    let closest = UZBEKISTAN_REGIONS[0];
    let minDistance = Infinity;

    for (const r of UZBEKISTAN_REGIONS) {
        const d = haversineKm(lat, lng, r.lat, r.lng);
        if (d < minDistance) {
            minDistance = d;
            closest = r;
        }
    }
    return closest;
}
