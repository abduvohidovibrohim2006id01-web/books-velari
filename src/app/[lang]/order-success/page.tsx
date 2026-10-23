"use client";

import { CheckCircle, Sparkles, Gift, ArrowRight, Wallet, History } from "lucide-react";
import Link from "next/link";
import { useStore } from "@/store/store";
import { useSearchParams } from "next/navigation";
import { useState, useEffect, useRef, Suspense } from "react";
import { ymGoal } from "@/lib/metrika";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

const GREEN = "#2D6E3E";
const GREEN_DEEP = "#1F5A30";
const GREEN_TINT = "#EAF3EC";

function SuccessContent() {
    const { language } = useStore();
    const searchParams = useSearchParams();
    const orderId = searchParams.get("orderId");
    const [potentialCashback, setPotentialCashback] = useState<number>(0);
    const [loading, setLoading] = useState(true);
    const trackedRef = useRef<string | null>(null);

    useEffect(() => {
        videoPreWarmer.triggerHaptic("double");
        if (orderId) {
            // Analytics: yakuniy konversiya (har orderId uchun bir marta)
            if (trackedRef.current !== orderId) {
                trackedRef.current = orderId;
                ymGoal('order_success', { order_id: orderId });
            }
            fetchOrderReward();
        } else {
            setLoading(false);
        }
    }, [orderId]);

    const fetchOrderReward = async () => {
        const { user } = useStore.getState();
        try {
            const response = await fetch(`/api/orders/get?orderId=${orderId}&phone=${encodeURIComponent(user?.phone || 'NONE')}`);
            const data = await response.json();
            if (data.success && data.order?.potential_cashback) {
                setPotentialCashback(Number(data.order.potential_cashback));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ background: "#FAFAF6", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 20px", textAlign: "center" }}>
            {/* Success Icon */}
            <div style={{ position: "relative", marginBottom: 32 }}>
                <div style={{ width: 96, height: 96, borderRadius: 32, background: GREEN_TINT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle size={48} color={GREEN} strokeWidth={2.5} />
                </div>
                <div style={{ position: "absolute", top: -8, right: -8, width: 36, height: 36, borderRadius: 12, background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 4px 12px rgba(45,110,62,0.4)` }} className="animate-pulse">
                    <Sparkles size={18} color="#fff" />
                </div>
            </div>

            <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: -1, color: "#0F1410", marginBottom: 10, lineHeight: 1.1, fontStyle: "italic", textTransform: "uppercase" }}>
                {language === 'uz' ? 'Buyurtma qabul qilindi!' : 'Заказ принят!'}
            </h1>
            <p style={{ color: "#9AA29C", maxWidth: 280, margin: "0 auto 32px", fontSize: 13, fontWeight: 500, lineHeight: 1.6 }}>
                {language === 'uz'
                    ? "Buyurtmangiz muvaffaqiyatli qabul qilindi. Tez orada siz bilan bog'lanamiz."
                    : "Ваш заказ успешно принят. Мы свяжемся с вами в ближайшее время."}
            </p>

            {/* Cashback Card */}
            {potentialCashback > 0 && (
                <div style={{ width: "100%", maxWidth: 360, borderRadius: 28, padding: "28px 24px", background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`, marginBottom: 32, boxShadow: "0 16px 40px rgba(45,110,62,0.28)", position: "relative", overflow: "hidden" }}>
                    {/* Decorative blobs */}
                    <div style={{ position: "absolute", top: -24, right: -24, width: 96, height: 96, borderRadius: "50%", background: "rgba(255,255,255,0.08)" }} />
                    <div style={{ position: "absolute", bottom: -20, left: -20, width: 80, height: 80, borderRadius: "50%", background: "rgba(255,255,255,0.06)" }} />

                    <div style={{ position: "relative", zIndex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 16 }}>
                            <div style={{ width: 36, height: 36, borderRadius: 12, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <Gift size={18} color="#fff" />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.7)", letterSpacing: 2, textTransform: "uppercase" }}>
                                {language === 'uz' ? "Xushxabar!" : "Отличная новость!"}
                            </span>
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <h2 style={{ fontSize: 36, fontWeight: 900, color: "#fff", letterSpacing: -1, fontStyle: "italic", marginBottom: 4 }}>
                                + {potentialCashback.toLocaleString()} <span style={{ fontSize: 18, fontWeight: 600, fontStyle: "normal", opacity: 0.6 }}>so'm</span>
                            </h2>
                            <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 2, textTransform: "uppercase" }}>
                                {language === 'uz' ? "Kashbek kutilmoqda" : "Кэшбэк ожидается"}
                            </p>
                        </div>

                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 16 }}>
                            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.6 }}>
                                {language === 'uz'
                                    ? "Ushbu summa buyurtma yetkazilgandan so'ng avtomatik hamyoningizga tushadi!"
                                    : "Эта сумма поступит на ваш кошелек после доставки заказа!"}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 12 }}>
                <Link
                    href="/"
                    onClick={() => videoPreWarmer.triggerHaptic("medium")}
                    className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "18px 24px", borderRadius: 20, background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`, color: "#fff", fontWeight: 800, fontSize: 13, textDecoration: "none", boxShadow: "0 8px 20px rgba(45,110,62,0.28)", letterSpacing: 0.5 }}
                >
                    {language === 'uz' ? 'Xaridni davom ettirish' : 'Продолжить покупки'}
                    <ArrowRight size={18} />
                </Link>
                <div style={{ display: "flex", gap: 10 }}>
                    <Link
                        href="/orders"
                        onClick={() => videoPreWarmer.triggerHaptic("light")}
                        className="ios-tap-feedback active:scale-95 transition-transform duration-150 will-change-transform"
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 12px", borderRadius: 18, background: "#fff", color: "#5A625C", fontWeight: 700, fontSize: 12, textDecoration: "none", boxShadow: "0 2px 8px rgba(15,20,16,0.06)", border: "1px solid rgba(15,20,16,0.06)" }}
                    >
                        <History size={16} />
                        {language === 'uz' ? 'Tarix' : 'История'}
                    </Link>
                    <Link
                        href="/account"
                        onClick={() => videoPreWarmer.triggerHaptic("light")}
                        className="ios-tap-feedback active:scale-95 transition-transform duration-150 will-change-transform"
                        style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "16px 12px", borderRadius: 18, background: GREEN_TINT, color: GREEN, fontWeight: 700, fontSize: 12, textDecoration: "none" }}
                    >
                        <Wallet size={16} />
                        {language === 'uz' ? 'Hamyon' : 'Кошелек'}
                    </Link>
                </div>
            </div>
        </div>
    );
}

export default function OrderSuccess() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF6" }}>
                <div style={{ width: 36, height: 36, border: `3px solid ${GREEN}`, borderTopColor: "transparent", borderRadius: "50%" }} className="animate-spin" />
            </div>
        }>
            <SuccessContent />
        </Suspense>
    );
}
