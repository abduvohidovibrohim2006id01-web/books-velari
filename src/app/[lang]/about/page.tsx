import { Metadata } from 'next';
import { translations } from "@/lib/translations";
import { getShopSettingsServer } from "@/lib/shop-settings.server";
import AboutClient from "./AboutClient";

export async function generateMetadata({ params: { lang } }: { params: { lang: string } }): Promise<Metadata> {
    const language = (lang === 'ru' ? 'ru' : 'uz') as 'uz' | 'ru';
    const t = translations[language];
    const baseUrl = 'https://velari.uz';
    const settings = await getShopSettingsServer();
    const shopName = settings.name || 'Velari';

    const title = language === 'ru'
        ? `${t.aboutUs.title} | ${shopName} — премиум маркетплейс №1 в Узбекистане`
        : `${t.aboutUs.title} | ${shopName} - O'zbekistonda №1 Premium Marketplace`;
    const description = language === 'ru'
        ? `${t.aboutUs.subtitle}. ${t.aboutUs.mainTitle}. ${shopName} — магазин качественной электроники и бытовой техники в Узбекистане.`
        : `${t.aboutUs.subtitle}. ${t.aboutUs.mainTitle}. ${shopName} market — O'zbekistonda sifatli elektronika va maishiy texnika do'koni.`;

    return {
        title: { absolute: title },
        description: description,
        openGraph: {
            title: title,
            description: description,
            url: `${baseUrl}/${lang}/about`,
            siteName: shopName,
            type: 'website',
            locale: lang === 'ru' ? 'ru_RU' : 'uz_UZ',
        },
        alternates: {
            canonical: `${baseUrl}/${lang}/about`,
            languages: {
                'uz-UZ': `${baseUrl}/uz/about`,
                'ru-RU': `${baseUrl}/ru/about`,
                'x-default': `${baseUrl}/uz/about`,
            },
        },
    };
}

export default async function Page() {
    const settings = await getShopSettingsServer();
    return <AboutClient initialSettings={settings} />;
}
