/**
 * Yetkazib berish narxlari va qoidalari — bitta manbada (cart, checkout, place_order).
 *
 *  Standart (uyga, Toshkent shahri bo'ylab):
 *    - buyurtma summasi < 150 000 so'm  → 25 000 so'm
 *    - buyurtma summasi >= 150 000 so'm → BEPUL
 *
 *  Tezkor (express) — faqat admin belgilagan mahsulotlar uchun:
 *    - narx Yandex Delivery API orqali masofaga qarab hisoblanadi
 *    - buyurtma summasi < 600 000 so'm  → pullik (hisoblangan narx)
 *    - buyurtma summasi >= 600 000 so'm → BEPUL
 *    - ETA: 30 daqiqa — 1.5 soat (yoki Yandex bergan vaqt + 30 daqiqa)
 */

export const FREE_DELIVERY_THRESHOLD = 150000;      // standart yetkazish bepul bo'ladigan chegara
export const STANDARD_DELIVERY_FEE = 25000;          // standart yetkazish narxi (Toshkent)
export const EXPRESS_FREE_THRESHOLD = 600000;        // tezkor yetkazish bepul bo'ladigan chegara
export const RETURN_WINDOW_DAYS = 14;                // sifatli tovarni qaytarish muddati (return-policy sahifasi)

// Do'kon (jo'natuvchi) koordinatasi — express masofa shu nuqtadan hisoblanadi
export const STORE_COORDS: [number, number] = [41.239674, 69.248763];

export type DeliveryType = "standard" | "express";

/** Standart yetkazish narxini buyurtma summasiga qarab qaytaradi. */
export function computeStandardDelivery(orderAmount: number): number {
    return orderAmount >= FREE_DELIVERY_THRESHOLD ? 0 : STANDARD_DELIVERY_FEE;
}

/** Tezkor yetkazish bepulmi (buyurtma summasiga qarab)? */
export function isExpressFree(orderAmount: number): boolean {
    return orderAmount >= EXPRESS_FREE_THRESHOLD;
}

/** Narxni mahalliy formatda ko'rsatish (uz/ru). */
export function fmtSom(n: number, language: "uz" | "ru"): string {
    return n.toLocaleString("ru-RU") + (language === "ru" ? " сум" : " so'm");
}

/** Standart yetkazish izohi (bepulgacha qancha qolgani). */
export function standardDeliveryHint(orderAmount: number, language: "uz" | "ru"): string | null {
    if (orderAmount >= FREE_DELIVERY_THRESHOLD) return null;
    const left = FREE_DELIVERY_THRESHOLD - orderAmount;
    return language === "uz"
        ? `Yana ${fmtSom(left, "uz")} xarid qiling — yetkazish bepul bo'ladi`
        : `Купите ещё на ${fmtSom(left, "ru")} — доставка станет бесплатной`;
}
