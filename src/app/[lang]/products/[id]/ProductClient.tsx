"use client";

import { useStore } from "@/store/store";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { mapProduct, mapComment } from "@/lib/mappers";
import { translations } from "@/lib/translations";
import { Loader2, Plus, Minus, ShoppingBag, Heart, Star, Check, Truck, Clock, ShieldCheck, RefreshCw, Store as StoreIcon, ChevronRight, ChevronLeft, X, BookOpen } from "lucide-react";
import Link from "next/link";
import { getDeliveryDateText } from "@/lib/date-utils";
import Image from "next/image";
import { getProductIdFromSlug, getProductSlug } from "@/lib/slugify";
import { useTelemetry } from "@/hooks/useTelemetry";
import { makeVariantLoader, hasVariants, getOptimizedImageUrl, getOptimizedSrcSet, getMetaForUrl } from "@/lib/imageVariants";
import { ymViewProduct } from "@/lib/metrika";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

// Components
import { ProductMedia } from "@/components/product/ProductMedia";
import { ProductInfo } from "@/components/product/ProductInfo";
import { ProductCard } from "@/components/home/ProductCard";
import dynamic from "next/dynamic";
import { applyGlobalPromo } from "@/lib/promo-utils";
import { getProductRealStock } from "@/lib/stock";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-product";
const ReviewsSection = dynamic(() => import("@/components/product/ReviewsSection").then(mod => ({ default: mod.ReviewsSection })), {
    loading: () => <div className="h-40 animate-pulse bg-gray-50 rounded-3xl mx-4 my-8" />,
    ssr: false,
});
const ProductDescriptionModal = dynamic(() => import("@/components/product/ProductDescriptionModal").then(m => ({ default: m.ProductDescriptionModal })), { ssr: false });
import { ProductSpecifications } from "@/components/product/ProductSpecifications";
const RelatedProducts = dynamic(() => import("@/components/product/RelatedProducts").then(mod => ({ default: mod.RelatedProducts })), {
    loading: () => <div className="h-80 animate-pulse bg-gray-50 rounded-[50px] mx-10 my-20" />,
    ssr: false,
});
const BookCanvasReader = dynamic(
    () => import("@/components/reader/BookCanvasReader").then((mod) => mod.BookCanvasReader),
    { ssr: false }
);

import type { Product } from "@/types";
import { trackProductView } from "@/components/velari/RecentlyViewed";

// Mahsulot sahifasidagi "do'kon" kartasi (ombor do'kon sifatida) — logo, nom, do'konga o'tish
function StoreCard({ store, language }: { store: { id: string; name: string; logo: string | null }; language: "uz" | "ru" }) {
    return (
        <Link
            href={`/${language}/store/${store.id}`}
            className="flex items-center gap-4 p-5 rounded-[28px] no-underline"
            style={{ background: "linear-gradient(135deg,#FFFFFF 0%,#F2F8F3 100%)", border: "1px solid #E6EFE8" }}
        >
            <div
                className="shrink-0 overflow-hidden flex items-center justify-center"
                style={{ width: 56, height: 56, borderRadius: 18, background: store.logo ? "#fff" : "#2D6E3E", boxShadow: "0 4px 12px rgba(15,20,16,0.08)" }}
            >
                {store.logo ? (
                    <img src={store.logo} alt={store.name} className="w-full h-full object-cover" />
                ) : (
                    <StoreIcon size={26} color="#fff" />
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div style={{ fontSize: 10, fontWeight: 800, color: "#2D6E3E", letterSpacing: 0.5, textTransform: "uppercase" }}>
                    {language === "uz" ? "Do'kon" : "Магазин"}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#0F1410", letterSpacing: -0.3, lineHeight: 1.2 }} className="truncate">
                    {store.name}
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#2D6E3E", marginTop: 2, display: "flex", alignItems: "center", gap: 2 }}>
                    {language === "uz" ? "Do'konga o'tish" : "Перейти в магазин"} <ChevronRight size={13} />
                </div>
            </div>
        </Link>
    );
}

export default function ProductClient({ 
    params, 
    initialProduct,
    initialGroupProducts = [],
    initialWarehouses = []
}: { 
    params: { id: string; lang?: string }, 
    initialProduct?: Product | null,
    initialGroupProducts?: Product[],
    initialWarehouses?: any[]
}) {
    // Serverdan kelgan omborlarni store'ga darhol o'rnatish (0ms)
    if (typeof window !== "undefined" && initialWarehouses && initialWarehouses.length > 0 && useStore.getState().warehouses.length === 0) {
        useStore.setState({ warehouses: initialWarehouses });
    }
    useEffect(() => {
        if (initialWarehouses && initialWarehouses.length > 0) {
            useStore.setState({ warehouses: initialWarehouses });
        }
    }, [initialWarehouses]);

    const router = useRouter();
    const productIdentifier = getProductIdFromSlug(params.id);
    const { 
        addToCart, toggleWishlist, wishlist, cart, updateQuantity, 
        removeFromCart, user, language: storeLanguage, setLanguage, showToast, prefetchedProducts,
        selectedRegion
    } = useStore();
    const routeLang = params.lang === 'ru' || params.lang === 'uz' ? (params.lang as 'uz' | 'ru') : null;
    const language: 'uz' | 'ru' = routeLang || storeLanguage || 'uz';
    const t = translations[language];

    useEffect(() => {
        if (routeLang && storeLanguage !== routeLang) {
            setLanguage(routeLang);
        }
    }, [routeLang, storeLanguage, setLanguage]);

    // Core Data State
    const prefetched = prefetchedProducts[productIdentifier];
    const [rawProduct, setProduct] = useState<Product | null>(initialProduct || prefetched || null);
    const globalPromo = useStore(s => s.globalPromo);
    
    // Apply global promo
    const product = useMemo(() => {
        if (!rawProduct) return null;
        return applyGlobalPromo(rawProduct, globalPromo);
    }, [rawProduct, globalPromo]);

    const [loading, setLoading] = useState<boolean>(!initialProduct && !prefetched);
    const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
    const [boughtTogether, setBoughtTogether] = useState<Product[]>([]);
    const [popularProducts, setPopularProducts] = useState<Product[]>([]);
    const [groupProducts, setGroupProducts] = useState<Product[]>(
        (initialGroupProducts && initialGroupProducts.length > 0)
            ? initialGroupProducts
            : ((initialProduct as any)?.initialGroupProducts || [])
    );
    const [comments, setComments] = useState<any[]>([]);
    const [categoryData, setCategoryData] = useState<any | null>(null);
    
    // UI State
    const [activeImage, setActiveImage] = useState(0);
    const [isScrolledPast, setIsScrolledPast] = useState(false);
    const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const [popularLoading, setPopularLoading] = useState(false);
    const [isReaderOpen, setIsReaderOpen] = useState(false);

    const hasReadableBook = useMemo(() => {
        if (!product) return false;
        return Boolean(product.archive_identifier || product.archive_url || (product as any)?.pdf_url);
    }, [product]);

    const handleOpenReader = useCallback(() => {
        videoPreWarmer.triggerHaptic("medium");
        if (product && hasReadableBook) {
            setIsReaderOpen(true);
        } else {
            showToast(language === 'uz' ? "Mutolaa havolasi tayyorlanmoqda..." : "Ссылка формируется...");
        }
    }, [product, hasReadableBook, language, showToast]);

    // Agar URL da ?read=1 yoki #read bo'lsa avtomatik mutolaa modalini ochish
    useEffect(() => {
        if (typeof window !== "undefined" && product && hasReadableBook) {
            const searchParams = new URLSearchParams(window.location.search);
            if (searchParams.get("read") === "1" || window.location.hash === "#read") {
                setIsReaderOpen(true);
            }
        }
    }, [product, hasReadableBook]);
    const [maxDesktopLoadIndex, setMaxDesktopLoadIndex] = useState(0);

    // Infinite scroll state
    const [infiniteProducts, setInfiniteProducts] = useState<Product[]>([]);
    const [infinitePage, setInfinitePage] = useState(0);
    const [infiniteHasMore, setInfiniteHasMore] = useState(true);
    const [infiniteLoading, setInfiniteLoading] = useState(false);
    const infiniteSentinel = useRef<HTMLDivElement>(null);

    // Track recently viewed
    useEffect(() => {
        if (product?.id) {
            trackProductView(product.id);
            // Analytics: e-commerce mahsulot ko'rinishi
            ymViewProduct({ id: product.id, name: product.name, price: product.price, category: (product as any).category, brand: (product as any).brand });
        }
    }, [product?.id]);

    // Shaxsiy chegirma (smart/manual offer) — login mijozga ko'rsatiladi
    const [personalOffer, setPersonalOffer] = useState<{ percent: number; reason_uz?: string; reason_ru?: string; expires_at: string | null } | null>(null);
    useEffect(() => {
        const pid = product?.id;
        if (!pid || !user) { setPersonalOffer(null); return; }
        let cancelled = false;
        const inWishlist = wishlist.some(w => w.id === pid);
        // 1) AI taklifini "mint" qilishga urinish (config yoqilgan bo'lsa), so'ng
        // 2) barcha aktiv takliflardan shu mahsulotникини olish (manual ham, config'dan mustaqil)
        fetch("/api/discount", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId: pid, inWishlist }),
        }).catch(() => {}).finally(() => {
            fetch("/api/discount").then(r => r.json()).then(d => {
                if (cancelled) return;
                const off = (d.offers || []).find((o: any) => o.product_id === pid);
                setPersonalOffer(off || null);
            }).catch(() => {});
        });
        return () => { cancelled = true; };
    }, [product?.id, user, wishlist]);

    // Call Telemetry Tracker Hook
    useTelemetry({
        productId: product?.id || productIdentifier,
        categoryId: categoryData?.id || product?.category,
        metadata: {
            price: product?.price,
            isOriginal: product?.isOriginal
        }
    });

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 800) {
                setIsScrolledPast(true);
            } else {
                setIsScrolledPast(false);
            }
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);
    const storeWarehouses = useStore(s => s.warehouses);
    const fetchWarehouses = useStore(s => s.fetchWarehouses);
    useEffect(() => {
        if (!storeWarehouses || storeWarehouses.length === 0) {
            fetchWarehouses();
        }
    }, [storeWarehouses, fetchWarehouses]);

    // Boshlang'ich holatdayoq store'dagi omborni olamiz (0ms, birdaniga!)
    const activeWarehouse = useMemo(() => {
        const whs = (storeWarehouses && storeWarehouses.length > 0) ? storeWarehouses : initialWarehouses;
        if (!whs || whs.length === 0) return null;
        const targetProd = product || initialProduct;
        const availableWhId = Object.keys(targetProd?.stockDetails || {}).find(id => Number((targetProd?.stockDetails as Record<string, number>)[id]) > 0);
        return whs.find((w: any) => w.id === availableWhId) || whs[0];
    }, [storeWarehouses, initialWarehouses, product, initialProduct]);

    const [deliverySettings, setDeliverySettings] = useState<any | null>(activeWarehouse?.dbs_config || null);
    useEffect(() => {
        if (activeWarehouse?.dbs_config) {
            setDeliverySettings(activeWarehouse.dbs_config);
        }
    }, [activeWarehouse]);

    const [store, setStore] = useState<{ id: string; name: string; logo: string | null } | null>(null);
    useEffect(() => {
        if (activeWarehouse) {
            setStore({ id: activeWarehouse.id, name: activeWarehouse.name, logo: activeWarehouse.logo || null });
        }
    }, [activeWarehouse]);

    // --- MLM Referral Tracking ---
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const ref = params.get('ref');
            if (ref && product?.id) {
                // Get existing referral data from cookie
                let refData: Record<string, string> = {};
                const cookieStr = document.cookie.split('; ').find(row => row.startsWith('affiliate_data='));
                if (cookieStr) {
                    try {
                        refData = JSON.parse(decodeURIComponent(cookieStr.split('=')[1]));
                    } catch(e) {}
                }

                // Add new referral mapping
                refData[product.id] = ref;

                // Store back in cookie for 30 days (mehmonlar uchun)
                const expires = new Date();
                expires.setTime(expires.getTime() + (30 * 24 * 60 * 60 * 1000));
                document.cookie = `affiliate_data=${encodeURIComponent(JSON.stringify(refData))};expires=${expires.toUTCString()};path=/;SameSite=Lax`;

                // Login qilgan bo'lsa — serverga ham yozamiz (cross-device, last-click)
                if (user?.phone) {
                    fetch("/api/affiliate/track", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ productId: product.id, slug: ref }),
                    }).catch(() => null);
                }
            }
        }
    }, [product?.id, user?.phone]);

    // 1. Initial Data Pipeline (Hierarchical Prioritization)
    useEffect(() => {
        if (!initialProduct || (initialProduct.id !== productIdentifier && initialProduct.article !== productIdentifier)) {
            fetchProduct();
        } else {
            // High priority: Delivery, Group & Internal logic
            fetchDeliverySettings(initialProduct);
            const serverGroup = (initialGroupProducts && initialGroupProducts.length > 0) 
                ? initialGroupProducts 
                : (initialProduct as any)?.initialGroupProducts;
            if (initialProduct.groupId && (!serverGroup || serverGroup.length === 0)) {
                fetchGroup(initialProduct.groupId);
            }

            // Kategoriya ma'lumotini yuklash (breadcrumb to'g'ri nom ko'rsatishi uchun)
            if (initialProduct.category) {
                const cachedCat = useStore.getState().cachedCategories?.find((c: any) => c.id === initialProduct.category);
                if (cachedCat) setCategoryData(cachedCat);
                else supabase.from("categories").select("*").eq("id", initialProduct.category).maybeSingle().then(({ data: catData }) => { if (catData) setCategoryData(catData); });
            }

            // Secondary priority: Defer background sections to free up initial render thread
            const timer = setTimeout(() => {
                Promise.all([
                    fetchRelated(initialProduct.category as string, initialProduct.id),
                    fetchBoughtTogether(),
                    fetchPopular(),
                    fetchComments()
                ]);
            }, 300); // 300ms sweet spot for UI settling

            return () => clearTimeout(timer);
        }
    }, [productIdentifier]);

    const fetchProduct = async () => {
        if (!product) setLoading(true);
        try {
            const { data: productData, error } = await supabase
                .from("products")
                .select(PUBLIC_PRODUCT_COLUMNS)
                .eq("is_deleted", false)
                .or(`id.eq.${productIdentifier},article.eq.${productIdentifier}`)
                .single();

            if (productData) {
                const data = mapProduct(productData);
                setProduct(data);
                
                // Track interest and viewed (Optional / Future implementation with Supabase)
                if (user?.phone && user.phone !== 'ADMIN') {
                   // We could use an RPC or just update user_interests table
                   supabase.rpc('track_product_view', { 
                       p_user_phone: user.phone, 
                       p_product_id: productData.id, 
                       p_category_id: data.category
                   }).then(({ error }) => {
                       if (error) console.warn("Interest tracking failed:", error);
                   });
                }

                // Parallel fetching
                const fetchCat = async () => {
                    if (data.category) {
                        const { data: catData } = await supabase.from("categories").select("*").eq("id", data.category).maybeSingle();
                        if (catData) setCategoryData(catData);
                    }
                };

                Promise.all([
                    fetchRelated(data.category as string, data.id),
                    fetchBoughtTogether(),
                    fetchPopular(),
                    data.groupId ? fetchGroup(data.groupId) : Promise.resolve(),
                    fetchDeliverySettings(data),
                    fetchCat()
                ]);

            } else { router.push(`/${language}`); }
        } catch (e) {
            console.error("Fetch Product failed", e);
        } finally { setLoading(false); }
    };

    const fetchDeliverySettings = async (productData: Product) => {
        const storeWarehouses = initialWarehouses?.length ? initialWarehouses : useStore.getState().warehouses;
        const warehouses = storeWarehouses?.length ? storeWarehouses : (await supabase.from("warehouses").select("*")).data;
        if (!warehouses) return;

        const availableWhId = Object.keys(productData.stockDetails || {}).find(id => (productData.stockDetails as Record<string, number>)[id] > 0);
        const warehouse = warehouses.find(w => w.id === availableWhId) || warehouses[0];

        if (warehouse) {
            setStore({ id: warehouse.id, name: warehouse.name, logo: warehouse.logo || null });
        }
        
        // Sxema: warehouses.dbs_config (eski kod warehouse.data.dbs ni o'qigan — xato edi)
        const dbs = warehouse?.dbs_config || warehouse?.data?.dbs;
        if (dbs) {
            setDeliverySettings(dbs);
        }
    };

    const fetchRelated = async (category: string, currentId: string) => {
        // Semantik o'xshashlik — saqlangan embedding asosida (pgvector). Runtime model kerak emas.
        try {
            const { data: vec, error } = await supabase.rpc("match_products_by_embedding", {
                p_id: currentId, p_match_count: 10,
            });
            if (!error && vec && vec.length > 0) { setRelatedProducts(vec.map(mapProduct)); return; }
        } catch { /* fallback'ga o'tamiz */ }

        // Fallback: kategoriya bo'yicha (embedding hali yo'q bo'lsa)
        const { data } = await supabase
            .from("products")
            .select(PUBLIC_PRODUCT_COLUMNS)
            .eq("category_id", category)
            .eq("is_deleted", false)
            .gt("stock", 0)
            .neq("id", currentId)
            .limit(10);

        if (data) setRelatedProducts(data.map(mapProduct));
    };

    const fetchBoughtTogether = async () => {
        const { data } = await supabase
            .from("products")
            .select(PUBLIC_PRODUCT_COLUMNS)
            .eq("is_deleted", false)
            .gt("stock", 0)
            .neq("id", initialProduct?.id || productIdentifier)
            .limit(10);
        
        if (data) setBoughtTogether(data.map(mapProduct));
    };

    const fetchPopular = async () => {
        const { cachedProducts, setCachedProducts } = useStore.getState();
        if (cachedProducts && cachedProducts.length > 0) {
            setPopularProducts(cachedProducts.slice(0, 20));
            return;
        }

        setPopularLoading(true);
        const { data } = await supabase
            .from("products")
            .select(PUBLIC_PRODUCT_COLUMNS)
            .eq("is_deleted", false)
            .gt("stock", 0)
            .order("sales", { ascending: false, nullsFirst: false })
            .limit(20);
        
        if (data) {
            const mapped = data.map(mapProduct);
            setPopularProducts(mapped);
            setCachedProducts(mapped);
        }
        setPopularLoading(false);
    };

    const loadMoreInfinite = useCallback(async () => {
        if (infiniteLoading || !infiniteHasMore || !product) return;
        setInfiniteLoading(true);
        try {
            const excludeIds = [
                product.id,
                ...relatedProducts.map(p => p.id),
                ...boughtTogether.map(p => p.id),
                ...popularProducts.map(p => p.id),
                ...infiniteProducts.map(p => p.id),
            ];
            const PAGE_SIZE = 12;
            const from = infinitePage * PAGE_SIZE;
            let q = supabase.from("products")
                .select("id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,sales,avg_rating,review_count,stock,category_id,brand_id,model,color_name,group_id,article")
                .eq("is_deleted", false)
                .gt("stock", 0)
                .order("sales", { ascending: false, nullsFirst: false })
                .range(from, from + PAGE_SIZE - 1);
            if (excludeIds.length) q = q.not("id", "in", `(${excludeIds.join(",")})`);
            const { data } = await q;
            if (!data || data.length === 0) {
                setInfiniteHasMore(false);
            } else {
                setInfiniteProducts(prev => [...prev, ...data.map(mapProduct)]);
                setInfinitePage(prev => prev + 1);
                if (data.length < PAGE_SIZE) setInfiniteHasMore(false);
            }
        } catch (e) {
            setInfiniteHasMore(false);
        } finally {
            setInfiniteLoading(false);
        }
    }, [infiniteLoading, infiniteHasMore, infinitePage, infiniteProducts, relatedProducts, boughtTogether, popularProducts, product]);

    useEffect(() => {
        const sentinel = infiniteSentinel.current;
        if (!sentinel) return;
        const obs = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) loadMoreInfinite();
        }, { rootMargin: "600px" });
        obs.observe(sentinel);
        return () => obs.disconnect();
    }, [loadMoreInfinite]);

    const fetchGroup = async (groupId: string) => {
        const { data } = await supabase.from("products").select(PUBLIC_PRODUCT_COLUMNS).eq("group_id", groupId).eq("is_deleted", false);
        if (data) setGroupProducts(data.map(mapProduct));
    };

    const fetchComments = async () => {
        if (!product && !initialProduct) return;
        const targetId = product?.id || initialProduct?.id || productIdentifier;
        const { data } = await supabase
            .from("comments")
            .select("*")
            .eq("product_id", targetId)
            .order("created_at", { ascending: false });
        
        if (data) setComments(data.map(mapComment));
    };

    const totalStock = useMemo(() =>
        product ? getProductRealStock(product as any) : 0
    , [product]);

    const handleFastBuy = () => {
        videoPreWarmer.triggerHaptic("medium");
        if (!product) return;
        const item = {
            id: product.id,
            name: product.name,
            name_uz: product.name_uz,
            name_ru: product.name_ru,
            price: product.price,
            quantity: 1,
            imageUrl: product.image
        };
        sessionStorage.setItem('fast_buy_item', JSON.stringify(item));
        router.push(`/${language}/checkout?fast=true`);
    };

    const isWishlisted = product ? wishlist.some(item => item.id === product.id) : false;
    const cartItem = product ? cart.find((item) => item.id === product.id) : null;
    const allMedia = useMemo(() => [
        ...(product?.images && product.images.length > 0 ? product.images : [product?.image || ""]).map(img => ({ type: 'image' as const, url: img })),
        ...(product?.videoUrl ? [{ type: 'video' as const, url: product.videoUrl }] : [])
    ], [product]);

    // Lightbox keyboard navigation
    useEffect(() => {
        if (lightboxIndex === null) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") setLightboxIndex(null);
            if (e.key === "ArrowLeft") setLightboxIndex(prev => (prev === null || prev === 0 ? allMedia.length - 1 : prev - 1));
            if (e.key === "ArrowRight") setLightboxIndex(prev => (prev === null || prev === allMedia.length - 1 ? 0 : prev + 1));
        };
        window.addEventListener("keydown", handleKeyDown);
        document.body.style.overflow = "hidden";
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            document.body.style.overflow = "";
        };
    }, [lightboxIndex, allMedia.length]);

    if (loading) return (
        <div className="min-h-screen bg-white font-sans">
            <style>{`
                @keyframes shimmer {
                    0% { background-position: -400px 0; }
                    100% { background-position: 400px 0; }
                }
                .skeleton-shimmer {
                    background: linear-gradient(90deg, #f5f5f5 25%, #ececec 37%, #f5f5f5 63%);
                    background-size: 800px 100%;
                    animation: shimmer 1.6s ease-in-out infinite;
                }
            `}</style>
            {/* Desktop Skeleton */}
            <div className="hidden md:block max-w-[1600px] mx-auto px-10 py-12">
                <div className="h-4 skeleton-shimmer rounded-full w-48 mb-10" />
                <div className="grid grid-cols-12 gap-16">
                    <div className="col-span-12 lg:col-span-7 flex gap-6 h-[700px]">
                        <div className="w-24 shrink-0 space-y-4">
                            {[...Array(5)].map((_, i) => <div key={i} className="aspect-square skeleton-shimmer rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />)}
                        </div>
                        <div className="flex-1 skeleton-shimmer rounded-[40px]" />
                    </div>
                    <div className="col-span-12 lg:col-span-5 space-y-8">
                        <div className="p-10 rounded-[40px] border border-gray-100/50 space-y-6">
                            <div className="h-10 skeleton-shimmer rounded-2xl w-[85%]" style={{ animationDelay: '0.1s' }} />
                            <div className="h-5 skeleton-shimmer rounded-full w-32" style={{ animationDelay: '0.2s' }} />
                            <div className="h-14 skeleton-shimmer rounded-2xl w-[60%]" style={{ animationDelay: '0.3s' }} />
                            <div className="h-32 skeleton-shimmer rounded-[32px]" style={{ animationDelay: '0.4s' }} />
                            <div className="flex gap-3">
                                <div className="h-14 skeleton-shimmer rounded-2xl flex-1" style={{ animationDelay: '0.5s' }} />
                                <div className="h-14 skeleton-shimmer rounded-2xl flex-1" style={{ animationDelay: '0.6s' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile Skeleton - matches actual PDP layout */}
            <div className="md:hidden">
                {/* Image area with floating buttons skeleton */}
                <div className="relative">
                    <div className="w-full aspect-[3/4] skeleton-shimmer" />
                    {/* Fake floating buttons */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                        <div className="w-11 h-11 rounded-full skeleton-shimmer" />
                        <div className="w-11 h-11 rounded-full skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
                    </div>
                    <div className="absolute top-4 right-4 flex flex-col gap-2">
                        <div className="w-11 h-11 rounded-full skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
                        <div className="w-11 h-11 rounded-full skeleton-shimmer" style={{ animationDelay: '0.3s' }} />
                    </div>
                    {/* Dots */}
                    <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-1.5">
                        {[...Array(4)].map((_, i) => <div key={i} className={`h-1 rounded-full skeleton-shimmer ${i === 0 ? 'w-6' : 'w-1'}`} style={{ animationDelay: `${i * 0.1}s` }} />)}
                    </div>
                </div>
                
                {/* Info skeleton */}
                <div className="px-6 pt-8 space-y-5">
                    {/* Original badge */}
                    <div className="h-7 skeleton-shimmer rounded-xl w-36" style={{ animationDelay: '0.2s' }} />
                    {/* Title */}
                    <div className="space-y-2">
                        <div className="h-6 skeleton-shimmer rounded-xl w-[90%]" style={{ animationDelay: '0.3s' }} />
                        <div className="h-6 skeleton-shimmer rounded-xl w-[60%]" style={{ animationDelay: '0.35s' }} />
                    </div>
                    {/* Rating */}
                    <div className="flex items-center gap-2">
                        <div className="h-4 skeleton-shimmer rounded-full w-24" style={{ animationDelay: '0.4s' }} />
                        <div className="h-4 skeleton-shimmer rounded-full w-16" style={{ animationDelay: '0.45s' }} />
                    </div>
                    {/* Stock */}
                    <div className="h-14 skeleton-shimmer rounded-3xl" style={{ animationDelay: '0.5s' }} />
                    {/* Delivery */}
                    <div className="h-20 skeleton-shimmer rounded-[32px]" style={{ animationDelay: '0.55s' }} />
                    {/* Price */}
                    <div className="h-28 skeleton-shimmer rounded-[40px]" style={{ animationDelay: '0.6s' }} />
                </div>
            </div>
        </div>
    );

    if (!product) return null;

    return (
        <div className="bg-white min-h-screen text-black font-sans selection:bg-black selection:text-white animate-in fade-in duration-500">
            
            {/* Sticky Quick-Buy Bar (Desktop) */}
            <div className={`hidden md:flex fixed top-20 md:top-24 left-0 right-0 bg-white/95 backdrop-blur-2xl z-[90] border-b border-gray-100 py-4 shadow-2xl transition-transform duration-300 transition-opacity duration-300 ease-out will-change-transform transform ${isScrolledPast ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}>
                <div className="max-w-[1600px] mx-auto px-10 flex items-center justify-between w-full h-16">
                    <div className="flex items-center gap-6 flex-1 min-w-0">
                        <div className="relative w-14 h-14 rounded-2xl overflow-hidden shrink-0 border border-gray-100 shadow-sm">
                            <Image
                                src={getOptimizedImageUrl(product.image_metadata, product.image, 'xs')}
                                fill
                                className="object-cover"
                                alt={(product[`name_${language}` as keyof typeof product] as string) || product.name}
                                sizes="56px"
                                loader={hasVariants(product.image_metadata, product.image) ? makeVariantLoader(product.image_metadata) : undefined}
                            />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-sm font-black italic uppercase truncate tracking-tight">{product[language === 'uz' ? 'name_uz' : 'name_ru'] || product.name}</h2>
                            <div className="flex items-center gap-3">
                                <span className={`text-lg font-black italic ${personalOffer ? 'text-indigo-700' : ''}`}>
                                    {Number((personalOffer ? Math.round(product.price * (1 - personalOffer.percent / 100)) : product.price) || 0).toLocaleString()} <span className="text-[10px] not-italic">{language === 'uz' ? "so'm" : "сум"}</span>
                                </span>
                                {personalOffer ? (
                                    <span className="text-xs text-gray-300 line-through font-bold">{Number((product.oldPrice && product.oldPrice > product.price ? product.oldPrice : product.price) || 0).toLocaleString()}</span>
                                ) : product.oldPrice && product.oldPrice > product.price && (
                                    <span className="text-xs text-gray-300 line-through font-bold">{Number(product.oldPrice || 0).toLocaleString()}</span>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <button 
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                toggleWishlist({ ...product, imageUrl: product.image } as any);
                            }}
                            className="ios-icon-tap active:scale-90 p-4 bg-gray-50 rounded-2xl hover:bg-black hover:text-white transition-colors duration-200 shadow-sm border border-transparent hover:border-black"
                        >
                            <Heart size={20} fill={isWishlisted ? "currentColor" : "none"} />
                        </button>

                        <button 
                            onClick={handleFastBuy}
                            className="ios-tap-feedback active:scale-95 px-10 py-4 bg-[#F2F3F5] hover:bg-black hover:text-white text-black rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-200"
                        >
                            {language === 'uz' ? "Tezkor xarid" : "Купить сейчас"}
                        </button>

                        {cartItem ? (
                           <div className="flex items-center rounded-[24px] overflow-hidden h-[56px]" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", boxShadow: "0 8px 24px rgba(45,110,62,0.28)" }}>
                               <button
                                   onClick={() => {
                                       videoPreWarmer.triggerHaptic("light");
                                       updateQuantity(product.id, cartItem.quantity - 1);
                                   }}
                                   className="px-6 py-4 hover:bg-white/10 ios-icon-tap active:scale-85 transition-transform duration-150 ease-out will-change-transform"
                               >
                                   <Minus size={18} strokeWidth={3} />
                               </button>
                               <span className="px-2 font-black italic text-lg">{cartItem.quantity}</span>
                               <button
                                   onClick={() => {
                                       videoPreWarmer.triggerHaptic("light");
                                       updateQuantity(product.id, cartItem.quantity + 1);
                                   }}
                                   className="px-6 py-4 hover:bg-white/10 ios-icon-tap active:scale-85 transition-transform duration-150 ease-out will-change-transform"
                               >
                                   <Plus size={18} strokeWidth={3} />
                               </button>
                           </div>
                        ) : (
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    addToCart({ ...product, imageUrl: product.image, stock: totalStock } as any);
                                }}
                                className="px-10 py-4 rounded-[24px] text-[10px] font-black uppercase tracking-[0.2em] ios-tap-feedback active:scale-95 transition-transform duration-150 ease-out will-change-transform flex items-center gap-3 velari-green-btn"
                            >
                                <Plus size={18} strokeWidth={3} /> {language === 'uz' ? "SAVATGA" : "В КОРЗИНУ"}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Sticky Quick-Buy Bar (Mobile) — pastga skrol qilinganda tepada paydo bo'ladi */}
            <div
                className="md:hidden fixed top-0 left-0 right-0 z-[95] transition-transform duration-300 transition-opacity duration-300 ease-out will-change-transform"
                style={{
                    background: "rgba(250,250,246,0.94)",
                    backdropFilter: "blur(20px) saturate(180%)",
                    borderBottom: "0.5px solid rgba(15,20,16,0.06)",
                    padding: "10px 14px",
                    transform: isScrolledPast ? "translateY(0)" : "translateY(-100%)",
                    opacity: isScrolledPast ? 1 : 0,
                    pointerEvents: isScrolledPast ? "auto" : "none",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {/* Thumbnail */}
                    <div style={{ position: "relative", width: 44, height: 44, borderRadius: 12, overflow: "hidden", flexShrink: 0, border: "1px solid rgba(15,20,16,0.06)" }}>
                        <Image
                            src={product.image}
                            fill
                            className="object-cover"
                            alt={product[language === 'uz' ? 'name_uz' : 'name_ru'] || product.name}
                            sizes="44px"
                            loader={hasVariants(product.image_metadata, product.image) ? makeVariantLoader(product.image_metadata) : undefined}
                        />
                    </div>
                    {/* Title + Price */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: "#0F1410", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {product[language === 'uz' ? 'name_uz' : 'name_ru'] || product.name}
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: personalOffer ? "#4338CA" : "#0F1410" }}>
                                {Number((personalOffer ? Math.round(product.price * (1 - personalOffer.percent / 100)) : product.price) || 0).toLocaleString()}
                                <span style={{ fontSize: 10, fontWeight: 600 }}> {language === 'uz' ? "so'm" : "сум"}</span>
                            </span>
                            {product.oldPrice && product.oldPrice > product.price && (
                                <span style={{ fontSize: 11, color: "#9AA29C", textDecoration: "line-through", fontWeight: 600 }}>{Number(product.oldPrice).toLocaleString()}</span>
                            )}
                        </div>
                    </div>
                    {/* Cart CTA */}
                    {cartItem ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 4, background: "#EAF3EC", borderRadius: 14, padding: "0 4px", height: 44, flexShrink: 0 }}>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    updateQuantity(product.id, cartItem.quantity - 1);
                                }}
                                className="ios-icon-tap active:scale-85 transition-transform duration-150"
                                style={{ padding: 8, background: "none", border: "none", cursor: "pointer", color: "#2D6E3E" }}
                            >
                                <Minus size={15} />
                            </button>
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#0F1410", minWidth: 16, textAlign: "center" }}>{cartItem.quantity}</span>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    updateQuantity(product.id, cartItem.quantity + 1);
                                }}
                                className="ios-icon-tap active:scale-85 transition-transform duration-150"
                                style={{ padding: 8, background: "none", border: "none", cursor: "pointer", color: "#2D6E3E" }}
                            >
                                <Plus size={15} />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("medium");
                                addToCart({ ...product, imageUrl: product.image, stock: totalStock } as any);
                            }}
                            className="ios-tap-feedback active:scale-[0.96] transition-transform duration-150 ease-out will-change-transform"
                            style={{
                                flexShrink: 0, height: 44, borderRadius: 14, border: "none", cursor: "pointer",
                                padding: "0 18px", background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)",
                                color: "#fff", fontSize: 13, fontWeight: 700, letterSpacing: -0.2,
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                                boxShadow: "0 6px 16px rgba(45,110,62,0.26)", WebkitTapHighlightColor: "transparent",
                            }}
                        >
                            <ShoppingBag size={16} color="#fff" />
                            {language === 'uz' ? "Savatga" : "В корзину"}
                        </button>
                    )}
                </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden" style={{ overscrollBehavior: 'none', touchAction: 'pan-x pan-y' }}>
                <ProductMedia
                    allMedia={allMedia}
                    activeImage={activeImage}
                    setActiveImage={setActiveImage}
                    isWishlisted={isWishlisted}
                    toggleWishlist={toggleWishlist}
                    product={product}
                />
                <ProductInfo 
                    product={product}
                    language={language}
                    t={t}
                    groupProducts={groupProducts}
                    totalStock={totalStock}
                    getDeliveryDateText={() => deliverySettings ? getDeliveryDateText(language, deliverySettings, selectedRegion) : (language === "uz" ? "Yetkazib berish..." : "Доставка...")}
                    onDescriptionOpen={() => setIsDescriptionModalOpen(true)}
                    personalOffer={personalOffer}
                />
                {/* Do'kon kartasi (mobil) */}
                {store && (
                    <div className="md:hidden px-4 mt-4">
                        <StoreCard store={store} language={language} />
                    </div>
                )}
            </div>

            {/* Desktop View (E-commerce Grid Style) */}
            <div className="hidden md:block max-w-[1600px] mx-auto px-10 py-12">
                <div className="flex items-center gap-2 text-xs text-gray-400 font-bold uppercase tracking-widest mb-10 overflow-x-auto no-scrollbar whitespace-nowrap">
                    <Link href={`/${language}`} className="hover:text-black transition-colors">{language === 'uz' ? 'MAHSULOTLAR' : 'ТОВАРЫ'}</Link>
                    {categoryData && (
                        <>
                            <span>/</span>
                            <Link href={`/${language}/?category=${product.category}`} className="hover:text-black transition-colors">
                                {categoryData[language === 'uz' ? 'name_uz' : 'name_ru'] || categoryData.name}
                            </Link>
                        </>
                    )}
                    <span>/</span>
                    <span className="text-black italic">{product[language === 'uz' ? 'name_uz' : 'name_ru'] || product.name}</span>
                </div>

                <div className="grid grid-cols-12 gap-16">
                    {/* Left: Gallery */}
                    <div className="col-span-12 lg:col-span-7 flex gap-10 h-[800px]">
                        <div className="flex flex-col gap-4 overflow-y-auto no-scrollbar w-40 shrink-0">
                            {allMedia.map((media, i) => (
                                <button 
                                    key={i}
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("selection");
                                        setActiveImage(i);
                                    }}
                                    className={`ios-tap-feedback active:scale-95 aspect-[3/4] rounded-3xl overflow-hidden border-2 transition-transform duration-150 group ${activeImage === i ? "border-black scale-95 shadow-xl" : "border-gray-50 opacity-60 hover:opacity-100"}`}
                                >
                                    {media.type === 'image' ? (
                                        <div className="relative w-full h-full bg-gray-50">
                                            {/* Zanjirli yuklanish: Faqat o'z navbati kelgan rasm yuklanadi */}
                                            {i <= maxDesktopLoadIndex ? (
                                                <Image
                                                    src={getOptimizedImageUrl(product.image_metadata, media.url, 'xs')}
                                                    fill
                                                    className="object-cover group-hover:scale-110 transition-transform"
                                                    alt={`${(product[`name_${language}` as keyof typeof product] as string) || product.name} - ${i + 1}`}
                                                    sizes="160px"
                                                    loader={hasVariants(product.image_metadata, media.url) ? makeVariantLoader(product.image_metadata) : undefined}
                                                    onLoad={() => setMaxDesktopLoadIndex(prev => Math.max(prev, i + 1))}
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gray-50/50 flex items-center justify-center animate-pulse" />
                                            )}
                                        </div>
                                    ) : (
                                        <div className="relative w-full h-full bg-black">
                                            <video 
                                                src={media.url} 
                                                className="w-full h-full object-cover opacity-60"
                                                muted
                                                playsInline
                                            />
                                            <div className="absolute inset-0 flex items-center justify-center text-white">
                                                <div className="bg-black/50 backdrop-blur-md rounded-full p-2">
                                                    <Loader2 size={20} className="animate-spin" />
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                        <div
                            onClick={() => setLightboxIndex(activeImage)}
                            className="flex-1 bg-white rounded-[40px] overflow-hidden relative group/hero shadow-xl shadow-black/5 border border-gray-100/80 cursor-pointer"
                            style={{ viewTransitionName: `product-img-${product.id}` } as React.CSSProperties}
                        >
                            {allMedia[activeImage]?.type === 'video' ? (
                                <div className="w-full h-full bg-black relative flex items-center justify-center">
                                    <video 
                                        src={allMedia[activeImage].url} 
                                        className="w-full h-full object-contain"
                                        autoPlay
                                        muted
                                        loop
                                        playsInline
                                        controls
                                    />
                                </div>
                            ) : (
                                <Image
                                    src={getOptimizedImageUrl(product.image_metadata, allMedia[activeImage]?.url || "", 'lg')}
                                    fill
                                    className="object-contain p-4 md:p-6 group-hover:scale-105 transition-transform duration-500"
                                    alt={`${(product[`name_${language}` as keyof typeof product] as string) || product.name} - ${language === 'uz' ? 'Asosiy rasm' : 'Основное изображение'}`}
                                    priority
                                    sizes="(max-width: 1024px) 100vw, 60vw"
                                    quality={85}
                                    fetchPriority="high"
                                    loader={hasVariants(product.image_metadata, allMedia[activeImage]?.url || "") ? makeVariantLoader(product.image_metadata) : undefined}
                                    onLoad={() => setMaxDesktopLoadIndex(prev => Math.max(prev, 1))}
                                />
                            )}
                            
                            {/* Zoom hint badge */}
                            <div className="absolute top-8 left-8 p-3 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg opacity-0 group-hover/hero:opacity-100 transition-opacity text-gray-700 border border-white flex items-center gap-2 text-xs font-bold">
                                <Maximize2 size={16} />
                                <span>{language === 'uz' ? "Kattalashtirish" : "Увеличить"}</span>
                            </div>

                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    videoPreWarmer.triggerHaptic("light");
                                    toggleWishlist({ ...product, imageUrl: product.image } as any);
                                }}
                                className="ios-icon-tap active:scale-90 absolute top-8 right-8 p-5 bg-white/80 backdrop-blur-xl rounded-full shadow-2xl transition-transform duration-150 text-black border border-white z-10"
                            >
                                <Heart size={24} fill={isWishlisted ? "black" : "none"} />
                            </button>
                        </div>
                    </div>

                    {/* Right: Info Panels */}
                    <div className="col-span-12 lg:col-span-5 space-y-10">
                        {/* 1. Header & Price */}
                        <div className="bg-white p-8 lg:p-10 rounded-[32px] border border-gray-100 shadow-sm">
                            {/* <p>: sahifada yagona <h1> — mobil ProductInfo'da */}
                            <p className="text-2xl lg:text-3xl font-semibold tracking-tight text-[#111612] mb-3 leading-snug">
                                {product[language === 'uz' ? 'name_uz' : 'name_ru'] || product.name}
                            </p>
                            {/* Reyting faqat haqiqiy sharhlar bo'lsa */}
                            {(product.reviewCount || 0) > 0 && (
                                <div className="flex items-center gap-2 mb-6 bg-gray-50/70 w-fit px-3.5 py-1.5 rounded-xl">
                                    <Star size={15} className="text-yellow-400 fill-yellow-400" />
                                    <span className="font-semibold text-xs text-[#111612]">{product.rating}</span>
                                    <span className="text-xs text-gray-400 font-medium ml-1.5">({product.reviewCount} {language === 'uz' ? 'sharh' : 'отзыв'})</span>
                                </div>
                            )}

                            {/* Bepul narx yozuvi */}
                            <div className="mb-6">
                                <span className="text-green-600 font-bold text-2xl lg:text-3xl">
                                    {language === 'uz' ? 'Bepul' : 'Бесплатно'}
                                </span>
                            </div>

                            {/* Short Specs Summary */}
                            <div className="grid grid-cols-2 gap-4 mb-10">
                                <div className="space-y-1">
                                    <p className="text-[9px] text-gray-400 font-black uppercase">{language === 'uz' ? 'Mahsulot kodi' : 'Код товара'}</p>
                                    <p className="text-xs font-bold text-gray-800">#{product.article || product.sku || product.id.slice(0, 8)}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[9px] text-gray-400 font-black uppercase">{language === 'uz' ? 'Asosiy' : 'Основное'}</p>
                                    <p className="text-xs font-bold text-green-600">Original / Brand New</p>
                                </div>
                            </div>

                            {/* Variants / Group Products */}
                            {groupProducts.length > 1 && (
                                <div className="bg-gray-50/50 p-10 rounded-[40px] border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 px-2">
                                        {language === 'uz' ? 'Rangni tanlang' : 'Выберите цвет'}: <span className="text-black font-black italic ml-2">{product.colorName || (language === 'uz' ? "Tanlanmagan" : "Не выбран")}</span>
                                    </p>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-4">
                                        {groupProducts.map((v) => (
                                            <Link 
                                                replace 
                                                key={v.id} 
                                                href={`/${language}/products/${getProductSlug(v, language)}`}
                                                onClick={() => videoPreWarmer.triggerHaptic("selection")}
                                                className={`ios-tap-feedback aspect-[3/4] rounded-3xl overflow-hidden border-2 transition-transform duration-150 flex-shrink-0 shadow-sm relative group/v active:scale-95 ${v.id === product.id ? "border-black scale-105 shadow-xl z-10" : "border-white opacity-60 hover:opacity-100 hover:border-gray-200"}`}
                                            >
                                                <Image
                                                    src={getOptimizedImageUrl(v.image_metadata, v.image, 'xs')}
                                                    fill
                                                    className="object-cover transition-transform duration-500 group-hover/v:scale-110"
                                                    alt={`${(v[`name_${language}` as keyof typeof v] as string) || v.name} - ${v.colorName || "variant"}`}
                                                    sizes="100px"
                                                    loader={hasVariants(v.image_metadata, v.image) ? makeVariantLoader(v.image_metadata) : undefined}
                                                />
                                                {v.id === product.id && (
                                                    <div className="absolute inset-0 bg-black/5 flex items-center justify-center">
                                                        <div className="bg-white rounded-full p-1 shadow-lg">
                                                            <Check size={12} strokeWidth={4} />
                                                        </div>
                                                    </div>
                                                )}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="grid grid-cols-1 gap-3 mt-8">
                                <button 
                                    onClick={handleOpenReader}
                                    className="glass-prominent-button w-full h-[52px] text-sm font-semibold rounded-[var(--radius-control)] flex items-center justify-center gap-2"
                                >
                                    <BookOpen size={19} strokeWidth={2.4} />
                                    <span>{language === 'uz' ? "Mutolaa qilish (O'qish)" : "Читать онлайн"}</span>
                                </button>
                            </div>
                        </div>

                        {/* Do'kon kartasi (agar mavjud bo'lsa) */}
                        {store && (
                            <div className="bg-[#F2F3F5] p-6 rounded-[32px] border border-gray-100">
                                <StoreCard store={store} language={language} />
                            </div>
                        )}

                        {/* 3. Description Truncated Preview Box (Fills space directly under Delivery Panel) */}
                        <div className="bg-[#F2F3F5] p-8 md:p-10 rounded-[40px] border border-gray-100 relative flex flex-col justify-between">
                            <div>
                                <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">
                                    {language === 'uz' ? "Batafsil ma'lumot" : "Подробная информация"}
                                </h3>
                                <div className="relative max-h-[160px] overflow-hidden text-sm font-medium text-gray-700 leading-relaxed">
                                    {(() => {
                                        const desc = product[language === 'uz' ? 'description_uz' : 'description_ru'] || product.description || '';
                                        const hasHtml = /<[a-z][\s\S]*>/i.test(desc);
                                        if (hasHtml) {
                                            return <div dangerouslySetInnerHTML={{ __html: desc }} />;
                                        }
                                        return <div style={{ whiteSpace: 'pre-line' }}>{desc}</div>;
                                    })()}
                                    {/* Fade out mask */}
                                    <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-[#F2F3F5] via-[#F2F3F5]/80 to-transparent pointer-events-none" />
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setIsDescriptionModalOpen(true);
                                }}
                                className="ios-tap-feedback mt-6 w-full py-4 bg-white hover:bg-black hover:text-white text-black font-black text-xs uppercase tracking-widest rounded-2xl transition-transform duration-150 shadow-sm border border-gray-200/60 flex items-center justify-center gap-2 group active:scale-[0.98]"
                            >
                                <span>{language === 'uz' ? "Batafsil ko'rish" : "Подробнее"}</span>
                                <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <ProductSpecifications productId={product.id} language={language} />

            <ReviewsSection 
                productId={product.id}
                product={product}
                user={user}
                language={language}
                t={t}
                comments={comments}
                fetchComments={fetchComments}
                showToast={showToast}
                router={router}
            />

            <RelatedProducts
                relatedProducts={relatedProducts}
                boughtTogether={boughtTogether}
                popularProducts={popularProducts}
                language={language}
                cart={cart}
                wishlist={wishlist}
                addToCart={addToCart}
                toggleWishlist={toggleWishlist}
                updateQuantity={updateQuantity}
                removeFromCart={removeFromCart}
                popularLoading={popularLoading}
                t={t}
            />

            {infiniteProducts.length > 0 && (
                <section className="mt-8 pb-8" style={{ background: "#FAFAF6" }}>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-2 md:gap-x-6 gap-y-6 md:gap-y-10 px-4 max-w-[1600px] mx-auto">
                        {infiniteProducts.map(p => (
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
                </section>
            )}

            <div ref={infiniteSentinel} aria-hidden="true" style={{ height: 1 }} />
            {infiniteLoading && (
                <div className="flex justify-center py-10" style={{ background: "#FAFAF6" }}>
                    <Loader2 className="animate-spin" size={28} color="#2D6E3E" />
                </div>
            )}

            {isDescriptionModalOpen && (
                <ProductDescriptionModal 
                    isOpen={isDescriptionModalOpen}
                    onClose={() => setIsDescriptionModalOpen(false)}
                    product={product}
                    language={language}
                />
            )}

            {/* Mobile Floating Sticky CTA — Liquid Glass Capsule */}
            <div 
                className="md:hidden fixed bottom-3 left-3 right-3 max-w-lg mx-auto z-[95] glass-strong rounded-[24px] p-2 border border-white/80 shadow-[0_12px_36px_rgba(28,70,42,0.18)] select-none"
                style={{
                    paddingBottom: "max(env(safe-area-inset-bottom, 8px), 8px)",
                }}
            >
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                    <button
                        onClick={handleOpenReader}
                        className="glass-prominent-button flex-1 text-sm font-semibold flex items-center justify-center gap-2"
                        style={{ height: 48, borderRadius: 16 }}
                    >
                        <BookOpen size={18} color="#fff" strokeWidth={2.4} />
                        <span>{language === 'uz' ? "Mutolaa qilish" : "Читать"}</span>
                    </button>
                </div>
            </div>

            {/* Fullscreen Lightbox Modal */}
            {lightboxIndex !== null && (
                <div className="fixed inset-0 z-[200] bg-black/95 backdrop-blur-2xl flex flex-col justify-between p-4 md:p-8 animate-in fade-in duration-300">
                    {/* Top Bar */}
                    <div className="flex items-center justify-between z-10">
                        <span className="text-white/70 text-xs font-black uppercase tracking-widest bg-white/10 px-4 py-2 rounded-full backdrop-blur-md">
                            {lightboxIndex + 1} / {allMedia.length}
                        </span>
                        <p className="text-white/90 text-sm font-bold truncate max-w-md hidden md:block">
                            {product[language === 'uz' ? 'name_uz' : 'name_ru'] || product.name}
                        </p>
                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                setLightboxIndex(null);
                            }}
                            className="ios-icon-tap active:scale-90 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-transform duration-150 backdrop-blur-md"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Main Stage with Nav Arrows */}
                    <div className="relative flex-1 flex items-center justify-center my-4 overflow-hidden">
                        {allMedia.length > 1 && (
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setLightboxIndex(prev => (prev === null || prev === 0 ? allMedia.length - 1 : prev - 1));
                                }}
                                className="ios-icon-tap active:scale-90 absolute left-2 md:left-6 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-transform duration-150 backdrop-blur-md z-20"
                            >
                                <ChevronLeft size={32} />
                            </button>
                        )}

                        <div className="relative w-full h-full flex items-center justify-center p-2 md:p-6">
                            {allMedia[lightboxIndex]?.type === 'video' ? (
                                <video src={allMedia[lightboxIndex].url} controls autoPlay className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl" />
                            ) : (
                                <img src={getOptimizedImageUrl(product.image_metadata, allMedia[lightboxIndex]?.url, 'lg')} alt="" className="max-h-full max-w-full object-contain rounded-2xl shadow-2xl animate-in zoom-in-95 duration-300" />
                            )}
                        </div>

                        {allMedia.length > 1 && (
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setLightboxIndex(prev => (prev === null || prev === allMedia.length - 1 ? 0 : prev + 1));
                                }}
                                className="ios-icon-tap active:scale-90 absolute right-2 md:right-6 p-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-transform duration-150 backdrop-blur-md z-20"
                            >
                                <ChevronRight size={32} />
                            </button>
                        )}
                    </div>

                    {/* Bottom Thumbnails */}
                    {allMedia.length > 1 && (
                        <div className="flex justify-center gap-3 overflow-x-auto no-scrollbar py-2 z-10 overscroll-x-contain touch-pan-x">
                            {allMedia.map((m, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("selection");
                                        setLightboxIndex(idx);
                                    }}
                                    className={`ios-tap-feedback active:scale-95 w-16 h-16 rounded-xl overflow-hidden border-2 transition-transform duration-150 shrink-0 ${
                                        lightboxIndex === idx ? "border-white scale-110" : "border-transparent opacity-50 hover:opacity-100"
                                    }`}
                                >
                                    {m.type === 'video' ? (
                                        <div className="w-full h-full bg-gray-900 flex items-center justify-center text-white text-[9px] font-bold">VIDEO</div>
                                    ) : (
                                        <img src={getOptimizedImageUrl(product.image_metadata, m.url, 'xs')} alt="" className="w-full h-full object-cover" />
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* In-browser Interactive BookReader (Canvas + IndexedDB cache) */}
            {isReaderOpen && product && (
                <BookCanvasReader
                    productId={product.id}
                    bookTitle={product[language === 'uz' ? 'name_uz' : 'name_ru'] || product.name}
                    coverUrl={product.image || (Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : null)}
                    language={language}
                    onClose={() => setIsReaderOpen(false)}
                />
            )}
        </div>
    );
}
