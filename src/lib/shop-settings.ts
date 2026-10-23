// ✅ SAFE: Bu fayl client-side da ham import qilish mumkin.
// supabaseAdmin YO'Q — faqat interface, konstantalar va format funksiyalari.

export interface ShopSettings {
    name: string;
    phone: string;
    secondary_phone?: string;
    telegram_admin: string; // Masalan: "@VELARI_UZ_ADMIN" yoki "https://t.me/VELARI_UZ_ADMIN"
    telegram_channel: string; // Masalan: "https://t.me/velariuz"
    instagram: string; // Masalan: "velari_uz_" yoki "https://instagram.com/velari_uz_"
    facebook?: string; // Masalan: "https://facebook.com/velari.uz"
    youtube?: string; // Masalan: "https://youtube.com/@velariuz"
    address_uz?: string;
    address_ru?: string;
    working_hours_uz?: string;
    working_hours_ru?: string;
}

export const DEFAULT_SHOP_SETTINGS: ShopSettings = {
    name: "Velari",
    phone: "+998 95 082 11 88",
    secondary_phone: "+998 20 014 49 89",
    telegram_admin: "@VELARI_UZ_ADMIN",
    telegram_channel: "https://t.me/velariuz",
    instagram: "velari_uz_",
    facebook: "https://facebook.com/velari.uz",
    youtube: "https://youtube.com/@velariuz",
    address_uz: "Toshkent sh., Sergeli tumani, M. Zamaxshariy 4-tor ko'cha, 17A",
    address_ru: "г. Ташкент, Сергелийский район, ул. М. Замахшари, 4-й проезд, 17А",
    working_hours_uz: "Har kuni 09:00 dan 21:00 gacha",
    working_hours_ru: "Ежедневно с 09:00 до 21:00",
};

export function formatTelegramLink(val?: string): string {
    if (!val) return "";
    const clean = val.trim();
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
    const user = clean.replace(/^@/, "");
    return `https://t.me/${user}`;
}

export function formatInstagramLink(val?: string): string {
    if (!val) return "";
    const clean = val.trim();
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
    const user = clean.replace(/^@/, "");
    return `https://instagram.com/${user}`;
}

export function formatPhoneLink(val?: string): string {
    if (!val) return "";
    const digits = val.replace(/[^\d+]/g, "");
    return `tel:${digits}`;
}

export function formatFacebookLink(val?: string): string {
    if (!val) return "";
    const clean = val.trim();
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
    return `https://facebook.com/${clean.replace(/^@/, "")}`;
}

export function formatYoutubeLink(val?: string): string {
    if (!val) return "";
    const clean = val.trim();
    if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;
    return `https://youtube.com/${clean.startsWith("@") ? clean : `@${clean}`}`;
}
