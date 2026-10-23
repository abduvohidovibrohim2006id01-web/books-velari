// O'zbekistonning rasmiy davlat bayramlari (Oy-Kun formati)
export const FIXED_HOLIDAYS = [
    "01-01", // Yangi yil
    "03-08", // Xalqaro xotin-qizlar kuni
    "03-21", // Navro'z bayrami
    "05-09", // Xotira va qadrlash kuni
    "09-01", // Mustaqillik kuni
    "10-01", // O'qituvchi va murabbiylar kuni
    "12-08", // Konstitutsiya kuni
];

// O'zgaruvchan bayramlar (Ramazon va Qurbon hayiti sanalari)
export const SPECIAL_HOLIDAYS_MAP: Record<number, string[]> = {
    2026: ["2026-03-20", "2026-03-21", "2026-03-22", "2026-05-27", "2026-05-28", "2026-05-29"],
    2027: ["2027-03-10", "2027-05-17"],
};

export function isUzbekistanHoliday(date: Date): boolean {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    const monthDay = `${m}-${d}`;
    const fullDate = `${y}-${m}-${d}`;
    if (FIXED_HOLIDAYS.includes(monthDay)) return true;
    if (SPECIAL_HOLIDAYS_MAP[y]?.includes(fullDate)) return true;
    return false;
}
