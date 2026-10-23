import { Metadata } from "next";

export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
    const lang = params.lang === "ru" ? "ru" : "uz";
    const title = lang === "ru" 
        ? "Reels | Короткие видео и обзоры товаров"
        : "Reels | Qisqa videolar va mahsulot sharhlari";
    const description = lang === "ru"
        ? "Смотрите интересные видео-обзоры современных гаджетов, электроники и товаров в магазине Velari."
        : "Velari do'konidagi zamonaviy gadjetlar va texnikalar haqidagi qiziqarli video sharhlarni tomosha qiling.";

    return {
        title,
        description,
        alternates: {
            canonical: `https://velari.uz/${lang}/reels`,
            languages: {
                "uz-UZ": `https://velari.uz/uz/reels`,
                "ru-RU": `https://velari.uz/ru/reels`,
                "x-default": `https://velari.uz/uz/reels`,
            },
        },
    };
}

export default function ReelsLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
}
