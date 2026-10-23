"use client";

import { useStore } from "@/store/store";
import { useRouter } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import { CheckCircle, QrCode, Banknote, Clock, Info, AlertCircle, ArrowLeft, Truck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { translations } from "@/lib/translations";

function PaymentContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const orderId = searchParams.get("orderId");
    const { user, clearCart, language, showToast } = useStore();
    const t = translations[language];
    const [order, setOrder] = useState<any>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [loadingOrder, setLoadingOrder] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [paymentMethod, setPaymentMethod] = useState<"click" | "cash">("click");

    useEffect(() => {
        if (orderId) {
            fetchOrder();
        } else {
            setLoadingOrder(false);
            setError(language === 'uz' ? "Buyurtma topilmadi." : "Заказ не найден.");
        }
    }, [orderId]);

    const fetchOrder = async () => {
        try {
            const response = await fetch(`/api/orders/get?orderId=${orderId}&phone=${encodeURIComponent(user?.phone || '')}`);
            const data = await response.json();
            
            if (!response.ok || !data.success) {
                setError(language === 'uz' ? "Buyurtma topilmadi." : "Заказ не найден.");
            } else {
                setOrder(data.order);
            }
        } catch (e) {
            console.error("Fetch order error:", e);
            setError(language === 'uz' ? "Ma'lumotlarni yuklashda xatolik." : "Ошибка при загрузке данных.");
        } finally {
            setLoadingOrder(false);
        }
    };

    const handlePayment = async () => {
        if (!order || !orderId) return;

        setIsProcessing(true);
        setError(null);

        try {
            // Note: Stock deduction is already handled atomically by the place_order RPC in the checkout page.
            // We do not decrement stock here to avoid double deduction.

            // 3. Update order status
            const finalStatus = paymentMethod === 'cash' 
                ? (language === 'uz' ? "Qabul qilindi" : "Принят")
                : (language === 'uz' ? "To'lov kutilmoqda" : "Ожидание оплаты");

            // 3. Update order status via secure API
            const updateResponse = await fetch('/api/orders/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    status: finalStatus,
                    paymentMethod: paymentMethod,
                    userPhone: user?.phone || "" // Added for verification
                })
            });

            const updateData = await updateResponse.json();
            if (!updateResponse.ok) {
                throw new Error(updateData.message || "Buyurtmani yangilashda xatolik yuz berdi.");
            }

            clearCart();
            sessionStorage.removeItem('fast_buy_item');

            if (paymentMethod === "click") {
                const serviceId = process.env.NEXT_PUBLIC_CLICK_SERVICE_ID || "";
                const merchantId = process.env.NEXT_PUBLIC_CLICK_MERCHANT_ID || "";
                if (!serviceId || !merchantId) {
                    throw new Error("Click tizimi hozircha sozlanmagan.");
                }
                const returnUrl = encodeURIComponent(`${window.location.origin}/order-success`);
                
                // Standard parameters for Click
                const params = `service_id=${serviceId}&merchant_id=${merchantId}&amount=${order.total}&transaction_param=${orderId}&return_url=${returnUrl}`;
                const clickUrl = `https://my.click.uz/services/pay?${params}`;
                const clickDeepLink = `clickuz://payment?${params}`;

                // Detection
                const ua = navigator.userAgent;
                const isAndroid = /Android/i.test(ua);
                const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);

                if (isAndroid) {
                    // Force open Click App for Android
                    window.location.href = clickDeepLink;
                    
                    // Fallback to Web after a short delay
                    setTimeout(() => {
                        if (document.hasFocus()) {
                            window.location.href = clickUrl;
                        }
                    }, 1000);
                } else if (isMobile) {
                    // iOS and others: New window context to break out of PWA
                    const newWindow = window.open(clickUrl, '_blank');
                    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                        window.location.href = clickUrl;
                    }
                } else {
                    // Desktop behavior
                    window.location.href = clickUrl;
                }
                return;
            }

            if (paymentMethod === "cash") {
                await fetch('/api/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: orderId, method: 'cash' })
                });
            }

            router.push(`/${language}/order-success?orderId=${orderId}`);
        } catch (err: any) {
            console.error("Payment error:", err);
            setError(err.message || (language === 'uz' ? "Xatolik yuz berdi." : "Произошла ошибка."));
        } finally {
            setIsProcessing(false);
        }
    };

    if (loadingOrder) return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF6" }}>
            <div style={{ width: 36, height: 36, border: "3px solid #2D6E3E", borderTopColor: "transparent", borderRadius: "50%" }} className="animate-spin" />
        </div>
    );

    return (
        <div style={{ padding: "24px 16px 96px", background: "#FAFAF6", minHeight: "100vh" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, paddingTop: 48 }}>
                <button
                    onClick={() => router.back()}
                    style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", border: "none", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(15,20,16,0.06)", cursor: "pointer", flexShrink: 0 }}
                >
                    <ArrowLeft size={20} color="#0F1410" />
                </button>
                <h1 className="text-2xl font-black italic tracking-tighter uppercase">
                    {language === 'uz' ? 'To\'lov usuli' : 'Способ оплаты'}
                </h1>
            </div>

            <div className="space-y-4 mb-8">
                {/* Click Option */}
                <div
                    onClick={() => setPaymentMethod("click")}
                    className={`p-6 border-2 rounded-[32px] cursor-pointer transition-[border-color,background-color,box-shadow] duration-150 ${paymentMethod === "click" ? "border-[#00a1ff] bg-[#00a1ff]/5 shadow-xl shadow-[#00a1ff]/10" : "border-gray-100"
                        }`}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-4">
                            <div className={`p-3 rounded-2xl ${paymentMethod === "click" ? "bg-[#00a1ff] text-white" : "bg-gray-100"}`}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM11 19.93C7.05 19.43 4 16.05 4 12C4 7.95 7.05 4.57 11 4.07V19.93ZM13 4.07C16.95 4.57 20 7.95 20 12C20 16.05 16.95 19.43 13 19.93V4.07Z" fill="currentColor" />
                                </svg>
                            </div>
                            <span className={`font-black text-sm italic uppercase tracking-tighter ${paymentMethod === "click" ? "text-[#00a1ff]" : ""}`}>
                                {language === 'uz' ? 'Click orqali to\'lash' : 'Оплата через Click'}
                            </span>
                        </div>
                        <input type="radio" checked={paymentMethod === "click"} readOnly className="accent-[#00a1ff] w-5 h-5" />
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-14">
                        {language === 'uz' ? 'Avtomatlashtirilgan Click portaliga o\'tish' : 'Переход на портал Click'}
                    </p>
                </div>

                {/* Cash on Delivery Option */}
                <div
                    onClick={() => setPaymentMethod("cash")}
                    className={`p-6 border-2 rounded-[32px] cursor-pointer transition-[border-color,background-color,box-shadow] duration-150 ${paymentMethod === "cash" ? "bg-white shadow-xl" : "border-gray-100"}`}
                    style={paymentMethod === "cash" ? { borderColor: "#2D6E3E" } : {}}
                >
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl" style={paymentMethod === "cash" ? { background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff" } : { background: "#f3f4f6" }}>
                                <Banknote size={20} />
                            </div>
                            <span className="font-black text-sm italic uppercase tracking-tighter">
                                {language === 'uz' ? 'Naqd pul yoki karta (Olganda)' : 'Наличными или картой (При получении)'}
                            </span>
                        </div>
                        <input type="radio" checked={paymentMethod === "cash"} readOnly className="accent-black w-5 h-5" />
                    </div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest ml-14">
                        {language === 'uz' ? 'Mahsulotni qo\'lingizga olganda to\'lang' : 'Оплатите при получении товара'}
                    </p>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="mb-8 p-5 bg-red-50 border-2 border-red-100 rounded-[28px] flex items-center gap-4 text-red-600 text-[12px] font-black italic uppercase tracking-tight animate-in slide-in-from-top-2">
                    <AlertCircle size={24} strokeWidth={3} className="shrink-0" />
                    <p>{error}</p>
                </div>
            )}

            {/* Buyurtma tafsilotlari — yetkazish narxi bilan */}
            <div style={{ padding: "20px 24px", borderRadius: 24, background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", marginBottom: 20, color: "#fff" }}>
                {/* Tovarlar summasi */}
                {order?.delivery_fee != null && (
                    <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, opacity: 0.8, fontSize: 13 }}>
                            <span>{language === 'uz' ? 'Tovarlar' : 'Товары'}</span>
                            <span>{((order.total || 0) - (order.delivery_fee || 0)).toLocaleString()} {language === 'uz' ? "so'm" : 'сум'}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, opacity: 0.8, fontSize: 13 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <Truck size={13} />
                                {language === 'uz'
                                    ? (order.delivery_type === 'express' ? 'Tezkor yetkazish' : 'Standart yetkazish')
                                    : (order.delivery_type === 'express' ? 'Экспресс-доставка' : 'Стандартная доставка')}
                            </span>
                            <span style={{ color: (order.delivery_fee || 0) > 0 ? "#fff" : "#A3F0B8", fontWeight: 700 }}>
                                {(order.delivery_fee || 0) > 0
                                    ? `${(order.delivery_fee || 0).toLocaleString()} ${language === 'uz' ? "so'm" : 'сум'}`
                                    : (language === 'uz' ? 'Bepul' : 'Бесплатно')}
                            </span>
                        </div>
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.2)", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>{t.common.total}</span>
                            <span style={{ fontSize: 22, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5 }}>{order?.total?.toLocaleString() || 0} {language === 'uz' ? "so'm" : 'сум'}</span>
                        </div>
                    </>
                )}
                {/* delivery_fee yo'q bo'lsa (eski buyurtmalar) — oddiy ko'rinish */}
                {order?.delivery_fee == null && (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", opacity: 0.7 }}>{t.common.total}</span>
                        <span style={{ fontSize: 22, fontWeight: 900, fontStyle: "italic", letterSpacing: -0.5 }}>{order?.total?.toLocaleString() || 0} {language === 'uz' ? "so'm" : 'сум'}</span>
                    </div>
                )}
            </div>

            <button
                onClick={handlePayment}
                disabled={isProcessing}
                className={`w-full py-6 rounded-[20px] font-black text-sm uppercase tracking-widest flex justify-center items-center gap-3 active:scale-95 transition-transform duration-150 will-change-transform disabled:opacity-70 ${
                    paymentMethod === "click" ? "bg-[#00a1ff] text-white" : ""
                }`}
                style={paymentMethod !== "click" ? { background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", boxShadow: "0 8px 20px rgba(45,110,62,0.28)" } : { boxShadow: "0 8px 20px rgba(0,161,255,0.3)" }}
            >
                {isProcessing ? (
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                    <>
                        <span>
                            {paymentMethod === "click" 
                                ? (language === 'uz' ? 'Click\'ga o\'tish' : 'Перейти в Click') 
                                : (language === 'uz' ? 'Buyurtmani rasmiylashtirish' : 'Оформить заказ')}
                        </span>
                        <CheckCircle size={22} strokeWidth={3} />
                    </>
                )}
            </button>

            <div className="mt-8 flex items-center justify-center gap-2 text-gray-300 text-[10px] font-black uppercase tracking-[0.2em]">
                <Info size={14} />
                <span>{language === 'uz' ? 'Xavfsiz to\'lov tizimi' : 'Безопасная платежная система'}</span>
            </div>
        </div>
    );
}

export default function PaymentPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAFAF6" }}>
                <div style={{ width: 36, height: 36, border: "3px solid #2D6E3E", borderTopColor: "transparent", borderRadius: "50%" }} className="animate-spin" />
            </div>
        }>
            <PaymentContent />
        </Suspense>
    );
}
