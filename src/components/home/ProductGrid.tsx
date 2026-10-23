"use client";

import { useMemo } from "react";
import { ProductSkeleton } from "./ProductSkeleton";
import { ProductCard } from "./ProductCard";
import { BentoVideoCard } from "./BentoVideoCard";
import { WatchedProduct } from "./WatchedProduct";
import { Product, User, CartItem } from "@/types";
import { TranslationKeys } from "@/lib/translations";

interface ProductGridProps {
    products: Product[];
    loading: boolean;
    language: "uz" | "ru";
    t: TranslationKeys;
    cart: CartItem[];
    wishlist: Product[];
    user: User | null;
    toggleWishlist: (product: Product) => void;
    addToCart: (product: Product) => void;
    updateQuantity: (id: string, qty: number) => void;
    removeFromCart: (id: string) => void;
    reasonMap?: Record<string, { uz: string; ru: string }>;
    showReasons?: boolean;
}

export const ProductGrid = ({
    products, loading, language, t, cart, wishlist, user, toggleWishlist, addToCart, updateQuantity, removeFromCart,
    reasonMap, showReasons
}: ProductGridProps) => {
    if (loading) {
        return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 md:gap-x-6 gap-y-6 md:gap-y-10">
                {[...Array(12)].map((_, i) => (
                    <ProductSkeleton key={i} />
                ))}
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="py-16 text-center text-[#737D75] font-medium glass-surface rounded-[28px] text-sm border border-black/5">
                {t.common.noProducts}
            </div>
        );
    }

    // Har 6-8 ta tovardan keyin 1 ta video tovar bo'lsa, uni Bento Card qilib chiqaramiz
    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2.5 md:gap-x-6 gap-y-5 md:gap-y-10 items-start">
            {products.map((item, index) => {
                const hasVideo = !!(item.videoUrl || (item as any).video_url);
                // Har 7-element va video mavjud bo'lsa -> Bento Video Card
                const isBentoIndex = hasVideo && (index % 7 === 3);

                if (isBentoIndex) {
                    return (
                        <WatchedProduct key={`bento-${item.id}`} product={item} userPhone={user?.phone}>
                            <BentoVideoCard
                                item={item}
                                language={language}
                                t={t}
                                cart={cart}
                                wishlist={wishlist}
                                toggleWishlist={toggleWishlist}
                                addToCart={addToCart}
                            />
                        </WatchedProduct>
                    );
                }

                return (
                    <WatchedProduct key={item.id} product={item} userPhone={user?.phone}>
                        <ProductCard 
                            item={item}
                            language={language}
                            t={t}
                            cart={cart}
                            wishlist={wishlist}
                            toggleWishlist={toggleWishlist}
                            addToCart={addToCart}
                            updateQuantity={updateQuantity}
                            removeFromCart={removeFromCart}
                            priority={index < 4}
                            reason={showReasons ? reasonMap?.[item.id]?.[language] : undefined}
                        />
                    </WatchedProduct>
                );
            })}
        </div>
    );
};
