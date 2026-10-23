/**
 * Buyurtma holatlari — yagona manba (normalizatsiya + lokalizatsiya).
 *
 * Tizimda holatlar tarixan o'zbekcha matn sifatida saqlanadi ("Kutilmoqda",
 * "Yetkazilmoqda", "Yetkazildi", "Bekor qilingan", ...). Lekin turli kirish
 * nuqtalari nomuvofiq qiymatlar yozgan: "pending" (inglizcha), "bekor_qilingan",
 * ruscha variantlar va h.k. Bu modul HAR QANDAY xom qiymatni kanonik kodga
 * keltiradi va til bo'yicha ko'rsatiladigan matnni beradi.
 *
 * MUHIM: admin tugmalari va telegram/MLM mantiqlari hali ham o'zbekcha matn
 * yozadi ("Yetkazildi" => MLM, "Bekor qilingan" => refund). Bu yerda faqat
 * KO'RSATISH va FILTRLASH normallashtiriladi; yozuvlar o'zgarmaydi.
 */

export type OrderStatusCode =
    | "awaiting_payment"
    | "accepted"
    | "pending"
    | "shipping"
    | "delivered"
    | "cancelled"
    | "paid";

const RAW_TO_CODE: Record<string, OrderStatusCode> = {
    // To'lov kutilmoqda (yoki eski inglizcha "pending" — place API o'zgartirilgunga qadar)
    "pending": "awaiting_payment",
    "pending_payment": "awaiting_payment",
    "to'lov kutilmoqda": "awaiting_payment",
    "tolov kutilmoqda": "awaiting_payment",
    "to'lov tekshirilmoqda": "awaiting_payment",
    "ожидание оплаты": "awaiting_payment",
    "ожидание": "awaiting_payment",
    // Qabul qilindi (naqd to'lov tanlangan)
    "qabul qilindi": "accepted",
    "accepted": "accepted",
    "принят": "accepted",
    // Kutilmoqda (tasdiq/jo'natishni kutmoqda)
    "kutilmoqda": "pending",
    "kutulmoqda": "pending",
    "в обработке": "pending",
    // Yetkazilmoqda
    "yetkazilmoqda": "shipping",
    "shipping": "shipping",
    "доставляется": "shipping",
    // Yetkazildi
    "yetkazildi": "delivered",
    "delivered": "delivered",
    "доставлено": "delivered",
    // Bekor qilingan
    "bekor qilingan": "cancelled",
    "bekor_qilingan": "cancelled",
    "cancelled": "cancelled",
    "canceled": "cancelled",
    "отменен": "cancelled",
    "отменён": "cancelled",
    // To'landi
    "to'landi": "paid",
    "paid": "paid",
    "оплачено": "paid",
};

const LABELS: Record<OrderStatusCode, { uz: string; ru: string }> = {
    awaiting_payment: { uz: "To'lov kutilmoqda", ru: "Ожидание оплаты" },
    accepted: { uz: "Qabul qilindi", ru: "Принят" },
    pending: { uz: "Kutilmoqda", ru: "В обработке" },
    shipping: { uz: "Yetkazilmoqda", ru: "Доставляется" },
    delivered: { uz: "Yetkazildi", ru: "Доставлено" },
    cancelled: { uz: "Bekor qilingan", ru: "Отменён" },
    paid: { uz: "To'landi", ru: "Оплачено" },
};

/** Xom holat qiymatini kanonik kodga keltiradi. Noma'lum bo'lsa 'pending'. */
export function normalizeOrderStatus(raw?: string | null): OrderStatusCode {
    if (!raw) return "awaiting_payment";
    const key = String(raw).trim().toLowerCase();
    return RAW_TO_CODE[key] ?? "pending";
}

/** Til bo'yicha ko'rsatiladigan holat matni (xom qiymatdan). */
export function getStatusLabel(raw: string | null | undefined, lang: "uz" | "ru"): string {
    return LABELS[normalizeOrderStatus(raw)][lang];
}

/** Holat kodi bo'yicha rang sinfi (Tailwind bg/text) — UI uchun. */
export function getStatusTone(raw: string | null | undefined): "green" | "blue" | "yellow" | "red" | "orange" {
    switch (normalizeOrderStatus(raw)) {
        case "delivered": return "green";
        case "paid": return "blue";
        case "awaiting_payment": return "yellow";
        case "cancelled": return "red";
        default: return "orange"; // accepted / pending / shipping
    }
}

/**
 * Admin filtr yorliqlari => kanonik kodlar guruhi.
 * "Kutilmoqda" yorlig'i jo'natishdan oldingi barcha faol holatlarni qamrab oladi.
 */
export const ADMIN_STATUS_TABS: { label_uz: string; codes: OrderStatusCode[] }[] = [
    { label_uz: "Kutilmoqda", codes: ["pending", "accepted", "awaiting_payment", "paid"] },
    { label_uz: "Yetkazilmoqda", codes: ["shipping"] },
    { label_uz: "Yetkazildi", codes: ["delivered"] },
    { label_uz: "Bekor qilingan", codes: ["cancelled"] },
];
