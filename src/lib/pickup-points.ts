export interface PickupPoint {
    id: string;             // Masalan: "emu-182" yoki "bts-0108"
    provider: "bts" | "emu";
    name: string;           // "Angor ofisi" yoki "BTS YUNUSOBOD #0108"
    region_id: string;      // 14 ta viloyatimizdan biri: "tashkent_city", "samarkand", ...
    address: string;        // To'liq manzil
    landmark?: string;      // Mo'ljal
    phone: string;          // Telefon raqami
    schedule?: string;      // "Du-Sha: 09:00 - 18:00"
    lat: number;
    lng: number;
}

let cachedPoints: PickupPoint[] | null = null;
let loadPromise: Promise<PickupPoint[]> | null = null;

async function ensurePointsLoaded(): Promise<PickupPoint[]> {
    if (cachedPoints) return cachedPoints;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const mod = await import("./data/pickup-points.json");
        cachedPoints = (mod.default || mod) as PickupPoint[];
        return cachedPoints;
    })();

    return loadPromise;
}

export async function loadPickupPointsByRegion(regionId: string, provider?: "bts" | "emu"): Promise<PickupPoint[]> {
    const points = await ensurePointsLoaded();
    return points.filter(p => {
        if (p.region_id !== regionId) return false;
        if (provider && p.provider !== provider) return false;
        return true;
    });
}

export function getAllPickupPoints(): PickupPoint[] {
    return cachedPoints || [];
}

export function getPickupPointsByRegion(regionId: string, provider?: "bts" | "emu"): PickupPoint[] {
    if (!cachedPoints) return [];
    return cachedPoints.filter(p => {
        if (p.region_id !== regionId) return false;
        if (provider && p.provider !== provider) return false;
        return true;
    });
}

export function getPickupPointById(id: string): PickupPoint | undefined {
    return (cachedPoints || []).find(p => p.id === id);
}
