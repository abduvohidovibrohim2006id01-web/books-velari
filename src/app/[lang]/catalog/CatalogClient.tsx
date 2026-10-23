"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useStore } from "@/store/store";
import { useShallow } from "zustand/react/shallow";
import { Search, SlidersHorizontal, ArrowUpDown, X, Check, Loader2, Camera, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { translations } from "@/lib/translations";
import { supabase } from "@/lib/supabase";
import { mapProduct } from "@/lib/mappers";
import { ProductGrid } from "@/components/home/ProductGrid";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { getProductRealStock } from "@/lib/stock";
import type { Product } from "@/types";
import dynamic from "next/dynamic";
const VisualSearchModal = dynamic(() => import("@/components/search/VisualSearchModal"), { ssr: false });
import type { VisualAnalysis } from "@/app/api/search/route";

const GREEN = "#2D6E3E";

interface Category {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    parentId?: string;
    image?: string;
}

interface Brand {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
}

interface CatalogClientProps {
    initialCategories?: Category[];
    initialCategory?: string; // toza URL (/catalog/[slug]) orqali oldindan tanlangan kategoriya id
    initialProducts?: Product[];
    initialBrands?: Brand[];
    initialProductCatIds?: string[];
    initialWarehouses?: any[];
}

type SortKey = "popular" | "new" | "price_asc" | "price_desc" | "rating";

export default function CatalogClient({
    initialCategories,
    initialCategory,
    initialProducts,
    initialBrands,
    initialProductCatIds,
    initialWarehouses
}: CatalogClientProps) {
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
    const {
        language, cachedCategories, setCachedCategories,
        cart, wishlist, user, addToCart, updateQuantity, removeFromCart, toggleWishlist,
        storeGlobalQuery, storeSearchResults
    } = useStore(useShallow(state => ({
        language: state.language,
        cachedCategories: state.cachedCategories,
        setCachedCategories: state.setCachedCategories,
        cart: state.cart,
        wishlist: state.wishlist,
        user: state.user,
        addToCart: state.addToCart,
        updateQuantity: state.updateQuantity,
        removeFromCart: state.removeFromCart,
        toggleWishlist: state.toggleWishlist,
        storeGlobalQuery: state.homeSearchQuery,
        storeSearchResults: state.searchResults,
    })));
    const t = translations[language];
    const catName = (c: { name: string; name_uz?: string; name_ru?: string }) =>
        (language === "uz" ? c.name_uz : c.name_ru) || c.name;

    const [allCategories, setAllCategories] = useState<Category[]>(initialCategories || cachedCategories || []);
    const [brands, setBrands] = useState<Brand[]>(initialBrands || []);
    const [products, setProducts] = useState<Product[]>(() => {
        if (initialProducts && initialProducts.length > 0) return initialProducts;
        const cached = useStore.getState().cachedProducts;
        if (cached && cached.length > 0 && !initialCategory) return cached;
        return [];
    });
    const [loadingProducts, setLoadingProducts] = useState<boolean>(() => {
        if (initialProducts && initialProducts.length > 0) return false;
        const cached = useStore.getState().cachedProducts;
        if (cached && cached.length > 0 && !initialCategory) return false;
        return true;
    });
    const [productCatIds, setProductCatIds] = useState<Set<string>>(() => {
        if (initialProductCatIds && initialProductCatIds.length > 0) return new Set(initialProductCatIds);
        return new Set();
    });

    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<Product[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [isVisualUploading, setIsVisualUploading] = useState(false);
    const [isLensModalOpen, setIsLensModalOpen] = useState(false);
    const [lensImagePreview, setLensImagePreview] = useState<string | null>(null);
    const [isLensAnalyzing, setIsLensAnalyzing] = useState(false);
    const [lensAnalysis, setLensAnalysis] = useState<VisualAnalysis | null>(null);
    const [lensResults, setLensResults] = useState<Product[]>([]);
    const [searchPage, setSearchPage] = useState(1);
    const [hasMoreSearch, setHasMoreSearch] = useState(false);
    // API'dagi jami topilganlar soni (sahifa hajmi emas)
    const [searchTotal, setSearchTotal] = useState<number | null>(null);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [didYouMean, setDidYouMean] = useState<string | null>(null);
    const isVisualActiveRef = useRef(false);
    const searchAbortRef = useRef<AbortController | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Tepada joylashgan asosiy qidiruv paneli (Navigation) bilan sinxronizatsiya
    useEffect(() => {
        if (storeGlobalQuery !== undefined && storeGlobalQuery !== searchQuery) {
            setSearchQuery(storeGlobalQuery);
            if (!storeGlobalQuery.trim()) {
                setSearchResults(null);
            }
        }
    }, [storeGlobalQuery]);

    useEffect(() => {
        if (storeSearchResults === null && !storeGlobalQuery?.trim()) {
            setSearchResults(null);
        } else if (storeSearchResults !== null) {
            setSearchResults(storeSearchResults);
        }
    }, [storeSearchResults, storeGlobalQuery]);
    // Toza URL (/catalog/[slug]) orqali kelgan kategoriyani oldindan tanlaymiz.
    // Subkategoriya bo'lsa: asosiy = ota, sub = o'zi; aks holda asosiy = o'zi.
    const [mainCat, setMainCat] = useState<string>(() => {
        if (!initialCategory) return "all";
        const cat = (initialCategories || []).find(c => c.id === initialCategory);
        if (!cat) return initialCategory;
        return cat.parentId || cat.id;
    });
    const [subCat, setSubCat] = useState<string>(() => {
        if (!initialCategory) return "all";
        const cat = (initialCategories || []).find(c => c.id === initialCategory);
        return cat?.parentId ? cat.id : "all";
    });

    const [showFilters, setShowFilters] = useState(false);
    const [showSort, setShowSort] = useState(false);

    // Filter state
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [minRating, setMinRating] = useState<number>(0);
    const [priceRange, setPriceRange] = useState<[number, number]>([0, 0]);
    const [sortBy, setSortBy] = useState<SortKey>("popular");

    // Draft state for the filter sheet (apply on confirm)
    const [draftBrands, setDraftBrands] = useState<string[]>([]);
    const [draftRating, setDraftRating] = useState<number>(0);
    const [draftMinPrice, setDraftMinPrice] = useState<number>(0);
    const [draftMaxPrice, setDraftMaxPrice] = useState<number>(0);

    // Categories that actually contain products (incl. ancestors of any category with products)
    const categoriesWithProducts = useMemo(() => {
        const set = new Set<string>();
        if (productCatIds.size === 0) return set;
        const byId = new Map(allCategories.map(c => [c.id, c]));
        productCatIds.forEach(cid => {
            let cur: string | undefined = cid;
            let guard = 0;
            while (cur && guard < 20) {
                set.add(cur);
                cur = byId.get(cur)?.parentId;
                guard++;
            }
        });
        return set;
    }, [productCatIds, allCategories]);

    const hasCat = (id: string) => productCatIds.size === 0 || categoriesWithProducts.has(id);
    const mainCategories = allCategories.filter(c => !c.parentId && hasCat(c.id));
    const subCategories = mainCat !== "all" ? allCategories.filter(c => c.parentId === mainCat && hasCat(c.id)) : [];

    // Fetch categories (if not provided) + brands
    useEffect(() => {
        const load = async () => {
            if (!initialCategories || initialCategories.length === 0) {
                if (cachedCategories.length === 0) {
                    const { data } = await supabase.from("categories").select("*").eq("is_deleted", false).order("name");
                    if (data) {
                        const cData = data.map(c => ({
                            id: c.id, name: c.name, name_uz: c.name_uz, name_ru: c.name_ru,
                            parentId: c.parent_id, image: c.image,
                        })) as Category[];
                        setAllCategories(cData);
                        setCachedCategories(cData);
                    }
                }
            } else {
                setCachedCategories(initialCategories);
            }

            if (!initialBrands || initialBrands.length === 0) {
                const { data: bData } = await supabase.from("brands").select("id, name, name_uz, name_ru").eq("is_deleted", false).order("name");
                if (bData) setBrands(bData as Brand[]);
            }

            // Which categories actually have products — to hide empty ones (faqat propda berilmagan bo'lsa)
            if (!initialProductCatIds || initialProductCatIds.length === 0) {
                const { data: pcData } = await supabase
                    .from("products").select("category_id, stock, stock_details").eq("is_deleted", false)
                    .gt("stock", 0)
                    .limit(10000);
                if (pcData) {
                    const validIds = pcData
                        .filter((r: any) => getProductRealStock(r) > 0)
                        .map((r: any) => r.category_id)
                        .filter(Boolean);
                    setProductCatIds(new Set(validIds));
                }
            }
        };
        load();
    }, []);

    // Serverdan kelgan boshlang'ich mahsulotlarni global keshga saqlash
    useEffect(() => {
        if (initialProducts && initialProducts.length > 0 && !initialCategory) {
            useStore.getState().setCachedProducts(initialProducts);
        }
    }, [initialProducts, initialCategory]);

    const isFirstMountRef = useRef(true);

    // Fetch products when category/subcategory changes (when not searching)
    useEffect(() => {
        if (searchQuery.trim()) return;

        // Boshlang'ich yuklanishda mahsulotlar allaqachon mavjud bo'lsa, qayta fetch qilib qotirmaymiz
        if (isFirstMountRef.current) {
            isFirstMountRef.current = false;
            if (products.length > 0) {
                return;
            }
        }

        const fetchProducts = async () => {
            setLoadingProducts(true);
            try {
                let query = supabase.from("products")
                    .select("id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,sales,avg_rating,review_count,stock,stock_details,category_id,brand_id,video_url,model,color_name,group_id,is_original,article,express_delivery,created_at")
                    .eq("is_deleted", false)
                    .gt("stock", 0);

                const activeCat = subCat !== "all" ? subCat : mainCat;
                if (activeCat !== "all") {
                    const getAllIds = (catId: string): string[] => {
                        const children = allCategories.filter(c => c.parentId === catId);
                        let ids = [catId];
                        for (const child of children) ids = [...ids, ...getAllIds(child.id)];
                        return ids;
                    };
                    query = query.in("category_id", getAllIds(activeCat));
                }

                const { data } = await query.order("sales", { ascending: false, nullsFirst: false }).limit(150);
                const inStock = (data || []).map(mapProduct).filter((p: any) => getProductRealStock(p) > 0);
                setProducts(inStock);
            } catch (e) {
                console.error("Catalog products fetch failed", e);
            } finally {
                setLoadingProducts(false);
            }
        };
        fetchProducts();
    }, [mainCat, subCat, searchQuery]);

    // Live search via /api/search backend with filters & semantic ranking
    useEffect(() => {
        const q = searchQuery.trim();
        if (!q) {
            setSearchResults(null);
            setIsSearching(false);
            setHasMoreSearch(false);
            setSearchPage(1);
            setDidYouMean(null);
            isVisualActiveRef.current = false;
            if (searchAbortRef.current) searchAbortRef.current.abort();
            return;
        }

        // If visual search results were just set, skip overriding them with text search
        if (isVisualActiveRef.current) {
            isVisualActiveRef.current = false;
            return;
        }

        if (searchAbortRef.current) searchAbortRef.current.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsSearching(true);
        setSearchPage(1);

        const timer = setTimeout(async () => {
            try {
                const activeCat = subCat !== "all" ? subCat : mainCat !== "all" ? mainCat : undefined;
                const res = await fetch("/api/search", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        query: q,
                        category: activeCat,
                        brands: selectedBrands.length > 0 ? selectedBrands : undefined,
                        minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
                        maxPrice: priceRange[1] > 0 ? priceRange[1] : undefined,
                        rating: minRating > 0 ? minRating : undefined,
                        sort: sortBy,
                        page: 1,
                        limit: 50,
                    }),
                    signal: controller.signal
                });
                if (controller.signal.aborted) return;
                const data = await res.json();
                if (data.results) {
                    setSearchResults(data.results);
                    setHasMoreSearch(!!data.hasMore);
                    setDidYouMean(data.didYouMean || null);
                    setSearchTotal(typeof data.total === "number" ? data.total : data.results.length);
                }
            } catch (err: any) {
                if (err?.name !== "AbortError") {
                    console.error("Catalog search error:", err);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setIsSearching(false);
                }
            }
        }, 300);

        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [searchQuery, mainCat, subCat, selectedBrands, minRating, priceRange, sortBy]);

    const handleLoadMore = async () => {
        if (isLoadingMore || !hasMoreSearch || !searchQuery.trim()) return;
        setIsLoadingMore(true);
        const nextPage = searchPage + 1;
        try {
            const activeCat = subCat !== "all" ? subCat : mainCat !== "all" ? mainCat : undefined;
            const res = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    query: searchQuery.trim(),
                    category: activeCat,
                    brands: selectedBrands.length > 0 ? selectedBrands : undefined,
                    minPrice: priceRange[0] > 0 ? priceRange[0] : undefined,
                    maxPrice: priceRange[1] > 0 ? priceRange[1] : undefined,
                    rating: minRating > 0 ? minRating : undefined,
                    sort: sortBy,
                    page: nextPage,
                    limit: 50,
                }),
            });
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                setSearchResults(prev => [...(prev || []), ...data.results]);
                setSearchPage(nextPage);
                setHasMoreSearch(!!data.hasMore);
            } else {
                setHasMoreSearch(false);
            }
        } catch (err) {
            console.error("Load more search error:", err);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleVisualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = "";
        setIsVisualUploading(true);
        setIsLensModalOpen(true);
        setIsLensAnalyzing(true);
        setLensAnalysis(null);
        setLensResults([]);

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setLensImagePreview(dataUrl);

            const img = new window.Image();
            img.onload = async () => {
                try {
                    // Rasmni client tomonda 1024px gacha siqish (Vercel 4.5MB limitidan toshmasligi va tezkor bo'lishi uchun)
                    const canvas = document.createElement("canvas");
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 1024;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext("2d");
                    if (ctx) ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.8);

                    const res = await fetch("/api/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ image: compressedBase64, limit: 50 })
                    });
                    const data = await res.json();
                    if (data.results && data.results.length > 0) {
                        setLensResults(data.results);
                        isVisualActiveRef.current = true;
                        setSearchResults(data.results);
                        setHasMoreSearch(false);
                        setSearchQuery("");
                    } else {
                        setLensResults([]);
                    }
                } catch (err) {
                    console.error("Visual search error:", err);
                } finally {
                    setIsVisualUploading(false);
                    setIsLensAnalyzing(false);
                }
            };
            img.onerror = () => {
                setIsVisualUploading(false);
                setIsLensAnalyzing(false);
            };
            img.src = dataUrl;
        };
        reader.onerror = () => {
            setIsVisualUploading(false);
            setIsLensAnalyzing(false);
        };
        reader.readAsDataURL(file);
    };

    const handleCropSearch = async (croppedBase64: string) => {
        setIsLensAnalyzing(true);
        try {
            const res = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: croppedBase64, limit: 50 })
            });
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                setLensResults(data.results);
                isVisualActiveRef.current = true;
                setSearchResults(data.results);
                setHasMoreSearch(false);
                setSearchQuery("");
            } else {
                setLensResults([]);
            }
        } catch (err) {
            console.error("Visual crop search error:", err);
        } finally {
            setIsLensAnalyzing(false);
        }
    };


    // Max price across current product set (for the slider bound)
    const maxProductPrice = useMemo(() => {
        const source = searchResults !== null ? searchResults : products;
        const max = source.reduce((m, p) => Math.max(m, p.oldPrice || p.price || 0), 0);
        return max > 0 ? Math.ceil(max / 100000) * 100000 : 5000000;
    }, [products, searchResults]);

    const filteredProducts = useMemo(() => {
        // If backend search is active, results are already ranked and filtered
        if (searchResults !== null) {
            return searchResults.filter((p: any) => getProductRealStock(p) > 0);
        }

        let list = products.filter((p: any) => getProductRealStock(p) > 0);

        if (selectedBrands.length > 0) {
            list = list.filter(p => selectedBrands.includes((p as any).brand || p.brand_id || ""));
        }
        if (minRating > 0) {
            list = list.filter(p => (p.rating || 0) >= minRating);
        }
        if (priceRange[0] > 0 || priceRange[1] > 0) {
            list = list.filter(p => {
                const okMin = priceRange[0] <= 0 || p.price >= priceRange[0];
                const okMax = priceRange[1] <= 0 || p.price <= priceRange[1];
                return okMin && okMax;
            });
        }

        const sorted = [...list];
        switch (sortBy) {
            case "new": sorted.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || "")); break;
            case "price_asc": sorted.sort((a, b) => a.price - b.price); break;
            case "price_desc": sorted.sort((a, b) => b.price - a.price); break;
            case "rating": sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
            default: sorted.sort((a, b) => (b.sales || 0) - (a.sales || 0));
        }
        return sorted;
    }, [products, searchResults, selectedBrands, minRating, priceRange, sortBy]);

    const activeFilterCount = (selectedBrands.length > 0 ? 1 : 0) + (minRating > 0 ? 1 : 0) + (priceRange[0] > 0 || priceRange[1] > 0 ? 1 : 0);

    const openFilters = () => {
        setDraftBrands(selectedBrands);
        setDraftRating(minRating);
        setDraftMinPrice(priceRange[0] > 0 ? priceRange[0] : 0);
        setDraftMaxPrice(priceRange[1] > 0 ? priceRange[1] : maxProductPrice);
        setShowFilters(true);
    };
    const applyFilters = () => {
        setSelectedBrands(draftBrands);
        setMinRating(draftRating);
        const max = draftMaxPrice >= maxProductPrice ? 0 : draftMaxPrice;
        setPriceRange([draftMinPrice, max]);
        setShowFilters(false);
    };
    const clearFilters = () => {
        setDraftBrands([]);
        setDraftRating(0);
        setDraftMinPrice(0);
        setDraftMaxPrice(maxProductPrice);
    };

    const sortOptions: { key: SortKey; label_uz: string; label_ru: string }[] = [
        { key: "popular", label_uz: "Mashhurligi", label_ru: "По популярности" },
        { key: "new", label_uz: "Yangilari", label_ru: "Новинки" },
        { key: "price_asc", label_uz: "Arzondan qimmatga", label_ru: "Сначала дешёвые" },
        { key: "price_desc", label_uz: "Qimmatdan arzonga", label_ru: "Сначала дорогие" },
        { key: "rating", label_uz: "Reyting bo'yicha", label_ru: "По рейтингу" },
    ];

    const fmt = (n: number) => n.toLocaleString("ru-RU") + (language === "ru" ? " сум" : " so'm");

    return (
        <div className="min-h-screen text-black font-sans pb-24" style={{ background: "#FAFAF6" }}>
            <div className="max-w-[1600px] mx-auto px-2 md:px-10 pt-3 md:pt-6 pb-6 md:pb-10">

                {/* Title */}
                <h1 className="sr-only">
                    {language === "uz" ? "Katalog" : "Каталог"}
                </h1>

                {/* Hidden visual search file input for modal fallback */}
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleVisualUpload}
                />

                {/* Main category pills */}
                <div
                    className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 mb-3 px-1 overscroll-x-contain touch-pan-x"
                    style={{ WebkitOverflowScrolling: "touch" }}
                >
                    <Pill active={mainCat === "all"} onClick={() => { setMainCat("all"); setSubCat("all"); }}>
                        {language === "uz" ? "Hammasi" : "Все"}
                    </Pill>
                    {mainCategories.map(c => (
                        <Pill key={c.id} active={mainCat === c.id} onClick={() => { setMainCat(c.id); setSubCat("all"); }}>
                            {catName(c)}
                        </Pill>
                    ))}
                </div>

                {/* Sub category pills */}
                {subCategories.length > 0 && (
                    <div
                        className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1 mb-3 px-1 overscroll-x-contain touch-pan-x"
                        style={{ WebkitOverflowScrolling: "touch" }}
                    >
                        <Pill small active={subCat === "all"} onClick={() => setSubCat("all")}>
                            {language === "uz" ? "Barchasi" : "Все"}
                        </Pill>
                        {subCategories.map(c => (
                            <Pill key={c.id} small active={subCat === c.id} onClick={() => setSubCat(c.id)}>
                                {catName(c)}
                            </Pill>
                        ))}
                    </div>
                )}

                {/* Filter / Sort buttons */}
                <div className="grid grid-cols-2 gap-3 mb-6 px-1">
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            openFilters();
                        }}
                        className="flex items-center justify-center gap-2 bg-white/85 backdrop-blur-md border border-[rgba(15,20,16,0.06)] rounded-2xl py-3.5 text-[13.5px] font-semibold text-[#111612] shadow-sm ios-tap-feedback active:scale-[0.97] transition-transform duration-150 ease-out will-change-transform"
                    >
                        <SlidersHorizontal size={16} className="text-[#2D6E3E]" />
                        {language === "uz" ? "Filtrlar" : "Фильтры"}
                        {activeFilterCount > 0 && (
                            <span className="ml-1 w-5 h-5 rounded-full text-white text-[10.5px] font-bold flex items-center justify-center bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] shadow-sm">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setShowSort(true);
                        }}
                        className="flex items-center justify-center gap-2 bg-white/85 backdrop-blur-md border border-[rgba(15,20,16,0.06)] rounded-2xl py-3.5 text-[13.5px] font-semibold text-[#111612] shadow-sm ios-tap-feedback active:scale-[0.97] transition-transform duration-150 ease-out will-change-transform"
                    >
                        <ArrowUpDown size={16} className="text-[#5A625C]" />
                        {language === "uz" ? "Saralash" : "Сортировка"}
                    </button>
                </div>

                {/* DID YOU MEAN BANNER */}
                {didYouMean && searchQuery.trim() && (
                    <div className="mb-4 mx-1 p-3.5 rounded-2xl glass-surface flex items-center gap-2 text-sm border border-emerald-500/20 bg-emerald-50/40">
                        <Sparkles size={16} className="text-[#2D6E3E] shrink-0" />
                        <span className="text-[#737D75]">
                            {language === "uz" ? "Balki shuni nazarda tutdingizmi:" : "Возможно, вы имели в виду:"}
                        </span>
                        <button
                            onClick={() => setSearchQuery(didYouMean)}
                            className="font-bold text-[#2D6E3E] hover:underline"
                        >
                            {didYouMean}
                        </button>
                    </div>
                )}

                {/* Qidiruv: jami topilganlar soni yoki "topilmadi" */}
                {searchQuery.trim() && searchResults !== null && !isSearching && searchTotal !== null && (
                    <p className="mb-3 mx-1 text-[13px] font-medium text-[#737D75]">
                        {searchTotal === 0
                            ? (language === "uz" ? "Hech narsa topilmadi — bu so'rov bo'yicha do'konda mahsulot yo'q" : "Ничего не найдено — по этому запросу товаров нет")
                            : (language === "uz" ? `${searchTotal} ta mahsulot topildi` : `Найдено товаров: ${searchTotal}`)}
                    </p>
                )}

                {/* Mahsulotlar ro'yxati (Bosh sahifa bilan 1:1 bir xil ProductGrid) */}
                <ProductGrid
                    products={filteredProducts}
                    loading={loadingProducts}
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

                {/* SEARCH LOAD MORE PAGINATION */}
                {searchResults !== null && hasMoreSearch && (
                    <div className="mt-8 mb-4 flex justify-center">
                        <button
                            onClick={handleLoadMore}
                            disabled={isLoadingMore}
                            className="px-8 py-3.5 rounded-2xl font-semibold text-[14px] text-white bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] shadow-md shadow-[#2D6E3E]/20 ios-tap-feedback active:scale-[0.98] transition-transform duration-150 disabled:opacity-50 flex items-center gap-2 will-change-transform"
                        >
                            {isLoadingMore && <Loader2 size={16} className="animate-spin" />}
                            {language === "uz" ? "Yana ko'proq ko'rsatish" : "Показать ещё"}
                        </button>
                    </div>
                )}
            </div>

            {/* FILTER SHEET */}
            <BottomSheet open={showFilters} onClose={() => setShowFilters(false)}
                title={language === "uz" ? "Filtrlar" : "Фильтры"}
                leftAction={<button onClick={clearFilters} className="text-sm font-bold text-gray-400">{language === "uz" ? "Tozalash" : "Сбросить"}</button>}
            >
                {/* Price */}
                <Section title={language === "uz" ? "Narx" : "Цена"}>
                    <div className="flex items-center justify-between mb-3 text-[14px] font-bold text-[#111612]">
                        <span>{fmt(draftMinPrice)}</span>
                        <span className="text-gray-300">—</span>
                        <span>{fmt(draftMaxPrice || maxProductPrice)}</span>
                    </div>
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        {language === "uz" ? "Eng kam" : "Минимум"}
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={maxProductPrice}
                        step={50000}
                        value={draftMinPrice}
                        onChange={e => {
                            const v = Math.min(Number(e.target.value), (draftMaxPrice || maxProductPrice));
                            setDraftMinPrice(v);
                        }}
                        className="w-full accent-[#2D6E3E] mb-4 cursor-pointer"
                    />
                    <label className="block text-[11px] font-medium text-gray-400 mb-1">
                        {language === "uz" ? "Eng ko'p" : "Максимум"}
                    </label>
                    <input
                        type="range"
                        min={0}
                        max={maxProductPrice}
                        step={50000}
                        value={draftMaxPrice || maxProductPrice}
                        onChange={e => {
                            const v = Math.max(Number(e.target.value), draftMinPrice);
                            setDraftMaxPrice(v);
                        }}
                        className="w-full accent-[#2D6E3E] cursor-pointer"
                    />
                </Section>

                {/* Brands */}
                {brands.length > 0 && (
                    <Section title={language === "uz" ? "Brendlar" : "Бренды"}>
                        <div className="flex flex-wrap gap-2.5">
                            {brands.map(b => {
                                const on = draftBrands.includes(b.id);
                                return (
                                    <button key={b.id}
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("light");
                                            setDraftBrands(on ? draftBrands.filter(x => x !== b.id) : [...draftBrands, b.id]);
                                        }}
                                        className={`px-4 py-2.5 rounded-full text-[12.5px] font-semibold border transition-[transform,colors] ios-tap-feedback active:scale-95 duration-150 will-change-transform ${on ? "bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] text-white border-transparent shadow-sm shadow-[#2D6E3E]/20" : "bg-white/80 backdrop-blur-md text-[#2C332E] border-black/10 hover:bg-white"}`}
                                    >
                                        {(language === "uz" ? b.name_uz : b.name_ru) || b.name}
                                    </button>
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* Rating */}
                <Section title={language === "uz" ? "Reyting" : "Рейтинг"}>
                    {[4.5, 4, 3.5, 0].map(r => (
                        <button key={r}
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("light");
                                setDraftRating(r);
                            }}
                            className="w-full flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 ios-tap-feedback active:scale-[0.98] transition-transform duration-150 ease-out">
                            <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${draftRating === r ? "bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] border-transparent shadow-sm" : "border-gray-200 bg-white"}`}>
                                {draftRating === r && <Check size={12} color="#fff" strokeWidth={3} />}
                            </span>
                            <span className="text-[13.5px] font-semibold text-[#111612]">
                                {r === 0 ? (language === "uz" ? "Har qanday" : "Любой") : `${r}+ ⭐`}
                            </span>
                        </button>
                    ))}
                </Section>

                <div
                    className="sticky bottom-0 -mx-6 px-6 pt-3 bg-white/95 backdrop-blur-md border-t border-gray-100"
                    style={{ paddingBottom: "max(14px, env(safe-area-inset-bottom, 14px))" }}
                >
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("medium");
                            applyFilters();
                        }}
                        className="w-full py-3.5 rounded-2xl text-white font-semibold text-[14px] ios-tap-feedback active:scale-[0.98] transition-transform duration-150 ease-out will-change-transform bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] shadow-md shadow-[#2D6E3E]/30"
                    >
                        {language === "uz" ? "Natijalarni ko'rsatish" : "Показать результаты"}
                    </button>
                </div>
            </BottomSheet>

            {/* SORT SHEET */}
            <BottomSheet open={showSort} onClose={() => setShowSort(false)}
                title={language === "uz" ? "Saralash" : "Сортировка"}
            >
                {sortOptions.map(o => (
                    <button key={o.key}
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setSortBy(o.key);
                            setShowSort(false);
                        }}
                        className="w-full flex items-center justify-between py-3.5 border-b border-gray-50 last:border-0 ios-tap-feedback active:scale-[0.98] transition-transform duration-150 ease-out">
                        <span className={`text-[14px] ${sortBy === o.key ? "font-bold text-[#2D6E3E]" : "font-medium text-[#2C332E]"}`}>
                            {language === "uz" ? o.label_uz : o.label_ru}
                        </span>
                        {sortBy === o.key && <Check size={18} color={GREEN} strokeWidth={3} />}
                    </button>
                ))}
            </BottomSheet>

            {/* Google Lens uslubidagi vizual qidiruv modal oynasi */}
            {isLensModalOpen && (
                <VisualSearchModal
                    isOpen={isLensModalOpen}
                    onClose={() => setIsLensModalOpen(false)}
                    imagePreview={lensImagePreview}
                    isAnalyzing={isLensAnalyzing}
                    results={lensResults}
                    language={language}
                    onChangePhoto={() => fileInputRef.current?.click()}
                    onCropSearch={handleCropSearch}
                    onViewResults={() => {
                        setIsLensModalOpen(false);
                        setTimeout(() => {
                            window.scrollTo({ top: 0, behavior: "smooth" });
                        }, 120);
                    }}
                />
            )}
        </div>
    );
}

function Pill({ children, active, onClick, small }: { children: React.ReactNode; active: boolean; onClick: () => void; small?: boolean }) {
    return (
        <button
            onClick={() => {
                videoPreWarmer.triggerHaptic("light");
                onClick();
            }}
            className={`shrink-0 rounded-full font-semibold transition-[transform,colors] duration-150 whitespace-nowrap ios-tap-feedback active:scale-95 will-change-transform border ${
                small ? "px-4 py-2 text-xs" : "px-5 py-2.5 text-[13.5px]"
            } ${
                active
                    ? "bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] text-white border-transparent shadow-md shadow-[#2D6E3E]/20"
                    : "bg-white/80 backdrop-blur-md text-[#2C332E] border-black/5 hover:bg-white hover:text-black hover:shadow-sm"
            }`}
        >
            {children}
        </button>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#737D75] mb-3">{title}</p>
            {children}
        </div>
    );
}

function BottomSheet({ open, onClose, title, leftAction, children }: {
    open: boolean; onClose: () => void; title: string; leftAction?: React.ReactNode; children: React.ReactNode;
}) {
    const [isClosing, setIsClosing] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Gesture tracking refs
    const dragStartY = useRef(0);
    const lastTouchY = useRef(0);
    const dragStartTime = useRef(0);
    const velocity = useRef(0);
    const currentTranslateY = useRef(0);
    const isDragging = useRef(false);

    // Lock body scroll during open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [open]);

    // Handle animated close
    const handleCloseWithAnimation = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 250);
    }, [onClose]);

    // Non-passive touch listener to prevent pull-to-refresh
    useEffect(() => {
        const el = sheetRef.current;
        if (!el) return;
        const onNativeTouchMove = (e: TouchEvent) => {
            if (isDragging.current && e.cancelable) {
                e.preventDefault();
            }
        };
        el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
        return () => el.removeEventListener("touchmove", onNativeTouchMove);
    }, []);

    if (!open && !isClosing) return null;

    // Pointer Events on Header / Drag Pill with Pointer Capture
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const y = e.clientY;
        dragStartY.current = y;
        lastTouchY.current = y;
        dragStartTime.current = performance.now();
        velocity.current = 0;
        isDragging.current = true;
        if (sheetRef.current) {
            sheetRef.current.style.transition = "none";
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        const y = e.clientY;
        const delta = y - dragStartY.current;

        if (delta < 0) {
            if (sheetRef.current) sheetRef.current.style.transform = "translate3d(0, 0, 0)";
            currentTranslateY.current = 0;
            return;
        }

        const now = performance.now();
        const dt = Math.max(1, now - dragStartTime.current);
        const dy = y - lastTouchY.current;
        velocity.current = dy / dt;
        lastTouchY.current = y;
        dragStartTime.current = now;

        if (sheetRef.current) {
            currentTranslateY.current = delta;
            sheetRef.current.style.transform = `translate3d(0, ${delta}px, 0)`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
        isDragging.current = false;

        // Dismiss if dragged down > 80px OR flicked down with velocity > 0.45 px/ms
        if (currentTranslateY.current > 80 || velocity.current > 0.45) {
            videoPreWarmer.triggerHaptic("light");
            handleCloseWithAnimation();
        } else if (sheetRef.current) {
            sheetRef.current.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
            sheetRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        currentTranslateY.current = 0;
        velocity.current = 0;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (contentRef.current && contentRef.current.scrollTop > 0) {
            isDragging.current = false;
            return;
        }
        const y = e.touches[0].clientY;
        dragStartY.current = y;
        lastTouchY.current = y;
        dragStartTime.current = performance.now();
        velocity.current = 0;
        isDragging.current = true;
        if (sheetRef.current) {
            sheetRef.current.style.transition = "none";
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        const y = e.touches[0].clientY;
        const delta = y - dragStartY.current;

        if (delta < 0 || (contentRef.current && contentRef.current.scrollTop > 0)) {
            return;
        }

        const now = performance.now();
        const dt = Math.max(1, now - dragStartTime.current);
        const dy = y - lastTouchY.current;
        velocity.current = dy / dt;
        lastTouchY.current = y;
        dragStartTime.current = now;

        if (sheetRef.current) {
            currentTranslateY.current = delta;
            sheetRef.current.style.transform = `translate3d(0, ${delta}px, 0)`;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (!isDragging.current || !sheetRef.current) {
            isDragging.current = false;
            return;
        }
        isDragging.current = false;

        // Dismiss if dragged down > 80px OR swiped down with velocity > 0.45 px/ms
        if (currentTranslateY.current > 80 || velocity.current > 0.45) {
            videoPreWarmer.triggerHaptic("light");
            handleCloseWithAnimation();
        } else {
            sheetRef.current.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
            sheetRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        currentTranslateY.current = 0;
        velocity.current = 0;
    };

    return (
        <div
            className="fixed inset-0 z-[130] flex items-end justify-center pointer-events-auto"
            onClick={handleCloseWithAnimation}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: "none" }}
        >
            <div
                className={`absolute inset-0 bg-black/40 transition-opacity duration-250 ease-out ${
                    isClosing ? "opacity-0" : "opacity-100 animate-in fade-in"
                }`}
                style={{ touchAction: "none" }}
            />
            <div
                ref={sheetRef}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                style={{
                    willChange: "transform",
                    transition: isClosing ? "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out" : undefined,
                    transform: isClosing ? "translate3d(0, 100%, 0)" : undefined,
                    animation: (!isClosing && !isDragging.current && currentTranslateY.current === 0)
                        ? "velari-sheet-up 320ms cubic-bezier(0.22, 1, 0.36, 1)"
                        : "none",
                }}
                className="relative w-full max-w-[480px] bg-white/95 backdrop-blur-2xl rounded-t-[32px] px-6 pt-3 pb-4 max-h-[88vh] flex flex-col overscroll-contain border-t border-white/60 shadow-2xl"
            >
                {/* Drag handle & Header (Dedicated Touch-Action None Drag Zone) */}
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="w-full shrink-0 select-none cursor-grab active:cursor-grabbing"
                    style={{ touchAction: "none" }}
                >
                    <div className="py-2.5 -mt-1 flex justify-center w-full">
                        <div className="w-10 h-1 bg-gray-300 rounded-full" />
                    </div>

                    {/* Header */}
                    <div className="flex items-center justify-between mb-5 select-none">
                        <div className="w-16">{leftAction}</div>
                        <h3 className="text-[15px] font-bold text-[#111612] pointer-events-none">{title}</h3>
                        <button
                            type="button"
                            onClick={handleCloseWithAnimation}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-16 flex justify-end ios-icon-tap active:scale-90 transition-transform duration-150 p-1"
                        >
                            <X size={20} className="text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Content Container */}
                <div
                    ref={contentRef}
                    className="flex-1 overflow-y-auto overscroll-contain pr-1 -mr-1"
                    style={{ WebkitOverflowScrolling: "touch" }}
                >
                    {children}
                </div>
            </div>
        </div>
    );
}
