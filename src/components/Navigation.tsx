"use client";

import Link from "next/link";
import { Search, Heart, ShoppingBag, MessageSquare, Clapperboard, LayoutGrid, User, ShoppingCart, BookOpen, Loader2, Sparkles, X, Home, MapPin, ChevronDown } from "lucide-react";
import Image from "next/image";
import Logo from "./Logo";
import LocationSelectModal from "@/components/modals/LocationSelectModal";
import { getRegionById } from "@/lib/regions";
import { getProductSlug } from "@/lib/slugify";
import { getOptimizedImageUrl } from "@/lib/imageVariants";
import { useStore } from "@/store/store";
import { useShallow } from "zustand/react/shallow";
import { usePathname, useRouter } from "next/navigation";
import { translations } from "@/lib/translations";
import { useState, useMemo, useRef, useEffect } from "react";
import { SearchResult, Product } from "@/types";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import dynamic from "next/dynamic";
import type { VisualAnalysis } from "@/app/api/search/route";
// Rasm qidiruvi oynasi (~22 KB) — faqat birinchi ochilganda yuklanadi (1-ekran JS'iga kirmaydi)
const VisualSearchModal = dynamic(() => import("@/components/search/VisualSearchModal"), { ssr: false });

export default function Navigation() {
    const user = useStore(state => state.user);
    const cart = useStore(state => state.cart);
    const wishlist = useStore(state => state.wishlist);
    const language = useStore(state => state.language);
    const setHomeSearchQuery = useStore(state => state.setHomeSearchQuery);
    const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
    const selectedRegion = useStore(state => state.selectedRegion);
    const currentRegion = getRegionById(selectedRegion);
    const currentRegionName = language === "ru" ? currentRegion.name_ru : currentRegion.name_uz;
    const pathname = usePathname();
    const router = useRouter();
    const t = translations[language];
    
    const inputRef = useRef<HTMLInputElement>(null);
    const [search, setSearch] = useState("");
    const [suggestions, setSuggestions] = useState<SearchResult[]>([]);
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const suggestAbortRef = useRef<AbortController | null>(null);
    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);


    const isHomePage = pathname === `/${language}` || pathname === `/`;
    const isProductPage = !!pathname?.includes('/products/');
    const isCatalogPage = pathname === `/${language}/catalog` || pathname?.startsWith(`/${language}/catalog/`) || pathname?.includes('/catalog');

    // Optimistic index for instantaneous 0ms bottom nav indicator sliding
    const [navOptimisticIndex, setNavOptimisticIndex] = useState<number | null>(null);
    useEffect(() => {
        setNavOptimisticIndex(null);
    }, [pathname]);

    // Handle Search Focus from other pages
    useEffect(() => {
        if (isHomePage && typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            if (params.get('focus') === 'true' && inputRef.current) {
                inputRef.current.focus();
                router.replace(`/${language}`, { scroll: false });
            }
        }
    }, [isHomePage, router, language]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const formObj = inputRef.current?.closest('form');
            if (formObj && !formObj.contains(e.target as Node)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const handleTrigger = () => {
            fileInputRef.current?.click();
        };
        window.addEventListener("velari-trigger-visual-search", handleTrigger);
        return () => window.removeEventListener("velari-trigger-visual-search", handleTrigger);
    }, []);

    const { setSearchResults, isSearchLoading, setHomeSearchQuery: setStoreGlobalQuery, showToast } = useStore(useShallow(s => ({
        setSearchResults: s.setSearchResults, isSearchLoading: s.isSearchLoading, setHomeSearchQuery: s.setHomeSearchQuery, showToast: s.showToast
    })));
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isVisualSearching, setIsVisualSearching] = useState(false);
    const [isLensModalOpen, setIsLensModalOpen] = useState(false);
    const [lensImagePreview, setLensImagePreview] = useState<string | null>(null);
    const [isLensAnalyzing, setIsLensAnalyzing] = useState(false);
    const [lensAnalysis, setLensAnalysis] = useState<VisualAnalysis | null>(null);
    const [lensResults, setLensResults] = useState<Product[]>([]);

    const handleVisualSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // Fayl inputini tozalash (keyingi safar xuddi shu faylni tanlasa ham trigger bo'lishi uchun)
        e.target.value = "";
        setIsVisualSearching(true);
        setIsLensModalOpen(true);
        setIsLensAnalyzing(true);
        setLensAnalysis(null);
        setLensResults([]);
        useStore.setState({ isSearchLoading: true });

        if (!isHomePage && !pathname?.includes('/catalog')) {
            router.push(`/${language}`);
        }

        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            setLensImagePreview(dataUrl);

            const img = new window.Image();
            img.onload = async () => {
                try {
                    // Rasmni client tomonda 1024px gacha siqish
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
                    if (ctx) {
                        ctx.drawImage(img, 0, 0, width, height);
                    }
                    const compressedBase64 = canvas.toDataURL("image/jpeg", 0.8);

                    const res = await fetch("/api/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ image: compressedBase64, limit: 50 })
                    });
                    const data = await res.json();
                    
                    if (data.results && data.results.length > 0) {
                        setLensResults(data.results);
                        setSearchResults(data.results, data.facets || null, null, false);
                        // Qidiruv satrini matn bilan to'ldirmaymiz, toza saqlaymiz
                        setStoreGlobalQuery("");
                        setSearch("");
                        if (!isHomePage && !pathname?.includes('/catalog')) {
                            router.push(`/${language}`);
                        }
                        setTimeout(() => {
                            const el = document.getElementById("search-results");
                            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                        }, 400);
                    } else {
                        setLensResults([]);
                        setSearchResults([], data.facets || null, null, false);
                        const msg = data.message || (language === "uz" ? "Rasm bo'yicha mahsulot aniqlanmadi" : "По фото товар не распознан");
                        showToast(msg, "error");
                    }
                } catch (err) {
                    console.error("Visual search error:", err);
                    showToast(language === "uz" ? "Rasm qidiruvida xatolik yuz berdi" : "Ошибка при поиске по фото", "error");
                } finally {
                    setIsVisualSearching(false);
                    setIsLensAnalyzing(false);
                    useStore.setState({ isSearchLoading: false });
                }
            };
            img.onerror = () => {
                setIsVisualSearching(false);
                setIsLensAnalyzing(false);
                useStore.setState({ isSearchLoading: false });
                showToast(language === "uz" ? "Rasmni o'qib bo'lmadi" : "Не удалось прочитать фото", "error");
            };
            img.src = dataUrl;
        };
        reader.onerror = () => {
            setIsVisualSearching(false);
            setIsLensAnalyzing(false);
            useStore.setState({ isSearchLoading: false });
        };
        reader.readAsDataURL(file);
    };

    const handleCropSearch = async (croppedBase64: string) => {
        setIsLensAnalyzing(true);
        useStore.setState({ isSearchLoading: true });
        try {
            const res = await fetch("/api/search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: croppedBase64, limit: 50 })
            });
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                setLensResults(data.results);
                setSearchResults(data.results, data.facets || null, null, false);
                setStoreGlobalQuery("");
                setSearch("");
                setTimeout(() => {
                    const el = document.getElementById("search-results");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 400);
            } else {
                setLensResults([]);
            }
        } catch (err) {
            console.error("Visual crop search error:", err);
        } finally {
            setIsLensAnalyzing(false);
            useStore.setState({ isSearchLoading: false });
        }
    };

    const handleSearch = async (e?: React.FormEvent, forceQuery?: string) => {
        if (e) e.preventDefault();
        const activeQuery = forceQuery || search;
        
        setShowSuggestions(false);
        // Enter bosilganda kutilayotgan suggest debounce/so'rov takror ishlamasin
        if (debounceTimer.current) { clearTimeout(debounceTimer.current); debounceTimer.current = null; }
        if (suggestAbortRef.current) { suggestAbortRef.current.abort(); suggestAbortRef.current = null; }
        if (!activeQuery.trim()) {
            setSearchResults(null);
            return;
        }

        try {
            localStorage.setItem("velari_last_search", activeQuery.trim());
        } catch {}

        // Katalogda to'liq qidiruvni CatalogClient o'zi (filtr/saralash bilan) bajaradi —
        // bu yerda ham so'rov yuborilsa bitta Enter'ga 2 ta qidiruv ketardi.
        if (isCatalogPage) {
            setStoreGlobalQuery(activeQuery.trim());
            return;
        }

        useStore.setState({ isSearchLoading: true });
        try {
            const res = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query: activeQuery, limit: 60 })
            });
            const data = res.ok ? await res.json() : { results: [], facets: null, didYouMean: null, isFallback: false };
            setSearchResults(data.results || [], data.facets || null, data.didYouMean || null, !!data.isFallback,
                { total: data.total ?? (data.results || []).length, hasMore: !!data.hasMore, page: 1, query: activeQuery.trim(), category: null });
            setStoreGlobalQuery(activeQuery);
            if (!isHomePage && !isCatalogPage) router.push(`/${language}`);
        } catch (err) {
            console.error("Semantic search failed", err);
        } finally {
            useStore.setState({ isSearchLoading: false });
        }
    };

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setSearch(val);
        
        if (!val.trim()) {
            setSuggestions([]);
            setShowSuggestions(false);
            setStoreGlobalQuery("");
            if (isCatalogPage) setSearchResults(null);
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
            if (suggestAbortRef.current) { suggestAbortRef.current.abort(); suggestAbortRef.current = null; }
            return;
        }

        setShowSuggestions(true);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        // Yozish paytida faqat yengil takliflar (suggest). To'liq qidiruv — faqat Enter/tugma bosilganda.
        debounceTimer.current = setTimeout(async () => {
            // Oldingi uchayotgan suggest so'rovini bekor qilamiz — aks holda eskirgan
            // (sekin) javob keyin kelib yangi natijani ustiga yozadi (dropdown miltillashi).
            if (suggestAbortRef.current) suggestAbortRef.current.abort();
            const controller = new AbortController();
            suggestAbortRef.current = controller;
            setIsSuggesting(true);
            try {
                const res = await fetch('/api/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: val, suggest: true }),
                    signal: controller.signal,
                });
                // Bu so'rov eskirgan bo'lsa — natijani qo'llamaymiz
                if (suggestAbortRef.current !== controller) return;
                const data = await res.json();
                if (data.results) setSuggestions(data.results);
            } catch (err) {
                if ((err as any)?.name === "AbortError") return; // bekor qilingan — sokin
                console.error("Live suggest failed: ", err);
            } finally {
                if (suggestAbortRef.current === controller) {
                    suggestAbortRef.current = null;
                    setIsSuggesting(false);
                }
            }
        }, 300);
    };

    const l = (path: string) => `/${language}${path === '/' ? '' : path}`;

    return (
        <>
            {/* Main Header - Top Fixed */}
            <header className={`fixed top-0 left-0 right-0 glass-surface z-[100] border-b border-[var(--glass-divider)] h-16 md:h-20 ${pathname?.includes('/admin') || pathname?.includes('/reels') ? 'hidden' : (isHomePage || isProductPage) ? 'hidden md:block' : 'block'}`}>
                <div className="max-w-[1600px] mx-auto h-full px-4 md:px-10 flex items-center gap-3 md:gap-10">
                    
                    <div className={`shrink-0 group ${isCatalogPage ? 'hidden md:block' : ''}`}>
                        <div className="md:hidden">
                            {!isCatalogPage && (
                                <Link
                                    href={l("/catalog")}
                                    onClick={() => videoPreWarmer.triggerHaptic("light")}
                                    className="ios-tap-feedback active:scale-95 transition-transform duration-150 flex items-center gap-2 bg-[#EAF3EC] px-4 py-2.5 rounded-xl outline-none will-change-transform"
                                >
                                    <LayoutGrid size={19} strokeWidth={2.2} className="text-[#2D6E3E]" />
                                    <span className="text-xs font-semibold text-[#2D6E3E]">Katalog</span>
                                </Link>
                            )}
                        </div>
                        <div className="hidden md:block">
                            <Link
                                href={l("/")}
                                onClick={() => videoPreWarmer.triggerHaptic("light")}
                                className="ios-tap-feedback active:scale-95 transition-transform duration-150 flex will-change-transform"
                            >
                                <Logo size="md" showSmile={false} className="!items-start" />
                            </Link>
                        </div>
                    </div>

                    {!isCatalogPage && (
                        <Link
                            href={l("/catalog")}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className="hidden lg:flex items-center gap-2.5 bg-[#2D6E3E] hover:bg-[#1F5A30] text-white px-5 py-2.5 rounded-[var(--radius-control)] active:scale-95 transition-transform duration-150 group shadow-md shadow-[#2D6E3E]/20 will-change-transform font-semibold text-xs uppercase tracking-wider"
                        >
                            <LayoutGrid size={18} strokeWidth={2.2} className="group-hover:rotate-90 transition-transform duration-300" />
                            <span>{language === 'uz' ? 'Katalog' : 'Каталог'}</span>
                        </Link>
                    )}

                    {/* Desktop Location Selector */}
                    <button
                        type="button"
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setIsLocationModalOpen(true);
                        }}
                        className="hidden md:flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-[#F5F9F6] hover:bg-[#EAF3EC] border border-gray-100 hover:border-[#2D6E3E]/20 transition-all text-left cursor-pointer shrink-0 active:scale-[0.98] select-none"
                        title={language === 'ru' ? 'Выбрать регион доставки' : 'Yetkazib berish hududini tanlash'}
                    >
                        <div className="w-7 h-7 rounded-xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center shrink-0">
                            <MapPin size={15} />
                        </div>
                        <div className="flex flex-col leading-tight">
                            <span className="text-[10px] text-gray-400 font-medium">
                                {language === 'ru' ? 'Доставка:' : 'Yetkazib berish:'}
                            </span>
                            <span className="text-xs font-bold text-[#111612] max-w-[110px] lg:max-w-[140px] truncate">
                                {currentRegionName}
                            </span>
                        </div>
                        <ChevronDown size={13} className="text-gray-400 ml-0.5" />
                    </button>

                    <form onSubmit={handleSearch} className={`flex-1 relative group ${isCatalogPage ? 'w-full' : 'max-w-2xl'}`}>
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="text-gray-400 group-focus-within:text-black transition-colors duration-150" size={17} />
                        </div>
                        <input
                            ref={inputRef}
                            type="search"
                            name="q"
                            enterKeyHint="search"
                            autoComplete="off"
                            aria-label={t.common.search}
                            placeholder={t.common.search}
                            value={search}
                            onChange={handleSearchChange}
                            onFocus={() => { if (search.trim()) setShowSuggestions(true); }}
                            className="w-full bg-[#F5F9F6] border-2 border-transparent rounded-xl md:rounded-2xl py-2.5 md:py-3.5 pl-10 md:pl-14 pr-20 md:pr-24 text-[13.5px] md:text-base font-bold placeholder:text-gray-400 focus:bg-white focus:border-[#2d6e3e]/30 focus:ring-4 focus:ring-[#2d6e3e]/5 outline-none transition-[background-color,border-color,box-shadow] duration-200 shadow-sm [&::-webkit-search-cancel-button]:appearance-none"
                        />
                        <div className="absolute inset-y-0 right-2 flex items-center gap-1 md:gap-2">
                            {search && (
                                <button
                                    type="button"
                                    onClick={() => { 
                                        videoPreWarmer.triggerHaptic("light");
                                        setSearch(""); 
                                        setSuggestions([]);
                                        setShowSuggestions(false);
                                        setSearchResults(null); 
                                        setStoreGlobalQuery("");
                                        if (debounceTimer.current) clearTimeout(debounceTimer.current);
                                    }}
                                    className="ios-icon-tap active:scale-85 transition-transform duration-150 p-2 text-gray-400 hover:text-black will-change-transform"
                                >
                                    <X size={18} />
                                </button>
                            )}

                            <button
                                type="submit"
                                aria-label={t.common.search}
                                onClick={() => videoPreWarmer.triggerHaptic("light")}
                                className={`ios-icon-tap active:scale-90 p-2 md:p-3 rounded-lg md:rounded-xl transition-transform duration-150 will-change-transform ${isSearchLoading ? 'velari-green-btn' : 'text-gray-400 hover:text-[#2d6e3e] hover:bg-white shadow-sm'}`}
                            >
                                {isSearchLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={20} />}
                            </button>
                        </div>

                        {/* Live Suggestions Dropdown */}
                        {showSuggestions && (search.trim().length > 0) && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-[120] animate-in fade-in slide-in-from-top-2 duration-200">
                                {isSuggesting ? (
                                    <div className="flex items-center justify-center p-6 bg-gray-50/50">
                                        <Loader2 size={24} className="animate-spin text-black/20" />
                                    </div>
                                ) : suggestions.length > 0 ? (
                                    <div className="flex flex-col max-h-[60vh] overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>
                                        {suggestions.map((item, idx) => (
                                            <Link 
                                                key={item.id} 
                                                href={`/${language}/products/${getProductSlug(item, language)}`}
                                                onClick={() => { 
                                                    videoPreWarmer.triggerHaptic("light");
                                                    setShowSuggestions(false); 
                                                    if (search.trim().length >= 2) {
                                                        fetch('/api/analytics/search-click', { method: 'POST', body: JSON.stringify({ productId: item.id, query: search.trim() }) }).catch(e => console.error("Click track error", e));
                                                    }
                                                }}
                                                className={`ios-tap-feedback active:scale-[0.99] flex items-center gap-4 p-3 hover:bg-gray-50 transition-colors duration-150 will-change-transform ${idx !== 0 ? 'border-t border-gray-50' : ''}`}
                                            >
                                                <div className="w-12 h-12 bg-gray-100 rounded-xl overflow-hidden shrink-0 relative">
                                                    <Image 
                                                        src={getOptimizedImageUrl(item.image_metadata, item.image || item.images?.[0], 'xs')} 
                                                        alt={item[`name_${language}`] || item.name} 
                                                        fill 
                                                        className="object-cover"
                                                    />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-xs font-semibold text-[#111612] truncate">{item[`name_${language}`] || item.name}</h4>
                                                    <p className="text-[11px] font-medium text-[#737D75] truncate">{item[`category_${language}`] || item.category}</p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-xs font-bold text-[#111612]">{item.price?.toLocaleString()} {language === 'uz' ? "so'm" : "сум"}</p>
                                                </div>
                                            </Link>
                                        ))}
                                        <button 
                                            type="button" 
                                            onClick={() => {
                                                videoPreWarmer.triggerHaptic("medium");
                                                handleSearch();
                                            }}
                                            className="ios-tap-feedback active:scale-[0.98] w-full p-3.5 bg-[#F5F7F5] hover:bg-[#EAF3EC] text-xs font-semibold text-[#111612] transition-[transform,colors] duration-150 will-change-transform rounded-b-[20px]"
                                        >
                                            {language === 'uz' ? "Barcha natijalarni ko'rish" : "Посмотреть все результаты"}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="p-6 text-center bg-gray-50/50">
                                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{language === 'uz' ? 'Hech narsa topilmadi' : 'Ничего не найдено'}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </form>

                    <div className="hidden md:flex items-center gap-2 md:gap-6 shrink-0 h-full">
                        <Link
                            href={l("/reels")}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className={`ios-icon-tap active:scale-95 flex flex-col items-center gap-1 group transition-colors duration-150 will-change-transform ${pathname === l('/reels') ? 'text-black' : 'text-gray-400 hover:text-black'}`}
                        >
                            <div className="relative p-2 rounded-xl group-hover:bg-gray-50 transition-colors duration-150">
                                <Clapperboard size={22} strokeWidth={pathname === l('/reels') ? 3 : 2} className="group-hover:scale-110 group-hover:-rotate-12 group-hover:text-black transition-transform duration-200" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-tighter hidden xl:block">{t.nav.reels}</span>
                        </Link>

                        <Link
                            href={l("/blog")}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className={`ios-icon-tap active:scale-95 flex flex-col items-center gap-1 group transition-colors duration-150 will-change-transform ${pathname === l('/blog') ? 'text-black' : 'text-gray-400 hover:text-black'}`}
                        >
                            <div className="relative p-2 rounded-xl group-hover:bg-gray-50 transition-colors duration-150">
                                <BookOpen size={22} strokeWidth={pathname === l('/blog') ? 3 : 2} className="group-hover:scale-110 group-hover:text-black transition-transform duration-200" />
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-tighter hidden xl:block">{t.nav.blog}</span>
                        </Link>

                        <Link
                            href={l("/wishlist")} prefetch={false}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className={`ios-icon-tap active:scale-95 flex flex-col items-center gap-1 group transition-colors duration-150 will-change-transform ${pathname === l('/wishlist') ? 'text-black' : 'text-gray-400 hover:text-black'}`}
                        >
                            <div className="p-2 rounded-xl group-hover:bg-gray-50 relative transition-colors duration-150">
                                <Heart size={22} fill={wishlist.length > 0 ? "black" : "none"} strokeWidth={pathname === l('/wishlist') ? 3 : 2} className="transition-transform duration-200 group-hover:scale-125" />
                                {wishlist.length > 0 && <span className="absolute top-1 right-1 bg-red-600 text-white text-[8px] font-black w-4 h-4 flex items-center justify-center rounded-full border border-white">{wishlist.length}</span>}
                            </div>
                            <span className="text-[9px] font-black uppercase tracking-tighter hidden xl:block">{language === 'uz' ? 'Kutubxonam' : 'Избранное'}</span>
                        </Link>

                        <div className="pl-4 md:pl-6 border-l border-gray-100 items-center gap-4 hidden lg:flex">
                            {user ? (
                                <Link
                                    href={l("/account")}
                                    onClick={() => videoPreWarmer.triggerHaptic("light")}
                                    className={`ios-tap-feedback active:scale-95 flex items-center gap-3 bg-[#F2F3F5] hover:bg-black hover:text-white px-6 py-3.5 rounded-2xl transition-colors duration-150 group shadow-sm hover:shadow-xl will-change-transform ${pathname?.includes('/account') ? 'bg-black text-white' : ''}`}
                                >
                                    <User size={18} className="group-hover:scale-110 transition-transform duration-200" />
                                    <span className="text-[10px] font-black uppercase tracking-widest hidden xl:block">{t.nav.profile}</span>
                                </Link>
                            ) : (
                                <Link
                                    href={l("/login")} prefetch={false}
                                    onClick={() => videoPreWarmer.triggerHaptic("light")}
                                    className="ios-tap-feedback active:scale-95 bg-[#F2F3F5] hover:bg-black hover:text-white px-8 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] transition-colors duration-150 shadow-sm hover:shadow-xl will-change-transform"
                                >
                                    {language === 'uz' ? 'Kirish' : 'Войти'}
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Velari — Floating Liquid Glass Bottom Tab Bar */}
            {!pathname?.includes('/admin') && !isProductPage && (() => {
                const isReels = !!pathname?.includes('/reels');
                const tabs = [
                    { 
                        href: l("/"), 
                        label: t.nav.home, 
                        active: isHomePage, 
                        icon: (on: boolean) => <Home size={22} strokeWidth={on ? 2.4 : 1.8} /> 
                    },
                    { 
                        href: l("/catalog"), 
                        label: language === 'uz' ? 'Katalog' : 'Каталог', 
                        active: pathname === l("/catalog") || pathname?.startsWith(l("/catalog/")), 
                        icon: (on: boolean) => <LayoutGrid size={22} strokeWidth={on ? 2.4 : 1.8} /> 
                    },
                    { 
                        href: l("/wishlist"), 
                        label: language === 'uz' ? 'Kutubxonam' : 'Избранное', 
                        active: pathname === l("/wishlist"), 
                        badge: wishlist.length > 0 ? wishlist.length : undefined, 
                        icon: (on: boolean) => <Heart size={22} fill={on ? "currentColor" : "none"} strokeWidth={on ? 2.4 : 1.8} /> 
                    },
                    { 
                        href: l("/messages"), 
                        label: language === 'uz' ? 'Xabarlar' : 'Чаты', 
                        active: pathname === l("/messages") || pathname?.startsWith(l("/messages/")), 
                        icon: (on: boolean) => <MessageSquare size={22} strokeWidth={on ? 2.4 : 1.8} /> 
                    },
                    { 
                        href: user ? l("/account") : l("/login"), 
                        label: t.nav.profile, 
                        active: !!pathname?.includes("/account") || (!user && !!pathname?.includes("/login")), 
                        icon: (on: boolean) => <User size={22} strokeWidth={on ? 2.4 : 1.8} /> 
                    },
                ];
                const currentPathIndex = tabs.findIndex(tab => tab.active);
                const activeIndex = navOptimisticIndex !== null ? navOptimisticIndex : currentPathIndex;

                return (
                    <nav
                        className="flex md:hidden fixed bottom-2 left-3 right-3 max-w-lg mx-auto z-[110] rounded-[26px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] border select-none"
                        style={{
                            background: isReels ? "rgba(18, 18, 18, 0.88)" : "rgba(255, 255, 255, 0.82)",
                            backdropFilter: "blur(24px) saturate(180%)",
                            WebkitBackdropFilter: "blur(24px) saturate(180%)",
                            borderColor: isReels ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.72)",
                            paddingBottom: "max(env(safe-area-inset-bottom, 6px), 6px)",
                            paddingTop: 6,
                            paddingLeft: 4,
                            paddingRight: 4,
                            justifyContent: "space-around",
                            alignItems: "center",
                        }}
                    >
                        {/* Velari — Hardware-Accelerated Sliding Pill Active Indicator */}
                        {activeIndex >= 0 && (
                            <div
                                aria-hidden="true"
                                className="absolute pointer-events-none transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] will-change-transform z-0"
                                style={{
                                    top: 6,
                                    bottom: "max(env(safe-area-inset-bottom, 6px), 6px)",
                                    left: 4,
                                    width: "calc((100% - 8px) / 5)",
                                    transform: `translateX(${activeIndex * 100}%)`,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <div
                                    className={`w-[60px] h-[44px] rounded-full transition-colors duration-200 ${
                                        isReels 
                                            ? "bg-white/20 shadow-sm" 
                                            : "bg-[#EAF3EC] shadow-[0_2px_8px_rgba(45,110,62,0.12)]"
                                    }`}
                                />
                            </div>
                        )}

                        {tabs.map((tab, idx) => {
                            const isActive = activeIndex === idx;
                            return (
                                <Link
                                    key={tab.href}
                                    href={tab.href}
                                    // Shaxsiy sahifalar (savat, xabarlar, login/kabinet) oldindan yuklanmaydi — 1-ekran trafigi kamayadi
                                    prefetch={tab.href === l("/") || tab.href === l("/catalog") ? undefined : false}
                                    onClick={() => {
                                        setNavOptimisticIndex(idx);
                                        videoPreWarmer.triggerHaptic("selection");
                                    }}
                                    className="ios-icon-tap active:scale-90 transition-transform duration-150 ease-out will-change-transform"
                                    style={{
                                        flex: 1,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        textDecoration: "none",
                                        WebkitTapHighlightColor: "transparent",
                                        position: "relative",
                                        zIndex: 1,
                                    }}
                                >
                                    <div
                                        className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-full transition-colors duration-200 ${
                                            isActive 
                                                ? (isReels ? "text-white" : "text-[#2D6E3E]")
                                                : (isReels ? "text-white/60" : "text-[#737D75]")
                                        }`}
                                    >
                                        <div className="relative">
                                            {tab.icon(isActive)}
                                            {(tab.badge ?? 0) > 0 && (
                                                <div 
                                                    className="absolute -top-1 -right-2.5 min-w-[17px] h-[17px] px-1 rounded-full bg-[#FF3B30] text-white text-[10px] font-bold flex items-center justify-center border-2 border-white shadow-sm"
                                                    style={{ animation: "velari-badge-pop 360ms cubic-bezier(0.34,1.56,0.64,1)" }}
                                                >
                                                    {tab.badge}
                                                </div>
                                            )}
                                        </div>
                                        <span 
                                            className="text-[10px] tracking-tight transition-all duration-200"
                                            style={{ lineHeight: 1.1, fontWeight: isActive ? 700 : 500 }}
                                        >
                                            {tab.label}
                                        </span>
                                    </div>
                                </Link>
                            );
                        })}
                    </nav>
                );
            })()}

            {/* Google Lens uslubidagi vizual qidiruv modal oynasi */}
            {(isLensModalOpen || lensImagePreview) && <VisualSearchModal
                isOpen={isLensModalOpen}
                onClose={() => setIsLensModalOpen(false)}
                imagePreview={lensImagePreview}
                isAnalyzing={isLensAnalyzing}
                results={lensResults}
                language={language as "uz" | "ru"}
                onChangePhoto={() => fileInputRef.current?.click()}
                onCropSearch={handleCropSearch}
                onViewResults={() => {
                    setIsLensModalOpen(false);
                    if (!isHomePage && !pathname?.includes('/catalog')) {
                        router.push(`/${language}`);
                    }
                    setTimeout(() => {
                        const el = document.getElementById("search-results");
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                    }, 150);
                }}
            />}

            <LocationSelectModal
                isOpen={isLocationModalOpen}
                onClose={() => setIsLocationModalOpen(false)}
            />
        </>
    );
}
