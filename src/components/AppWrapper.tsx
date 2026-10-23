"use client";

import { usePathname } from "next/navigation";
import Navigation from "@/components/Navigation";
import dynamic from "next/dynamic";
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });
const PWAInstallPrompt = dynamic(() => import("@/components/PWAInstallPrompt"), { ssr: false });
const PWAFlow = dynamic(() => import("@/components/pwa/PWAFlow"), { ssr: false });

import Link from "next/link";
import { MessageSquare, CheckCircle, AlertCircle, Info } from "lucide-react";
import { useStore } from "@/store/store";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import ErrorBoundary from "@/components/ErrorBoundary";
import ConnectivityListener from "@/components/common/ConnectivityListener";


import { subscribeToPushNotifications } from "@/lib/push-notifications";
import { Language } from "@/types";
import DynamicFavicon from "@/components/common/DynamicFavicon";
import SmartTabTitle from "@/components/common/SmartTabTitle";

export default function AppWrapper({ children, lang }: { children: React.ReactNode, lang?: string }) {
    const cart = useStore(state => state.cart);
    const user = useStore(state => state.user);
    const toast = useStore(state => state.toast);
    const setLanguage = useStore(state => state.setLanguage);

    const pathname = usePathname();

    // Sync language from URL to Store & Supabase
    useEffect(() => {
        if (lang && (lang === 'uz' || lang === 'ru')) {
            setLanguage(lang as Language);
            if (user?.phone) {
                const syncKey = `${user.phone}:${lang}`;
                if (typeof window !== "undefined" && sessionStorage.getItem("synced_lang") !== syncKey) {
                    sessionStorage.setItem("synced_lang", syncKey);
                    fetch('/api/user/language', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ language: lang, phone: user.phone })
                    }).catch(() => {});
                }
            }
        }
    }, [lang, setLanguage, user?.phone]);

    // 📱 Telegram WebApp & Mini App Header Color Support
    // (telegram-web-app.js faqat Telegram ichida async yuklanadi — yuklangach ham qo'llanadi)
    useEffect(() => {
        if (typeof window === "undefined") return;
        const apply = () => {
            const tg = (window as any).Telegram?.WebApp;
            if (!tg) return;
            try {
                tg.ready?.();
                tg.setHeaderColor?.('#2d6e3e');
                tg.setBackgroundColor?.('#ffffff');
                tg.expand?.();
            } catch {
                // silent fallback
            }
        };
        apply();
        window.addEventListener("telegram-webapp-ready", apply);
        return () => window.removeEventListener("telegram-webapp-ready", apply);
    }, [pathname]);

    // 🛡️ GLOBAL API ERROR HANDLER
    useEffect(() => {
        const handlePromiseError = (event: PromiseRejectionEvent) => {
            if (event.reason?.status === 429) {
                useStore.getState().showToast(
                    lang === 'uz' ? "Juda ko'p urinish! Iltimos, bir oz kutib turing." : "Too many requests! Please wait a moment.", 
                    "error"
                );
            } else if (event.reason?.status === 401) {
                useStore.getState().showToast(
                    lang === 'uz' ? "Sessiya muddati tugadi. Iltimos, qayta kiring." : "Session expired. Please login again.", 
                    "info"
                );
            }
        };

        window.addEventListener('unhandledrejection', handlePromiseError);
        return () => window.removeEventListener('unhandledrejection', handlePromiseError);
    }, [lang, pathname]);

    // Real-time Activity & Action Tracking
    useEffect(() => {
        let intervalId: any;
        const sessionId = user?.phone || (() => {
            const stored = localStorage.getItem("shop_visitor_id");
            if (stored) return stored;
            const newId = "visitor_" + Math.random().toString(36).substring(2, 11);
            localStorage.setItem("shop_visitor_id", newId);
            return newId;
        })();

        const getFriendlyPath = (path: string) => {
            if (path === "/") return "Asosiy sahifa";
            if (path.startsWith("/products/")) return "Mahsulot ko'rmoqda";
            if (path === "/cart") return "Savatda";
            if (path === "/wishlist") return "Saralanganlarda";
            if (path === "/catalog") return "Katalogni ko'rmoqda";
            if (path === "/checkout") return "Buyurtma bermoqda";
            if (path === "/account") return "Profilida";
            if (path === "/login") return "Kirish sahifasida";
            if (path.startsWith("/admin")) return "Admin Panelda";
            if (path.startsWith("/messages")) return "Xabarlarda";
            return path;
        };

        const fetchGlobalPromo = useStore.getState().fetchGlobalPromo;

        const updateActivity = async (action: string = "Ko'rmoqda") => {
            // Completely silent tracking - no toasts shown if this fails
            try {
                // Skip tracking for Admin users (prevents 406 Not Acceptable)
                if (user?.phone === 'ADMIN') return;

                // ── 1. GEO (sessionStorage'dan o'qish, tashqi ipapi.co ga so'rov yuborilmaydi) ──
                let geoData: any = {};
                try {
                    const cachedGeo = sessionStorage.getItem("tracked_geo");
                    if (cachedGeo) {
                        geoData = JSON.parse(cachedGeo);
                    }
                } catch {}

                // ── 2. QURILMA (Device info — insta skrab usuli) ──
                const ua = navigator.userAgent;
                let deviceType = "Desktop";
                if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) {
                    deviceType = /iPad/i.test(ua) ? "Tablet" : "Mobile";
                }

                const deviceInfo = {
                    screen_resolution: `${window.screen.width}x${window.screen.height}`,
                    device_type: deviceType,
                    device_memory: (navigator as any).deviceMemory || null,
                    cpu_cores: navigator.hardwareConcurrency || null,
                };
                fetch("/api/client-sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        type: "status",
                        payload: {
                            id: sessionId,
                            user_phone: user?.phone || null,
                            name: user?.name || "Mehmon",
                            ip_address: geoData.ip || "Unknown",
                            last_seen: new Date().toISOString(),
                            is_online: true,
                            current_path: getFriendlyPath(pathname),
                            last_action: action,
                            type: user?.phone ? "user" : "visitor",
                            screen_resolution: deviceInfo.screen_resolution,
                            device_type: deviceInfo.device_type,
                            device_memory: deviceInfo.device_memory,
                            cpu_cores: deviceInfo.cpu_cores,
                            city: geoData.city || null,
                            region: geoData.region || null,
                            country: geoData.country || null,
                            isp: geoData.isp || null,
                            latitude: geoData.latitude || null,
                            longitude: geoData.longitude || null
                        }
                    })
                }).catch(() => {});

            } catch (error) {
                if (process.env.NODE_ENV === 'development') {
                    console.warn("[Activity Tracking]", error);
                }
            }
        };

        // Click tracking — debounce bilan optimallashtirilgan
        let clickTimeout: ReturnType<typeof setTimeout>;
        const handleGlobalClick = (e: MouseEvent) => {
            clearTimeout(clickTimeout);
            clickTimeout = setTimeout(() => {
                const target = e.target as HTMLElement;
                let actionText = "Klikladi";

                if (target.closest('button')) {
                    const btn = target.closest('button');
                    actionText = btn?.innerText || btn?.ariaLabel || "Tugma bosildi";
                } else if (target.closest('a')) {
                    actionText = "Havolaga o'tdi";
                }

                updateActivity(actionText.substring(0, 30));
            }, 10000); 
        };

        document.addEventListener('click', handleGlobalClick);

        const ric = (cb: () => void) =>
            (window as any).requestIdleCallback?.(cb, { timeout: 3000 }) ?? setTimeout(cb, 1500);
        ric(() => {
            updateActivity();
            fetchGlobalPromo();
            useStore.getState().fetchPersonalOffers();
            useStore.getState().fetchWarehouses();
        });
        intervalId = setInterval(() => updateActivity(), 120000);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                updateActivity("Sahifaga qaytdi");
            }
        };

        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('click', handleGlobalClick);
            document.removeEventListener("visibilitychange", handleVisibility);
        };
    }, [user?.phone, pathname]);

    // Foydalanuvchi saytdan chiqib ketganda (tab yopilganda/boshqa saytga o'tganda) oflayn qilish
    useEffect(() => {
        if (typeof window === "undefined") return;

        const handlePageHide = () => {
            if (user?.phone === 'ADMIN') return;
            const sessionId = user?.phone || localStorage.getItem("shop_visitor_id");
            if (!sessionId) return;

            fetch("/api/client-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "status_update",
                    payload: { id: sessionId, is_online: false }
                }),
                keepalive: true
            }).catch(() => {});
        };

        window.addEventListener("pagehide", handlePageHide);
        return () => window.removeEventListener("pagehide", handlePageHide);
    }, [user?.phone]);

    // Sync cart to Supabase
    useEffect(() => {
        if (!user?.phone) return;

        const syncCart = async () => {
            fetch("/api/client-sync", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "cart",
                    payload: {
                        user_phone: user.phone,
                        items: cart.length > 0 ? cart.map(item => ({
                            id: item.id,
                            quantity: item.quantity,
                            name: item.name || "",
                            price: item.price || 0,
                            image: item.image || ""
                        })) : []
                    }
                })
            }).catch(() => {});
        };

        const timer = setTimeout(syncCart, 2000);
        return () => clearTimeout(timer);
    }, [cart, user?.phone]);
    
    // 🔔 Push Notifications Setup
    useEffect(() => {
        const setupPush = async () => {
            // Bir oz kutib keyin so'raymiz (foydalanuvchi cho'chib ketmasligi uchun)
            setTimeout(async () => {
                await subscribeToPushNotifications(user?.phone);
            }, 5000);
        };
        setupPush();
    }, [user?.phone]);

    // 🔗 Affiliate attribution sync: login bo'lganda cookie'dagi ref'larni
    // serverga ko'chiramiz (mehmon havola bosib, keyin login qilsa — cross-device ishlaydi)
    useEffect(() => {
        if (!user?.phone) return;
        const cookieStr = document.cookie.split('; ').find(row => row.startsWith('affiliate_data='));
        if (!cookieStr) return;
        try {
            const items = JSON.parse(decodeURIComponent(cookieStr.split('=')[1]));
            if (items && Object.keys(items).length > 0) {
                fetch("/api/affiliate/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ items }),
                }).catch(() => null);
            }
        } catch { /* noto'g'ri cookie */ }
    }, [user?.phone]);



    // ⚠️ pathname locale prefiksi bilan keladi (masalan "/uz/checkout"), chunki
    // middleware redirect qiladi (rewrite emas). Shu sabab oldingi "=== '/checkout'"
    // tekshiruvlari hech qachon mos kelmagan va nav/footer hamma joyda chiqib ketgan.
    // Locale'ni olib tashlab, toza yo'l bo'yicha tekshiramiz.
    const pathWithoutLocale = (() => {
        if (!pathname) return "/";
        const m = pathname.match(/^\/(uz|ru)(?=\/|$)/);
        const p = m ? pathname.slice(m[0].length) : pathname;
        return p === "" ? "/" : p;
    })();

    const isAdmin = pathWithoutLocale.startsWith("/admin");
    const isProductDetail = pathWithoutLocale.startsWith("/products/");
    // Show navigation on main messages list, but hide inside actual chat rooms
    const isChat = pathWithoutLocale === "/chat" || (pathWithoutLocale.startsWith("/messages/") && pathWithoutLocale !== "/messages");
    const isCheckout = pathWithoutLocale === "/checkout";
    const isPayment = pathWithoutLocale === "/payment";
    const isMessages = pathWithoutLocale === "/messages";
    // Footer (Biz haqimizda / Foydalanuvchilarga / Tadbirkorlarga) faqat profil bo'limida
    const isAccount = pathWithoutLocale === "/account" || pathWithoutLocale.startsWith("/account/");

    // Manual Scroll Restoration Logic (debounced + passive listener)
    useEffect(() => {
        let timer: NodeJS.Timeout;
        const handleScroll = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                try {
                    sessionStorage.setItem(`scroll_${pathname}`, window.scrollY.toString());
                } catch {}
            }, 300);
        };

        const savedScroll = sessionStorage.getItem(`scroll_${pathname}`);
        if (savedScroll) {
            setTimeout(() => {
                window.scrollTo({
                    top: parseInt(savedScroll),
                    behavior: 'instant'
                });
            }, 50);
        }

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => {
            clearTimeout(timer);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [pathname]);

    if (isAdmin) {
        return (
            <>
                <ConnectivityListener />
                {children}
            </>
        );
    }

    const isReels = pathWithoutLocale === "/reels";
    const showNav = !isCheckout && !isPayment && !isChat;

    return (
        <div className={`
            mx-auto ${isReels ? 'bg-black' : 'bg-white'} min-h-screen relative w-full max-w-full lg:max-w-[1600px] overflow-x-clip
            ${showNav ? (isReels ? '' : (pathWithoutLocale === '/' || isProductDetail) ? 'md:pt-28' : 'pt-16 md:pt-28') : ''}
        `}>
            <ConnectivityListener />
            <DynamicFavicon />
            <SmartTabTitle />
            {showNav && <Navigation />}

            <PWAFlow />
            <ErrorBoundary>
                <PWAInstallPrompt />

                {children}
            </ErrorBoundary>

            {showNav && isAccount && <Footer />}

            {/* Animated Toast Notification — to'g'ri subscribe qilingan */}
            {toast && !toast.message.toLowerCase().includes('failed to fetch') && (
                <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-sm animate-in fade-in slide-in-from-top-full duration-500">
                    <div className={`
                        flex items-center gap-3 p-4 rounded-3xl shadow-2xl backdrop-blur-xl border
                        ${toast.type === 'success' ? 'bg-black/90 text-white border-white/10' :
                            toast.type === 'error' ? 'bg-red-500/90 text-white border-red-400/20' :
                                'bg-white/90 text-black border-gray-100'}
                    `}>
                        <div className="shrink-0">
                            {toast.type === 'success' && <CheckCircle size={20} className="text-green-400" />}
                            {toast.type === 'error' && <AlertCircle size={20} className="text-white" />}
                            {toast.type === 'info' && <Info size={20} className="text-blue-400" />}
                        </div>
                        <p className="text-[11px] font-black uppercase tracking-widest leading-none">
                            {toast.message}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
