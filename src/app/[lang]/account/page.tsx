"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/store/store";
import { getOptimizedImageUrl } from "@/lib/imageVariants";
import { 
    ChevronRight, 
    Package, 
    RotateCcw, 
    Ticket, 
    Star, 
    Heart, 
    Globe, 
    Layers, 
    User, 
    MessageSquare, 
    Headset, 
    LogOut, 
    Loader2, 
    ChevronLeft,
    Save,
    CheckCircle2,
    Settings,
    Tag,
    Wallet,
    HelpCircle,
    Info,
    Camera,
    X,
    Video,
    Play,
    Check,
    Sparkles,
    Users,
    Share2,
    ExternalLink,
    TrendingUp,
    Award,
    ShieldCheck,
    Banknote,
    History,
    KeyRound,
    LayoutGrid,
    Search,
    Copy,
    Link as LinkIcon
} from "lucide-react";
import { translations } from "@/lib/translations";
import { mapUser, mapComment } from "@/lib/mappers";
import Image from "next/image";
import { uploadToYandexS3 } from "@/lib/yandex-s3";
import { useShallow } from "zustand/react/shallow";
import { PinKeypad } from "@/components/PinKeypad";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

const ACCOUNT_VIEWS = ["edit-profile", "language", "returns", "promo-codes", "reviews", "affiliate"] as const;
type AccountView = "menu" | typeof ACCOUNT_VIEWS[number];

function AccountContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, setUser, logout, language, setLanguage, showToast, wishlist } = useStore(useShallow(s => ({
        user: s.user, setUser: s.setUser, logout: s.logout, language: s.language,
        setLanguage: s.setLanguage, showToast: s.showToast, wishlist: s.wishlist
    })));
    const t = translations[language];

    const [view, setViewState] = useState<AccountView>(() => {
        const v = searchParams?.get("view");
        return (v && (ACCOUNT_VIEWS as readonly string[]).includes(v) ? v : "menu") as AccountView;
    });

    // Holatni URL bilan sinxronlash: sahifa yangilanganda ham bo'lim saqlanadi
    const setView = (v: AccountView) => {
        setViewState(v);
        const params = new URLSearchParams(window.location.search);
        if (v === "menu") {
            params.delete("view");
            params.delete("tab");
        } else {
            params.set("view", v);
            if (v !== "affiliate") params.delete("tab");
        }
        const qs = params.toString();
        router.replace(qs ? `${window.location.pathname}?${qs}` : window.location.pathname, { scroll: false });
    };

    // Hamkorlik bo'limida global footer ("Biz haqimizda") yashiriladi
    useEffect(() => {
        document.body.classList.toggle("affiliate-active", view === "affiliate");
        return () => document.body.classList.remove("affiliate-active");
    }, [view]);
    const [name, setName] = useState(user?.name || "");
    const [username, setUsername] = useState(user?.username || "");
    const [password, setPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [usernameError, setUsernameError] = useState("");
    const [showSuccess, setShowSuccess] = useState(false);
    const [loading, setLoading] = useState(true);
    const [balance, setBalance] = useState(0);
    const [realBalance, setRealBalance] = useState(0);
    const [affiliateCode, setAffiliateCode] = useState("");
    const [pendingCashback, setPendingCashback] = useState(0);
    const [orderCount, setOrderCount] = useState(0);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        const fetchUserData = async () => {
            try {
                // Profil, balans va buyurtmalar xulosasi — server orqali (sessiya bo'yicha, faqat o'zimniki)
                const getJson = (url: string) => fetch(url, { cache: "no-store" }).then(r => r.json()).catch(() => null);
                const [userRes, walletRes, summary] = await Promise.all([
                    getJson("/api/me/profile").then(j => ({ data: j?.success ? j.user : null })),
                    // Hamyon balansi — server orqali (faqat o'z hamyoni)
                    fetch("/api/me/wallet?summary=1", { cache: "no-store" })
                        .then(r => r.json())
                        .then(j => ({ data: j?.wallet ? { balance: j.wallet.balance } : null }))
                        .catch(() => ({ data: null })),
                    getJson("/api/me/orders-summary"),
                ]);

                if (userRes.data) {
                    const mappedUser = mapUser(userRes.data);
                    setName(mappedUser.name || "");
                    setUsername(mappedUser.username || "");
                    setAffiliateCode(userRes.data.affiliate_code || "");
                    setRealBalance(userRes.data.real_balance || 0);
                    setUser({ ...user, ...mappedUser });
                }

                if (walletRes.data) setBalance(walletRes.data.balance);

                if (summary?.success) {
                    setPendingCashback(Number(summary.pendingCashback) || 0);
                    setOrderCount(Number(summary.orderCount) || 0);
                }
            } catch (e) {
                console.error("Error fetching account data:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchUserData();
    }, [user?.phone, setUser]);

    const handleSave = async () => {
        if (!user) return;
        setUsernameError("");

        const usernameRegex = /^[a-zA-Z0-9_]+$/;
        if (username && !usernameRegex.test(username)) {
            setUsernameError(language === 'uz' ? "Username noto'g'ri formatda" : "Неверный формат");
            return;
        }

        const trimmedUsername = username.trim();
        if (trimmedUsername && (trimmedUsername.length < 3 || trimmedUsername.length > 20)) {
            setUsernameError(language === 'uz' ? "3-20 ta belgi" : "3-20 символов");
            return;
        }

        setIsSaving(true);
        try {
            const response = await fetch('/api/auth/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phone: user.phone, 
                    password,
                    name, 
                    username: trimmedUsername 
                })
            });

            const data = await response.json();
            if (!response.ok) {
                if (data.message === "Ushbu username band.") setUsernameError(language === 'uz' ? "Username band" : "Занято");
                else throw new Error(data.message);
                return;
            }

            setUser({ ...user, name, username: trimmedUsername });
            setPassword("");
            setShowSuccess(true);
            setTimeout(() => {
                setShowSuccess(false);
                setView("menu");
            }, 1500);
        } catch (e: any) {
            console.error(e);
            showToast(e.message || "Xatolik yuz berdi", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return (
        <div style={{ minHeight: "100vh", background: "#FAFAF6", paddingBottom: 100 }}>
            <div className="max-w-xl mx-auto animate-pulse">
                <div style={{ margin: "54px 16px 12px", borderRadius: 28, height: 160, background: "linear-gradient(135deg, rgba(45,110,62,0.3) 0%, rgba(31,90,48,0.3) 100%)" }} />
                {[1, 2, 3].map(i => (
                    <div key={i} style={{ padding: i === 1 ? "10px 16px 0" : "12px 16px 0" }}>
                        <div style={{ background: "#fff", borderRadius: 20, height: 120 }} />
                    </div>
                ))}
            </div>
        </div>
    );

    if (!user) {
        return (
            <div style={{ minHeight: "100vh", background: "#FAFAF6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 24, padding: 32 }}>
                <div style={{ width: 100, height: 100, borderRadius: 50, background: "#EAF3EC", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <User size={48} color="#2D6E3E" />
                </div>
                <div>
                    <h2 style={{ fontSize: 22, fontWeight: 700, color: "#0F1410", letterSpacing: -0.3, marginBottom: 8 }}>{t.account.login}</h2>
                    <p style={{ color: "#9AA29C", fontSize: 14, maxWidth: 240 }}>
                        {language === 'uz' ? 'Profilga kirib buyurtmalarni kuzating' : 'Войдите чтобы отслеживать заказы'}
                    </p>
                </div>
                <Link href={`/${language}/login`} prefetch={false} style={{
                    display: "block", width: "100%", maxWidth: 200, textAlign: "center",
                    background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)",
                    color: "#fff", padding: "16px 0", borderRadius: 18,
                    fontWeight: 700, fontSize: 15, textDecoration: "none",
                }}>
                    {t.account.login}
                </Link>
            </div>
        );
    }

    // --- Sub-Views ---

    if (view === "edit-profile") {
        return (
            <div className="bg-[#FAFAF6] min-h-screen pb-24 px-4 md:px-8">
                <div className="max-w-xl mx-auto pt-8">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setView("menu");
                        }}
                        className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] mb-6 transition-transform duration-150 will-change-transform hover:bg-white"
                        aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612] mb-6">{(t.account as any).myInfo}</h1>
                    
                    <div className="bg-white/90 backdrop-blur-md p-6 sm:p-8 rounded-[28px] border border-[rgba(15,20,16,0.06)] shadow-sm space-y-5">
                        <div>
                            <label className="text-xs font-semibold text-[#737D75] uppercase tracking-wider ml-1 mb-2 block">{t.account.name}</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl px-5 py-3.5 font-medium text-[#111612] outline-none transition-colors duration-150"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-[#737D75] uppercase tracking-wider ml-1 mb-2 block">Username (@)</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className={`w-full bg-[#F5F7F5] border ${usernameError ? 'border-red-500' : 'border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E]'} rounded-2xl px-5 py-3.5 font-medium text-[#111612] outline-none transition-colors duration-150`}
                            />
                            {usernameError && <p className="text-red-500 text-xs font-medium mt-1.5 ml-2">{usernameError}</p>}
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-[#737D75] uppercase tracking-wider ml-1 mb-2 block">{language === 'uz' ? 'Tasdiqlash uchun parolingiz' : 'Пароль для подтверждения'}</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="******"
                                className="w-full bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl px-5 py-3.5 font-medium text-[#111612] outline-none transition-colors duration-150"
                            />
                        </div>

                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("medium");
                                handleSave();
                            }}
                            disabled={isSaving}
                            className="ios-tap-feedback active:scale-[0.98] w-full py-4 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2.5 transition-transform duration-150 will-change-transform disabled:opacity-50 text-white shadow-md shadow-[#2D6E3E]/20"
                            style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}
                        >
                            {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {language === 'uz' ? 'Saqlash' : 'Сохранить'}
                        </button>
                    </div>
                </div>
                {showSuccess && (
                    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-2xl font-semibold text-sm flex items-center gap-2.5 animate-in fade-in slide-in-from-bottom-4 shadow-xl z-50" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", boxShadow: "0 8px 24px rgba(45,110,62,0.3)" }}>
                        <CheckCircle2 size={18} style={{ color: "#A8EFB8" }} /> {language === 'uz' ? 'Saqlandi' : 'Сохранено'}
                    </div>
                )}
            </div>
        );
    }

    if (view === "language") {
        return (
            <div className="bg-[#FAFAF6] min-h-screen px-4 md:px-8">
                <div className="max-w-xl mx-auto pt-8">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setView("menu");
                        }}
                        className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] mb-6 transition-transform duration-150 will-change-transform hover:bg-white"
                        aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612] mb-6">{(t.account.sections as any).language}</h1>
                    
                    <div className="space-y-3">
                        <button 
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("selection");
                                setLanguage("uz"); 
                                fetch("/api/user/language", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ language: "uz", phone: user?.phone || null })
                                }).catch(() => {});
                                router.push("/uz/account");
                                setView("menu"); 
                            }}
                            className={`ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform w-full p-5 bg-white/90 backdrop-blur-md rounded-[22px] border border-[rgba(15,20,16,0.06)] shadow-sm flex items-center justify-between font-semibold text-base text-[#111612] ${language === 'uz' ? 'ring-2 ring-[#2D6E3E] border-transparent' : ''}`}
                        >
                            <span>O'zbekcha</span>
                            {language === 'uz' && <CheckCircle2 size={22} className="text-[#2D6E3E]" />}
                        </button>
                        <button 
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("selection");
                                setLanguage("ru"); 
                                fetch("/api/user/language", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ language: "ru", phone: user?.phone || null })
                                }).catch(() => {});
                                router.push("/ru/account");
                                setView("menu"); 
                            }}
                            className={`ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform w-full p-5 bg-white/90 backdrop-blur-md rounded-[22px] border border-[rgba(15,20,16,0.06)] shadow-sm flex items-center justify-between font-semibold text-base text-[#111612] ${language === 'ru' ? 'ring-2 ring-[#2D6E3E] border-transparent' : ''}`}
                        >
                            <span>Русский</span>
                            {language === 'ru' && <CheckCircle2 size={22} className="text-[#2D6E3E]" />}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (view === "returns") {
        return <ReturnsView user={user} t={t} language={language} onBack={() => setView("menu")} />;
    }

    if (view === "promo-codes") {
        return <PromoCodesView t={t} language={language} onBack={() => setView("menu")} />;
    }

    if (view === "reviews") {
        return <ReviewsView user={user} language={language} t={t} showToast={showToast} onBack={() => setView("menu")} />;
    }

    if (view === "affiliate") {
        return <AffiliateView user={user} language={language} t={t} showToast={showToast} onBack={() => setView("menu")} />;
    }

    // --- Main Menu View ---

    const GREEN = "#2D6E3E";
    const GREEN_DEEP = "#1F5A30";
    const GREEN_TINT = "#EAF3EC";

    return (
        <div style={{ background: "#FAFAF6", minHeight: "100vh", paddingBottom: 100 }}>
            <div className="max-w-xl mx-auto px-4 pt-4">

                {/* Gradient Header Card */}
                <div style={{
                    marginTop: "20px",
                    marginBottom: "16px",
                    borderRadius: 28,
                    padding: "24px 22px 26px",
                    background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`,
                    color: "#fff",
                    position: "relative",
                    overflow: "hidden",
                    boxShadow: "0 16px 40px rgba(45,110,62,0.28)",
                }}>
                    {/* Decorative blobs */}
                    <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: 80, background: "rgba(255,255,255,0.08)", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", bottom: -60, left: -20, width: 140, height: 140, borderRadius: 70, background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />

                    {/* Avatar + Name row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 32,
                            background: "rgba(255,255,255,0.18)", backdropFilter: "blur(20px)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            border: "1.5px solid rgba(255,255,255,0.25)", flexShrink: 0,
                        }}>
                            <User size={32} color="#fff" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {name || user.phone}
                            </div>
                            <button
                                onClick={() => setView("edit-profile")}
                                style={{ fontSize: 13, opacity: 0.85, marginTop: 2, background: "none", border: "none", color: "#fff", padding: 0, cursor: "pointer", textDecoration: "underline", textDecorationStyle: "dotted" }}
                            >
                                @{user.username || (language === 'uz' ? 'tahrirlash' : 'редактировать')} →
                            </button>
                        </div>
                    </div>

                    {/* Stats row */}
                    <div style={{ marginTop: 18, display: "flex", gap: 8, position: "relative" }}>
                        <Link
                            href={`/${language}/orders`} prefetch={false}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className="ios-tap-feedback active:scale-95 transition-transform duration-150 will-change-transform flex-1 p-2.5 rounded-[18px] bg-white/12 backdrop-blur-md border border-white/15 text-white no-underline block text-center"
                        >
                            <div className="text-lg font-bold">{orderCount}</div>
                            <div className="text-[11px] opacity-80 font-medium mt-0.5">{t.account.orders}</div>
                        </Link>
                        <Link
                            href={`/${language}/wishlist`} prefetch={false}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className="ios-tap-feedback active:scale-95 transition-transform duration-150 will-change-transform flex-1 p-2.5 rounded-[18px] bg-white/12 backdrop-blur-md border border-white/15 text-white no-underline block text-center"
                        >
                            <div className="text-lg font-bold">{wishlist.length}</div>
                            <div className="text-[11px] opacity-80 font-medium mt-0.5">{t.nav.wishlist}</div>
                        </Link>
                        <Link
                            href={`/${language}/wallet`}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className="ios-tap-feedback active:scale-95 transition-transform duration-150 will-change-transform flex-1 p-2.5 rounded-[18px] bg-white/12 backdrop-blur-md border border-white/15 text-white no-underline block text-center"
                        >
                            <div className="text-lg font-bold">{(balance || 0).toLocaleString()}</div>
                            <div className="text-[11px] opacity-80 font-medium mt-0.5">{language === 'uz' ? 'Cashback' : 'Кэшбэк'}</div>
                        </Link>
                    </div>
                </div>

                {/* Menu Group 1: Shopping */}
                <div className="mb-3">
                    <div className="bg-white/90 backdrop-blur-md rounded-[24px] border border-[rgba(15,20,16,0.06)] shadow-sm overflow-hidden">
                        <MenuItem href="/orders" icon={<Package size={20} color={GREEN} />} label={t.account.orders} language={language} />
                        <VDivider />
                        <MenuItem onClick={() => setView("returns")} icon={<RotateCcw size={20} color={GREEN} />} label={t.account.sections.returns} language={language} />
                        <VDivider />
                        <MenuItem href="/wishlist" icon={<Heart size={20} color={GREEN} />} label={t.nav.wishlist} badge={wishlist.length} language={language} />
                        <VDivider />
                        <MenuItem onClick={() => setView("reviews")} icon={<Star size={20} color={GREEN} />} label={t.account.sections.reviews} language={language} />
                        <VDivider />
                        <MenuItem onClick={() => setView("promo-codes")} icon={<Ticket size={20} color={GREEN} />} label={t.account.sections.promoCodes} language={language} />
                        <VDivider />
                        <MenuItem href="/wallet" icon={<Wallet size={20} color={GREEN} />} label={language === 'uz' ? 'Hamyon' : 'Кошелёк'} language={language} />
                    </div>
                </div>

                {/* Menu Group 2: Magazine + Affiliate */}
                <div className="mb-3">
                    <div className="bg-white/90 backdrop-blur-md rounded-[24px] border border-[rgba(15,20,16,0.06)] shadow-sm overflow-hidden">
                        <MenuItem onClick={() => setView("affiliate")} icon={<Sparkles size={20} color={GREEN} />} label={language === 'uz' ? 'Hamkorlik (Pul ishlash)' : 'Партнерство (Заработок)'} language={language} />
                        <VDivider />
                        <MenuItem href="/messages" icon={<MessageSquare size={20} color={GREEN} />} label={language === 'uz' ? 'Xabarlar (Chat)' : 'Сообщения'} language={language} />
                    </div>
                </div>

                {/* Menu Group 3: Settings */}
                <div className="mb-4">
                    <div className="bg-white/90 backdrop-blur-md rounded-[24px] border border-[rgba(15,20,16,0.06)] shadow-sm overflow-hidden">
                        <MenuItem href="/chat" icon={<Headset size={20} color={GREEN} />} label={t.account.sections.support} language={language} />
                        <VDivider />
                        <MenuItem onClick={() => setView("language")} icon={<Globe size={20} color={GREEN} />} label={(t.account.sections as any).language} language={language} />
                    </div>
                </div>

                {/* Logout */}
                <div className="mb-6">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("medium");
                            logout();
                        }}
                        className="ios-tap-feedback active:scale-[0.98] w-full py-4 px-4 rounded-[22px] bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] shadow-sm flex items-center justify-center gap-2.5 text-rose-600 text-[15px] font-semibold transition-transform duration-150 will-change-transform hover:bg-rose-50/50"
                    >
                        <LogOut size={18} className="text-rose-600" />
                        {t.account.logout}
                    </button>
                </div>

                {/* Footer */}
                <div className="py-4 flex flex-col items-center gap-1">
                    <div className="text-xs font-medium text-[#737D75]/60">Velari v1.2.5</div>
                </div>

            </div>
        </div>
    );
}

export default function AccountPage() {
    return (
        <Suspense fallback={<div className="min-h-screen bg-[#FAFAF6] flex items-center justify-center"><Loader2 className="animate-spin" /></div>}>
            <AccountContent />
        </Suspense>
    );
}

function ReviewsView({ user, language, showToast, onBack }: any) {
    const [orders, setOrders] = useState<any[]>([]);
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Review states
    const [reviewProduct, setReviewProduct] = useState<any>(null);
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewText, setReviewText] = useState("");
    const [reviewImages, setReviewImages] = useState<string[]>([]);
    const [reviewVideo, setReviewVideo] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        fetchReviewsData();
    }, [user.phone, user.id]);

    const fetchReviewsData = async () => {
        if (!user) return;
        setLoading(true);
        // Yetkazilgan buyurtmalar va o'z sharhlarim — server orqali (sessiya bo'yicha)
        const getJson = (url: string) => fetch(url, { cache: "no-store" }).then(r => r.json()).catch(() => null);
        const [oRes, cRes] = await Promise.all([
            getJson("/api/me/orders?delivered=1"),
            getJson("/api/me/comments"),
        ]);

        if (oRes?.success) setOrders(oRes.orders || []);
        if (cRes?.success) setComments(cRes.comments || []);
        setLoading(false);
    };

    const handleSubmitReview = async () => {
        if (!user || !reviewProduct || !reviewText.trim()) return;
        if (!user.username) {
            showToast(language === 'uz' ? "Username kiritilmagan!" : "Имя пользователя не введено!", 'info');
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'insert',
                    p_user_phone: user.phone || user.id,
                    p_comment_data: {
                        product_id: reviewProduct.id,
                        username: user.username,
                        text: reviewText,
                        rating: reviewRating,
                        type: 'review',
                        data: {
                            images: reviewImages,
                            video: reviewVideo
                        }
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Xatolik yuz berdi");

            showToast(language === 'uz' ? "Muvaffaqiyatli saqlandi!" : "Успешно сохранено!", 'success');
            setReviewProduct(null);
            setReviewText("");
            setReviewRating(5);
            setReviewImages([]);
            setReviewVideo("");
            fetchReviewsData(); // Refresh list
        } catch (e: any) {
            console.error(e);
            showToast(e.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Extract products that need reviews
    const commentedProductIds = new Set(comments.map(c => c.product_id));
    const pendingProducts: any[] = [];
    orders.forEach(order => {
        order.items.forEach((item: any) => {
            if (!commentedProductIds.has(item.id)) {
                if (!pendingProducts.find(p => p.id === item.id)) {
                    pendingProducts.push(item);
                }
            }
        });
    });

    if (loading) return <div className="min-h-screen bg-[#FAFAF6] flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="bg-[#FAFAF6] min-h-screen pb-24 px-4 md:px-8">
            <div className="max-w-xl mx-auto pt-8">
                <button
                    onClick={() => {
                        videoPreWarmer.triggerHaptic("light");
                        onBack();
                    }}
                    className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] mb-6 transition-transform duration-150 will-change-transform hover:bg-white"
                    aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                >
                    <ChevronLeft size={20} />
                </button>

                <div className="space-y-8">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612]">{language === 'uz' ? 'Sharhlar va savollar' : 'Отзывы и вопросы'}</h1>
                        <p className="text-sm font-medium text-[#737D75] mt-1">{language === 'uz' ? 'Sizning fikringiz biz uchun muhim' : 'Ваше мнение важно для нас'}</p>
                    </div>

                    {/* Pending Reviews */}
                    {pendingProducts.length > 0 && (
                        <div className="space-y-4">
                            <h2 className="text-[10px] font-black uppercase tracking-widest text-[#2D6E3E] flex items-center gap-2">
                                <div className="w-1.5 h-1.5 bg-[#EAF3EC]0 rounded-full animate-pulse" />
                                {language === 'uz' ? 'Baholashni kutyapti' : 'Ожидают оценки'}
                            </h2>
                            <div className="grid grid-cols-1 gap-4">
                                {pendingProducts.map(p => (
                                    <div 
                                        key={p.id} 
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("light");
                                            setReviewProduct(p);
                                        }}
                                        className="ios-tap-feedback active:scale-[0.98] bg-white p-4 rounded-3xl flex items-center gap-4 border border-emerald-100 shadow-xl shadow-emerald-500/5 group cursor-pointer transition-transform duration-150 will-change-transform"
                                    >
                                        <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden shrink-0"><img src={getOptimizedImageUrl(p.image_metadata, p.image, 'xs')} className="w-full h-full object-cover" alt={p.name} /></div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-black italic uppercase truncate">{p.name}</p>
                                            <p className="text-[10px] font-bold text-[#2D6E3E] uppercase tracking-widest mt-1">{language === 'uz' ? 'Mahsulotni baholang' : 'Оцените товар'}</p>
                                        </div>
                                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-[#2D6E3E] group-hover:bg-[#EAF3EC]0 group-hover:text-white transition-colors duration-150">
                                            <Star size={18} fill="currentColor" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Past Reviews & Answers */}
                    <div className="space-y-4">
                        <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">{language === 'uz' ? 'Mening sharhlarim' : 'Мои отзывы'}</h2>
                        {comments.length === 0 ? (
                            <div className="bg-white p-12 rounded-[40px] text-center border-2 border-dashed border-gray-100 opacity-50 italic font-medium text-gray-400">
                                {language === 'uz' ? 'Hozircha sharhlar yo\'q' : 'Пока нет отзывов'}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {comments.map(c => (
                                    <div key={c.id} className="bg-white p-6 rounded-[32px] shadow-sm border border-gray-100">
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-8 h-8 rounded-lg bg-gray-50 overflow-hidden"><img src={c.products?.image} className="w-full h-full object-cover" alt="" /></div>
                                            <Link href={`/${language}/products/${c.product_id}`} className="text-[10px] font-black italic uppercase truncate hover:text-blue-500">{c.products?.name_uz || c.products?.name}</Link>
                                        </div>
                                        <div className="flex items-center gap-1 text-yellow-400 mb-2">
                                            {[...Array(5)].map((_, i) => <Star key={i} size={12} fill={i < c.rating ? "currentColor" : "none"} />)}
                                        </div>
                                        <p className="text-sm font-medium text-gray-700 leading-relaxed mb-4">{c.content || c.text}</p>
                                        
                                        {/* Media in Comment */}
                                        {c.data?.images && c.data.images.length > 0 && (
                                            <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
                                                {c.data.images.map((img: string, i: number) => (
                                                    <div key={i} className="w-20 h-24 rounded-2xl overflow-hidden shrink-0 border border-gray-100">
                                                        <Image src={img} width={80} height={100} className="w-full h-full object-cover" alt="" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Reply from Admin */}
                                        {c.reply && (
                                            <div className="bg-gray-50 p-4 rounded-2xl border-l-4 border-black mt-4 ml-2">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-4 h-4 bg-black rounded flex items-center justify-center text-[8px] text-white font-black italic">V</div>
                                                    <span className="text-[8px] font-black uppercase tracking-widest">VELARI ADMIN</span>
                                                </div>
                                                <p className="text-xs font-bold text-gray-600 leading-relaxed italic">{c.reply}</p>
                                            </div>
                                        )}

                                        <div className="mt-4 flex justify-between items-center opacity-40 text-[8px] font-black uppercase tracking-widest">
                                            <span>{new Date(c.created_at).toLocaleDateString()}</span>
                                            {c.is_approved ? <span className="text-green-600">Tasdiqlangan</span> : <span className="italic">Moderatsiyada</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Review Modal */}
            {reviewProduct && (
                <div onClick={() => setReviewProduct(null)} className="fixed inset-0 bg-black/70 backdrop-blur-xl z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div onClick={e => e.stopPropagation()} className="bg-white w-full max-w-sm rounded-[48px] overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in duration-300">
                        <div className="p-8 pb-4 flex justify-between items-center">
                            <h3 className="text-xl font-black italic tracking-tighter uppercase">{language === 'uz' ? 'Baholash' : 'Оценка'}</h3>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setReviewProduct(null);
                                }}
                                className="ios-icon-tap active:scale-90 w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center transition-transform duration-150 will-change-transform"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="px-8 pb-10 space-y-6 overflow-y-auto no-scrollbar">
                           <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-3xl">
                               <div className="w-12 h-12 rounded-xl bg-white overflow-hidden shrink-0"><img src={reviewProduct.image} className="w-full h-full object-cover" /></div>
                               <p className="text-[10px] font-black uppercase italic truncate">{reviewProduct.name}</p>
                           </div>

                           <div className="flex justify-center gap-2">
                               {[1,2,3,4,5].map(star => (
                                   <button
                                       key={star}
                                       onClick={() => {
                                           videoPreWarmer.triggerHaptic("selection");
                                           setReviewRating(star);
                                       }}
                                       className="ios-icon-tap p-1 transition-transform duration-150 will-change-transform active:scale-90"
                                   >
                                       <Star size={36} fill={reviewRating >= star ? "#EAB308" : "none"} className={reviewRating >= star ? "text-yellow-500" : "text-gray-200"} />
                                   </button>
                               ))}
                           </div>

                           <textarea 
                                value={reviewText}
                                onChange={e => setReviewText(e.target.value)}
                                placeholder={language === 'uz' ? "Fikringiz..." : "Ваш отзыв..."}
                                className="w-full bg-gray-50 border-none rounded-3xl p-6 text-sm font-bold h-32 resize-none outline-none focus:ring-2 focus:ring-black transition-shadow"
                           />

                           {/* Media Upload */}
                            <div className="flex gap-2">
                               <label className="flex-1 h-14 bg-gray-50 rounded-2xl flex flex-col items-center justify-center cursor-pointer border-2 border-dashed border-gray-100 hover:border-gray-300">
                                   <input 
                                        type="file" accept="image/*" className="hidden" 
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setIsUploading(true);
                                            try {
                                                const { url } = await uploadToYandexS3(file);
                                                setReviewImages([...reviewImages, url]);
                                            } catch (err) {
                                                showToast(language === 'uz' ? "Yuklashda xatolik" : "Ошибка загрузки", "error");
                                            } finally {
                                                setIsUploading(false);
                                            }
                                        }}
                                   />
                                   <Camera size={16} className="text-gray-400" />
                                   <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 mt-1">{language === 'uz' ? 'Rasm' : 'Фото'}</span>
                               </label>
                               <label className="flex-1 h-14 bg-gray-50 rounded-2xl flex flex-col items-center justify-center cursor-pointer border-2 border-dashed border-gray-100 hover:border-gray-300">
                                   <input 
                                        type="file" accept="video/*" className="hidden" 
                                        onChange={async (e) => {
                                            const file = e.target.files?.[0];
                                            if (!file) return;
                                            setIsUploading(true);
                                            try {
                                                const { url } = await uploadToYandexS3(file);
                                                setReviewVideo(url);
                                            } catch (err) {
                                                showToast(language === 'uz' ? "Yuklashda xatolik" : "Ошибка загрузки", "error");
                                            } finally {
                                                setIsUploading(false);
                                            }
                                        }}
                                   />
                                   <Video size={16} className="text-gray-400" />
                                   <span className="text-[8px] font-black uppercase tracking-widest text-gray-400 mt-1">{language === 'uz' ? 'Video' : 'Видео'}</span>
                               </label>
                            </div>

                           {/* Uploaded Media Previews */}
                           {(reviewImages.length > 0 || reviewVideo) && (
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {reviewImages.map((img, i) => (
                                        <div key={i} className="w-14 h-14 rounded-xl overflow-hidden relative group shrink-0">
                                            <img src={img} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer" onClick={() => setReviewImages(reviewImages.filter((_, idx) => idx !== i))}>
                                                <X size={12} className="text-white" />
                                            </div>
                                        </div>
                                    ))}
                                    {reviewVideo && (
                                        <div className="w-14 h-14 rounded-xl overflow-hidden relative group" style={{ background: "#0F1410" }}>
                                            <video src={reviewVideo} className="w-full h-full object-cover opacity-60" />
                                            <div className="absolute inset-0 flex items-center justify-center"><Play size={14} className="text-white" /></div>
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center cursor-pointer" onClick={() => setReviewVideo("")}>
                                                <X size={12} className="text-white" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                           )}

                           <button 
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    handleSubmitReview();
                                }}
                                disabled={isSubmitting || isUploading || !reviewText.trim()}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-5 rounded-[28px] font-black text-xs uppercase tracking-widest transition-transform duration-150 will-change-transform disabled:opacity-50 flex items-center justify-center gap-3 velari-green-btn"
                           >
                               {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} /> {language === 'uz' ? 'Tasdiqlash' : 'Подтвердить'}</>}
                           </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ReturnsView({ user, t, language, onBack }: any) {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<any>(null);
    const [selectedItems, setSelectedItems] = useState<any[]>([]);
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        const fetchOrders = async () => {
            // Yetkazilgan buyurtmalar — server orqali (sessiya bo'yicha)
            const res = await fetch("/api/me/orders?delivered=1", { cache: "no-store" }).then(r => r.json()).catch(() => null);
            const data: any[] | null = res?.success ? res.orders : null;

            if (data) {
                const now = new Date().getTime();
                const fourteenDays = 14 * 24 * 60 * 60 * 1000;
                const eligible = data.filter(o => {
                    const deliveredAt = new Date(o.delivered_at || o.created_at).getTime();
                    return (now - deliveredAt) <= fourteenDays;
                });
                setOrders(eligible);
            }
            setLoading(false);
        };
        fetchOrders();
    }, [user.phone]);

    const handleSubmit = async () => {
        if (selectedItems.length === 0 || !reason.trim()) return;
        setSubmitting(true);
        try {
            const response = await fetch('/api/orders/return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    order_id: selectedOrder.id,
                    user_phone: user.phone,
                    items: selectedItems,
                    reason: reason.trim()
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Xatolik");

            setSuccess(true);
            setTimeout(() => onBack(), 2000);
        } catch (e) {
            console.error(e);
        } finally {
            setSubmitting(false);
        }
    };

    if (success) return (
        <div className="min-h-screen bg-[#FAFAF6] flex items-center justify-center p-8">
            <div className="bg-white p-10 rounded-[48px] text-center shadow-xl flex flex-col items-center max-w-sm">
                <div className="w-20 h-20 bg-green-50 text-green-500 rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 size={40} />
                </div>
                <h2 className="text-2xl font-black italic tracking-tighter mb-4">{language === 'uz' ? 'So\'rov yuborildi!' : 'Заявка отправлена!'}</h2>
                <p className="text-gray-400 font-medium text-sm leading-relaxed">{language === 'uz' ? "Sizning qaytarish so'rovingiz ko'rib chiqiladi. Tez orada adminlarimiz siz bilan bog'lanishadi." : "Ваша заявка будет рассмотрена. Наши админы свяжутся с вами в ближайшее время."}</p>
            </div>
        </div>
    );

    return (
        <div className="bg-[#FAFAF6] min-h-screen pb-24 px-4 md:px-10">
            <div className="max-w-xl mx-auto pt-10">
                <button
                    onClick={() => {
                        videoPreWarmer.triggerHaptic("light");
                        if (selectedOrder) setSelectedOrder(null);
                        else onBack();
                    }}
                    className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] mb-6 transition-transform duration-150 will-change-transform hover:bg-white"
                    aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                >
                    <ChevronLeft size={20} />
                </button>

                {!selectedOrder ? (
                    <div className="space-y-6">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612]">{t.account.sections.returns}</h1>
                            <p className="text-xs font-medium text-[#737D75] mt-1 leading-relaxed">
                                {language === 'uz' ? 'Yetkazib berilganidan so\'ng 14 kun ichida mahsulotlarni qaytarishingiz mumkin.' : 'Вы можете вернуть товары в течение 14 дней после доставки.'}
                            </p>
                        </div>

                        {/* Qaytarish shartlari (return-policy) — chiroyli havola tugma */}
                        <Link
                            href={`/${language}/return-policy`}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className="group flex items-center gap-4 rounded-[24px] p-5 text-white overflow-hidden relative ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                            style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", boxShadow: "0 8px 24px rgba(45,110,62,0.25)" }}
                        >
                            <div className="absolute -bottom-6 -right-4 opacity-10 group-hover:scale-110 transition-transform duration-500">
                                <ShieldCheck size={90} />
                            </div>
                            <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center shrink-0">
                                <ShieldCheck size={24} />
                            </div>
                            <div className="flex-1 min-w-0 relative">
                                <p className="text-sm font-semibold tracking-tight">{language === 'uz' ? 'Qaytarish shartlari' : 'Условия возврата'}</p>
                                <p className="text-xs font-medium text-white/75 mt-0.5">{language === 'uz' ? 'To\'liq qoidalar bilan tanishing' : 'Ознакомьтесь с полными правилами'}</p>
                            </div>
                            <ChevronRight className="text-white/80 group-hover:translate-x-1 transition-transform relative shrink-0" size={20} />
                        </Link>

                        {loading ? (
                            <div className="flex justify-center py-20"><Loader2 className="animate-spin text-[#2D6E3E]" /></div>
                        ) : orders.length === 0 ? (
                            <div className="bg-white/90 backdrop-blur-md p-10 rounded-[24px] text-center border border-[rgba(15,20,16,0.06)] font-medium text-sm text-[#737D75]">
                                {language === 'uz' ? 'Hozircha qaytarish uchun buyurtmalar yo\'q.' : 'Нет заказов для возврата.'}
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {orders.map(order => (
                                    <div 
                                        key={order.id} 
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("light");
                                            setSelectedOrder(order);
                                        }}
                                        className="bg-white/90 backdrop-blur-md p-5 rounded-[22px] shadow-sm border border-[rgba(15,20,16,0.06)] ios-tap-feedback active:scale-[0.99] transition-transform duration-150 will-change-transform cursor-pointer group flex justify-between items-center"
                                    >
                                        <div>
                                            <p className="text-xs font-medium text-[#737D75]">#{order.id.slice(0,8)}</p>
                                            <p className="font-bold text-base text-[#111612] mt-0.5">{order.total.toLocaleString()} {language === 'uz' ? "so'm" : "сум"}</p>
                                        </div>
                                        <ChevronRight className="text-[#C7CDC8] group-hover:text-[#111612] transition-colors" size={20} />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-6">
                        <h1 className="text-2xl font-bold tracking-tight text-[#111612]">{language === 'uz' ? 'Qaytarish tafsilotlari' : 'Детали возврата'}</h1>
                        <div className="bg-white/90 backdrop-blur-md p-6 sm:p-8 rounded-[28px] shadow-sm border border-[rgba(15,20,16,0.06)] space-y-6">
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-[#737D75] uppercase tracking-wider ml-1">{language === 'uz' ? 'Qaysi mahsulotlarni qaytarmoqchisiz?' : 'Какие товары хотите вернуть?'}</label>
                                <div className="space-y-2.5">
                                    {selectedOrder.items.map((item: any, i: number) => {
                                        const isSelected = selectedItems.find(si => si.id === item.id);
                                        return (
                                            <div 
                                                key={i} 
                                                onClick={() => {
                                                    videoPreWarmer.triggerHaptic("selection");
                                                    if (isSelected) setSelectedItems(selectedItems.filter(si => si.id !== item.id));
                                                    else setSelectedItems([...selectedItems, item]);
                                                }}
                                                className={`p-4 rounded-2xl border transition-colors duration-150 cursor-pointer flex items-center justify-between ios-tap-feedback active:scale-[0.98] will-change-transform ${isSelected ? 'border-[#2D6E3E] bg-[#EAF3EC]/40' : 'border-[rgba(15,20,16,0.06)] bg-white hover:border-gray-300'}`}
                                            >
                                                <div className="font-medium text-sm text-[#111612]">{item.name}</div>
                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center border transition-colors ${isSelected ? 'border-transparent bg-[#2D6E3E] text-white' : 'border-gray-200 text-transparent'}`}>
                                                    {isSelected && <CheckCircle2 size={14} />}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-[#737D75] uppercase tracking-wider ml-1">{language === 'uz' ? 'Qaytarish sababi' : 'Причина возврата'}</label>
                                <textarea value={reason} onChange={e => setReason(e.target.value)} className="w-full bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl p-4 text-sm font-medium h-32 resize-none outline-none transition-colors" />
                            </div>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    handleSubmit();
                                }}
                                disabled={submitting || selectedItems.length === 0 || !reason.trim()}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-4 rounded-2xl font-semibold text-sm disabled:opacity-40 transition-transform duration-150 will-change-transform text-white shadow-md shadow-[#2D6E3E]/20"
                                style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}
                            >
                                {language === 'uz' ? 'Tasdiqlash' : 'Подтвердить'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function PromoCodesView({ t, language, onBack }: any) {
    const [promos, setPromos] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchPromos = async () => {
            // Faol promo-kodlar — server orqali (promo_codes anon'ga yopiq)
            const res = await fetch("/api/promo-codes/active", { cache: "no-store" }).then(r => r.json()).catch(() => null);
            if (res?.success) setPromos(res.promos || []);
            setLoading(false);
        };
        fetchPromos();
    }, []);

    return (
        <div className="bg-[#FAFAF6] min-h-screen pb-24 px-4 md:px-8">
            <div className="max-w-xl mx-auto pt-8">
                <button
                    onClick={() => {
                        videoPreWarmer.triggerHaptic("light");
                        onBack();
                    }}
                    className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] mb-6 transition-transform duration-150 will-change-transform hover:bg-white"
                    aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                >
                    <ChevronLeft size={20} />
                </button>
                <div className="space-y-6">
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612]">{t.account.sections.promoCodes}</h1>
                    <div className="grid grid-cols-1 gap-4">
                        {promos.length === 0 && !loading ? (
                            <div className="bg-white/90 backdrop-blur-md p-10 rounded-[24px] text-center border border-[rgba(15,20,16,0.06)] font-medium text-sm text-[#737D75]">
                                {language === 'uz' ? 'Hozircha faol promo-kodlar yo\'q.' : 'Нет активных промокодов.'}
                            </div>
                        ) : (
                            promos.map(p => (
                                <div key={p.id} className="bg-white/90 backdrop-blur-md p-6 rounded-[24px] border border-[rgba(15,20,16,0.06)] shadow-sm text-center relative overflow-hidden group">
                                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-4 bg-[#FAFAF6] rounded-b-full border-x border-b border-gray-200" />
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-4 bg-[#FAFAF6] rounded-t-full border-x border-t border-gray-200" />
                                    <h3 className="text-3xl font-bold tracking-tight text-[#111612] mb-2">{p.code}</h3>
                                    <p className="text-xs font-semibold text-[#2D6E3E] uppercase tracking-wider">{p.discount_type === 'percent' ? `${p.discount_value}%` : `${p.discount_value.toLocaleString()} so'm`} {language === 'uz' ? 'Chegirma' : 'Скидка'}</p>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

const AFFILIATE_TABS = ["products", "promos", "links"] as const;

function AffiliateView({ user, language, showToast, onBack }: any) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [authorized, setAuthorized] = useState(false);
    const [step, setStep] = useState<"pin" | "contract" | "dashboard">("pin");
    const [pinError, setPinError] = useState("");
    
    // Modal states
    const [showAddMember, setShowAddMember] = useState(false);
    const [showTransfer, setShowTransfer] = useState(false);
    const [showWithdraw, setShowWithdraw] = useState(false);
    
    // Form states
    const [memberPhone, setMemberPhone] = useState("");
    const [vCode, setVCode] = useState("");
    const [transferAmount, setTransferAmount] = useState("");
    const [withdrawAmount, setWithdrawAmount] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [isActionLoading, setIsActionLoading] = useState(false);

    // Recovery states
    const [showRecovery, setShowRecovery] = useState(false);
    const [recoveryStep, setRecoveryStep] = useState<"password" | "telegram" | "new_pin">("password");
    const [recoveryPassword, setRecoveryPassword] = useState("");
    const [recoveryTelegramCode, setRecoveryTelegramCode] = useState("");
    const [recoveryNewPin, setRecoveryNewPin] = useState("");
    const [recoveryError, setRecoveryError] = useState("");

    // NEW Affiliate states
    const [activeTab, setActiveTabState] = useState<"dashboard" | "products" | "promos" | "links">(() => {
        const tab = searchParams?.get("tab");
        return (tab && (AFFILIATE_TABS as readonly string[]).includes(tab) ? tab : "dashboard") as any;
    });

    // Ichki bo'limni (mahsulotlar/promo-kod/silka) URL'ga yozish — yangilashda saqlanadi
    const setActiveTab = (tab: "dashboard" | "products" | "promos" | "links") => {
        setActiveTabState(tab);
        const params = new URLSearchParams(window.location.search);
        params.set("view", "affiliate");
        if (tab === "dashboard") params.delete("tab");
        else params.set("tab", tab);
        router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
    };
    const [affProducts, setAffProducts] = useState<any[]>([]);
    const [affTariffs, setAffTariffs] = useState<any[]>([]);
    const [myPromoCodes, setMyPromoCodes] = useState<any[]>([]);
    const [myReferralLinks, setMyReferralLinks] = useState<any[]>([]);
    const [analytics, setAnalytics] = useState<any>(null);
    const [isDataLoading, setIsDataLoading] = useState(false);
    const [showCreatePromo, setShowCreatePromo] = useState(false);
    const [selectedTariff, setSelectedTariff] = useState<any>(null);
    const [customPromoCode, setCustomPromoCode] = useState("");
    const [productSearch, setProductSearch] = useState("");
    const [linkModal, setLinkModal] = useState<{ slug: string; name: string } | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const res = await fetch("/api/affiliate/user");
            const d = await res.json();
            if (d.success) {
                setData(d);
                if (!d.user.hasPin) setStep("pin");
                else if (!d.user.affiliate_agreed) setStep("contract");
                else if (authorized) setStep("dashboard");
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handlePinComplete = async (pin: string) => {
        setPinError("");
        const action = data?.user?.hasPin ? "verify_pin" : "set_pin";
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, pin })
            });
            const d = await res.json();
            if (d.success) {
                setAuthorized(true);
                if (!data?.user?.affiliate_agreed) setStep("contract");
                else setStep("dashboard");
                if (action === "set_pin") fetchData(); // Refresh to update hasPin
            } else {
                setPinError(d.error);
            }
        } catch (e) {
            setPinError("Xatolik yuz berdi");
        }
    };

    const handleAgree = async () => {
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "agree_contract" })
            });
            const d = await res.json();
            if (d.success) {
                setStep("dashboard");
                fetchData();
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const [codeSent, setCodeSent] = useState(false);

    const handleSendMemberCode = async () => {
        if (!memberPhone) return;
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "request_member_verification", memberPhone })
            });
            const d = await res.json();
            if (d.success) {
                setCodeSent(true);
                showToast(language === 'uz' ? "Kod Telegram'ga yuborildi!" : "Код отправлен в Telegram!", "success");
            } else {
                showToast(d.error, "error");
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleAddMember = async () => {
        if (!memberPhone || !vCode) return;
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "add_team_member", memberPhone, verificationCode: vCode })
            });
            const d = await res.json();
            if (d.success) {
                showToast(language === 'uz' ? "A'zo qo'shildi!" : "Участник добавлен!", "success");
                setShowAddMember(false);
                setCodeSent(false);
                setMemberPhone("");
                setVCode("");
                fetchData();
            } else {
                showToast(d.error, "error");
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleTransfer = async () => {
        const amount = Number(transferAmount);
        if (!amount || amount <= 0) return;
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "transfer_to_cashback", amount })
            });
            const d = await res.json();
            if (d.success) {
                showToast(language === 'uz' ? "O'tkazildi!" : "Переведено!", "success");
                setShowTransfer(false);
                fetchData();
            } else {
                showToast(d.error, "error");
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleWithdraw = async () => {
        const amount = Number(withdrawAmount);
        if (!amount || !cardNumber) return;
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "withdraw", amount, card_number: cardNumber })
            });
            const d = await res.json();
            if (d.success) {
                showToast(language === 'uz' ? "So'rov yuborildi!" : "Запрос отправлен!", "success");
                setShowWithdraw(false);
                fetchData();
            } else {
                showToast(d.error, "error");
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleVerifyPassword = async () => {
        setIsActionLoading(true);
        setRecoveryError("");
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "verify_password", password: recoveryPassword })
            });
            const d = await res.json();
            if (d.success) setRecoveryStep("new_pin");
            else setRecoveryError(d.error);
        } catch (e) {
            setRecoveryError("Xatolik");
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleSetNewPinDirectly = async (pin: string) => {
        setIsActionLoading(true);
        setRecoveryError("");
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    action: "reset_pin_with_auth", 
                    newPin: pin 
                })
            });
            const d = await res.json();
            if (d.success) {
                showToast(language === 'uz' ? "PIN yangilandi!" : "PIN обновлен!", "success");
                setShowRecovery(false);
                fetchData();
            } else {
                setRecoveryError(d.error);
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleRequestTelegramCode = async () => {
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "request_telegram_reset" })
            });
            const d = await res.json();
            if (d.success) {
                setRecoveryStep("telegram");
                showToast(language === 'uz' ? "Kod yuborildi!" : "Код отправлен!", "success");
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleVerifyTelegramAndReset = async () => {
        if (recoveryNewPin.length !== 4) return;
        setIsActionLoading(true);
        setRecoveryError("");
        try {
            const res = await fetch("/api/affiliate/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    action: "verify_telegram_reset", 
                    code: recoveryTelegramCode, 
                    newPin: recoveryNewPin 
                })
            });
            const d = await res.json();
            if (d.success) {
                showToast(language === 'uz' ? "PIN yangilandi!" : "PIN обновлен!", "success");
                setShowRecovery(false);
                fetchData();
            } else {
                setRecoveryError(d.error);
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const fetchAffiliateData = async () => {
        setIsDataLoading(true);
        try {
            if (activeTab === "products") {
                const res = await fetch("/api/affiliate/products");
                const d = await res.json();
                if (d.success) setAffProducts(d.products || []);
            } else if (activeTab === "promos") {
                const res = await fetch("/api/affiliate/promo-codes");
                const d = await res.json();
                if (d.success) {
                    setAffTariffs(d.tariffs || []);
                    setMyPromoCodes(d.myCodes || []);
                }
            } else if (activeTab === "links") {
                const [linksRes, analyticsRes] = await Promise.all([
                    fetch("/api/affiliate/links"),
                    fetch("/api/affiliate/analytics")
                ]);
                const linksD = await linksRes.json();
                const analyticsD = await analyticsRes.json();
                if (linksD.success) setMyReferralLinks(linksD.data || []);
                if (analyticsD.success) setAnalytics(analyticsD);
            }
        } finally {
            setIsDataLoading(false);
        }
    };

    useEffect(() => {
        if (authorized && activeTab !== "dashboard") {
            fetchAffiliateData();
        }
    }, [activeTab, authorized]);

    const handleCreateLink = async (product: any) => {
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId: product.id })
            });
            const d = await res.json();
            if (d.success) {
                const pName = language === 'uz' ? (product.name_uz || product.name) : (product.name_ru || product.name);
                setLinkModal({ slug: d.data.slug, name: pName });
            } else {
                showToast(d.error || (language === 'uz' ? "Xatolik" : "Ошибка"), "error");
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleCreatePromo = async () => {
        if (!selectedTariff || !customPromoCode) return;
        setIsActionLoading(true);
        try {
            const res = await fetch("/api/affiliate/promo-codes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tariffId: selectedTariff.id, customCode: customPromoCode })
            });
            const d = await res.json();
            if (d.success) {
                showToast(language === 'uz' ? "Promo-kod yaratildi!" : "Промо-код создан!", "success");
                setShowCreatePromo(false);
                fetchAffiliateData();
            } else {
                showToast(d.error, "error");
            }
        } finally {
            setIsActionLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast(language === 'uz' ? "Nusxa olindi!" : "Скопировано!", "success");
    };

    if (loading) return <div className="min-h-screen bg-[#FAFAF6] flex items-center justify-center"><Loader2 className="animate-spin" /></div>;

    if (!authorized && data?.user?.hasPin) {
        return (
            <div className="bg-[#FAFAF6] min-h-screen p-4">
                <button onClick={onBack} className="flex items-center gap-2 text-gray-400 font-black uppercase tracking-widest text-[10px] mb-8">
                    <ChevronLeft size={16} /> {language === 'uz' ? 'Orqaga' : 'Назад'}
                </button>
                <PinKeypad 
                    onComplete={handlePinComplete} 
                    onForgotPin={() => {
                        setShowRecovery(true);
                        setRecoveryStep("password");
                        setRecoveryError("");
                    }}
                    title={language === 'uz' ? "PIN-kodni kiriting" : "Введите PIN-код"} 
                    error={pinError} 
                />
            </div>
        );
    }

    if (!data?.user?.hasPin) {
        return (
            <div className="bg-[#FAFAF6] min-h-screen p-4">
                <button onClick={onBack} className="flex items-center gap-2 text-gray-400 font-black uppercase tracking-widest text-[10px] mb-8">
                    <ChevronLeft size={16} /> {language === 'uz' ? 'Orqaga' : 'Назад'}
                </button>
                <PinKeypad onComplete={handlePinComplete} title={language === 'uz' ? "PIN-kod o'rnating" : "Установите PIN-код"} error={pinError} />
            </div>
        );
    }

    if (step === "contract") {
        return (
            <div className="bg-[#FAFAF6] min-h-screen p-6 flex flex-col items-center justify-center">
                <div className="max-w-md w-full bg-white/95 backdrop-blur-xl p-8 rounded-[32px] border border-[rgba(15,20,16,0.06)] shadow-xl space-y-6">
                    <div className="w-16 h-16 bg-[#EAF3EC] rounded-2xl flex items-center justify-center mx-auto text-[#2D6E3E]">
                        <ShieldCheck size={32} />
                    </div>
                    <div className="text-center space-y-1.5">
                        <h2 className="text-2xl font-bold tracking-tight text-[#111612]">{language === 'uz' ? 'Hamkorlik Shartnomasi' : 'Партнерское Соглашение'}</h2>
                        <p className="text-[#737D75] text-xs font-medium">{language === 'uz' ? "Tizimga qo'shilishdan oldin tanishib chiqing" : "Ознакомьтесь перед началом сотрудничества"}</p>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-4 bg-[#F5F7F5] rounded-2xl text-xs text-[#737D75] leading-relaxed font-medium border border-[rgba(15,20,16,0.06)]">
                        {language === 'uz' ? (
                            <>
                                1. Hamkorlik tizimi orqali real daromad olishingiz mumkin.<br/>
                                2. Har bir sotuvdan mahsulotga belgilangan foiz beriladi.<br/>
                                3. Firibgarlik (o'ziga-o'zi sotish) qat'iyan taqiqlanadi.<br/>
                                4. Mablag'lar mahsulot yetkazilgandan 14 kundan keyin yechishga ruxsat beriladi.<br/>
                                5. Adminlar shubhali hisoblarni bloklash huquqiga ega.
                            </>
                        ) : (
                            <>
                                1. Вы можете получать реальный доход через партнерскую систему.<br/>
                                2. С каждой продажи выплачивается установленный процент.<br/>
                                3. Фрод (покупка у самого себя) строго запрещен.<br/>
                                4. Вывод средств возможен через 14 дней после доставки товара.<br/>
                                5. Админы имеют право блокировать подозрительные аккаунты.
                            </>
                        )}
                    </div>
                    <button 
                        onClick={handleAgree}
                        disabled={isActionLoading}
                        className="ios-tap-feedback active:scale-[0.98] w-full py-4 rounded-2xl font-semibold text-sm transition-transform duration-150 will-change-transform text-white shadow-md shadow-[#2D6E3E]/20"
                        style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}
                    >
                        {isActionLoading ? <Loader2 className="animate-spin mx-auto" size={18} /> : (language === 'uz' ? 'Tanishib chiqdim va roziman' : 'Я ознакомлен и согласен')}
                    </button>
                </div>
            </div>
        );
    }

    let roleName = language === 'uz' ? "A'zo" : 'Участник';
    const currentRole = data?.user?.affiliate_role;
    if (currentRole === 'top_manager') roleName = language === 'uz' ? 'Top Menejer' : 'Топ Менеджер';
    else if (currentRole === 'top_sales_manager') roleName = language === 'uz' ? 'Top Sotuv Menejeri' : 'Топ Менеджер Продаж';
    else if (currentRole === 'sales_manager') roleName = language === 'uz' ? 'Sotuv Menejeri' : 'Менеджер Продаж';
    else if (currentRole === 'agent') roleName = language === 'uz' ? 'Agent' : 'Агент';

    return (
        <div className="bg-[#FAFAF6] min-h-screen pb-24 px-4 md:px-8 overflow-x-hidden">
            <div className="max-w-4xl mx-auto pt-8">
                <div className="flex justify-between items-center mb-6">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            onBack();
                        }}
                        className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] transition-transform duration-150 will-change-transform hover:bg-white"
                        aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#EAF3EC] text-[#2D6E3E] border border-[#2D6E3E]/20 text-xs font-semibold">
                         <Award size={14} className="text-amber-500" />
                         <span>{roleName}</span>
                    </div>
                </div>

                <div className="flex bg-[rgba(15,20,16,0.04)] p-1 rounded-[20px] mb-6 overflow-x-auto no-scrollbar gap-1">
                    {[
                        { id: 'dashboard', label: language === 'uz' ? 'Asosiy' : 'Главная', icon: LayoutGrid },
                        { id: 'products', label: language === 'uz' ? 'Mahsulotlar' : 'Товары', icon: Package },
                        { id: 'promos', label: language === 'uz' ? 'Promo-kodlar' : 'Промо-коды', icon: Ticket },
                        { id: 'links', label: language === 'uz' ? 'Havolalar' : 'Ссылки', icon: LinkIcon }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("selection");
                                setActiveTab(tab.id as any);
                            }}
                            className={`ios-tap-feedback active:scale-[0.98] flex items-center gap-2 px-5 py-2.5 rounded-[16px] text-xs font-semibold transition-[transform,colors] duration-150 will-change-transform whitespace-nowrap ${activeTab === tab.id ? 'bg-white text-[#111612] shadow-sm' : 'text-[#737D75] hover:text-[#111612]'}`}
                        >
                            <tab.icon size={15} />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Wallets */}
                        <div className="space-y-6">
                            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex flex-col justify-between min-h-[220px]">
                                <div>
                                    <div className="flex justify-between items-start">
                                        <div className="w-12 h-12 bg-[#EAF3EC] rounded-2xl flex items-center justify-center">
                                            <Banknote className="text-[#2D6E3E]" size={24} />
                                        </div>
                                        <button onClick={() => setShowWithdraw(true)} className="text-[10px] font-black text-[#2D6E3E] uppercase tracking-widest bg-[#EAF3EC] px-3 py-1.5 rounded-xl hover:bg-[#D4EBDA] transition-colors duration-150">
                                            {language === 'uz' ? 'Yechish' : 'Вывод'}
                                        </button>
                                    </div>
                                    <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mt-6 italic">Hamkorlik Hamyoni</h3>
                                    <p className="text-4xl font-black italic tracking-tighter text-black mt-1">{(data?.user?.real_balance || 0).toLocaleString()} <span className="text-sm">so'm</span></p>
                                </div>
                                <button 
                                    onClick={() => setShowTransfer(true)}
                                    className="w-full bg-gray-50 text-gray-500 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border border-gray-100 hover:bg-black hover:text-white transition-colors duration-150 flex items-center justify-center gap-2 group"
                                >
                                    <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                                    {language === 'uz' ? "Cashback hamyonga o'tkazish" : "Перевод na кэшбэк"}
                                </button>
                            </div>

                            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100 flex items-center justify-between">
                                <div>
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Oddiy Hamyon</h3>
                                    <p className="text-2xl font-black italic tracking-tighter text-black mt-1">{(data?.user?.wallet_balance || 0).toLocaleString()} <span className="text-xs">so'm</span></p>
                                </div>
                                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                                    <Wallet className="text-blue-500" size={20} />
                                </div>
                            </div>
                        </div>

                        {/* Team & Stats */}
                        <div className="space-y-6">
                            <div className="bg-white p-8 rounded-[40px] shadow-sm border border-gray-100">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="text-lg font-black italic tracking-tighter uppercase">{language === 'uz' ? 'Mening Jamoam' : 'Моя Команда'}</h3>
                                    {data?.user?.affiliate_role !== 'agent' && (
                                        <button onClick={() => setShowAddMember(true)} className="p-2 rounded-xl hover:scale-110 active:scale-95 transition-transform duration-150 velari-green-btn will-change-transform">
                                            <Users size={18} />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-3">
                                    {data?.team?.length === 0 ? (
                                        <div className="py-8 text-center text-gray-300 font-bold italic text-xs">Jamoa a'zolari yo'q</div>
                                    ) : (
                                        data?.team?.map((m: any) => (
                                            <div key={m.id} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center font-black text-xs text-black border border-gray-200">
                                                        {m.name?.[0] || m.phone?.[0]}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black italic">{m.name || m.phone}</p>
                                                        <p className="text-[8px] font-bold uppercase text-gray-400 tracking-tighter">{m.affiliate_role}</p>
                                                    </div>
                                                </div>
                                                <div className="text-[#2D6E3E]">
                                                    <TrendingUp size={14} />
                                                </div>
                                            </div>
                                        ))
                                    )}
                                    {data?.team?.length > 0 && (
                                        <p className="text-[8px] text-center text-gray-400 font-bold uppercase mt-4">Maksimum: {data?.team?.length}/10 a'zo</p>
                                    )}
                                </div>
                            </div>

                            {/* Referral Code */}
                            <div className="p-8 rounded-[40px] shadow-2xl text-white relative overflow-hidden group" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}>
                                <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-150 transition-transform duration-1000">
                                    <Ticket size={80} />
                                </div>
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">{language === 'uz' ? 'Mening Kodim' : 'Мой Код'}</h3>
                                <div className="flex items-center justify-between">
                                    <span className="text-3xl font-black italic tracking-tighter">{data?.user?.affiliate_code || "KOD_YO'Q"}</span>
                                    <button onClick={() => copyToClipboard(data?.user?.affiliate_code)} className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors duration-150">
                                        <Share2 size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'products' && (
                    <div className="space-y-6">
                        {/* Qidiruv */}
                        <div className="relative">
                            <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" />
                            <input
                                value={productSearch}
                                onChange={(e) => setProductSearch(e.target.value)}
                                placeholder={language === 'uz' ? 'Mahsulot qidirish...' : 'Поиск товара...'}
                                className="w-full bg-white border border-gray-100 rounded-[28px] pl-14 pr-12 py-4 text-sm font-bold text-black placeholder:text-gray-300 outline-none focus:border-[#2D6E3E]/30 transition-colors duration-150"
                            />
                            {productSearch && (
                                <button onClick={() => setProductSearch("")} className="absolute right-4 top-1/2 -translate-y-1/2 p-1 text-gray-300 hover:text-black transition-colors">
                                    <X size={16} />
                                </button>
                            )}
                        </div>

                        {isDataLoading && affProducts.length === 0 ? (
                            // Yuklanish skeleti
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-gray-100 animate-pulse">
                                        <div className="h-48 bg-gray-100" />
                                        <div className="p-6 space-y-4">
                                            <div className="h-4 bg-gray-100 rounded-full w-3/4" />
                                            <div className="flex justify-between items-center">
                                                <div className="h-6 bg-gray-100 rounded-full w-1/3" />
                                                <div className="h-11 w-11 bg-gray-100 rounded-2xl" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (() => {
                            const q = productSearch.trim().toLowerCase();
                            const filtered = q
                                ? affProducts.filter(p => `${p.name || ''} ${p.name_uz || ''} ${p.name_ru || ''}`.toLowerCase().includes(q))
                                : affProducts;
                            if (filtered.length === 0) {
                                return (
                                    <div className="bg-white p-16 rounded-[40px] text-center text-gray-300 font-bold italic text-sm border border-dashed border-gray-200">
                                        {language === 'uz' ? 'Mahsulot topilmadi' : 'Товары не найдены'}
                                    </div>
                                );
                            }
                            return (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filtered.map(p => (
                                        <div key={p.id} className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-gray-100 group">
                                            <div className="relative h-48 overflow-hidden">
                                                <Image src={p.image} alt={p.name} fill className="object-cover group-hover:scale-110 transition-transform duration-700" />
                                                <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] font-black uppercase italic">
                                                    {p.myCommission}% {language === 'uz' ? 'foyda' : 'выгода'}
                                                </div>
                                            </div>
                                            <div className="p-6 space-y-4">
                                                <h3 className="font-black italic tracking-tighter text-sm uppercase line-clamp-1">{language === 'uz' ? p.name_uz || p.name : p.name_ru || p.name}</h3>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-lg font-black italic tracking-tighter">{p.price?.toLocaleString()} {language === 'uz' ? "so'm" : "сум"}</span>
                                                    <button
                                                        onClick={() => handleCreateLink(p)}
                                                        disabled={isActionLoading}
                                                        className="p-3 rounded-2xl hover:scale-110 active:scale-95 transition-transform duration-150 velari-green-btn disabled:opacity-50 will-change-transform"
                                                    >
                                                        <LinkIcon size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {activeTab === 'promos' && (
                    <div className="space-y-10">
                        {/* My Codes */}
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Mening Promo-kodlarim</h3>
                            {myPromoCodes.length === 0 ? (
                                <div className="bg-white p-12 rounded-[40px] text-center text-gray-300 font-bold italic text-sm border border-dashed border-gray-200">
                                    Hali promo-kodlar yaratilmagan
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {myPromoCodes.map(c => (
                                        <div key={c.id} className="bg-white p-6 rounded-[32px] border border-gray-100 flex justify-between items-center">
                                            <div>
                                                <p className="text-2xl font-black italic tracking-tighter text-black">{c.code}</p>
                                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{c.promo_code_tariffs?.name}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-black text-[#2D6E3E]">+{c.total_earned?.toLocaleString()} so'm</p>
                                                <p className="text-[8px] font-bold text-gray-300 uppercase">{c.usage_count} marta ishlatildi</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Available Tariffs */}
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Mavjud Tariflar</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {affTariffs.map(t => (
                                    <div key={t.id} className="p-8 rounded-[40px] text-white space-y-6 relative overflow-hidden group" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}>
                                        <div className="absolute -bottom-10 -right-10 opacity-5 group-hover:scale-150 transition-transform duration-1000">
                                            <Ticket size={160} />
                                        </div>
                                        <div>
                                            <h4 className="text-xl font-black italic tracking-tighter uppercase">{t.name}</h4>
                                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                                Minimal buyurtma: {t.min_order_value?.toLocaleString()} so'm
                                            </p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="bg-white/5 p-4 rounded-2xl">
                                                <p className="text-[8px] font-black text-gray-500 uppercase">Mijoz uchun chegirma</p>
                                                <p className="text-xl font-black italic">{t.discount_value}{t.type === 'percentage' ? '%' : ' so\'m'}</p>
                                            </div>
                                            <div className="bg-white/5 p-4 rounded-2xl">
                                                <p className="text-[8px] font-black text-[#2D6E3E] uppercase">Sizning foydangiz</p>
                                                <p className="text-xl font-black italic text-[#4CAF71]">
                                                    {t.affiliate_reward_type === 'fixed_per_use' ? `${t.affiliate_reward_value.toLocaleString()} so'm` : `${t.affiliate_reward_value}%`}
                                                </p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => {
                                                setSelectedTariff(t);
                                                setShowCreatePromo(true);
                                            }}
                                            className="w-full bg-white text-black py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#2D6E3E] hover:text-white transition-colors duration-150"
                                        >
                                            Kod yaratish
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'links' && (
                    <div className="space-y-8">
                        {/* Summary stats */}
                        {analytics?.stats && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: language === 'uz' ? 'Jami bosishlar' : 'Всего кликов', value: analytics.stats.totalClicks, color: 'text-blue-600', bg: 'bg-blue-50' },
                                    { label: language === 'uz' ? 'Konversiya' : 'Конверсий', value: analytics.stats.totalConversions, color: 'text-[#2D6E3E]', bg: 'bg-[#EAF3EC]' },
                                    { label: language === 'uz' ? 'Conv. darajasi' : 'Conv. rate', value: `${analytics.stats.conversionRate}%`, color: 'text-purple-600', bg: 'bg-purple-50' },
                                    { label: language === 'uz' ? 'Jamoa bosishlari' : 'Клики команды', value: analytics.stats.teamTotalClicks, color: 'text-orange-600', bg: 'bg-orange-50' },
                                ].map((s, i) => (
                                    <div key={i} className={`${s.bg} p-6 rounded-[28px]`}>
                                        <p className={`text-2xl font-black italic ${s.color}`}>{s.value}</p>
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* My links */}
                        <div className="space-y-3">
                            <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2">
                                {language === 'uz' ? 'Mening havolalarim' : 'Мои ссылки'}
                            </h3>
                            <div className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-gray-100">
                                {isDataLoading ? (
                                    <div className="p-16 flex justify-center"><Loader2 className="animate-spin text-gray-300" /></div>
                                ) : myReferralLinks.length === 0 ? (
                                    <div className="p-16 text-center text-gray-300 font-bold italic text-sm">
                                        {language === 'uz' ? 'Hali havolalar yaratilmagan' : 'Ссылки ещё не созданы'}<br/>
                                        <span className="text-[10px]">{language === 'uz' ? '"Mahsulotlar" tabidan link yarating' : 'Создайте ссылку во вкладке "Товары"'}</span>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-100">
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400">Mahsulot</th>
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-center">Bosishlar</th>
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-center">Sotuvlar</th>
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-right">Amal</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {myReferralLinks.map((l: any) => (
                                                    <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="p-5">
                                                            <p className="text-xs font-black italic uppercase line-clamp-1">
                                                                {language === 'uz' ? l.products?.name_uz || l.products?.name : l.products?.name_ru || l.products?.name}
                                                            </p>
                                                            <p className="text-[8px] font-bold text-gray-300 font-mono mt-0.5">/ref/{l.slug}</p>
                                                        </td>
                                                        <td className="p-5 text-center">
                                                            <span className="text-lg font-black italic text-blue-600">{l.clicks || 0}</span>
                                                        </td>
                                                        <td className="p-5 text-center">
                                                            <span className="text-lg font-black italic text-[#2D6E3E]">{l.conversions || 0}</span>
                                                        </td>
                                                        <td className="p-5 text-right">
                                                            <button
                                                                onClick={() => copyToClipboard(`${window.location.origin}/${language}/ref/${l.slug}`)}
                                                                className="p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-colors duration-150"
                                                            >
                                                                <Share2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Team links (only for SM / TSM / TM) */}
                        {analytics?.teamLinks?.length > 0 && (
                            <div className="space-y-3">
                                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-2 flex items-center gap-2">
                                    <Users size={12} />
                                    {language === 'uz' ? 'Jamoa havolalari (shaffoflik)' : 'Ссылки команды (прозрачность)'}
                                </h3>
                                <div className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-gray-100">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-100">
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400">A'zo</th>
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400">Mahsulot</th>
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-center">Bosishlar</th>
                                                    <th className="p-5 text-[9px] font-black uppercase tracking-widest text-gray-400 text-center">Sotuvlar</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {analytics.teamLinks.map((l: any) => (
                                                    <tr key={l.id} className="hover:bg-gray-50/50 transition-colors">
                                                        <td className="p-5">
                                                            <p className="text-xs font-black italic">{l.member?.name || l.member?.phone}</p>
                                                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                                                                l.member?.affiliate_role === 'sales_manager' ? 'bg-blue-50 text-blue-600' :
                                                                l.member?.affiliate_role === 'top_sales_manager' ? 'bg-purple-50 text-purple-600' :
                                                                'bg-gray-100 text-gray-500'
                                                            }`}>
                                                                {l.member?.affiliate_role?.replace('_', ' ')}
                                                            </span>
                                                        </td>
                                                        <td className="p-5">
                                                            <p className="text-xs font-black italic line-clamp-1">
                                                                {language === 'uz' ? l.products?.name_uz || l.products?.name : l.products?.name_ru || l.products?.name}
                                                            </p>
                                                        </td>
                                                        <td className="p-5 text-center">
                                                            <span className="text-lg font-black italic text-blue-600">{l.clicks || 0}</span>
                                                        </td>
                                                        <td className="p-5 text-center">
                                                            <span className="text-lg font-black italic text-[#2D6E3E]">{l.conversions || 0}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Transactions / History */}
                <div className="mt-10 space-y-6">
                    <div className="flex items-center gap-2 ml-4">
                        <History size={16} className="text-gray-400" />
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-400">{language === 'uz' ? "So'nggi harakatlar" : 'Последние действия'}</h3>
                    </div>
                    <div className="bg-white rounded-[40px] overflow-hidden shadow-sm border border-gray-100">
                        {data?.transactions?.length === 0 ? (
                            <div className="p-16 text-center text-gray-300 font-bold italic text-sm">Hali daromadlar yo'q</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-gray-50 border-b border-gray-100">
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Holat / Bosqich</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Summa</th>
                                            <th className="p-6 text-[10px] font-black uppercase tracking-widest text-gray-400">Vaqt</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {data?.transactions?.map((t: any) => (
                                            <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="p-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${t.status === 'released' ? 'bg-[#EAF3EC]0' : t.status === 'approved' ? 'bg-blue-500' : t.status === 'pending' ? 'bg-orange-500' : 'bg-red-500'} ${t.status === 'rejected' ? '' : 'animate-pulse'}`} />
                                                        <div>
                                                            <p className="text-xs font-black italic tracking-tighter uppercase">
                                                                {t.status === 'rejected'
                                                                    ? (language === 'uz' ? 'Buyurtma bekor qilindi' : 'Заказ отменён')
                                                                    : (t.order_stage || 'Jarayonda')}
                                                            </p>
                                                            <p className={`text-[8px] font-bold uppercase tracking-widest ${t.status === 'rejected' ? 'text-red-400' : 'text-gray-400'}`}>
                                                                {t.status === 'released' ? 'Hamyonda' : t.status === 'approved' ? 'Muzlatilgan' : t.status === 'rejected' ? (language === 'uz' ? 'Bekor qilingan' : 'Отменён') : 'Kutilmoqda'}
                                                                {t.order_id ? ` · #${String(t.order_id).slice(-4)}` : ''}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="p-6">
                                                    <p className={`text-sm font-black italic tracking-tighter ${t.status === 'rejected' ? 'text-gray-300 line-through' : ''}`}>+{t.amount.toLocaleString()} so'm</p>
                                                </td>
                                                <td className="p-6">
                                                    <p className="text-[10px] text-gray-400 font-bold italic">{new Date(t.created_at).toLocaleDateString()}</p>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modals */}
            {linkModal && (() => {
                const fullUrl = `${window.location.origin}/${language}/ref/${linkModal.slug}`;
                return (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md" onClick={() => setLinkModal(null)}>
                        <div className="bg-white w-full max-w-md p-8 rounded-[40px] shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-300" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setLinkModal(null)} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-colors duration-150"><X size={18} /></button>
                            <div className="w-16 h-16 bg-[#EAF3EC] rounded-3xl flex items-center justify-center mx-auto">
                                <LinkIcon className="text-[#2D6E3E]" size={30} />
                            </div>
                            <div className="text-center space-y-1">
                                <h2 className="text-xl font-black italic tracking-tighter uppercase">{language === 'uz' ? 'Havola tayyor' : 'Ссылка готова'}</h2>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest line-clamp-1">{linkModal.name}</p>
                            </div>
                            <div className="flex items-center gap-2 bg-gray-50 rounded-2xl p-2 pl-5 border border-gray-100">
                                <span className="flex-1 text-xs font-bold text-gray-600 font-mono truncate">{fullUrl}</span>
                                <button
                                    onClick={() => copyToClipboard(fullUrl)}
                                    className="shrink-0 flex items-center gap-2 px-5 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-transform duration-150 will-change-transform velari-green-btn"
                                >
                                    <Copy size={14} /> {language === 'uz' ? 'Nusxa' : 'Копир.'}
                                </button>
                            </div>
                            <button
                                onClick={() => { setLinkModal(null); setActiveTab("links"); }}
                                className="w-full py-4 rounded-2xl bg-gray-50 text-gray-500 font-black text-[10px] uppercase tracking-widest border border-gray-100 hover:bg-black hover:text-white transition-colors duration-150"
                            >
                                {language === 'uz' ? 'Havolalarim' : 'Мои ссылки'}
                            </button>
                        </div>
                    </div>
                );
            })()}
            {showAddMember && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md p-10 rounded-[40px] shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-300">
                        <button onClick={() => { setShowAddMember(false); setCodeSent(false); setMemberPhone(""); setVCode(""); }} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-colors duration-150"><X size={18} /></button>
                        <h2 className="text-2xl font-black italic tracking-tighter uppercase">{language === 'uz' ? "A'zo Qo'shish" : 'Добавить Участника'}</h2>
                        <div className="space-y-4">
                            {/* Step 1: Phone + Send Code */}
                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-400 ml-4 mb-2 block">Telefon Raqam</label>
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={memberPhone}
                                        onChange={e => { setMemberPhone(e.target.value); setCodeSent(false); setVCode(""); }}
                                        placeholder="+998"
                                        disabled={codeSent}
                                        className="flex-1 bg-gray-50 border-none rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150 disabled:opacity-50"
                                    />
                                    <button
                                        onClick={handleSendMemberCode}
                                        disabled={isActionLoading || !memberPhone || codeSent}
                                        className="shrink-0 px-5 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform duration-150 will-change-transform velari-green-btn"
                                    >
                                        {isActionLoading && !codeSent ? <Loader2 size={16} className="animate-spin" /> : codeSent ? <Check size={16} /> : (language === 'uz' ? 'Kod' : 'Код')}
                                    </button>
                                </div>
                                {codeSent && (
                                    <p className="text-[10px] text-[#2D6E3E] font-black uppercase ml-4 mt-2">
                                        ✓ {language === 'uz' ? "Kod Telegram'ga yuborildi" : "Код отправлен в Telegram"}
                                    </p>
                                )}
                            </div>

                            {/* Step 2: Enter Code (shown after code sent) */}
                            {codeSent && (
                                <>
                                    <div>
                                        <label className="text-[10px] font-black uppercase text-gray-400 ml-4 mb-2 block">Telegram Kod</label>
                                        <input
                                            type="text"
                                            value={vCode}
                                            onChange={e => setVCode(e.target.value)}
                                            placeholder="1234"
                                            maxLength={4}
                                            className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-black outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150 text-center tracking-[1em] text-2xl"
                                        />
                                    </div>
                                    <button
                                        onClick={handleAddMember}
                                        disabled={isActionLoading || !vCode || vCode.length < 4}
                                        className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 disabled:opacity-40"
                                        style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", boxShadow: "0 8px 20px rgba(45,110,62,0.28)" }}
                                    >
                                        {isActionLoading ? <Loader2 className="animate-spin mx-auto" /> : (language === 'uz' ? "QO'SHISH" : 'ДОБАВИТЬ')}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showCreatePromo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md p-10 rounded-[40px] shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-300">
                        <button onClick={() => setShowCreatePromo(false)} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-colors duration-150"><X size={18} /></button>
                        <h2 className="text-2xl font-black italic tracking-tighter uppercase">Promo-kod yaratish</h2>
                        <div className="space-y-4">
                            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                <p className="text-[8px] font-black text-gray-400 uppercase">Tanlangan Tarif</p>
                                <p className="text-sm font-black italic uppercase">{selectedTariff?.name}</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-400 ml-4 mb-2 block">Sizning kodingiz</label>
                                <input 
                                    type="text"
                                    value={customPromoCode}
                                    onChange={e => setCustomPromoCode(e.target.value)}
                                    placeholder="MASALAN: ALISHER20"
                                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-black uppercase outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150"
                                />
                            </div>
                            <button 
                                onClick={handleCreatePromo}
                                disabled={isActionLoading || !customPromoCode}
                                className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform duration-150 will-change-transform velari-green-btn"
                            >
                                {isActionLoading ? <Loader2 className="animate-spin mx-auto" /> : 'YARATISH VA TASDIQLASH'}
                            </button>
                        </div>
                    </div>
                </div>
            )}


            {showTransfer && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md p-10 rounded-[40px] shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-300">
                        <button onClick={() => setShowTransfer(false)} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-colors duration-150"><X size={18} /></button>
                        <h2 className="text-2xl font-black italic tracking-tighter uppercase">{language === 'uz' ? "Ichki O'tkazma" : 'Внутренний Перевод'}</h2>
                        <p className="text-gray-400 text-xs font-bold italic">Sizning mablag'ingiz cashback hamyoniga o'tkaziladi va uni saytda ishlatishingiz mumkin bo'ladi.</p>
                        <div className="space-y-4">
                            <input 
                                type="number"
                                value={transferAmount}
                                onChange={e => setTransferAmount(e.target.value)}
                                placeholder={language === 'uz' ? "O'tkazish summasi" : "Сумма перевода"}
                                className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-black italic text-xl outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150"
                            />
                            <button 
                                onClick={handleTransfer}
                                disabled={isActionLoading || !transferAmount}
                                className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform duration-150 will-change-transform velari-green-btn"
                            >
                                {isActionLoading ? <Loader2 className="animate-spin mx-auto" /> : (language === 'uz' ? 'O\'TKAZISH' : 'ПЕРЕВЕСТИ')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showWithdraw && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md p-10 rounded-[40px] shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-300">
                        <button onClick={() => setShowWithdraw(false)} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-colors duration-150"><X size={18} /></button>
                        <h2 className="text-2xl font-black italic tracking-tighter uppercase">{language === 'uz' ? 'Kartaga Yechish' : 'Вывод на Карту'}</h2>
                        <div className="space-y-4">
                            <input 
                                type="number"
                                value={withdrawAmount}
                                onChange={e => setWithdrawAmount(e.target.value)}
                                placeholder={language === 'uz' ? "Summa (min: 50k)" : "Сумма (мин: 50к)"}
                                className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150"
                            />
                            <input 
                                type="text"
                                value={cardNumber}
                                onChange={e => setCardNumber(e.target.value)}
                                placeholder="8600 **** **** ****"
                                className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150"
                            />
                            <button 
                                onClick={handleWithdraw}
                                disabled={isActionLoading || !withdrawAmount || !cardNumber}
                                className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform duration-150 will-change-transform velari-green-btn"
                            >
                                {isActionLoading ? <Loader2 className="animate-spin mx-auto" /> : (language === 'uz' ? 'Yuborish' : 'Отправить')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showRecovery && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                    <div className="bg-white w-full max-w-md p-10 rounded-[40px] shadow-2xl space-y-6 relative animate-in fade-in zoom-in duration-300">
                        <button onClick={() => setShowRecovery(false)} className="absolute top-6 right-6 p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-colors duration-150"><X size={18} /></button>
                        
                        {recoveryStep === "password" && (
                            <div className="space-y-6">
                                <div className="text-center space-y-2">
                                    <h2 className="text-2xl font-black italic tracking-tighter uppercase">{language === 'uz' ? 'PIN Tiklash' : 'Восстановление PIN'}</h2>
                                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Akaunt parolingizni kiriting</p>
                                </div>
                                <input 
                                    type="password"
                                    value={recoveryPassword}
                                    onChange={e => setRecoveryPassword(e.target.value)}
                                    placeholder="******"
                                    className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150"
                                />
                                {recoveryError && <p className="text-red-500 text-[10px] font-bold text-center uppercase tracking-widest">{recoveryError}</p>}
                                <button 
                                    onClick={handleVerifyPassword}
                                    disabled={isActionLoading || !recoveryPassword}
                                    className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform duration-150 will-change-transform velari-green-btn"
                                >
                                    {isActionLoading ? <Loader2 className="animate-spin mx-auto" /> : (language === 'uz' ? 'DAVOM ETISH' : 'ПРОДОЛЖИТЬ')}
                                </button>
                                <button 
                                    onClick={handleRequestTelegramCode}
                                    className="w-full text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-black transition-colors duration-150"
                                >
                                    Parolni ham unutdim (Telegram)
                                </button>
                            </div>
                        )}

                        {recoveryStep === "telegram" && (
                            <div className="space-y-6">
                                <div className="text-center space-y-2">
                                    <h2 className="text-2xl font-black italic tracking-tighter uppercase">{language === 'uz' ? 'Telegram Tiklash' : 'Telegram Сброс'}</h2>
                                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Botdan kelgan kodni kiriting</p>
                                </div>
                                <div className="space-y-4">
                                    <input 
                                        type="text"
                                        value={recoveryTelegramCode}
                                        onChange={e => setRecoveryTelegramCode(e.target.value)}
                                        placeholder="----"
                                        className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-black text-center tracking-[1em] outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150"
                                    />
                                    <div className="pt-4 border-t border-gray-100">
                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-4">Yangi PIN o'rnating</p>
                                        <input 
                                            type="text"
                                            maxLength={4}
                                            value={recoveryNewPin}
                                            onChange={e => setRecoveryNewPin(e.target.value)}
                                            placeholder="****"
                                            className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-black text-center tracking-[1em] outline-none focus:ring-2 focus:ring-black transition-[box-shadow] duration-150"
                                        />
                                    </div>
                                </div>
                                {recoveryError && <p className="text-red-500 text-[10px] font-bold text-center uppercase tracking-widest">{recoveryError}</p>}
                                <button 
                                    onClick={handleVerifyTelegramAndReset}
                                    disabled={isActionLoading || recoveryTelegramCode.length < 4 || recoveryNewPin.length !== 4}
                                    className="w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-transform duration-150 will-change-transform velari-green-btn"
                                >
                                    {isActionLoading ? <Loader2 className="animate-spin mx-auto" /> : (language === 'uz' ? 'TASDIQLASH' : 'ПОДТВЕРДИТЬ')}
                                </button>
                            </div>
                        )}

                        {recoveryStep === "new_pin" && (
                            <div className="space-y-6">
                                <div className="text-center space-y-2">
                                    <h2 className="text-2xl font-black italic tracking-tighter uppercase">{language === 'uz' ? 'Yangi PIN' : 'Новый PIN'}</h2>
                                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Yangi 4 xonali PIN kiriting</p>
                                </div>
                                <PinKeypad onComplete={handleSetNewPinDirectly} title="" />
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function VDivider() {
    return <div style={{ height: 1, background: "rgba(15,20,16,0.05)", marginLeft: 66 }} />;
}

function MenuItem({ href, icon, label, language, onClick, badge }: any) {
    const handleClick = (e: React.MouseEvent) => {
        videoPreWarmer.triggerHaptic("light");
        if (onClick) onClick(e);
    };

    const Content = (
        <div
            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform min-h-[52px] w-full flex items-center gap-3.5 px-4 py-3.5 cursor-pointer hover:bg-[rgba(15,20,16,0.02)]"
        >
            <div className="w-9 h-9 rounded-xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center shrink-0">
                {icon}
            </div>
            <span className="flex-1 text-[15px] font-medium text-[#111612] tracking-tight">
                {label}
            </span>
            {badge != null && badge > 0 && (
                <span className="min-w-[22px] h-[22px] px-2 rounded-full bg-[#EAF3EC] text-[#2D6E3E] text-xs font-bold inline-flex items-center justify-center">
                    {badge}
                </span>
            )}
            <ChevronRight size={18} className="text-[#C7CDC8]" />
        </div>
    );

    if (href && href !== "#") {
        return <Link href={`/${language}${href}`} onClick={handleClick} className="block no-underline">{Content}</Link>;
    }
    return <div onClick={handleClick}>{Content}</div>;
}
