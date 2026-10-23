"use client";

import { useState } from "react";
import Link from "next/link";
import { getProductSlug } from "@/lib/slugify";
import { getOptimizedImageUrl } from "@/lib/imageVariants";
import { Star, Check, Truck, Clock, RefreshCw, FileText, MessageCircle } from "lucide-react";
import { ProductDirectChatSheet } from "./ProductDirectChatSheet";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

const GREEN = "#2D6E3E";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

interface ProductInfoProps {
    product: any;
    language: "uz" | "ru";
    t: any;
    groupProducts: any[];
    totalStock: number;
    getDeliveryDateText: () => string;
    onDescriptionOpen: () => void;
    personalOffer?: { percent: number; reason_uz?: string; reason_ru?: string; expires_at?: string | null } | null;
}

export const ProductInfo = ({
    product, language, t, groupProducts, totalStock, getDeliveryDateText, onDescriptionOpen, personalOffer
}: ProductInfoProps) => {
    const [isChatOpen, setIsChatOpen] = useState(false);
    const name = (language === "uz" ? product.name_uz : product.name_ru) || product.name;
    const fmtPrice = (n: number) => n.toLocaleString("ru-RU") + (language === "ru" ? " сум" : " so'm");
    // Shaxsiy smart-chegirma (desktop bilan bir xil ko'rinish): yakuniy narx + chizilgan asl narx
    const hasPersonal = !!personalOffer && personalOffer.percent > 0;
    const personalPrice = hasPersonal ? Math.round(product.price * (1 - personalOffer!.percent / 100)) : product.price;

    return (
        <div style={{ padding: "20px 20px 120px", background: "#FAFAF6", position: "relative", zIndex: 20 }}>

            {/* Original badge */}
            {product.isOriginal && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#EAF3EC", borderRadius: 10, padding: "6px 12px", marginBottom: 12 }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", background: GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Check size={9} color="#fff" strokeWidth={4} />
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, color: GREEN, letterSpacing: 0.4, textTransform: "uppercase" }}>
                        {language === "uz" ? "Original sifat" : "Оригинальное качество"}
                    </span>
                </div>
            )}

            {/* Name */}
            <h1 style={{ fontSize: 21, fontWeight: 600, letterSpacing: -0.3, color: "var(--velari-ink)", lineHeight: 1.3, margin: "0 0 8px" }}>
                {name}
            </h1>

            {/* Rating */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 2 }}>
                    {[...Array(5)].map((_, i) => (
                        <Star key={i} size={13} fill={(product.rating || 0) > i ? "#F6B100" : "none"} color={(product.rating || 0) > i ? "#F6B100" : "#D0D5CF"} />
                    ))}
                </div>
                <span style={{ fontSize: 13, fontWeight: 500, color: "var(--velari-muted)" }}>
                    {(product.reviewCount || 0) > 0
                        ? `${(product.rating || 0).toFixed(1)} (${product.reviewCount} ${language === "uz" ? "sharh" : "отзыв"})`
                        : (language === "uz" ? "Yangi kitob" : "Новая книга")}
                </span>
            </div>

            {/* Price card -> Free status */}
            <div className="glass-card" style={{ padding: "16px 18px", marginBottom: 14 }}>
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: "#16A34A" }}>
                    {language === "uz" ? "Bepul" : "Бесплатно"}
                </span>
            </div>

            {/* Variants / Group */}
            {groupProducts.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "var(--velari-muted)", letterSpacing: 0.2, textTransform: "uppercase", marginBottom: 8 }}>
                        {language === "uz" ? "Rang" : "Цвет"}: <span style={{ color: "var(--velari-ink)", fontWeight: 600 }}>{product.colorName || "—"}</span>
                    </p>
                    <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4, WebkitOverflowScrolling: "touch" }} className="no-scrollbar overscroll-x-contain touch-pan-x">
                        {groupProducts.map(v => (
                            <Link replace key={v.id} href={`/${language}/products/${getProductSlug(v, language)}`}
                                onClick={() => videoPreWarmer.triggerHaptic("light")}
                                className="ios-tap-feedback active:scale-95 transition-transform duration-150 ease-out will-change-transform"
                                style={{ flexShrink: 0, width: 56, height: 72, borderRadius: 16, overflow: "hidden", backgroundColor: "#F3F4F6", border: v.id === product.id ? `2.5px solid ${GREEN}` : "2px solid rgba(15,20,16,0.08)", textDecoration: "none", display: "block", transform: v.id === product.id ? "scale(1.06)" : undefined, boxShadow: v.id === product.id ? "0 4px 12px rgba(45,110,62,0.18)" : "none" }}
                            >
                                <img 
                                    src={getOptimizedImageUrl(v.image_metadata, v.image, 'xs')} 
                                    width={56}
                                    height={72}
                                    loading="eager"
                                    decoding="async"
                                    style={{ width: "100%", height: "100%", objectFit: "cover" }} 
                                    alt={v.colorName || (language === "uz" ? "Variant" : "Вариант")} 
                                />
                            </Link>
                        ))}
                    </div>
                </div>
            )}



            {/* Book Reading & Format - iOS Grouped Section */}
            <div className="ios-grouped-section" style={{ marginBottom: 16 }}>
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: "#EAF3EC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <FileText size={19} color={GREEN} strokeWidth={2} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--velari-muted)", marginBottom: 1 }}>
                            {language === "uz" ? "Format va kirish" : "Формат и доступ"}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--velari-ink)" }}>PDF / EPUB</span>
                            <span style={{ fontSize: 11, fontWeight: 600, color: GREEN }}>· {language === "uz" ? "To'liq matn" : "Полный текст"}</span>
                        </div>
                    </div>
                </div>

                <div className="ios-divider" />

                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: "rgba(17,22,18,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <Check size={18} color={GREEN} strokeWidth={2.4} />
                    </div>
                    <div>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "var(--velari-muted)", marginBottom: 1 }}>
                            {language === "uz" ? "Mutolaa turi" : "Тип чтения"}
                        </p>
                        <span style={{ fontSize: 14, fontWeight: 600, color: "var(--velari-ink)" }}>
                            {language === "uz" ? "Onlayn mutolaa (Tezkor va ochiq)" : "Онлайн чтение"}
                        </span>
                    </div>
                </div>
            </div>

            {/* Description button */}
            <button
                onClick={() => {
                    videoPreWarmer.triggerHaptic("light");
                    onDescriptionOpen();
                }}
                className="glass-tinted-button w-full"
                style={{ width: "100%", height: 50, borderRadius: 16 }}
            >
                <FileText size={17} color={GREEN} strokeWidth={2} />
                <span>{language === "uz" ? "To'liq tavsifni ko'rish" : "Полное описание"}</span>
            </button>

            {/* Instagram Direct style "Sotuvchiga savol berish" button */}
            <button
                type="button"
                onClick={() => {
                    videoPreWarmer.triggerHaptic("light");
                    setIsChatOpen(true);
                }}
                className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 ease-out will-change-transform"
                style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "14px",
                    background: "#fff",
                    border: "1.5px solid rgba(99, 53, 237, 0.2)",
                    borderRadius: 18,
                    fontSize: 13,
                    fontWeight: 800,
                    color: "#6335ED",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(99, 53, 237, 0.06)",
                    marginTop: 10,
                    textTransform: "uppercase",
                    letterSpacing: 0.2,
                    WebkitTapHighlightColor: "transparent"
                }}
            >
                <MessageCircle size={17} color="#6335ED" strokeWidth={2.4} />
                <span>{language === "uz" ? "Sotuvchidan so'rash (Direct)" : "Спросить у продавца (Direct)"}</span>
            </button>

            {/* Direct Chat Sheet */}
            {isChatOpen && (
                <ProductDirectChatSheet
                    product={product}
                    onClose={() => setIsChatOpen(false)}
                    language={language}
                    t={t}
                />
            )}
        </div>
    );
};
