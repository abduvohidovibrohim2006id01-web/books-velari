"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/store/store";
import { translations } from "@/lib/translations";
import { ChevronLeft, Rocket, ShieldCheck, Banknote, PackageCheck, RotateCcw, MessageCircle, Send, Instagram, Phone, Clock } from "lucide-react";
import Link from "next/link";
import {
    ShopSettings,
    DEFAULT_SHOP_SETTINGS,
    formatTelegramLink,
    formatInstagramLink,
    formatPhoneLink
} from "@/lib/shop-settings";

interface AboutClientProps {
    initialSettings?: ShopSettings;
}

export default function AboutClient({ initialSettings }: AboutClientProps) {
    const { language } = useStore();
    const t = translations[language];
    const [settings, setSettings] = useState<ShopSettings>(initialSettings || DEFAULT_SHOP_SETTINGS);

    useEffect(() => {
        if (!initialSettings) {
            fetch("/api/shop-settings")
                .then(res => res.json())
                .then(d => {
                    if (d?.settings) setSettings(d.settings);
                })
                .catch(() => {});
        }
    }, [initialSettings]);

    const icons = [
        <Rocket key="rocket" className="text-blue-500" size={24} />,
        <ShieldCheck key="shield" className="text-green-500" size={24} />,
        <Banknote key="banknote" className="text-yellow-600" size={24} />,
        <PackageCheck key="package" className="text-purple-500" size={24} />,
        <RotateCcw key="rotate" className="text-red-500" size={24} />,
        <MessageCircle key="message" className="text-blue-400" size={24} />
    ];

    const contactIcons: any = {
        "Telegram": <Send size={20} />,
        "Telegram kanal": <Send size={20} />,
        "Telegram канал": <Send size={20} />,
        "Instagram": <Instagram size={20} />,
        "Call center": <Phone size={20} />
    };

    const tgAdminDisplay = settings.telegram_admin?.startsWith("@")
        ? settings.telegram_admin
        : (settings.telegram_admin?.includes("t.me/")
            ? `@${settings.telegram_admin.split("t.me/")[1].replace(/\//g, "")}`
            : `@${settings.telegram_admin || "VELARI_UZ_ADMIN"}`);

    const instaDisplay = settings.instagram
        ? settings.instagram.replace(/^@/, '').replace(/https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '')
        : "velari_uz_";

    const contacts: any[] = [
        {
            label: "Telegram",
            value: tgAdminDisplay,
            link: formatTelegramLink(settings.telegram_admin)
        },
        {
            label: "Instagram",
            value: `@${instaDisplay}`,
            link: formatInstagramLink(settings.instagram)
        },
        {
            label: "Call center",
            value: settings.phone || "+998 95 082 11 88",
            link: formatPhoneLink(settings.phone)
        }
    ];

    if (settings.telegram_channel && settings.telegram_channel !== settings.telegram_admin) {
        const tgChanDisplay = settings.telegram_channel.includes("t.me/")
            ? `@${settings.telegram_channel.split("t.me/")[1].replace(/\//g, "")}`
            : settings.telegram_channel;
        contacts.splice(1, 0, {
            label: language === 'ru' ? "Telegram канал" : "Telegram kanal",
            value: tgChanDisplay.startsWith("@") ? tgChanDisplay : `@${tgChanDisplay}`,
            link: formatTelegramLink(settings.telegram_channel)
        });
    }

    const workingHours = language === 'ru'
        ? (settings.working_hours_ru || settings.working_hours_uz)
        : (settings.working_hours_uz || settings.working_hours_ru);

    return (
        <div className="min-h-screen text-black w-full overflow-x-hidden" style={{ background: "#FAFAF6" }}>
            <div className="w-full px-4 md:px-10 pb-32">
                {/* Header */}
                <div className="flex items-center justify-between mb-8 md:mb-12 pt-8 md:pt-0 w-full border-b border-gray-50 pb-6">
                    <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                        <Link href="/" style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(15,20,16,0.06)", flexShrink: 0, textDecoration: "none", color: "#0F1410" }}>
                            <ChevronLeft size={20} />
                        </Link>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black tracking-tighter italic uppercase truncate">
                                {t.aboutUs.title}
                            </h1>
                            <p className="text-[10px] md:text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-1 max-w-xs md:max-w-none line-clamp-1">
                                {t.aboutUs.subtitle}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main Content Container */}
                <div className="max-w-4xl mx-auto space-y-16 md:space-y-24 animate-in fade-in slide-in-from-bottom-10 duration-1000">
                    
                    {/* 1. Brand Story */}
                    <section className="space-y-6">
                        <div className="inline-block px-4 py-1.5 text-white text-[10px] font-black uppercase tracking-widest rounded-full mb-2" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}>
                             {t.aboutUs.mainTitle}
                        </div>
                        <h2 className="text-3xl md:text-5xl font-black tracking-tighter italic leading-tight max-w-2xl">
                             Electronic Marketplace for Uzbekistan
                        </h2>
                        <div className="space-y-6">
                            {t.aboutUs.mainText.split('\n').map((line: string, i: number) => (
                                <p key={i} className="text-lg md:text-xl text-gray-600 leading-relaxed font-medium">
                                    {line}
                                </p>
                            ))}
                        </div>
                    </section>

                    {/* 2. Mission Section */}
                    <section className="bg-white/90 backdrop-blur-md rounded-[32px] p-8 md:p-12 border border-[rgba(15,20,16,0.06)] shadow-xs">
                        <h3 className="text-xl md:text-2xl font-bold tracking-tight mb-4 text-[#111612]">{t.aboutUs.missionTitle}</h3>
                        <div className="space-y-4">
                            {t.aboutUs.missionText.split('\n').map((line: string, i: number) => (
                                <p key={i} className="text-sm md:text-base text-[#737D75] leading-relaxed">
                                    {line}
                                </p>
                            ))}
                        </div>
                    </section>

                    {/* 3. Why Us Grid */}
                    <section className="space-y-8">
                        <div className="text-center space-y-3">
                            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612]">{t.aboutUs.whyTitle}</h3>
                            <div className="h-1 w-16 mx-auto rounded-full" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            {t.aboutUs.whyItems.map((item: any, i: number) => (
                                <div key={i} className="p-7 bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] rounded-[28px] shadow-xs hover:border-[#2D6E3E]/30 transition-colors duration-200 group">
                                    <div className="w-12 h-12 bg-[#EAF3EC] text-[#2D6E3E] rounded-2xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform shadow-xs">
                                        {icons[i] || <Rocket size={22} />}
                                    </div>
                                    <h4 className="text-base md:text-lg font-bold tracking-tight mb-2 text-[#111612]">{item.title}</h4>
                                    <p className="text-xs md:text-sm text-[#737D75] leading-relaxed">{item.text}</p>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* 4. Stats Grid */}
                    <section className="space-y-6">
                         <h3 className="text-xl md:text-2xl font-bold tracking-tight text-center md:text-left text-[#111612]">{t.aboutUs.statsTitle}</h3>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {t.aboutUs.stats.map((stat: string, i: number) => (
                                <div key={i} className="p-6 rounded-[24px] flex flex-col justify-center items-center text-center group transition-transform duration-200 shadow-sm shadow-[#2D6E3E]/15 border border-white/15" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff" }}>
                                    <span className="text-2xl md:text-3xl font-bold tracking-tight mb-1 group-hover:scale-105 transition-transform">
                                        {stat.split(' ')[0]}
                                    </span>
                                    <span className="text-xs font-semibold uppercase tracking-wider text-white/75">
                                        {stat.substring(stat.indexOf(' ') + 1)}
                                    </span>
                                </div>
                            ))}
                         </div>
                    </section>

                    {/* 5. Promise */}
                    <section className="relative overflow-hidden text-white rounded-[32px] p-8 md:p-14 border border-white/20 shadow-xl shadow-[#2D6E3E]/20" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}>
                         <div className="relative z-10 space-y-6">
                            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{t.aboutUs.promiseTitle}</h3>
                            <div className="space-y-4">
                                {t.aboutUs.promiseText.split('\n').map((line: string, i: number) => (
                                    <p key={i} className="text-base md:text-lg font-normal leading-relaxed text-white/85">
                                        {line}
                                    </p>
                                ))}
                            </div>
                         </div>
                         <div className="absolute -top-24 -right-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                         <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
                    </section>

                    {/* 6. Contacts */}
                    <section className="space-y-8 pb-10">
                        <div className="text-center md:text-left space-y-3">
                            <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612]">{t.aboutUs.contactTitle}</h3>
                            <p className="text-[#737D75] font-normal text-sm md:text-base">{t.aboutUs.contactSubtitle}</p>
                            {workingHours && (
                                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#EAF3EC] border border-[#2D6E3E]/20 text-[#2D6E3E] text-xs font-semibold">
                                    <Clock size={14} />
                                    <span>{language === 'ru' ? "Режим работы:" : "Ish vaqti:"} {workingHours}</span>
                                </div>
                            )}
                        </div>
                        <div className={`grid grid-cols-1 md:grid-cols-2 ${contacts.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"} gap-4`}>
                            {contacts.map((contact: any, i: number) => (
                                <a 
                                    key={i} 
                                    href={contact.link}
                                    target="_blank"
                                    rel="noopener noreferrer" 
                                    className="p-6 bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] hover:border-[#2D6E3E]/30 rounded-[24px] transition-colors duration-200 hover:shadow-md group flex flex-col items-center md:items-start text-center md:text-left gap-3"
                                >
                                    <div className="w-11 h-11 bg-[#EAF3EC] text-[#2D6E3E] rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-xs">
                                        {contact.icon}
                                    </div>
                                    <span className="text-[11px] font-semibold text-[#737D75] uppercase tracking-wider">{contact.label}</span>
                                    <p className="text-sm font-semibold group-hover:text-[#2D6E3E] transition-colors break-all text-[#111612]">{contact.value}</p>
                                </a>
                            ))}
                        </div>
                    </section>

                </div>
            </div>
        </div>
    );
}
