const GREEN = "#2D6E3E";

interface TrustStripProps {
    language: "uz" | "ru";
}

const items = [
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M5 12H3l9-9 9 9h-2v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7z" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 22V12h6v10" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        label: { uz: "Bepul", ru: "Бесплатно" },
        sub: { uz: "100K+ dan", ru: "от 100К" },
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M9 12l2 2 4-4" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        label: { uz: "12 oy", ru: "12 мес" },
        sub: { uz: "Kafolat", ru: "Гарантия" },
    },
    {
        icon: (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M3 9l4-4 4 4M7 5v14" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M21 15l-4 4-4-4M17 19V5" stroke={GREEN} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
        ),
        label: { uz: "14 kun", ru: "14 дней" },
        sub: { uz: "Qaytarish", ru: "Возврат" },
    },
];

export default function TrustStrip({ language }: TrustStripProps) {
    return (
        <div className="md:hidden mx-4 mt-8 mb-2">
            <div style={{
                padding: "16px 8px",
                borderRadius: 22,
                background: "#fff",
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 8,
                boxShadow: "0 2px 8px rgba(15,20,16,0.04)",
            }}>
                {items.map((item, i) => (
                    <div key={i} style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: 5,
                        padding: "4px 0",
                    }}>
                        {item.icon}
                        <span style={{ fontSize: 13, fontWeight: 700, color: "#0F1410", letterSpacing: -0.2 }}>
                            {item.label[language]}
                        </span>
                        <span style={{ fontSize: 11, color: "#9AA29C", fontWeight: 500 }}>
                            {item.sub[language]}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
