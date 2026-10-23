"use client";

import { Loader2 } from "lucide-react";
import { ProductCard } from "../home/ProductCard";

import { Product, CartItem, Language } from "@/types";
import { TranslationType } from "@/lib/translations";

interface RelatedProductsProps {
    relatedProducts: Product[];
    boughtTogether: Product[];
    popularProducts: Product[];
    language: Language;
    cart: CartItem[];
    wishlist: Product[];
    addToCart: (p: Product) => void;
    toggleWishlist: (p: Product) => void;
    updateQuantity: (id: string, q: number) => void;
    removeFromCart: (id: string) => void;
    popularLoading: boolean;
    t: TranslationType;
}

export const RelatedProducts = ({
    relatedProducts, boughtTogether, popularProducts, language, cart, wishlist, addToCart, toggleWishlist, updateQuantity, removeFromCart, popularLoading, t
}: RelatedProductsProps) => {

    const renderGrid = (products: Product[]) => (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 md:gap-x-6 gap-y-6 md:gap-y-10 px-4 max-w-[1600px] mx-auto">
            {products.map(p => (
                <ProductCard 
                    key={p.id}
                    item={p}
                    language={language}
                    t={t}
                    cart={cart}
                    wishlist={wishlist}
                    toggleWishlist={toggleWishlist}
                    addToCart={addToCart}
                    updateQuantity={updateQuantity}
                    removeFromCart={removeFromCart}
                />
            ))}
        </div>
    );

    return (
        <div className="mt-8 space-y-16" style={{ background: "#FAFAF6" }}>
            {relatedProducts.length > 0 && (
                <section className="animate-in fade-in duration-700">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", marginBottom: 14 }}>
                        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4, color: "#0F1410", margin: 0 }}>{t.product.mayLike}</h2>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#2D6E3E", background: "#EAF3EC", borderRadius: 8, padding: "3px 8px", textTransform: "uppercase", letterSpacing: 0.3 }}>AI</span>
                    </div>
                    {renderGrid(relatedProducts)}
                </section>
            )}

            {boughtTogether.length > 0 && (
                <section className="animate-in fade-in slide-in-from-bottom-10 duration-1000">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", marginBottom: 14 }}>
                        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4, color: "#0F1410", margin: 0 }}>{t.product.boughtTogether}</h2>
                        <span style={{ fontSize: 10, fontWeight: 700, color: "#5A625C", background: "#F0F0EC", borderRadius: 8, padding: "3px 8px", textTransform: "uppercase" }}>Combo</span>
                    </div>
                    <div className="flex overflow-x-auto no-scrollbar gap-x-2 pb-8 px-4">
                        {boughtTogether.map(p => (
                            <div key={p.id} className="flex-shrink-0 w-[180px]">
                                <ProductCard 
                                    item={p}
                                    language={language}
                                    t={t}
                                    cart={cart}
                                    wishlist={wishlist}
                                    toggleWishlist={toggleWishlist}
                                    addToCart={addToCart}
                                    updateQuantity={updateQuantity}
                                    removeFromCart={removeFromCart}
                                />
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {popularProducts.length > 0 && (
                <section className="animate-in fade-in duration-1000">
                    <div style={{ padding: "0 20px", marginBottom: 14 }}>
                        <h2 style={{ fontSize: 19, fontWeight: 800, letterSpacing: -0.4, color: "#0F1410", margin: 0 }}>{t.product.popular}</h2>
                    </div>
                    {renderGrid(popularProducts)}
                    {popularLoading && <div className="flex justify-center py-10"><Loader2 className="animate-spin" size={28} color="#2D6E3E" /></div>}
                </section>
            )}
        </div>
    );
};
