import "../globals.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { i18n } from "@/lib/i18n-config";

export async function generateStaticParams() {
    return i18n.locales.map((locale) => ({ lang: locale }));
}

const inter = Inter({
    subsets: ["latin", "cyrillic"],
    display: "swap",
    variable: "--font-inter",
});

const DEFAULT_META = {
    uz: {
        title: "Velari | Zamonaviy Texnologiyalar va Gadjetlar Dunyosi",
        description: "Premium gadjetlar va elektronika do'koni. Apple, Samsung, Xiaomi mahsulotlari hamyonbop narxlarda. Muddatli to'lov, rasmiy kafolat va O'zbekiston bo'ylab yetkazib berish.",
        ogDescription: "O'zbekistondagi premium elektronika do'koni. Global brendlar, rasmiy kafolat va tez yetkazib berish. iPhone, Samsung va Xiaomi — muddatli to'lovga.",
    },
    ru: {
        title: "Velari | Мир современных технологий и гаджетов",
        description: "Магазин премиальных гаджетов и электроники. Apple, Samsung, Xiaomi по доступным ценам. Рассрочка, официальная гарантия и доставка по всему Узбекистану.",
        ogDescription: "Премиальный магазин электроники в Узбекистане. Мировые бренды, официальная гарантия и быстрая доставка. iPhone, Samsung и Xiaomi в рассрочку.",
    },
};

// Umumiy alternates.languages YO'Q: har indekslanadigan sahifa o'z canonical + hreflang'ini beradi.
// Aks holda alternates'siz sahifa bosh sahifaga ishora qiluvchi hreflang'ni meros oladi.
export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
    const lang = params.lang === "ru" ? "ru" : "uz";
    const t = DEFAULT_META[lang];
    return {
        title: {
            default: t.title,
            template: "%s | Velari"
        },
        description: t.description,
        keywords: [
            "Velari", "velari.uz", "elektronika do'koni", "gadjetlar", "iphone narxi", "samsung narxi", 
            "Toshkent", "O'zbekistan", "muddatli to'lov", "bo'lib to'lash", "kreditga telefon", 
            "online shop", "internet do'kon", "arzon narxlar", "kafolatli texnika"
        ],
        authors: [{ name: "Velari Team" }],
        creator: "Velari",
        publisher: "Velari",
        formatDetection: {
            email: false,
            address: false,
            telephone: false,
        },
        icons: {
            icon: [
                { url: "/favicon.ico" },
                { url: "/favicon-120x120.png", sizes: "120x120", type: "image/png" },
                { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
                { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
            ],
            apple: [
                { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
            ],
            shortcut: "/favicon.ico",
        },
        metadataBase: new URL("https://velari.uz"),
        robots: {
            index: true,
            follow: true,
            googleBot: {
                index: true,
                follow: true,
                'max-video-preview': -1,
                'max-image-preview': 'large',
                'max-snippet': -1,
            },
        },
        openGraph: {
            title: t.title,
            description: t.ogDescription,
            siteName: "Velari",
            images: [
                {
                    url: "/og-image.png",
                    width: 1200,
                    height: 630,
                    alt: "Velari Premium Electronics Store",
                },
            ],
            locale: lang === "ru" ? "ru_RU" : "uz_UZ",
            alternateLocale: lang === "ru" ? "uz_UZ" : "ru_RU",
            type: "website",
        },
        twitter: {
            card: "summary_large_image",
            title: t.title,
            description: t.ogDescription,
            images: ["/og-image.png"],
        },
        manifest: "/manifest.json",
        appleWebApp: {
            capable: true,
            statusBarStyle: "default",
            title: "Velari",
        },
        verification: {
            // Bir nechta Google Search Console mulki/egasi tasdig'i — massiv => bir nechta meta-teg.
            google: [
                "LTHMhrgHGixfKuNRWuOnvLrkiUHaTuTiy1kCG",
                "5mBCVxCoaxs77dV8KxCXZg7IOPa0ue7NKGB1C-6gS1A",
            ],
            // Yandex Webmaster tasdig'i — public/yandex_878ca82305d690c8.html bilan bir xil kod.
            // Next.js buni <meta name="yandex-verification" content="..."> qilib render qiladi.
            yandex: "878ca82305d690c8",
        },
    };
}

export const viewport = {
    themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#2d6e3e" },
        { media: "(prefers-color-scheme: dark)", color: "#1E4E2B" },
    ],
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover" as const,
};

import AppWrapper from "@/components/AppWrapper";
import YandexMetrika from "@/components/YandexMetrika";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import MetaPixel from "@/components/MetaPixel";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getShopSettingsServer } from "@/lib/shop-settings.server";
import {
    formatTelegramLink,
    formatInstagramLink,
    formatFacebookLink,
    formatYoutubeLink,
} from "@/lib/shop-settings";

export default async function RootLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: { lang: string };
}) {
    const validLang = ['uz', 'ru'].includes(params?.lang) ? params.lang : 'uz';
    const settings = await getShopSettingsServer();
    const shopName = settings.name || "Velari";

    const cleanPrimaryPhone = (settings.phone || "+998950821188").replace(/[^\d+]/g, "");
    const cleanSecondaryPhone = settings.secondary_phone ? settings.secondary_phone.replace(/[^\d+]/g, "") : null;

    const contactPoints = [
        {
            "@type": "ContactPoint",
            "telephone": cleanPrimaryPhone,
            "contactType": "customer service",
            "areaServed": "UZ",
            "availableLanguage": ["Uzbek", "Russian"]
        }
    ];

    if (cleanSecondaryPhone) {
        contactPoints.push({
            "@type": "ContactPoint",
            "telephone": cleanSecondaryPhone,
            "contactType": "sales",
            "areaServed": "UZ",
            "availableLanguage": ["Uzbek", "Russian"]
        });
    }

    const sameAs: string[] = [];
    if (settings.instagram) sameAs.push(formatInstagramLink(settings.instagram));
    if (settings.telegram_channel) sameAs.push(formatTelegramLink(settings.telegram_channel));
    if (settings.telegram_admin) sameAs.push(formatTelegramLink(settings.telegram_admin));
    if (settings.facebook) sameAs.push(formatFacebookLink(settings.facebook));
    if (settings.youtube) sameAs.push(formatYoutubeLink(settings.youtube));

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "WebSite",
        "name": shopName,
        "url": "https://velari.uz",
        "potentialAction": {
            "@type": "SearchAction",
            "target": "https://velari.uz/" + validLang + "/catalog?q={search_term_string}",
            "query-input": "required name=search_term_string"
        }
    };

    const orgJsonLd = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": shopName,
        "url": "https://velari.uz",
        "logo": "https://velari.uz/logo.png",
        "contactPoint": contactPoints,
        "sameAs": sameAs.length > 0 ? sameAs : [
            "https://instagram.com/velari_uz_",
            "https://t.me/VELARI_UZ_ADMIN"
        ]
    };

    const phonesList = cleanSecondaryPhone ? [cleanPrimaryPhone, cleanSecondaryPhone] : [cleanPrimaryPhone];

    const storeJsonLd = {
        "@context": "https://schema.org",
        "@type": "Store",
        "name": shopName,
        "url": "https://velari.uz",
        "image": "https://velari.uz/logo.png",
        "telephone": phonesList,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": settings.address_uz || "Tashkent",
            "addressLocality": "Tashkent",
            "addressRegion": "Tashkent",
            "postalCode": "100000",
            "addressCountry": "UZ"
        },
        "geo": {
            "@type": "GeoCoordinates",
            "latitude": "41.2995",
            "longitude": "69.2401"
        },
        "priceRange": "$$",
        "openingHoursSpecification": [
            {
                "@type": "OpeningHoursSpecification",
                "dayOfWeek": [
                    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"
                ],
                "opens": "00:00",
                "closes": "23:59"
            }
        ]
    };

    const displayLang = validLang;

    return (
        <html lang={displayLang} className={inter.variable}>
            <head>
                <meta name="theme-color" content="#2d6e3e" />
                <meta name="theme-color" media="(prefers-color-scheme: light)" content="#2d6e3e" />
                <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1E4E2B" />
                <meta name="msapplication-navbutton-color" content="#2d6e3e" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="telegram:header_color" content="#2d6e3e" />
                {/* telegram-web-app.js — faqat Telegram Mini App ichida (boshqa hamma uchun ~40 KB ortiqcha JS) */}
                <script dangerouslySetInnerHTML={{ __html: `(function(){try{var h=location.hash||"";var inTg=h.indexOf("tgWebAppData")>=0||!!window.TelegramWebviewProxy||!!sessionStorage.getItem("__telegram__initParams");if(!inTg)return;var s=document.createElement("script");s.src="https://telegram.org/js/telegram-web-app.js";s.async=true;s.onload=function(){window.dispatchEvent(new Event("telegram-webapp-ready"))};document.head.appendChild(s)}catch(e){}})();` }} />

                <link rel="icon" href="/favicon.ico" sizes="any" />
                <link rel="icon" type="image/png" sizes="120x120" href="/favicon-120x120.png" />
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192x192.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512x512.png" />
                <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

                <link rel="preconnect" href="https://storage.yandexcloud.net" crossOrigin="anonymous" />
                <link rel="dns-prefetch" href="https://storage.yandexcloud.net" />
                <link rel="preconnect" href="https://slmbethqqqugnktxwzdz.supabase.co" crossOrigin="anonymous" />
                <link rel="dns-prefetch" href="https://slmbethqqqugnktxwzdz.supabase.co" />

                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
                />

                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{ __html: JSON.stringify(storeJsonLd) }}
                />
            </head>
            <body className="bg-[#FAFAF6] text-[#111612] antialiased font-sans w-full max-w-full min-h-screen selection:bg-[#2D6E3E]/15 selection:text-[#2D6E3E]">
                <a href="#main-content" className="skip-to-main">
                    Asosiy kontentga o&apos;tish
                </a>

                <div id="main-content" className="w-full max-w-full">
                    <AppWrapper lang={displayLang}>
                        {children}
                    </AppWrapper>
                </div>
                <YandexMetrika ymid="107383008" />
                <GoogleAnalytics gaId="G-26H8F7XC2T" />
                <MetaPixel pixelId="1593828215426388" />
                <Analytics />
                <SpeedInsights />
                <script dangerouslySetInnerHTML={{ __html: `
                    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone || document.referrer.includes('android-app://')) {
                        document.documentElement.classList.add('is-pwa');
                        document.body.classList.add('is-pwa');
                    }
                `}} />
            </body>
        </html>
    );
}

