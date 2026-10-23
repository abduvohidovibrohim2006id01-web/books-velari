"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Search, Home, ShoppingBag, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-product";
import { mapProduct } from "@/lib/mappers";
import { useStore } from "@/store/store";
import { translations } from "@/lib/translations";
import { ProductCard } from "@/components/home/ProductCard";
import type { Product } from "@/types";

interface BrandedEmptyStateProps {
    title?: string;
    description?: string;
    type?: '404' | 'not-found' | 'error';
    showPopular?: boolean;
}

export default function BrandedEmptyState({ 
    title, 
    description, 
    type = 'not-found',
    showPopular = true
}: BrandedEmptyStateProps) {
    const { 
        language, cart, wishlist, toggleWishlist, addToCart, 
        updateQuantity, removeFromCart, user 
    } = useStore();
    const t = translations[language];

    const [popularProducts, setPopularProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(showPopular);

    useEffect(() => {
        const fetchAllData = async () => {
            if (!showPopular) return;
            setLoading(true);

            // Fetch popular products as baseline
            const { data: popData } = await supabase
                .from("products")
                .select(PUBLIC_PRODUCT_COLUMNS)
                .eq("is_deleted", false)
                .gt("stock", 0)
                .order("sales", { ascending: false, nullsFirst: false })
                .limit(18);
            
            let finalProducts = popData ? popData.map(mapProduct) : [];

            // AI Recommendations if user logged in
            if (user?.phone && user.phone !== 'ADMIN' && finalProducts.length > 0) {
                try {
                    const { data: interests } = await supabase
                        .from("user_interests")
                        .select("*")
                        .eq("id", user.phone)
                        .single();
                    
                    if (interests) {
                        const slimProducts = finalProducts.map((p: any) => ({
                            id: p.id, name: p.name, category: p.category,
                            price: p.price, oldPrice: p.oldPrice,
                            rating: p.rating, sales: p.sales, tag: p.tag, brand: p.brand,
                        }));
                        const response = await fetch("/api/ai/recommendations", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                action: "get_recommendations",
                                userInterests: interests,
                                allProducts: slimProducts,
                                userPhone: user.phone
                            })
                        });
                        
                        if (response.ok) {
                            const { recommendations: recIds } = await response.json();
                            if (recIds && recIds.length > 0) {
                                // Prioritize recs but keep some popular as well
                                const recs = finalProducts.filter(p => recIds.includes(p.id));
                                const others = finalProducts.filter(p => !recIds.includes(p.id));
                                finalProducts = [...recs, ...others].slice(0, 12);
                            }
                        }
                    }
                } catch (e) { console.error("AI Recs failed", e); }
            } else {
                finalProducts = finalProducts.slice(0, 12);
            }

            setPopularProducts(finalProducts);
            setLoading(false);
        };
        fetchAllData();
    }, [showPopular, user?.phone]);

    const displayTitle = title || (type === '404' ? (language === 'uz' ? "Sahifa topilmadi" : "Страница не найдена") : (language === 'uz' ? "Mahsulot topilmadi" : "Товар не найден"));
    const displayDesc = description || (language === 'uz' 
        ? "Kechirasiz, siz qidirayotgan ma'lumot tizimda mavjud emas yoki o'chirilgan bo'lishi mumkin." 
        : "К сожалению, запрашиваемая вами информация не существует в системе или могла быть удалена.");

    return (
        <div className="min-h-screen bg-[#FAFAF6]">
            {/* Hero Section */}
            <div className="pt-28 pb-16 px-6 text-center max-w-4xl mx-auto">
                <div className="relative mb-8 inline-block">
                    <div className="text-[100px] md:text-[160px] font-bold tracking-tight leading-none text-black/5 select-none animate-in fade-in zoom-in duration-700">
                        {type === '404' ? '404' : 'OOP!'}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-20 h-20 md:w-28 md:h-28 rounded-3xl flex items-center justify-center shadow-2xl rotate-6 animate-bounce duration-[2500ms]" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}>
                            <Search size={36} className="text-white -rotate-6" strokeWidth={2.5} />
                        </div>
                    </div>
                </div>

                <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-4 text-[#111612]">
                    {displayTitle}
                </h1>
                <p className="text-sm md:text-base text-[#737D75] font-medium max-w-xl mx-auto mb-10 leading-relaxed">
                    {displayDesc}
                </p>

                <div className="flex flex-col sm:flex-row gap-3.5 justify-center items-center">
                    <Link href="/" className="ios-tap-feedback active:scale-[0.98] transition-transform px-8 py-3.5 velari-green-btn rounded-2xl font-semibold text-sm shadow-md shadow-[#2D6E3E]/20 flex items-center gap-2.5 text-white">
                        <Home size={17} /> {language === 'uz' ? "Bosh sahifa" : "Главная"}
                    </Link>
                    <Link href="/catalog" className="ios-tap-feedback active:scale-[0.98] transition-transform px-8 py-3.5 bg-white/90 backdrop-blur-md text-[#111612] border border-[rgba(15,20,16,0.08)] rounded-2xl font-semibold text-sm hover:bg-white shadow-xs flex items-center gap-2.5">
                        <ShoppingBag size={17} /> {language === 'uz' ? "Katalog" : "Каталог"}
                    </Link>
                </div>
            </div>

            {/* Popular Products Section */}
            {showPopular && (
                <div className="max-w-[1600px] mx-auto px-6 md:px-10 pb-32">
                    <div className="flex items-center justify-between mb-8">
                        <div className="space-y-1">
                            <p className="text-xs font-semibold text-[#737D75] uppercase tracking-wider">Velari Trend</p>
                            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-[#111612]">
                                {language === 'uz' ? "Ommabop mahsulotlar" : "Популярные товары"}
                            </h2>
                        </div>
                        <Link href="/catalog" className="text-xs font-semibold text-[#2D6E3E] hover:underline">
                            {language === 'uz' ? "Barchasi" : "Все"}
                        </Link>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Loader2 className="animate-spin text-black mb-4" size={40} />
                            <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t.common.loading}</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 md:gap-8">
                            {popularProducts.map((item, index) => (
                                <div key={item.id} className="animate-in fade-in slide-in-from-bottom-10" style={{ animationDelay: `${index * 50}ms` }}>
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
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Footer Brand Label */}
            <div className="border-t border-gray-50 py-10 text-center">
                <p className="text-[8px] font-black text-gray-300 uppercase tracking-[0.5em] select-none">
                    Velari Market • Premium Electronics Experience
                </p>
            </div>
        </div>
    );
}
