"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-product";
import { mapProduct } from "@/lib/mappers";
import { getProductSlug } from "@/lib/slugify";
import { Product } from "@/types";
import { useStore } from "@/store/store";
import { applyGlobalPromo } from "@/lib/promo-utils";

const STORAGE_KEY = "velari_recently_viewed";
const MAX_ITEMS = 10;

export function trackProductView(productId: string) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const ids: string[] = raw ? JSON.parse(raw) : [];
        const filtered = ids.filter(id => id !== productId);
        filtered.unshift(productId);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
    } catch {
        // localStorage unavailable
    }
}

export function getRecentlyViewedIds(): string[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

const GREEN = "#2D6E3E";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

interface RecentlyViewedProps {
    language: "uz" | "ru";
    currentProductId?: string;
}

export default function RecentlyViewed({ language, currentProductId }: RecentlyViewedProps) {
    const [products, setProducts] = useState<Product[]>([]);
    const globalPromo = useStore(s => s.globalPromo);
    const personalOffers = useStore(s => s.personalOffers);

    useEffect(() => {
        const ids = getRecentlyViewedIds().filter(id => id !== currentProductId);
        if (ids.length === 0) return;

        supabase
            .from("products")
            .select(PUBLIC_PRODUCT_COLUMNS)
            .in("id", ids.slice(0, 8))
            .eq("is_deleted", false)
            .then(({ data }) => {
                if (!data) return;
                // Preserve localStorage order
                const mapped = ids
                    .map(id => data.find(d => d.id === id))
                    .filter(Boolean)
                    .map(mapProduct);
                setProducts(mapped);
            });
    }, [currentProductId]);

    if (products.length === 0) return null;

    const fmtPrice = (n: number) =>
        n.toLocaleString("ru-RU") + (language === "ru" ? " сум" : " so'm");


    return (
        <div className="md:hidden mt-8 mb-2">
            {/* Header */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 20px 12px" }}>
                <h2 style={{ fontSize: 19, fontWeight: 700, letterSpacing: -0.4, color: "#0F1410", margin: 0 }}>
                    {language === "uz" ? "Yaqinda ko'rdingiz" : "Недавно смотрели"}
                </h2>
            </div>

            {/* Horizontal scroll */}
            <div
                style={{ display: "flex", gap: 10, overflowX: "auto", padding: "0 20px 4px", scrollbarWidth: "none" }}
                className="no-scrollbar"
            >
                {products.map((product, idx) => {
                    const name = (language === "uz" ? product.name_uz : product.name_ru) || product.name;
                    const mainImg = product.images?.[0] || product.image || "/placeholder.png";
                    const slug = getProductSlug(product, language);

                    return (
                        <Link
                            key={product.id}
                            href={`/${language}/products/${slug}`}
                            style={{
                                flexShrink: 0,
                                width: 130,
                                background: "#fff",
                                borderRadius: 18,
                                overflow: "hidden",
                                textDecoration: "none",
                                boxShadow: "0 2px 8px rgba(15,20,16,0.05)",
                                animation: `velari-cart-in ${260 + idx * 40}ms ${EASE} both`,
                                display: "flex",
                                flexDirection: "column",
                            }}
                        >
                            <div style={{ position: "relative", aspectRatio: "3/4", background: "#F5F5F0" }}>
                                <Image
                                    src={product.image_metadata?.[mainImg]?.lowResUrl || mainImg}
                                    alt={name}
                                    fill
                                    sizes="130px"
                                    style={{ objectFit: "cover" }}
                                    placeholder={product.image_metadata?.[mainImg]?.blurDataURL ? "blur" : "empty"}
                                    blurDataURL={product.image_metadata?.[mainImg]?.blurDataURL}
                                />
                            </div>
                            <div style={{ padding: "8px 10px 10px" }}>
                                <div style={{
                                    fontSize: 12,
                                    fontWeight: 600,
                                    color: "#0F1410",
                                    letterSpacing: -0.1,
                                    lineHeight: 1.3,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: "vertical" as const,
                                    overflow: "hidden",
                                    marginBottom: 4,
                                }}>
                                    {name}
                                </div>
                                {(() => {
                                    // Smart chegirma (globalPromo) va shaxsiy chegirma (personalOffers) ni qo'llamiz
                                    const promoProduct = applyGlobalPromo(product, globalPromo);
                                    const personalPct = personalOffers[product.id] || 0;
                                    const hasPersonal = personalPct > 0;
                                    const displayPrice = hasPersonal
                                        ? Math.round(promoProduct.price * (1 - personalPct / 100))
                                        : promoProduct.price;
                                    const struckPrice = hasPersonal
                                        ? (promoProduct.oldPrice && promoProduct.oldPrice > promoProduct.price ? promoProduct.oldPrice : promoProduct.price)
                                        : (promoProduct.oldPrice && promoProduct.oldPrice > promoProduct.price ? promoProduct.oldPrice : null);
                                    const hasDiscount = displayPrice < product.price || !!struckPrice;
                                    return (
                                        <>
                                            <div style={{ display: "flex", alignItems: "baseline", gap: 4, flexWrap: "wrap" }}>
                                                <span style={{
                                                    fontSize: 13,
                                                    fontWeight: 700,
                                                    color: (hasPersonal || (promoProduct.price < product.price)) ? "#4F46E5" : "#0F1410",
                                                    letterSpacing: -0.2
                                                }}>
                                                    {fmtPrice(displayPrice)}
                                                </span>
                                                {struckPrice && (
                                                    <span style={{ fontSize: 10, color: "#9AA29C", textDecoration: "line-through" }}>
                                                        {fmtPrice(struckPrice)}
                                                    </span>
                                                )}
                                            </div>
                                            {hasPersonal && (
                                                <div style={{ fontSize: 9, fontWeight: 800, color: "#4F46E5", letterSpacing: 0.2, textTransform: "uppercase", marginTop: 1 }}>
                                                    {language === "uz" ? `Siz uchun −${personalPct}%` : `Для вас −${personalPct}%`}
                                                </div>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
