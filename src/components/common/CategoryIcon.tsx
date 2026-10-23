import React from "react";

interface CategoryIconProps {
    categoryId?: string | number;
    slug?: string;
    name?: string;
    size?: number;
    className?: string;
    color?: string;
    accentColor?: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({
    categoryId,
    slug = "",
    name = "",
    size = 48,
    className = "",
    color = "#111612",
    accentColor = "#2D6E3E",
}) => {
    const id = String(categoryId || "");
    const normalizedName = (name + " " + slug).toLowerCase();

    // ID yoki nom orqali mos ikonka turini aniqlash
    const getIconType = (): string => {
        // Erkaklar parvarishi (Soch va soqol)
        if (id === "406" || normalizedName.includes("trimmer") || normalizedName.includes("kantovka")) return "trimmer";
        if (id === "407" || normalizedName.includes("clipper") || normalizedName.includes("mashinka")) return "clipper";
        if (id === "408" || normalizedName.includes("shaver") || normalizedName.includes("sheyver") || normalizedName.includes("ustara")) return "shaver";
        if (id === "412" || normalizedName.includes("body") || normalizedName.includes("tana")) return "body_groomer";
        if (id === "413" || normalizedName.includes("burun") || normalizedName.includes("quloq")) return "nose_trimmer";
        if (id === "414" || normalizedName.includes("universal") || normalizedName.includes("multi-kit")) return "multikit";
        if (id === "409" || normalizedName.includes("bolalar mashinka")) return "kids_clipper";
        if (id === "420") return "men_grooming";

        // Soch parvarishi va turmaklash
        if (id === "403" || normalizedName.includes("fen") && !normalizedName.includes("cho'tka")) return "hair_dryer";
        if (id === "404" || normalizedName.includes("dazmol") || normalizedName.includes("utijok")) return "hair_straightener";
        if (id === "411" || normalizedName.includes("ployka") || normalizedName.includes("jingalak")) return "curler";
        if (id === "402" || normalizedName.includes("cho'tka") || normalizedName.includes("brashing")) return "blowout_brush";
        if (id === "405" || normalizedName.includes("stayler") || normalizedName.includes("styler")) return "hair_styler";
        if (id === "410") return "hair_care";

        // Epilyatsiya va yuz/tana
        if (id === "401" || normalizedName.includes("epilyator")) return "epilator";
        if (id === "431" || normalizedName.includes("fotodepilyator") || normalizedName.includes("ipl")) return "ipl_depilator";
        if (id === "441" || normalizedName.includes("pemza") || normalizedName.includes("tozon")) return "foot_file";
        if (id === "442" || normalizedName.includes("nano") || normalizedName.includes("bug'lagich")) return "face_steamer";
        if (id === "430" || id === "440" || id === "4") return "beauty_root";

        // Quvvatlash va aksessuarlar
        if (id === "307" || normalizedName.includes("powerbank") || normalizedName.includes("akkumulyator")) return "powerbank";
        if (id === "308" || normalizedName.includes("kabel") || normalizedName.includes("adapter") || normalizedName.includes("zaryad")) return "charger_cable";
        if (id === "309" || normalizedName.includes("ushlagich") || normalizedName.includes("holder")) return "car_holder";
        if (id === "341" || normalizedName.includes("magsafe")) return "magsafe";
        if (id === "340") return "power_root";

        // Smart gadjetlar & Audio
        if (id === "304" || normalizedName.includes("smart soat") || normalizedName.includes("soat")) return "smartwatch";
        if (id === "312" || normalizedName.includes("bolalar aqlli soat")) return "kids_watch";
        if (id === "313" || normalizedName.includes("whoop") || normalizedName.includes("bilaguzuk")) return "fitness_band";
        if (id === "314" || normalizedName.includes("treker") || normalizedName.includes("airtag")) return "airtag";
        if (id === "315" || normalizedName.includes("ko'zoynak")) return "smart_glasses";
        if (id === "320") return "smart_gadgets";

        if (id === "303" || normalizedName.includes("tws") || normalizedName.includes("simsiz quloqchin")) return "tws_earbuds";
        if (id === "302" || normalizedName.includes("katta quloqchin") || normalizedName.includes("boshga")) return "overear_headphones";
        if (id === "301" || normalizedName.includes("simli quloqchin")) return "wired_earphones";
        if (id === "311" || normalizedName.includes("kalonka") || normalizedName.includes("akustika") || normalizedName.includes("speaker")) return "speaker";
        if (id === "310") return "audio_root";

        // Foto / Video jihozlari
        if (id === "321" || normalizedName.includes("gimbal") || normalizedName.includes("stabilizator")) return "gimbal";
        if (id === "322" || normalizedName.includes("mikrofon") || normalizedName.includes("lavalier")) return "microphone";
        if (id === "323" || normalizedName.includes("led") || normalizedName.includes("yoritgich") || normalizedName.includes("chiroq")) return "led_light";
        if (id === "324" || normalizedName.includes("shtativ") || normalizedName.includes("tripod")) return "tripod";
        if (id === "330") return "photo_root";

        // Xotira, Tarmoq, TV
        if (id === "351" || id === "350" || normalizedName.includes("ssd") || normalizedName.includes("xotira")) return "ssd_drive";
        if (id === "361" || id === "360" || normalizedName.includes("router") || normalizedName.includes("wi-fi")) return "wifi_router";
        if (id === "306" || id === "370" || normalizedName.includes("televizor") || normalizedName.includes("tv")) return "smart_tv";
        if (id === "3") return "electronics_root";

        // Maishiy texnika
        if (id === "502" || id === "510" || normalizedName.includes("sharbat") || normalizedName.includes("blender")) return "juicer_blender";
        if (id === "535" || normalizedName.includes("katushka")) return "lint_remover";
        if (id === "520" || id === "5") return "home_appliance_root";

        return "default_gadget";
    };

    const type = getIconType();
    const bgSoft = "#E8F3EB"; // Nafis Velari zumrad fon ohangi

    switch (type) {
        // 1. Soqol va kantovka trimmeri (T-blade & compact body)
        case "trimmer":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <path d="M22 10H42L44 18H20L22 10Z" fill={bgSoft} stroke={accentColor} strokeWidth="2.5" strokeLinejoin="round" />
                    <path d="M24 10V6M28 10V6M32 10V6M36 10V6M40 10V6" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                    <path d="M23 18C23 18 22 30 24 44C25 51 28 56 32 56C36 56 39 51 40 44C42 30 41 18 41 18" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="32" cy="32" r="3.5" fill={accentColor} />
                    <line x1="32" y1="42" x2="32" y2="46" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="32" y1="49" x2="32" y2="50" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            );

        // 2. Soch kesish mashinkasi (Keng pichoq & sozlash dastagi)
        case "clipper":
        case "men_grooming":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="18" y="8" width="28" height="8" rx="2" fill={bgSoft} stroke={accentColor} strokeWidth="2.5" />
                    <path d="M20 8V5M24 8V5M28 8V5M32 8V5M36 8V5M40 8V5M44 8V5" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                    <path d="M14 20L18 22" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M20 16L19 38C19 48 24 57 32 57C40 57 45 48 45 38L44 16" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                    <rect x="28" y="30" width="8" height="14" rx="3" fill={color} />
                </svg>
            );

        // 3. Elektr sheyver (To'rli ustara)
        case "shaver":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="18" y="10" width="13" height="10" rx="3" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                    <rect x="33" y="10" width="13" height="10" rx="3" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                    <line x1="21" y1="15" x2="28" y2="15" stroke={accentColor} strokeWidth="1.5" strokeDasharray="2 1" />
                    <line x1="36" y1="15" x2="43" y2="15" stroke={accentColor} strokeWidth="1.5" strokeDasharray="2 1" />
                    <path d="M20 22H44V44C44 51 39 56 32 56C25 56 20 51 20 44V22Z" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                    <rect x="27" y="34" width="10" height="8" rx="2" fill={color} />
                </svg>
            );

        // 4. Tana trimmeri (Body groomer)
        case "body_groomer":
        case "nose_trimmer":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <ellipse cx="32" cy="14" rx="6" ry="6" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                    <line x1="32" y1="10" x2="32" y2="18" stroke={accentColor} strokeWidth="1.8" />
                    <line x1="28" y1="14" x2="36" y2="14" stroke={accentColor} strokeWidth="1.8" />
                    <path d="M24 20H40L38 48C38 53 35 56 32 56C29 56 26 53 26 48L24 20Z" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                    <circle cx="32" cy="32" r="3" fill={accentColor} />
                </svg>
            );

        // 5. Universal grooming to'plam
        case "multikit":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="22" y="16" width="20" height="38" rx="5" stroke={color} strokeWidth="2.5" />
                    <rect x="24" y="8" width="16" height="8" rx="2" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <circle cx="12" cy="24" r="5" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <circle cx="52" cy="24" r="5" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <circle cx="32" cy="32" r="3" fill={accentColor} />
                </svg>
            );

        // 6. Professional soch feni
        case "hair_dryer":
        case "hair_care":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <path d="M12 20H18V32H12V20Z" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" strokeLinejoin="round" />
                    <path d="M18 16C18 16 34 16 42 18C48 20 50 24 50 26C50 28 48 32 42 34C34 36 18 36 18 36" stroke={color} strokeWidth="2.5" />
                    <path d="M46 19C48 21 49 23 49 26C49 29 48 31 46 33" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" />
                    <path d="M34 35L30 54C29 56 31 57 33 57H37C39 57 41 55 42 53L44 34" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                    <path d="M6 23C7.5 24 7.5 28 6 29" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                </svg>
            );

        // 7. Soch dazmollari va utijoklar
        case "hair_straightener":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <path d="M14 18C14 18 34 22 46 22H52V28H46C34 28 14 32 14 32" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M14 32C14 32 34 36 46 36H52V42H46C34 42 14 46 14 46" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <rect x="42" y="24" width="8" height="3" fill={bgSoft} stroke={accentColor} strokeWidth="1.5" />
                    <rect x="42" y="37" width="8" height="3" fill={bgSoft} stroke={accentColor} strokeWidth="1.5" />
                    <circle cx="16" cy="32" r="4" fill={accentColor} />
                </svg>
            );

        // 8. Soch ploykasi (Curler)
        case "curler":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="30" y="8" width="10" height="28" rx="5" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                    <path d="M26 14C26 14 24 20 26 26" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                    <path d="M32 36L30 54C30 56 32 57 35 57C38 57 40 56 40 54L38 36" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                </svg>
            );

        // 9. Fen-cho'tka va brashing
        case "blowout_brush":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="24" y="8" width="16" height="26" rx="4" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                    <path d="M18 14H24M18 20H24M18 26H24M40 14H46M40 20H46M40 26H46" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                    <path d="M28 34L26 54C26 56 28 57 32 57C36 57 38 56 38 54L36 34" stroke={color} strokeWidth="2.5" />
                </svg>
            );

        // 10. Stayler (5-in-1 Dyson analogi)
        case "hair_styler":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <ellipse cx="32" cy="14" rx="8" ry="4" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <line x1="24" y1="14" x2="24" y2="28" stroke={accentColor} strokeWidth="2" />
                    <line x1="40" y1="14" x2="40" y2="28" stroke={accentColor} strokeWidth="2" />
                    <path d="M22 28L24 54C24 56 27 57 32 57C37 57 40 56 40 54L42 28" stroke={color} strokeWidth="2.5" />
                    <circle cx="32" cy="38" r="3" fill={accentColor} />
                </svg>
            );

        // 11. Epilyator & ayollar ustarasi
        case "epilator":
        case "beauty_root":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <path d="M22 14C22 10 26 8 32 8C38 8 42 10 42 14V20H22V14Z" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                    <line x1="28" y1="14" x2="36" y2="14" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                    <path d="M20 20C20 20 18 34 22 46C24 53 28 56 32 56C36 56 40 53 42 46C46 34 44 20 44 20" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="32" cy="34" r="4" fill={accentColor} />
                </svg>
            );

        // 12. Powerbank (Tashqi akkumulyator)
        case "powerbank":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="20" y="12" width="24" height="42" rx="6" fill="#F8FBF9" stroke={color} strokeWidth="2.5" />
                    <rect x="20" y="12" width="24" height="14" rx="6" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <path d="M33 16L30 20H34L31 24" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <line x1="26" y1="12" x2="30" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="34" y1="12" x2="38" y2="12" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="28" cy="46" r="1.5" fill={accentColor} />
                    <circle cx="32" cy="46" r="1.5" fill={accentColor} />
                    <circle cx="36" cy="46" r="1.5" fill={accentColor} />
                </svg>
            );

        // 13. Zaryadlovchi adapter va kabellar
        case "charger_cable":
        case "power_root":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="22" y="18" width="20" height="24" rx="4" fill={bgSoft} stroke={color} strokeWidth="2.5" />
                    <line x1="28" y1="10" x2="28" y2="18" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="36" y1="10" x2="36" y2="18" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                    <rect x="28" y="34" width="8" height="4" rx="1.5" fill={color} />
                    <path d="M32 42C32 50 44 48 44 54" stroke={accentColor} strokeWidth="2.2" strokeLinecap="round" />
                </svg>
            );

        // 14. Smart soatlar
        case "smartwatch":
        case "smart_gadgets":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <path d="M26 8H38V18H26V8Z" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <path d="M26 46H38V56H26V46Z" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <rect x="18" y="18" width="28" height="28" rx="8" fill="#FFFFFF" stroke={color} strokeWidth="2.5" />
                    <rect x="46" y="24" width="3" height="6" rx="1.5" fill={accentColor} />
                    <circle cx="32" cy="32" r="7" stroke={accentColor} strokeWidth="2.5" strokeDasharray="32 10" />
                </svg>
            );

        // 15. Simsiz TWS quloqchinlar
        case "tws_earbuds":
        case "audio_root":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    {/* Charging Case */}
                    <rect x="18" y="22" width="28" height="32" rx="10" fill="#FFFFFF" stroke={color} strokeWidth="2.5" />
                    <line x1="18" y1="34" x2="46" y2="34" stroke={color} strokeWidth="2" />
                    <circle cx="32" cy="42" r="2" fill={accentColor} />
                    {/* Earbuds sticking out */}
                    <path d="M23 14C23 11 26 10 28 12L28 22H24C23 22 23 16 23 14Z" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                    <path d="M41 14C41 11 38 10 36 12L36 22H40C41 22 41 16 41 14Z" fill={bgSoft} stroke={accentColor} strokeWidth="2" />
                </svg>
            );

        // 16. Katta bosh quloqchinlar (Over-ear)
        case "overear_headphones":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <path d="M16 34C16 22 23 12 32 12C41 12 48 22 48 34" stroke={color} strokeWidth="3" strokeLinecap="round" />
                    <rect x="12" y="30" width="8" height="18" rx="4" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                    <rect x="44" y="30" width="8" height="18" rx="4" fill={bgSoft} stroke={accentColor} strokeWidth="2.2" />
                </svg>
            );

        // 17. Bluetooth kalonka
        case "speaker":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="22" y="12" width="20" height="40" rx="8" fill={bgSoft} stroke={color} strokeWidth="2.5" />
                    <circle cx="32" cy="24" r="5" stroke={accentColor} strokeWidth="2" />
                    <circle cx="32" cy="40" r="6" stroke={accentColor} strokeWidth="2.5" />
                    <line x1="28" y1="16" x2="36" y2="16" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                </svg>
            );

        // 18. Simsiz lavalier mikrofon
        case "microphone":
        case "photo_root":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="20" y="16" width="24" height="28" rx="6" fill={bgSoft} stroke={color} strokeWidth="2.5" />
                    <circle cx="32" cy="26" r="4" fill={accentColor} />
                    <line x1="28" y1="36" x2="36" y2="36" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                    <path d="M16 26L20 28" stroke={color} strokeWidth="2" strokeLinecap="round" />
                </svg>
            );

        // 19. LED / RGB chiroq
        case "led_light":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <circle cx="32" cy="28" r="16" fill={bgSoft} stroke={accentColor} strokeWidth="2.5" />
                    <circle cx="32" cy="28" r="10" stroke={accentColor} strokeWidth="2" strokeDasharray="4 2" />
                    <line x1="32" y1="44" x2="32" y2="56" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <path d="M26 56H38" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            );

        // 20. Smart televizor
        case "smart_tv":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="12" y="14" width="40" height="28" rx="3" fill={bgSoft} stroke={color} strokeWidth="2.5" />
                    <line x1="24" y1="48" x2="40" y2="48" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="32" y1="42" x2="32" y2="48" stroke={color} strokeWidth="2.5" />
                </svg>
            );

        // 21. Wi-Fi Router
        case "wifi_router":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="14" y="32" width="36" height="16" rx="4" fill={bgSoft} stroke={color} strokeWidth="2.5" />
                    <line x1="20" y1="16" x2="20" y2="32" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="32" y1="12" x2="32" y2="32" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                    <line x1="44" y1="16" x2="44" y2="32" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                    <circle cx="22" cy="40" r="1.5" fill={accentColor} />
                    <circle cx="28" cy="40" r="1.5" fill={accentColor} />
                    <circle cx="34" cy="40" r="1.5" fill={accentColor} />
                </svg>
            );

        // 22. Tashqi SSD xotira
        case "ssd_drive":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="18" y="16" width="28" height="36" rx="5" fill={bgSoft} stroke={color} strokeWidth="2.5" />
                    <circle cx="38" cy="24" r="3" fill="#FFFFFF" stroke={accentColor} strokeWidth="1.5" />
                    <line x1="24" y1="44" x2="34" y2="44" stroke={accentColor} strokeWidth="2" strokeLinecap="round" />
                </svg>
            );

        // 23. Sharbat chiqargich / blender
        case "juicer_blender":
        case "home_appliance_root":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <path d="M22 14H42L38 38H26L22 14Z" fill={bgSoft} stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
                    <rect x="24" y="38" width="16" height="16" rx="3" fill="#FFFFFF" stroke={color} strokeWidth="2.5" />
                    <circle cx="32" cy="46" r="3" fill={accentColor} />
                    <line x1="20" y1="14" x2="44" y2="14" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" />
                </svg>
            );

        // 24. Kiyimdagi katushka tozalagich
        case "lint_remover":
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <circle cx="32" cy="22" r="12" fill={bgSoft} stroke={accentColor} strokeWidth="2.5" />
                    <circle cx="32" cy="22" r="6" stroke={accentColor} strokeWidth="1.5" strokeDasharray="3 2" />
                    <path d="M28 34L26 52C26 55 29 57 32 57C35 57 38 55 38 52L36 34" stroke={color} strokeWidth="2.5" />
                </svg>
            );

        // 25. Standart Gadjet
        default:
            return (
                <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className}>
                    <rect x="18" y="14" width="28" height="38" rx="6" fill={bgSoft} stroke={color} strokeWidth="2.5" />
                    <line x1="28" y1="14" x2="36" y2="14" stroke={color} strokeWidth="2" strokeLinecap="round" />
                    <circle cx="32" cy="44" r="2.5" fill={accentColor} />
                </svg>
            );
    }
};

export default CategoryIcon;
