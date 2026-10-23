"use client";

import Link from "next/link";
import { LayoutDashboard, ShoppingCart, Package, Layers, LogOut, Menu, X, Users, Image as ImageIcon, Database, Settings, Sparkles, Activity, Zap, MessageSquare, ShieldAlert, ShieldCheck, Truck, Warehouse, RotateCcw, Tag, Banknote, Wallet, BookOpen, ClipboardList, BookA, Bell, Timer, Percent, Grid, ChevronDown, DollarSign, Brain, HelpCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/store/store";
import { AdminNotificationListener } from "@/components/AdminNotificationListener";
import Logo from "@/components/Logo";

type MenuItem = { name: string; href: string; icon: LucideIcon; hint?: string };
type MenuGroup = { title: string; items: MenuItem[] };

function AdminTopNav({ groups, pathname }: { groups: MenuGroup[]; pathname: string }) {
    const [hoverGroup, setHoverGroup] = useState<string | null>(null);
    const [pinnedGroup, setPinnedGroup] = useState<string | null>(null);
    const [isRevalidating, setIsRevalidating] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const navRef = useRef<HTMLElement | null>(null);
    const helpRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
                setShowHelp(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handleRevalidateAll = async () => {
        setIsRevalidating(true);
        try {
            const res = await fetch("/api/admin/revalidate-all", { method: "POST" });
            if (res.ok) {
                alert("✅ Sayt keshi to'liq yangilandi!");
            } else {
                alert("❌ Keshni yangilashda xatolik yuz berdi");
            }
        } catch {
            alert("❌ Xatolik yuz berdi");
        } finally {
            setIsRevalidating(false);
        }
    };

    const openGroup = (title: string) => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        setHoverGroup(title);
    };
    const scheduleClose = () => {
        if (closeTimer.current) clearTimeout(closeTimer.current);
        closeTimer.current = setTimeout(() => setHoverGroup(null), 160);
    };
    const togglePin = (title: string) => {
        if (pinnedGroup === title) {
            setPinnedGroup(null);
            setHoverGroup(null);
        } else {
            setPinnedGroup(title);
            setHoverGroup(title);
        }
    };

    useEffect(() => {
        const handleDocClick = (e: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(e.target as Node)) {
                setPinnedGroup(null);
                setHoverGroup(null);
            }
        };
        document.addEventListener("click", handleDocClick);
        return () => document.removeEventListener("click", handleDocClick);
    }, []);

    return (
        <nav
            ref={navRef}
            aria-label="Admin bo'limlari"
            className="hidden lg:flex items-center gap-2 bg-white/95 backdrop-blur-md border-b border-gray-100 px-8 py-3 sticky top-0 z-40 shadow-sm"
        >
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 mr-2">Bo'limlar:</span>
            {groups.map((group) => {
                const isOpen = pinnedGroup === group.title || hoverGroup === group.title;
                const hasActive = group.items.some((it) => pathname === it.href);

                return (
                    <div
                        key={group.title}
                        className="relative"
                        onMouseEnter={() => openGroup(group.title)}
                        onMouseLeave={scheduleClose}
                    >
                        <button
                            onClick={() => togglePin(group.title)}
                            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold tracking-tight transition-all ${
                                isOpen
                                    ? "bg-gray-900 text-white"
                                    : hasActive
                                    ? "text-gray-900 bg-gray-100"
                                    : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
                            }`}
                        >
                            {group.title}
                            <ChevronDown size={15} className={`transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                        </button>

                        {isOpen && (
                            <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl shadow-black/10 border border-gray-100 p-2 z-50 animate-in fade-in slide-in-from-top-1 duration-200">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const active = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => { setPinnedGroup(null); setHoverGroup(null); }}
                                            className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all ${
                                                active ? "bg-gray-900 text-white font-bold" : "text-gray-600 hover:bg-gray-100"
                                            }`}
                                        >
                                            <Icon size={18} className={active ? "text-white shrink-0" : "text-gray-400 shrink-0"} />
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm tracking-tight font-bold truncate">{item.name}</span>
                                                {item.hint && (
                                                    <span className={`text-[10px] tracking-tight truncate ${active ? "text-gray-300" : "text-gray-400 font-normal"}`}>
                                                        {item.hint}
                                                    </span>
                                                )}
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
            })}

            <div className="ml-auto relative flex items-center gap-1.5" ref={helpRef}>
                <button
                    onClick={handleRevalidateAll}
                    disabled={isRevalidating}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 border border-gray-200 transition-all disabled:opacity-50 active:scale-95 shadow-sm"
                    title="Sayt keshini majburiy yangilash"
                >
                    <RotateCcw size={14} className={isRevalidating ? "animate-spin" : ""} />
                    <span>{isRevalidating ? "Yangilanmoqda..." : "🔄 Keshni Yangilash"}</span>
                </button>

                {/* Help Info Icon & Tooltip */}
                <div className="relative group">
                    <button
                        type="button"
                        onClick={() => setShowHelp(!showHelp)}
                        className={`p-1.5 rounded-xl transition-all flex items-center justify-center border ${
                            showHelp 
                                ? "bg-blue-600 text-white border-blue-600 shadow-sm" 
                                : "bg-gray-100 hover:bg-blue-50 text-gray-400 hover:text-blue-600 border-gray-200 hover:border-blue-200"
                        }`}
                        title="Keshni yangilash nima ekanligini bilish"
                    >
                        <HelpCircle size={15} />
                    </button>

                    {/* Popover / Tooltip */}
                    <div
                        className={`absolute right-0 top-full mt-2.5 w-72 md:w-80 bg-white rounded-2xl p-4 shadow-2xl border border-gray-100 text-left transition-all duration-200 z-50 ${
                            showHelp 
                                ? "opacity-100 visible translate-y-0" 
                                : "opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-hover:translate-y-0 translate-y-1"
                        }`}
                    >
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                            <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                <RotateCcw size={12} />
                            </div>
                            <h5 className="text-xs font-black text-gray-900 uppercase tracking-tight">Keshni Yangilash nima?</h5>
                        </div>
                        <p className="text-[11px] text-gray-600 leading-relaxed mb-2.5">
                            Saytingiz tez ishlashi uchun sahifalar va mahsulotlar serverda keshlangan bo'ladi. Ushbu tugma keshni majburiy tozalab, mijozlarga eng yangi ma'lumotlarni ko'rsatadi.
                        </p>
                        <div className="bg-gray-50 rounded-xl p-2.5 space-y-1 text-[10px]">
                            <div className="font-bold text-gray-800 flex items-center gap-1">
                                <span>💡 Qachon bosish kerak?</span>
                            </div>
                            <ul className="text-gray-500 space-y-1 list-disc list-inside">
                                <li>Yangi mahsulot yoki toifa qo'shilganda</li>
                                <li>Narxlar yoki aksiyalar o'zgartirilganda</li>
                                <li>Mijozda o'zgarishlar darhol ko'rinmasa</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </nav>
    );
}


export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { user } = useStore();
    const isAdmin = Boolean(user?.isAdmin || user?.phone === "ADMIN" || user?.id === "ADMIN");
    const [isAuthorized, setIsAuthorized] = useState(isAdmin);
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
        if (isAdmin) {
            setIsAuthorized(true);
        }
    }, [isAdmin]);

    // Admin autentifikatsiya tekshiruvi:
    // UI darhol ochiladi (0ms), server tekshiruvi esa orqa fonda amalga oshadi.
    useEffect(() => {
        if (!isMounted) return;
        let cancelled = false;

        const verify = async () => {
            if (!user || !isAdmin) {
                router.replace("/login");
                return;
            }
            try {
                const res = await fetch("/api/auth", { method: "GET", cache: "no-store" });
                if (cancelled) return;
                if (res.ok) {
                    setIsAuthorized(true);
                } else {
                    router.replace("/login");
                }
            } catch {
                if (!cancelled) router.replace("/login");
            }
        };

        verify();
        return () => { cancelled = true; };
    }, [user, router, isMounted, isAdmin]);

    const language = pathname.split('/')[1] || 'uz';
    const l = (path: string) => `/${language}${path}`;

    const menuGroups = [
        {
            title: "Asosiy",
            items: [
                { name: "Dashboard", href: l("/admin"), icon: LayoutDashboard, hint: "Statistika va umumiy xulosa" },
                { name: "Live", href: l("/admin/live"), icon: Zap, hint: "Jonli xaridorlar va radar" },
                { name: "Jurnal (Logs)", href: l("/admin/logs"), icon: ClipboardList, hint: "Audit va xavfsizlik jurnali" },
            ],
        },
        {
            title: "Savdo",
            items: [
                { name: "Buyurtmalar", href: l("/admin/orders"), icon: ShoppingCart, hint: "Barcha xaridlar ro'yxati" },
                { name: "Kafolat Talonlari", href: l("/admin/warranty"), icon: ShieldCheck, hint: "Kafolat xatlari va PDF generator" },
                { name: "Tark etilgan savat", href: l("/admin/carts"), icon: ShoppingCart, hint: "Sotib olinmagan savatchalar" },
                { name: "Qaytarishlar", href: l("/admin/returns"), icon: RotateCcw, hint: "Mahsulotni qaytarish arizalari" },
                { name: "Tezkor yetkazish", href: l("/admin/express-delivery"), icon: Truck, hint: "Yandex Delivery va kuryerlar" },
            ],
        },
        {
            title: "Katalog",
            items: [
                { name: "Mahsulotlar", href: l("/admin/products"), icon: Package, hint: "Mahsulotlar va ombor" },
                { name: "Kategoriyalar", href: l("/admin/categories"), icon: Layers, hint: "Toifalar va iyerarxiya" },
                { name: "Brendlar", href: l("/admin/brands"), icon: Activity, hint: "Ishlab chiqaruvchi brendlar" },
                { name: "Qoldiqlar", href: l("/admin/inventory"), icon: Database, hint: "Ombordagi tovar soni" },
                { name: "Omborlar", href: l("/admin/warehouses"), icon: Warehouse, hint: "Filiallar va ombor manzillari" },
            ],
        },
        {
            title: "Marketing",
            items: [
                { name: "Promo Kodlar", href: l("/admin/promo-codes"), icon: Tag, hint: "Chegirma kuponlari" },
                { name: "Smart Chegirma", href: l("/admin/smart-discount"), icon: Percent, hint: "Shartli avtomatik chegirmalar" },
                { name: "Cashback", href: l("/admin/cashback"), icon: Banknote, hint: "Keshbek foizlari" },
                { name: "Hamyon", href: l("/admin/wallets"), icon: Wallet, hint: "Mijozlar virtual balansi" },
                { name: "Hamkorlik", href: l("/admin/affiliate"), icon: Sparkles, hint: "3 bosqichli MLM referal" },
                { name: "Promo Countdown", href: l("/admin/promo-countdown"), icon: Timer, hint: "Taymerli aksiya banneri" },
                { name: "Narxlar", href: l("/admin/pricing"), icon: DollarSign, hint: "Dinamik narx siyosati" },
            ],
        },
        {
            title: "Kontent / Vitrina",
            items: [
                { name: "Bannerlar", href: l("/admin/banners"), icon: ImageIcon, hint: "Bosh sahifa slayderlari" },
                { name: "Stories", href: l("/admin/stories"), icon: Sparkles, hint: "Instagram uslubidagi hikoyalar" },
                { name: "Kategoriya vitrina", href: l("/admin/featured-categories"), icon: Grid, hint: "Tanlangan toifalar bloki" },
                { name: "Maqolalar", href: l("/admin/blogs"), icon: BookOpen, hint: "Foydali blog maqolalari" },
            ],
        },
        {
            title: "Mijozlar",
            items: [
                { name: "Mijozlar", href: l("/admin/customers"), icon: Users, hint: "Ro'yxatdan o'tgan xaridorlar" },
                { name: "Chat", href: l("/admin/chats"), icon: MessageSquare, hint: "Mijozlar bilan yozishmalar" },
                { name: "Xabarnomalar", href: l("/admin/notifications"), icon: Bell, hint: "Push va tizimli bildirishnomalar" },
            ],
        },
        {
            title: "Tizim",
            items: [
                { name: "Foydalanuvchilar", href: l("/admin/users"), icon: Users, hint: "Adminlar va managerlar" },
                { name: "Sozlamalar", href: l("/admin/settings"), icon: Settings, hint: "Do'kon, kontaktlar va tarmoqlar" },
                { name: "Qidiruv Lug'ati", href: l("/admin/synonyms"), icon: BookA, hint: "Sinonimlar va kalit so'zlar" },
                { name: "AI Monitoring", href: l("/admin/ai"), icon: Brain, hint: "Groq AI tahlil va xarajatlar" },
            ],
        },
    ];

    // Agar avtorizatsiya tekshirilmagan bo'lsa, loading ko'rsatish
    if (!isAuthorized) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-white gap-4">
                <ShieldAlert className="text-gray-300" size={48} />
                <p className="text-gray-400 font-bold text-sm">Tekshirilmoqda...</p>
            </div>
        );
    }

    const mobileBottomNav = [
        { name: "Bosh", href: l("/admin"), icon: LayoutDashboard },
        { name: "Buyurtma", href: l("/admin/orders"), icon: ShoppingCart },
        { name: "Mahsulot", href: l("/admin/products"), icon: Package },
        { name: "Mijozlar", href: l("/admin/customers"), icon: Users },
        { name: "Sozlama", href: l("/admin/settings"), icon: Settings },
    ];

    return (
        <div className="min-h-screen bg-[#F8F9FB] flex">
            <AdminNotificationListener />
            {/* Sidebar for Desktop */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-black text-white transform transition-transform duration-500 ease-in-out lg:translate-x-0 flex flex-col ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-10 flex-1 overflow-y-auto scrollbar-hide">
                    <div className="mb-12 flex items-center justify-between">
                        <Link href="/" className="hover:opacity-90 transition-opacity">
                            <Logo size="md" dark={true} />
                        </Link>
                        <span className="px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-[#2D6E3E] text-white rounded-full">
                            ADMIN
                        </span>
                    </div>

                    <nav className="space-y-6">
                        {menuGroups.map((group) => (
                            <div key={group.title} className="space-y-1.5">
                                <p className="px-6 mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-600">
                                    {group.title}
                                </p>
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.href}
                                            href={item.href}
                                            onClick={() => setIsSidebarOpen(false)}
                                            className={`flex items-center gap-4 px-6 py-3.5 rounded-[24px] transition-all duration-300 group ${isActive
                                                ? 'bg-white text-black font-black shadow-2xl shadow-white/10'
                                                : 'text-gray-500 hover:bg-white/5 hover:text-white'
                                                }`}
                                        >
                                            <Icon size={20} className={isActive ? 'text-black' : 'group-hover:scale-110 transition-transform'} />
                                            <span className="text-sm tracking-tight">{item.name}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        ))}
                    </nav>
                </div>

                <div className="p-10 border-t border-white/10 bg-black/50 backdrop-blur-md">
                    <Link href="/" className="flex items-center gap-4 text-gray-500 hover:text-red-400 transition-all font-bold group">
                        <div className="p-3 bg-white/5 rounded-xl group-hover:bg-red-500/10 transition-colors">
                            <LogOut size={20} />
                        </div>
                        <span className="text-sm text-gray-400 group-hover:text-red-400 transition-colors">Tizimdan chiqish</span>
                    </Link>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 lg:ml-72 min-h-screen pb-20 lg:pb-0">
                {/* Header for Mobile */}
                <header className="bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex justify-between items-center sticky top-0 z-40 lg:hidden">
                    <button onClick={() => setIsSidebarOpen(true)} className="p-2 bg-gray-50 rounded-xl">
                        <Menu size={22} />
                    </button>
                    <h1 className="font-black tracking-tighter italic text-sm">ADMIN PANEL</h1>
                    <div className="w-9"></div>
                </header>

                {/* Desktop top bar — guruh menyulari (hover ochadi, bosilsa qotadi) */}
                <AdminTopNav groups={menuGroups} pathname={pathname} />

                <div className="p-4 md:p-8 lg:p-16 max-w-[1600px] mx-auto">
                    {children}
                </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <nav className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-white border-t border-gray-100 safe-area-pb">
                <div className="flex items-center justify-around px-2 py-2">
                    {mobileBottomNav.map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl transition-all"
                            >
                                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-black' : ''}`}>
                                    <Icon size={20} className={isActive ? 'text-white' : 'text-gray-400'} />
                                </div>
                                <span className={`text-[10px] font-bold ${isActive ? 'text-black' : 'text-gray-400'}`}>
                                    {item.name}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </nav>

            {/* Overlay for mobile sidebar */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-all duration-500"
                    onClick={() => setIsSidebarOpen(false)}
                ></div>
            )}
        </div>
    );
}
