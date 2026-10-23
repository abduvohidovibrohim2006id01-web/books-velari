"use client";

import { useStore } from "@/store/store";
import { useShallow } from "zustand/react/shallow";
import Link from "next/link";
import { useState, useEffect } from "react";
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag, ShoppingCart, Package, ChevronLeft, ChevronRight, Ticket, Loader2, X } from "lucide-react";
import { translations } from "@/lib/translations";
import Image from "next/image";
import { makeVariantLoader, hasVariants, getOptimizedImageUrl } from "@/lib/imageVariants";
import { computeStandardDelivery } from "@/lib/delivery";
import Sheet from "@/components/velari/Sheet";
import { Gift } from "lucide-react";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

const GREEN = "#2D6E3E";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export default function CartPage() {
    const { cart, updateQuantity, removeFromCart, language, cartPromo, setCartPromo, showToast, personalOffers, fetchPersonalOffers } = useStore(useShallow(s => ({
        cart: s.cart, updateQuantity: s.updateQuantity, removeFromCart: s.removeFromCart, language: s.language,
        cartPromo: s.cartPromo, setCartPromo: s.setCartPromo, showToast: s.showToast,
        personalOffers: s.personalOffers, fetchPersonalOffers: s.fetchPersonalOffers
    })));
    const t = translations[language];

    // Shaxsiy smart-chegirmalarni yuklash (reload'da reset bo'ladi — store persist qilmaydi)
    useEffect(() => { fetchPersonalOffers(); }, [fetchPersonalOffers]);

    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    // Har bir mahsulot uchun shaxsiy chegirma — checkout/place_order bilan bir xil: floor(narx*soni*foiz/100)
    const lineDiscount = (item: any) => {
        const pct = personalOffers[item.id] || 0;
        return pct > 0 ? Math.floor(item.price * item.quantity * pct / 100) : 0;
    };
    const smartDiscount = cart.reduce((sum, item) => sum + lineDiscount(item), 0);
    const promoDiscount = cartPromo?.discount || 0;
    const goodsTotal = Math.max(0, subtotal - smartDiscount - promoDiscount);
    // Bepul yetkazish chegarasi PROMO-KODSIZ hisoblanadi (promo narx chegirmasi emas)
    const deliveryFee = computeStandardDelivery(Math.max(0, subtotal - smartDiscount));
    const total = goodsTotal + deliveryFee;
    const fmtPrice = (n: number) => n.toLocaleString("ru-RU") + (language === "ru" ? " сум" : " so'm");

    // Promokod (savatda kiritish — qo'llangani checkout'ga uzatiladi)
    const [promoOpen, setPromoOpen] = useState(false);
    const [promoCode, setPromoCode] = useState("");
    const [isApplyingPromo, setIsApplyingPromo] = useState(false);

    const handleApplyPromo = async () => {
        if (!promoCode.trim()) return;
        setIsApplyingPromo(true);
        try {
            const res = await fetch("/api/promo-codes/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: promoCode, totalAmount: subtotal, userPhone: useStore.getState().user?.phone || null }),
            });
            const data = await res.json();
            if (data.success) {
                setCartPromo({ code: data.code, discount: data.discount });
                setPromoCode("");
                setPromoOpen(false);
                showToast(t.common.promoApplied, "success");
            } else {
                showToast(data.error, "error");
            }
        } catch (e) {
            console.error("Promo apply error:", e);
        } finally {
            setIsApplyingPromo(false);
        }
    };

    const handleRemovePromo = () => {
        setCartPromo(null);
        setPromoCode("");
    };

    return (
        <div className="min-h-screen" style={{ background: "#FAFAF6" }}>

            {/* ── MOBILE ── */}
            <div className="md:hidden pb-48">
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 12px" }}>
                    <Link
                        href={`/${language}/catalog`}
                        onClick={() => videoPreWarmer.triggerHaptic("light")}
                        className="ios-icon-tap active:scale-90 transition-transform duration-150"
                        style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(15,20,16,0.06)", textDecoration: "none", color: "#0F1410", flexShrink: 0 }}
                    >
                        <ChevronLeft size={20} />
                    </Link>
                    <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: "#111612", margin: 0 }}>
                        {t.cart.title}
                    </h1>
                    <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "#737D75" }}>
                        {cart.length} {language === "uz" ? "ta" : "шт"}
                    </span>
                </div>

                {cart.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 32px", textAlign: "center" }}>
                        <div style={{ width: 80, height: 80, borderRadius: 28, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20, boxShadow: "0 4px 16px rgba(15,20,16,0.06)", border: "1px solid rgba(15,20,16,0.05)" }}>
                            <ShoppingBag size={36} color="#9AA29C" />
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 600, color: "#737D75", marginBottom: 24 }}>
                            {t.cart.empty}
                        </p>
                        <Link
                            href="/"
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150"
                            style={{
                                display: "inline-block", padding: "14px 32px",
                                background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", borderRadius: 27,
                                fontWeight: 600, fontSize: 15, textDecoration: "none",
                                boxShadow: "0 8px 24px rgba(45,110,62,0.28)",
                            }}
                        >
                            {language === "uz" ? "Xaridni boshlash" : "Начать покупки"}
                        </Link>
                    </div>
                ) : (
                    <div className="overscroll-contain touch-pan-y [WebkitOverflowScrolling:touch]" style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                        {cart.map((item, idx) => {
                            const name = (language === "uz" ? item.name_uz : item.name_ru) || item.name;
                            return (
                                <div key={item.id} style={{
                                    background: "#fff", borderRadius: 24,
                                    padding: "14px", display: "flex", gap: 12,
                                    boxShadow: "0 4px 16px rgba(15,20,16,0.04)",
                                    border: "1px solid rgba(15,20,16,0.06)",
                                    animation: `velari-cart-in ${200 + idx * 40}ms ${EASE} both`,
                                }}>
                                    {/* Image */}
                                    <div style={{ width: 80, height: 80, borderRadius: 18, overflow: "hidden", background: "#F5F5F0", flexShrink: 0, position: "relative" }}>
                                        {(() => {
                                            const u = getOptimizedImageUrl(item.image_metadata, item.image || item.imageUrl, 'xs');
                                            return <Image src={u} alt={name} fill sizes="80px" style={{ objectFit: "cover" }} loader={hasVariants(item.image_metadata, u) ? makeVariantLoader(item.image_metadata) : undefined} />;
                                        })()}
                                    </div>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                                        <div>
                                            <p style={{ fontSize: 13.5, fontWeight: 600, color: "#111612", lineHeight: 1.3, marginBottom: 2, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                                                {name}
                                            </p>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
                                            {/* Qty */}
                                            <div style={{ display: "flex", alignItems: "center", gap: 0, background: "#F0F2EF", borderRadius: 12, overflow: "hidden" }}>
                                                <button
                                                    onClick={() => {
                                                        videoPreWarmer.triggerHaptic("light");
                                                        item.quantity > 1 ? updateQuantity(item.id, item.quantity - 1) : removeFromCart(item.id);
                                                    }}
                                                    className="ios-icon-tap active:scale-85 transition-transform duration-150"
                                                    style={{ width: 32, height: 32, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#5A625C" }}
                                                >
                                                    <Minus size={13} strokeWidth={2.5} />
                                                </button>
                                                <span style={{ fontSize: 13.5, fontWeight: 700, color: "#111612", minWidth: 22, textAlign: "center" }}>{item.quantity}</span>
                                                <button
                                                    onClick={() => {
                                                        videoPreWarmer.triggerHaptic("light");
                                                        updateQuantity(item.id, item.quantity + 1);
                                                    }}
                                                    className="ios-icon-tap active:scale-85 transition-transform duration-150"
                                                    style={{ width: 32, height: 32, border: "none", background: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: GREEN }}
                                                >
                                                    <Plus size={13} strokeWidth={2.5} />
                                                </button>
                                            </div>
                                            {/* Price */}
                                            {(() => {
                                                const ld = lineDiscount(item);
                                                const lineTotal = item.price * item.quantity;
                                                if (ld > 0) {
                                                    return (
                                                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.15 }}>
                                                            <span style={{ fontSize: 15, fontWeight: 700, color: "#4F46E5", letterSpacing: -0.2 }}>
                                                                {fmtPrice(lineTotal - ld)}
                                                            </span>
                                                            <span style={{ fontSize: 11, fontWeight: 500, color: "#737D75", textDecoration: "line-through" }}>
                                                                {fmtPrice(lineTotal)}
                                                            </span>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <span style={{ fontSize: 15, fontWeight: 700, color: "#111612", letterSpacing: -0.2 }}>
                                                        {fmtPrice(lineTotal)}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </div>

                                    {/* Delete */}
                                    <button
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("medium");
                                            removeFromCart(item.id);
                                        }}
                                        aria-label="O'chirish"
                                        className="ios-icon-tap active:scale-85 transition-transform duration-150"
                                        style={{ width: 32, height: 32, borderRadius: 10, background: "#FFF0EE", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-start" }}
                                    >
                                        <Trash2 size={14} color="#FF3B30" />
                                    </button>
                                </div>
                            );
                        })}

                        {/* ── Promokod ── */}
                        <div style={{ marginTop: 4 }}>
                            {cartPromo ? (
                                <div style={{ background: "#EAF3EC", border: "1.5px solid #2D6E3E", borderRadius: 20, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                                    <div style={{ width: 38, height: 38, borderRadius: 12, background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <Ticket size={18} color="#fff" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111612", margin: 0 }}>{cartPromo.code}</p>
                                        <p style={{ fontSize: 12, fontWeight: 600, color: "#2D6E3E", margin: "2px 0 0" }}>
                                            −{fmtPrice(cartPromo.discount)} {language === "uz" ? "chegirma" : "скидка"}
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("light");
                                            handleRemovePromo();
                                        }}
                                        aria-label="Promokodni o'chirish"
                                        className="ios-icon-tap active:scale-85 transition-transform duration-150"
                                        style={{ width: 32, height: 32, borderRadius: 10, background: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                                    >
                                        <X size={16} color="#FF3B30" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("light");
                                        setPromoOpen(true);
                                    }}
                                    className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150"
                                    style={{ width: "100%", background: "#fff", borderRadius: 20, padding: "14px 16px", boxShadow: "0 2px 8px rgba(15,20,16,0.04)", border: "1px dashed rgba(15,20,16,0.12)", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", textAlign: "left" }}
                                >
                                    <div style={{ width: 38, height: 38, borderRadius: 12, background: "#F5F5F0", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <Ticket size={18} color="#5A625C" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 600, color: "#111612", margin: 0 }}>{t.common.promoQuestion}</p>
                                        <p style={{ fontSize: 12, fontWeight: 500, color: "#737D75", margin: "2px 0 0" }}>
                                            {language === "uz" ? "Chegirma uchun kiriting" : "Введите для скидки"}
                                        </p>
                                    </div>
                                    <ChevronRight size={18} color="#9AA29C" style={{ flexShrink: 0 }} />
                                </button>
                            )}
                        </div>

                        {/* ── Buyurtma xulosasi ── */}
                        <div style={{ marginTop: 4, background: "#fff", borderRadius: 24, padding: "18px", boxShadow: "0 4px 16px rgba(15,20,16,0.04)", border: "1px solid rgba(15,20,16,0.06)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 500, color: "#737D75" }}>{t.common.products}</span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: "#111612" }}>{fmtPrice(subtotal)}</span>
                            </div>
                            {smartDiscount > 0 && (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 500, color: "#4F46E5", display: "flex", alignItems: "center", gap: 6 }}>
                                        ✦ {language === "uz" ? "Shaxsiy chegirma" : "Персональная скидка"}
                                    </span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: "#4F46E5" }}>−{fmtPrice(smartDiscount)}</span>
                                </div>
                            )}
                            {promoDiscount > 0 && (
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                                    <span style={{ fontSize: 13.5, fontWeight: 500, color: "#2D6E3E", display: "flex", alignItems: "center", gap: 6 }}>
                                        <Ticket size={14} /> {cartPromo?.code}
                                    </span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: "#2D6E3E" }}>−{fmtPrice(promoDiscount)}</span>
                                </div>
                            )}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                                <span style={{ fontSize: 13.5, fontWeight: 500, color: "#737D75" }}>{t.cart.delivery}</span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: deliveryFee > 0 ? "#111612" : "#2D6E3E" }}>
                                    {deliveryFee > 0 ? fmtPrice(deliveryFee) : t.cart.free}
                                </span>
                            </div>
                            <div style={{ borderTop: "1px solid rgba(15,20,16,0.06)", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontSize: 15, fontWeight: 600, color: "#111612" }}>{t.common.total}</span>
                                <span style={{ fontSize: 20, fontWeight: 700, color: "#111612", letterSpacing: -0.4 }}>{fmtPrice(total)}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Sticky bottom bar — Buyurtma berish */}
                {cart.length > 0 && (
                    <div style={{
                        position: "fixed",
                        bottom: "calc(60px + max(env(safe-area-inset-bottom, 8px), 8px))",
                        left: 0, right: 0,
                        background: "rgba(255,255,255,0.85)",
                        backdropFilter: "blur(20px) saturate(180%)",
                        WebkitBackdropFilter: "blur(20px) saturate(180%)",
                        borderTop: "0.5px solid rgba(15,20,16,0.08)",
                        padding: "12px 20px",
                        zIndex: 50,
                    }}>
                        <Link
                            href="/checkout"
                            onClick={() => videoPreWarmer.triggerHaptic("medium")}
                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                            style={{
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                width: "100%", height: 52,
                                background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff",
                                borderRadius: 26, fontWeight: 600, fontSize: 15,
                                textDecoration: "none", letterSpacing: -0.2,
                                boxShadow: "0 8px 24px rgba(45,110,62,0.28)",
                            }}
                        >
                            {t.common.checkout} · {fmtPrice(total)} <ArrowRight size={18} />
                        </Link>
                    </div>
                )}
            </div>

            {/* ── DESKTOP ── */}
            <div className="hidden md:block bg-transparent min-h-screen text-[#111612]">
                <div className="w-full px-10 pb-32 pt-8">
                    <div className="flex items-center justify-between mb-8 pt-0 w-full">
                        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
                            <h1 className="text-3xl font-bold tracking-tight text-[#111612]">
                                {t.cart.title}
                            </h1>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                            <Link
                                href="/orders"
                                onClick={() => videoPreWarmer.triggerHaptic("light")}
                                className="ios-tap-feedback active:scale-95 p-3 bg-white/80 backdrop-blur-md rounded-2xl text-gray-500 hover:text-black border border-black/5 transition-colors duration-150 flex items-center gap-2"
                            >
                                <Package size={18} strokeWidth={2.2} />
                                <span className="text-[12px] font-semibold">Buyurtmalar</span>
                            </Link>
                            <div className="p-3 rounded-2xl bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] text-white shadow-sm">
                                <ShoppingCart size={20} strokeWidth={2.2} />
                            </div>
                        </div>
                    </div>

                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 text-center glass-surface rounded-[32px] max-w-lg mx-auto">
                            <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-5 text-gray-400">
                                <ShoppingBag size={40} />
                            </div>
                            <p className="text-gray-500 font-semibold text-sm mb-6">{t.cart.empty}</p>
                            <Link
                                href="/"
                                onClick={() => videoPreWarmer.triggerHaptic("light")}
                                className="ios-tap-feedback active:scale-[0.98] px-8 py-3.5 rounded-full font-semibold text-[13.5px] transition-transform duration-150"
                                style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", boxShadow: "0 8px 20px rgba(45,110,62,0.28)" }}
                            >
                                {language === "uz" ? "Xaridni boshlash" : "Начать покупки"}
                            </Link>
                        </div>
                    ) : (
                        <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 items-start">
                            <div className="w-full lg:col-span-8 space-y-3">
                                {cart.map((item) => {
                                    const name = (language === "uz" ? item.name_uz : item.name_ru) || item.name;
                                    return (
                                        <div key={item.id} className="bg-white border border-gray-100 rounded-3xl p-4 w-full overflow-hidden shadow-sm">
                                            <div className="flex gap-3.5 w-full overflow-hidden">
                                                <div className="w-20 h-20 bg-gray-50 rounded-2xl overflow-hidden shrink-0 relative">
                                                    {(() => {
                                                        const u = getOptimizedImageUrl(item.image_metadata, item.image || item.imageUrl, 'xs');
                                                        return <Image src={u} alt={name} fill className="object-cover" sizes="80px" loader={hasVariants(item.image_metadata, u) ? makeVariantLoader(item.image_metadata) : undefined} />;
                                                    })()}
                                                </div>
                                                <div className="flex-1 min-w-0 overflow-hidden">
                                                    <h3 className="font-semibold text-sm text-[#111612] leading-tight mb-2 line-clamp-2">{name}</h3>
                                                    <button
                                                        onClick={() => {
                                                            videoPreWarmer.triggerHaptic("medium");
                                                            removeFromCart(item.id);
                                                        }}
                                                        className="ios-tap-feedback active:scale-90 inline-flex items-center gap-1.5 text-red-500 font-semibold text-xs hover:bg-red-50 px-2 py-1 rounded-lg transition-colors duration-150"
                                                    >
                                                        <Trash2 size={13} /> {language === "uz" ? "O'chirish" : "Удалить"}
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 w-full">
                                                <div className="flex items-center gap-3 bg-gray-50 border border-gray-100 px-3 py-1.5 rounded-xl">
                                                    <button
                                                        onClick={() => {
                                                            videoPreWarmer.triggerHaptic("light");
                                                            item.quantity > 1 ? updateQuantity(item.id, item.quantity - 1) : removeFromCart(item.id);
                                                        }}
                                                        className="ios-icon-tap active:scale-85 text-gray-500 hover:text-black transition-transform duration-150"
                                                    >
                                                        <Minus size={14} strokeWidth={2.5} />
                                                    </button>
                                                    <span className="text-sm font-bold w-4 text-center">{item.quantity}</span>
                                                    <button
                                                        onClick={() => {
                                                            videoPreWarmer.triggerHaptic("light");
                                                            updateQuantity(item.id, item.quantity + 1);
                                                        }}
                                                        className="ios-icon-tap active:scale-85 text-gray-500 hover:text-black transition-transform duration-150"
                                                    >
                                                        <Plus size={14} strokeWidth={2.5} />
                                                    </button>
                                                </div>
                                                {(() => {
                                                    const ld = lineDiscount(item);
                                                    const lineTotal = item.price * item.quantity;
                                                    if (ld > 0) {
                                                        return (
                                                            <div className="text-right leading-tight">
                                                                <p className="text-base font-bold" style={{ color: "#4F46E5" }}>{(lineTotal - ld).toLocaleString("uz-UZ")} so'm</p>
                                                                <p className="text-xs font-medium text-gray-400 line-through">{lineTotal.toLocaleString("uz-UZ")} so'm</p>
                                                            </div>
                                                        );
                                                    }
                                                    return <p className="text-base font-bold text-[#111612]">{lineTotal.toLocaleString("uz-UZ")} so'm</p>;
                                                })()}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="w-full lg:col-span-4 lg:sticky lg:top-32">
                                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm w-full overflow-hidden">
                                    <h2 className="text-lg font-bold tracking-tight text-[#111612] mb-5">Buyurtma xulosasi</h2>
                                    <div className="space-y-3 mb-6 pb-6 border-b border-gray-100">
                                        <div className="flex justify-between text-xs font-medium text-gray-500">
                                            <span>Mahsulotlar soni</span>
                                            <span className="text-black font-semibold">{cart.length} ta</span>
                                        </div>
                                        {smartDiscount > 0 && (
                                            <div className="flex justify-between text-xs font-semibold" style={{ color: "#4F46E5" }}>
                                                <span>{language === "uz" ? "Shaxsiy chegirma" : "Перс. скидка"}</span>
                                                <span>−{smartDiscount.toLocaleString("uz-UZ")} so'm</span>
                                            </div>
                                        )}
                                        {promoDiscount > 0 && (
                                            <div className="flex justify-between text-xs font-semibold text-emerald-600">
                                                <span>{cartPromo?.code}</span>
                                                <span>−{promoDiscount.toLocaleString("uz-UZ")} so'm</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between text-xs font-medium text-gray-500">
                                            <span>Yetkazib berish</span>
                                            <span className={deliveryFee > 0 ? "text-black font-semibold" : "text-emerald-600 font-semibold"}>
                                                {deliveryFee > 0 ? `${deliveryFee.toLocaleString("uz-UZ")} so'm` : "Bepul"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="mb-6 w-full">
                                        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1">{t.common.total}</p>
                                        <p className="text-2xl font-bold tracking-tight text-black break-words">{total.toLocaleString("uz-UZ")}<span className="text-base font-normal opacity-80"> so'm</span></p>
                                    </div>
                                    <Link
                                        href="/checkout"
                                        onClick={() => videoPreWarmer.triggerHaptic("medium")}
                                        className="ios-tap-feedback active:scale-[0.98] flex w-full py-4 rounded-2xl font-semibold text-sm transition-transform duration-150 justify-center items-center gap-2 will-change-transform"
                                        style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", boxShadow: "0 8px 20px rgba(45,110,62,0.28)" }}
                                    >
                                        <span>{t.common.checkout}</span>
                                        <ArrowRight size={18} strokeWidth={2.5} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Promokod bottom-sheet (iOS uslubida, pastdan tepaga) ── */}
            <Sheet open={promoOpen} onClose={() => setPromoOpen(false)}>
                <div style={{ padding: "8px 22px 28px", paddingBottom: "calc(28px + env(safe-area-inset-bottom))" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 18 }}>
                        <div style={{ width: 60, height: 60, borderRadius: 20, background: "#EAF3EC", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                            <Gift size={28} color={GREEN} strokeWidth={2.2} />
                        </div>
                        <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, color: "#0F1410", margin: "0 0 6px" }}>
                            {language === "uz" ? "Promokod" : "Промокод"}
                        </h2>
                        <p style={{ fontSize: 13, fontWeight: 500, color: "#9AA29C", margin: 0 }}>
                            {language === "uz" ? "Chegirmaga ega bo'lish uchun kodni kiriting" : "Введите код для получения скидки"}
                        </p>
                    </div>

                    <label style={{ fontSize: 11, fontWeight: 700, color: "#9AA29C", letterSpacing: 0.6, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                        {language === "uz" ? "Kodni kiriting" : "Введите код"}
                    </label>
                    <input
                        type="text"
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value.toUpperCase())}
                        placeholder={t.common.promoPlaceholder}
                        autoFocus
                        onKeyDown={e => { if (e.key === "Enter") handleApplyPromo(); }}
                        style={{ width: "100%", boxSizing: "border-box", background: "#F5F5F0", border: "1.5px solid transparent", borderRadius: 16, padding: "16px 18px", fontSize: 17, fontWeight: 800, color: "#0F1410", outline: "none", letterSpacing: 1.5, textAlign: "center" }}
                    />

                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("medium");
                            handleApplyPromo();
                        }}
                        disabled={isApplyingPromo || !promoCode.trim()}
                        className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150"
                        style={{ width: "100%", marginTop: 14, height: 54, background: GREEN, color: "#fff", border: "none", borderRadius: 18, fontSize: 16, fontWeight: 700, cursor: "pointer", opacity: (!promoCode.trim() || isApplyingPromo) ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 8px 24px rgba(45,110,62,0.28)" }}
                    >
                        {isApplyingPromo ? <Loader2 size={18} className="animate-spin" /> : (language === "uz" ? "Qo'llash" : "Применить")}
                    </button>

                    <p style={{ fontSize: 12, fontWeight: 500, color: "#9AA29C", textAlign: "center", margin: "16px 0 0" }}>
                        {language === "uz" ? "Promokod bitta mahsulotga qo'llanadi" : "Промокод применяется к одному товару"}
                    </p>
                </div>
            </Sheet>

        </div>
    );
}
