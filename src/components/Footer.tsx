"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/store/store";
import { translations } from "@/lib/translations";
import { Instagram, Send, Facebook, Youtube, Phone } from "lucide-react";
import { 
    DEFAULT_SHOP_SETTINGS, 
    ShopSettings, 
    formatTelegramLink, 
    formatInstagramLink, 
    formatFacebookLink, 
    formatYoutubeLink, 
    formatPhoneLink 
} from "@/lib/shop-settings";

export default function Footer() {
    const { language } = useStore();
    const t = translations[language];
    const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SHOP_SETTINGS);

    useEffect(() => {
        let mounted = true;
        fetch("/api/shop-settings")
            .then(res => res.json())
            .then(data => {
                if (mounted && data?.settings) {
                    setSettings(data.settings);
                }
            })
            .catch(() => {});
        return () => { mounted = false; };
    }, []);

    return (
        <footer className="bg-white border-t border-gray-100 pt-16 pb-32 md:pb-12 px-4 md:px-10 mt-20">
            <div className="max-w-[1600px] mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-10 md:gap-8 mb-16">
                    {/* Column 1: Biz haqimizda */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-900 text-sm md:text-base">{t.footer.about}</h4>
                        <ul className="space-y-3">
                            <li>
                                <Link href="/about" className="text-gray-500 hover:text-black text-xs transition-colors">
                                    {t.footer.about}
                                </Link>
                            </li>
                            <li>
                                <span className="text-gray-400 text-xs cursor-default">
                                    {t.footer.deliveryPoints}
                                </span>
                            </li>
                            <li>
                                <span className="text-gray-400 text-xs cursor-default">
                                    {t.footer.vacancies}
                                </span>
                            </li>
                        </ul>
                    </div>

                    {/* Column 2: Foydalanuvchilarga */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-900 text-sm md:text-base">{t.footer.forUsers}</h4>
                        <ul className="space-y-3">
                            <li>
                                <a 
                                    href={formatPhoneLink(settings.phone)} 
                                    className="text-gray-700 hover:text-black text-xs transition-colors flex items-center gap-1.5 font-bold"
                                    title="Call-center bilan bog'lanish"
                                >
                                    <Phone size={13} className="text-green-600 shrink-0" />
                                    <span>{settings.phone}</span>
                                </a>
                            </li>
                            <li>
                                <Link href="/about" className="text-gray-500 hover:text-black text-xs transition-colors">
                                    {t.footer.contactUs}
                                </Link>
                            </li>
                            <li>
                                <Link href="/return-policy" className="text-gray-500 hover:text-black text-xs transition-colors">
                                    {language === "uz" ? "Qaytarish va almashtirish" : "Возврат и обмен"}
                                </Link>
                            </li>
                            <li>
                                <span className="text-gray-400 text-xs cursor-default">
                                    {t.footer.faq}
                                </span>
                            </li>
                        </ul>
                    </div>

                    {/* Column 3: Tadbirkorlarga */}
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-900 text-sm md:text-base">{t.footer.forEntrepreneurs}</h4>
                        <ul className="space-y-3">
                            <li>
                                <span className="text-gray-400 text-xs cursor-default">
                                    {t.footer.sellOnVelari}
                                </span>
                            </li>
                            <li>
                                <span className="text-gray-400 text-xs cursor-default">
                                    {t.footer.sellerCabinet}
                                </span>
                            </li>
                            <li>
                                <span className="text-gray-400 text-xs cursor-default">
                                    {t.footer.openDeliveryPoint}
                                </span>
                            </li>
                        </ul>
                    </div>

                    {/* Column 4: App Download & Socials */}
                    <div className="space-y-6">
                        <div className="bg-gray-50 p-6 rounded-[32px] border border-gray-100">
                            <h4 className="font-bold text-gray-900 text-xs mb-2">{t.footer.downloadApp}</h4>
                            <p className="text-[10px] text-gray-500 leading-relaxed">
                                {t.footer.scanToDownload}
                            </p>
                            <div className="mt-4 flex gap-2">
                                <div className="w-12 h-12 bg-white rounded-lg border border-gray-100 flex items-center justify-center p-1">
                                    {/* Placeholder for QR */}
                                    <div className="w-full h-full bg-gray-100 rounded-sm" />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h4 className="font-bold text-gray-900 text-xs">{t.footer.socials}</h4>
                            <div className="flex flex-wrap gap-3">
                                {settings.instagram && (
                                    <a 
                                        href={formatInstagramLink(settings.instagram)} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        aria-label="Instagram"
                                        className="ios-icon-tap w-11 h-11 inline-flex items-center justify-center rounded-2xl bg-black/[0.04] hover:bg-[#2D6E3E] hover:text-white text-[#111612] border border-black/[0.04] transition-colors duration-150 active:scale-95 will-change-transform"
                                    >
                                        <Instagram size={20} strokeWidth={1.9} />
                                    </a>
                                )}
                                {settings.telegram_channel && (
                                    <a 
                                        href={formatTelegramLink(settings.telegram_channel)} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        aria-label="Telegram"
                                        className="ios-icon-tap w-11 h-11 inline-flex items-center justify-center rounded-2xl bg-black/[0.04] hover:bg-[#2D6E3E] hover:text-white text-[#111612] border border-black/[0.04] transition-colors duration-150 active:scale-95 will-change-transform"
                                    >
                                        <Send size={20} strokeWidth={1.9} />
                                    </a>
                                )}
                                {settings.facebook && (
                                    <a 
                                        href={formatFacebookLink(settings.facebook)} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        aria-label="Facebook"
                                        className="ios-icon-tap w-11 h-11 inline-flex items-center justify-center rounded-2xl bg-black/[0.04] hover:bg-[#2D6E3E] hover:text-white text-[#111612] border border-black/[0.04] transition-colors duration-150 active:scale-95 will-change-transform"
                                    >
                                        <Facebook size={20} strokeWidth={1.9} />
                                    </a>
                                )}
                                {settings.youtube && (
                                    <a 
                                        href={formatYoutubeLink(settings.youtube)} 
                                        target="_blank" 
                                        rel="noopener noreferrer" 
                                        aria-label="YouTube"
                                        className="ios-icon-tap w-11 h-11 inline-flex items-center justify-center rounded-2xl bg-black/[0.04] hover:bg-[#2D6E3E] hover:text-white text-[#111612] border border-black/[0.04] transition-colors duration-150 active:scale-95 will-change-transform"
                                    >
                                        <Youtube size={20} strokeWidth={1.9} />
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Legal Section */}
                <div className="pt-10 border-t border-gray-50">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex flex-wrap gap-x-6 gap-y-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-default hover:text-gray-600 transition-colors">
                                {t.footer.privacy}
                            </span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest cursor-default hover:text-gray-600 transition-colors">
                                {t.footer.userAgreement}
                            </span>
                        </div>
                        <div className="text-[10px] text-gray-400 font-medium max-w-sm md:text-right">
                            <p className="mb-1">{t.footer.personalData}</p>
                            <p>{t.footer.copyright}</p>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
