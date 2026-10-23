"use client";

import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/store/store";
import { translations } from "@/lib/translations";
import { ProductGrid } from "@/components/home/ProductGrid";
import { ChevronLeft, Store as StoreIcon } from "lucide-react";
import type { Product } from "@/types";

const GREEN = "#2D6E3E";

interface Props {
    warehouse: { id: string; name: string; logo: string | null; address: string | null };
    products: Product[];
    language: "uz" | "ru";
}

export default function StoreClient({ warehouse, products, language }: Props) {
    const router = useRouter();
    const { cart, wishlist, user, addToCart, updateQuantity, removeFromCart, toggleWishlist } = useStore(
        useShallow((s) => ({
            cart: s.cart,
            wishlist: s.wishlist,
            user: s.user,
            addToCart: s.addToCart,
            updateQuantity: s.updateQuantity,
            removeFromCart: s.removeFromCart,
            toggleWishlist: s.toggleWishlist,
        }))
    );
    const t = translations[language];

    return (
        <div className="min-h-screen bg-[#FAFAF6]">
            <div className="max-w-[1600px] mx-auto px-4 md:px-10 pt-6 md:pt-28 pb-24">
                {/* Orqaga */}
                <button
                    onClick={() => router.back()}
                    className="inline-flex items-center gap-1.5 text-[rgba(15,20,16,0.62)] font-semibold text-xs mb-6 hover:text-[#111612] active:scale-95 transition-transform duration-150 will-change-transform"
                >
                    <ChevronLeft size={16} /> {language === "uz" ? "Orqaga" : "Назад"}
                </button>

                {/* Do'kon sarlavhasi */}
                <div className="flex items-center gap-5 p-6 md:p-8 rounded-[28px] mb-8 bg-white/90 backdrop-blur-xl border border-[rgba(15,20,16,0.06)] shadow-xs">
                    <div className="shrink-0 w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden flex items-center justify-center bg-white border border-[rgba(15,20,16,0.08)] shadow-xs">
                        {warehouse.logo ? (
                            <img src={warehouse.logo} alt={warehouse.name} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-[#2D6E3E] flex items-center justify-center text-white">
                                <StoreIcon size={28} />
                            </div>
                        )}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 text-[11px] font-semibold tracking-wide mb-1 border border-emerald-500/15">
                            <StoreIcon size={12} className="text-[#2D6E3E]" />
                            <span>{language === "uz" ? "Do'kon" : "Магазин"}</span>
                        </div>
                        <h1 className="text-xl md:text-2xl font-bold text-[#111612] tracking-tight truncate">
                            {warehouse.name}
                        </h1>
                        {warehouse.address && (
                            <p className="text-xs md:text-sm text-[rgba(15,20,16,0.62)] font-normal mt-1 truncate">
                                {warehouse.address}
                            </p>
                        )}
                        <p className="text-[11px] text-[rgba(15,20,16,0.5)] font-semibold mt-1.5 uppercase tracking-wider">
                            {products.length} {language === "uz" ? "ta mahsulot" : "товаров"}
                        </p>
                    </div>
                </div>

                {/* Mahsulotlar */}
                <ProductGrid
                    products={products}
                    loading={false}
                    language={language}
                    t={t}
                    cart={cart}
                    wishlist={wishlist}
                    user={user}
                    toggleWishlist={toggleWishlist}
                    addToCart={addToCart}
                    updateQuantity={updateQuantity}
                    removeFromCart={removeFromCart}
                />
            </div>
        </div>
    );
}
