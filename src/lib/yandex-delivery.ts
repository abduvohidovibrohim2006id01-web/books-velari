/**
 * Yandex Delivery — tezkor (express) yetkazish narxi va vaqtini baholash.
 *
 *  - YANDEX_DELIVERY_TOKEN sozlangan bo'lsa, Yandex B2B Cargo "check-price" API'ga
 *    so'rov yuboriladi va haqiqiy narx/vaqt olinadi.
 *  - Sozlanmagan bo'lsa yoki API xatosi bo'lsa — masofaga asoslangan zaxira (fallback)
 *    hisob ishlatiladi, shunda checkout hech qachon to'xtab qolmaydi.
 *
 *  ETA qoidasi (talab): 30 daqiqa — 1.5 soat. Yandex vaqt qaytarsa, unga +30 daqiqa qo'shiladi.
 */

import { STORE_COORDS } from "./delivery";

export interface ExpressEstimate {
    price: number;        // so'm (yaxlitlangan)
    etaMinMinutes: number;
    etaMaxMinutes: number;
    source: "yandex" | "fallback";
}

// Ikki koordinata orasidagi masofa (km) — Haversine
function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLon = ((b[1] - a[1]) * Math.PI) / 180;
    const lat1 = (a[0] * Math.PI) / 180;
    const lat2 = (b[0] * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Masofaga asoslangan zaxira narx: bazaviy + km narxi, 5000 ga yaxlitlangan
function fallbackEstimate(toCoords: [number, number]): ExpressEstimate {
    const km = haversineKm(STORE_COORDS, toCoords);
    const BASE = 20000;
    const PER_KM = 2500;
    const raw = BASE + km * PER_KM;
    const price = Math.max(20000, Math.round(raw / 5000) * 5000);
    return { price, etaMinMinutes: 30, etaMaxMinutes: 90, source: "fallback" };
}

/**
 * Tezkor yetkazish narxi/vaqtini baholash.
 * @param toCoords mijoz koordinatasi [lat, lng]
 */
export async function estimateExpressDelivery(toCoords: [number, number]): Promise<ExpressEstimate> {
    const token = process.env.YANDEX_DELIVERY_TOKEN?.trim();
    if (!token) return fallbackEstimate(toCoords);

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

        const res = await fetch("https://b2b.taxi.yandex.net/b2b/cargo/integration/v2/check-price", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "Accept-Language": "ru",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                items: [{ quantity: 1, size: { length: 0.2, width: 0.2, height: 0.1 }, weight: 1 }],
                route_points: [
                    { coordinates: [STORE_COORDS[1], STORE_COORDS[0]] }, // Yandex: [lng, lat]
                    { coordinates: [toCoords[1], toCoords[0]] },
                ],
                requirements: { taxi_class: "express" },
                skip_door_to_door: false,
            }),
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!res.ok) return fallbackEstimate(toCoords);
        const data = await res.json();

        // Yandex narxi (string yoki number bo'lishi mumkin)
        const price = Number(data?.price ?? data?.price_raw);
        if (!Number.isFinite(price) || price <= 0) return fallbackEstimate(toCoords);

        // Yandex vaqt qaytarsa (soniyada) — unga +30 daqiqa qo'shamiz
        const etaSeconds = Number(data?.eta ?? data?.distance_meta?.total_time);
        let etaMin = 30, etaMax = 90;
        if (Number.isFinite(etaSeconds) && etaSeconds > 0) {
            const base = Math.round(etaSeconds / 60) + 30; // +30 daqiqa
            etaMin = base;
            etaMax = base + 30;
        }

        return {
            price: Math.max(20000, Math.round(price / 1000) * 1000),
            etaMinMinutes: etaMin,
            etaMaxMinutes: etaMax,
            source: "yandex",
        };
    } catch {
        return fallbackEstimate(toCoords);
    }
}

/** ETA'ni o'qiladigan matnga aylantirish (uz/ru). */
export function formatEta(min: number, max: number, language: "uz" | "ru"): string {
    const fmt = (m: number) => {
        if (m < 60) return language === "uz" ? `${m} daqiqa` : `${m} мин`;
        const h = Math.floor(m / 60);
        const r = m % 60;
        if (r === 0) return language === "uz" ? `${h} soat` : `${h} ч`;
        return language === "uz" ? `${h} soat ${r} daqiqa` : `${h} ч ${r} мин`;
    };
    return `${fmt(min)} — ${fmt(max)}`;
}
