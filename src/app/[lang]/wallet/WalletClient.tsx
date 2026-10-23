"use client";

import { useState, useEffect } from "react";
import { 
    ChevronLeft, 
    ChevronRight, 
    Wallet, 
    ShieldCheck, 
    RotateCcw, 
    History as HistoryIcon, 
    Loader2,
    Star,
    CheckCircle2
} from "lucide-react";
import { useStore } from "@/store/store";
import { translations } from "@/lib/translations";
import { useRouter } from "next/navigation";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

export default function WalletClient() {
    const router = useRouter();
    const { user, language } = useStore();
    const t = translations[language];

    const [wallet, setWallet] = useState<any>(null);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [pendingOrders, setPendingOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Transfer States
    const [showTransfer, setShowTransfer] = useState(false);
    const [receiverPhone, setReceiverPhone] = useState("");
    const [amount, setAmount] = useState("");
    const [isGift, setIsGift] = useState(false);
    const [otpCode, setOtpCode] = useState("");
    const [transferStep, setTransferStep] = useState(1); // 1: Input, 2: OTP
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState("");

    const fetchWalletData = async () => {
        if (!user) return;
        // Hamyon, tarix va kutilayotgan keshbek — server orqali (faqat o'z hamyoni)
        let data: any = null;
        try {
            const res = await fetch("/api/me/wallet", { cache: "no-store" });
            data = await res.json();
        } catch (e) {
            console.error("Wallet fetch error:", e);
        }
        if (!data?.success) {
            setLoading(false);
            return;
        }

        const combined = [
            ...(data.cashback || []).map((c: any) => ({ ...c, type: 'cashback', date: c.created_at, val: c.amount })),
            ...(data.transfers || []).map((t: any) => ({
                ...t,
                type: 'transfer',
                date: t.created_at,
                val: t.isOutgoing ? -t.amount : t.amount,
                isOutgoing: t.isOutgoing
            }))
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (data.wallet) setWallet(data.wallet);
        setTransactions(combined);
        setPendingOrders(data.pendingOrders || []);
        setLoading(false);
    };

    useEffect(() => {
        if (user) fetchWalletData();
        else router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`);
    }, [user]);

    const totalPending = pendingOrders.reduce((sum: number, o: any) => sum + Number(o.potential_cashback), 0);

    const handleTransferRequest = async () => {
        if (!receiverPhone || !amount || Number(amount) < 1000) {
            setError(language === 'uz' ? "Minimal o'tkazma: 1 000 so'm" : "Минимум: 1 000 сум");
            return;
        }
        setIsProcessing(true);
        setError("");
        try {
            const res = await fetch("/api/wallet/transfer/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ senderPhone: user?.phone, receiverPhone, amount: Number(amount), isGift })
            });
            const data = await res.json();
            if (data.success) setTransferStep(2);
            else setError(data.message);
        } catch (e) { setError("Xatolik yuz berdi"); }
        setIsProcessing(false);
    };

    const handleTransferConfirm = async () => {
        if (!otpCode) return;
        setIsProcessing(true);
        try {
            const res = await fetch("/api/wallet/transfer/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ senderPhone: user?.phone, receiverPhone, amount: Number(amount), code: otpCode })
            });
            const data = await res.json();
            if (data.success) {
                setShowTransfer(false);
                setTransferStep(1);
                setIsGift(false);
                fetchWalletData();
            } else setError(data.message);
        } catch (e) { setError("Xatolik yuz berdi"); }
        setIsProcessing(false);
    };

    const GREEN = "#2D6E3E";
    const GREEN_DEEP = "#1F5A30";

    if (loading) return (
        <div style={{ minHeight: "100vh", background: "#FAFAF6", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 style={{ animation: "spin 1s linear infinite", color: GREEN }} size={32} />
        </div>
    );

    return (
        <div style={{ background: "#FAFAF6", minHeight: "100vh", paddingBottom: 100 }}>
            <div className="max-w-xl mx-auto px-4 pt-4">
                {/* Back button & Title */}
                <div className="flex items-center gap-4 mb-5 pt-2">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            router.back();
                        }}
                        className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] transition-transform duration-150 will-change-transform hover:bg-white"
                        aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <h1 className="text-2xl font-bold tracking-tight text-[#111612]">{language === 'uz' ? 'Hamyon' : 'Кошелёк'}</h1>
                </div>

                {/* Balance card — Velari green gradient */}
                <div style={{
                    background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`,
                    color: "#fff", borderRadius: 28, padding: "24px 22px 26px",
                    boxShadow: "0 16px 40px rgba(45,110,62,0.28)", position: "relative", overflow: "hidden", marginBottom: 14,
                }}>
                    <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: 60, background: "rgba(255,255,255,0.08)", pointerEvents: "none" }} />
                    <div style={{ position: "absolute", bottom: -50, left: -20, width: 140, height: 140, borderRadius: 70, background: "rgba(255,255,255,0.05)", pointerEvents: "none" }} />
                    <div style={{ position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                            <div>
                                <p style={{ fontSize: 11, opacity: 0.75, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, marginBottom: 4 }}>
                                    {language === 'uz' ? "Cashback hamyoni" : "Кэшбэк кошелёк"}
                                </p>
                                <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.8, margin: 0 }}>
                                    {(wallet?.balance || 0).toLocaleString()} <span style={{ fontSize: 16, opacity: 0.8, fontWeight: 500 }}>{language === 'uz' ? "so'm" : "сум"}</span>
                                </h2>
                            </div>
                            <div style={{ width: 48, height: 48, borderRadius: 16, background: "rgba(255,255,255,0.18)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Wallet size={22} color="#fff" />
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 16, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 500, marginBottom: 2 }}>{language === 'uz' ? "Kutilmoqda" : "Ожидается"}</div>
                                <div style={{ fontSize: 15, fontWeight: 700 }}>+{totalPending.toLocaleString()}</div>
                            </div>
                            <div style={{ flex: 1, padding: "10px 14px", borderRadius: 16, background: "rgba(255,255,255,0.12)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 500, marginBottom: 2 }}>{language === 'uz' ? "Foydalanuvchi" : "Пользователь"}</div>
                                <div style={{ fontSize: 15, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name || "Mijoz"}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Transfer button */}
                <div className="bg-white/90 backdrop-blur-md rounded-[22px] border border-[rgba(15,20,16,0.06)] shadow-sm overflow-hidden mb-4">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setShowTransfer(true);
                        }}
                        className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform w-full flex items-center gap-3.5 px-4 py-3.5 cursor-pointer text-left hover:bg-[rgba(15,20,16,0.02)] min-h-[54px]"
                    >
                        <div className="w-9 h-9 rounded-xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center shrink-0">
                            <RotateCcw size={18} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[15px] font-medium text-[#111612] tracking-tight">
                                {language === 'uz' ? "Hamyonlararo o'tkazma" : "Перевод между кошельками"}
                            </div>
                            <div className="text-xs text-[#737D75] mt-0.5 font-medium">
                                {language === 'uz' ? "2FA Telegram orqali himoya" : "Защита через 2FA Telegram"}
                            </div>
                        </div>
                        <ChevronRight size={18} className="text-[#C7CDC8]" />
                    </button>
                </div>

                {/* Transaction history */}
                <div className="mb-4">
                    <div className="flex items-center justify-between px-1 py-2 mb-2">
                        <p className="text-xs font-semibold text-[#737D75] uppercase tracking-wider">
                            {language === 'uz' ? "Tranzaksiyalar" : "Транзакции"}
                        </p>
                        <HistoryIcon size={16} className="text-[#737D75]" />
                    </div>
                    <div className="flex flex-col gap-2.5">
                        {transactions.length === 0 ? (
                            <div className="bg-white/90 backdrop-blur-md rounded-[22px] p-8 text-center text-[#737D75] font-medium text-sm border border-[rgba(15,20,16,0.06)] shadow-sm">
                                {language === 'uz' ? "Hozircha tranzaksiyalar yo'q" : "Транзакций пока нет"}
                            </div>
                        ) : transactions.map((tx, i) => (
                            <div key={i} className="bg-white/90 backdrop-blur-md rounded-[20px] p-4 border border-[rgba(15,20,16,0.05)] shadow-xs flex items-center gap-3.5">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-base ${tx.val > 0 ? "bg-[#EAF3EC] text-[#2D6E3E]" : "bg-rose-50 text-rose-600"}`}>
                                    {tx.val > 0 ? "+" : "−"}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-[#111612] truncate">
                                        {tx.type === 'cashback' ? (language === 'uz' ? "Keshbek to'plandi" : "Кэшбэк начислен") :
                                         tx.type?.includes('gift') ? `🎁 ${tx.isOutgoing ? tx.receiver_phone : tx.sender_phone}` :
                                         (tx.isOutgoing ? `→ ${tx.receiver_phone}` : `← ${tx.sender_phone}`)}
                                    </p>
                                    <p className="text-xs text-[#737D75] mt-0.5 font-medium">{new Date(tx.date).toLocaleDateString()}</p>
                                </div>
                                <p className={`shrink-0 font-bold text-base tracking-tight ${tx.val > 0 ? "text-[#2D6E3E]" : "text-rose-600"}`}>
                                    {tx.val > 0 ? "+" : "−"}{Math.abs(tx.val).toLocaleString()}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Transfer Modal */}
            {showTransfer && (
                <div
                    onClick={() => {
                        setShowTransfer(false);
                        setTransferStep(1);
                    }}
                    className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        className="bg-white/95 backdrop-blur-xl w-full max-w-md rounded-t-[32px] sm:rounded-[32px] p-6 sm:p-8 shadow-2xl border border-[rgba(15,20,16,0.08)] relative animate-in slide-in-from-bottom duration-300"
                    >
                        {/* Grab handle on mobile */}
                        <div className="w-12 h-1.5 bg-black/15 rounded-full mx-auto -mt-2 mb-4 sm:hidden" />

                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                setShowTransfer(false);
                                setTransferStep(1);
                            }}
                            className="ios-icon-tap active:scale-90 absolute top-5 right-5 w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-[#111612] hover:bg-black/10 transition-transform duration-150 will-change-transform"
                            aria-label="Close"
                        >
                            ✕
                        </button>
                        <div className="text-center mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center mx-auto mb-3 shadow-xs">
                                <ShieldCheck size={26} />
                            </div>
                            <h2 className="text-xl font-bold tracking-tight text-[#111612]">
                                {transferStep === 1 ? (language === 'uz' ? "O'tkazma" : "Перевод") : (language === 'uz' ? "2FA Tasdiqlash" : "2FA Подтверждение")}
                            </h2>
                        </div>

                        {error && <div className="bg-rose-50 text-rose-600 p-3.5 rounded-2xl text-xs font-semibold mb-4 border border-rose-100">{error}</div>}

                        {transferStep === 1 ? (
                            <div className="flex flex-col gap-3">
                                <input
                                    type="tel"
                                    placeholder={language === 'uz' ? "Qabul qiluvchi tel..." : "Телефон получателя..."}
                                    value={receiverPhone}
                                    onChange={e => setReceiverPhone(e.target.value)}
                                    className="w-full bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl p-4 text-sm font-semibold text-[#111612] outline-none transition-colors"
                                />
                                <input
                                    type="number"
                                    placeholder={language === 'uz' ? "Summa (so'm)..." : "Сумма (сум)..."}
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    className="w-full bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl p-4 text-sm font-semibold text-[#111612] outline-none transition-colors"
                                />
                                <button
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("selection");
                                        setIsGift(!isGift);
                                    }}
                                    className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform w-full p-4 rounded-2xl border flex items-center gap-3 cursor-pointer"
                                    style={{
                                        borderColor: isGift ? "#F59E0B" : "rgba(15,20,16,0.08)",
                                        background: isGift ? "#FFFBEB" : "#F5F7F5",
                                    }}
                                >
                                    <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: isGift ? "#F59E0B" : "rgba(15,20,16,0.06)" }}>
                                        <Star size={16} fill={isGift ? "#fff" : "none"} color={isGift ? "#fff" : "#9AA29C"} />
                                    </div>
                                    <span className="text-xs font-semibold" style={{ color: isGift ? "#B45309" : "#737D75" }}>
                                        🎁 {language === 'uz' ? "Sovg'a sifatida yuborish" : "Отправить как подарок"}
                                    </span>
                                </button>
                                <button
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("medium");
                                        handleTransferRequest();
                                    }}
                                    disabled={isProcessing}
                                    className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform w-full py-4 rounded-2xl text-white font-semibold text-sm cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#2D6E3E]/20 disabled:opacity-50"
                                    style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #1F5A30 100%)` }}
                                >
                                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : (language === 'uz' ? "Davom etish" : "Продолжить")}
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3.5 text-center">
                                <input
                                    type="text"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={otpCode}
                                    onChange={e => setOtpCode(e.target.value)}
                                    className="bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl py-5 px-4 text-3xl font-bold text-center tracking-[0.4em] outline-none w-full text-[#111612]"
                                />
                                <button
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("medium");
                                        handleTransferConfirm();
                                    }}
                                    disabled={isProcessing || otpCode.length < 6}
                                    className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform w-full py-4 rounded-2xl text-white font-semibold text-sm cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#2D6E3E]/20 disabled:opacity-50"
                                    style={{ background: `linear-gradient(135deg, ${GREEN} 0%, #1F5A30 100%)` }}
                                >
                                    {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                                    {language === 'uz' ? "Tasdiqlash" : "Подтвердить"}
                                </button>
                                <p className="text-xs text-[#737D75] font-medium">{language === 'uz' ? "Kodni Telegram botimizdan oldingiz" : "Код получен в Telegram боте"}</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
