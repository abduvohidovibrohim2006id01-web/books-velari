"use client";

import { ProductCard } from "@/components/home/ProductCard";
import { useStore } from "@/store/store";
import { translations } from "@/lib/translations";
import { Product, Language } from "@/types";
import { Sparkles } from "lucide-react";

interface LinkedProductsProps {
    products: Product[];
    lang: Language;
}

export default function LinkedProducts({ products, lang }: LinkedProductsProps) {
    const { 
        cart, 
        wishlist, 
        toggleWishlist, 
        addToCart, 
        updateQuantity, 
        removeFromCart 
    } = useStore();
    
    const t = translations[lang];

    if (products.length === 0) return null;

    return (
        <div className="max-w-6xl mx-auto px-6 md:px-0 mt-32">
            <div className="flex items-center gap-3.5 mb-8">
                <div className="w-10 h-10 bg-emerald-50 border border-emerald-500/10 rounded-2xl flex items-center justify-center text-[#2D6E3E]">
                    <Sparkles size={20} />
                </div>
                <h3 className="text-xl md:text-2xl font-bold tracking-tight text-[#111612]">
                    {t.blog.relatedProducts}
                </h3>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {products.map((product) => (
                    <ProductCard 
                        key={product.id} 
                        item={product} 
                        language={lang}
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
        </div>
    );
}
