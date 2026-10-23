import { Product } from "@/types";

export interface PromoSettings {
    enabled: boolean;
    start_time: string;
    end_time: string;
    discount_percent: number;
    target_type: "all" | "category" | "brand" | "manual";
    target_ids: string[];
}

export function applyGlobalPromo(product: Product, globalPromo: PromoSettings | null): Product {
    if (!globalPromo || !globalPromo.enabled) return product;

    // Vaqt oralig'ini tekshirish
    const now = Date.now();
    const start = new Date(globalPromo.start_time).getTime();
    const end = new Date(globalPromo.end_time).getTime();

    if (now < start || now > end) return product; // Hali boshlanmagan yoki tugagan
    if (!globalPromo.discount_percent || globalPromo.discount_percent <= 0) return product;

    // Target tekshiruvi
    let isTargeted = false;
    if (globalPromo.target_type === "all") {
        isTargeted = true;
    } else if (globalPromo.target_type === "category") {
        isTargeted = globalPromo.target_ids.includes(product.category || "");
    } else if (globalPromo.target_type === "brand") {
        isTargeted = globalPromo.target_ids.includes((product as any).brand_id || "");
    } else if (globalPromo.target_type === "manual") {
        isTargeted = globalPromo.target_ids.includes(product.id);
    }

    if (!isTargeted) return product;

    // Chegirmani qo'llash
    // Agar eski narx bo'lmasa, oldPrice sifatida joriy price olinadi.
    const originalPrice = product.price;
    const newPrice = Math.floor(originalPrice * (1 - globalPromo.discount_percent / 100));

    return {
        ...product,
        oldPrice: product.oldPrice && product.oldPrice > originalPrice ? product.oldPrice : originalPrice,
        price: newPrice,
    };
}
