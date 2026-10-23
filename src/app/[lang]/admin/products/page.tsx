"use client";

import { useStore } from "@/store/store";
import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { adminFrom } from "@/lib/admin-query";
import { adminInsert } from "@/lib/admin-api";
import { mapProduct } from "@/lib/mappers";
import { makeVariantLoader, hasVariants } from "@/lib/imageVariants";
import {
    LayoutGrid,
    List,
    Plus,
    Search,
    Trash2,
    Edit,
    ChevronDown,
    Loader2,
    Package,
    AlertCircle,
    X,
    Image as ImageIcon,
    FileSpreadsheet,
    Download,
    ChevronLeft,
    ChevronRight,
    Video,
    DollarSign,
    Sparkles,
    SlidersHorizontal,
    ExternalLink,
    Copy,
    Eye,
    TrendingUp,
    Percent,
    CheckCircle2,
    Wand2,
    Globe,
    Tag,
    Layers,
    Check
} from "lucide-react";
import ProductParamsEditor, { ParamValue } from "@/components/admin/ProductParamsEditor";
import AdminTooltip from "@/components/admin/AdminTooltip";
import { normalizeQuery, transliterateLatin } from "@/lib/query-normalize";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { getProductSlug } from "@/lib/slugify";

interface Category {
    id: string;
    label: string;
}

interface DBCategory {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    parent_id?: string;
    is_deleted?: boolean;
}

interface Product {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    price: number;
    oldPrice?: number;
    category: string;
    category_uz?: string;
    category_ru?: string;
    stock: number;
    image: string; // Primary thumbnail
    images: string[]; // All images array
    description: string;
    description_uz?: string;
    description_ru?: string;
    tag?: string;
    sku: string;
    groupId?: string;
    colorName?: string;
    sales?: number;
    isDeleted?: boolean;
    article?: string;
    isOriginal?: boolean;
    // UI temporary field
    images_string?: string;
    brand?: string;
    height?: string;
    width?: string;
    length?: string;
    weight?: string;
    barcode?: string;
    videoUrl?: string;
    cashback_type?: "global" | "percent" | "fixed";
    cashback_value?: number;
    model?: string;
    image_metadata?: Record<string, { alt_uz?: string; alt_ru?: string; blurDataURL?: string; lowResUrl?: string }>;
    comm_seller?: number;
    comm_tm?: number;
    comm_manager?: number;
    cost_price?: number;
    additional_expenses?: number;
}

import { uploadToYandexS3, uploadAdminToYandexS3, uploadFromUrlToYandexS3 } from "@/lib/yandex-s3";

// Ro'yxat uchun ustunlar: embedding / image_embedding (har biri JSON'da ~15 KB), embedding_hash,
// ai_persona, tavsiflar YO'Q. Tahrirlash/Moomkin to'liq mahsulotni alohida oladi (loadFullProduct).
const ADMIN_LIST_COLUMNS = "id,name,name_uz,name_ru,image,images,image_metadata,price,old_price,cost_price,stock,stock_details,category_id,brand_id,article,sku,model,barcode,sales,is_original,is_deleted,created_at,group_id,color_name,video_url,express_delivery,avg_rating,review_count";

function AdminProducts() {
    const params = useParams();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const lang = params?.lang || "uz";
    const [isStateInitialized, setIsStateInitialized] = useState(false);
    const [view, setView] = useState<"grid" | "list">("grid");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    // loading: birinchi yuklash (ro'yxat hali yo'q); listLoading: yangilash (eski ro'yxat ko'rinib turadi)
    const [loading, setLoading] = useState(true);
    const [listLoading, setListLoading] = useState(false);
    const [listError, setListError] = useState<string | null>(null);
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const listReqRef = useRef(0);
    const listAbortRef = useRef<AbortController | null>(null);
    const listKeyRef = useRef<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isActionLoading, setIsActionLoading] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [activeTab, setActiveTab] = useState<"active" | "trash">("active");
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [importLog, setImportLog] = useState<string[]>([]);
    const [rawCategories, setRawCategories] = useState<DBCategory[]>([]);
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [itemsPerPage, setItemsPerPage] = useState(20);
    const [categoryLabels, setCategoryLabels] = useState<{ [key: string]: string }>({});
    const [productSelectionPath, setProductSelectionPath] = useState<string[]>([]);
    const [aiStatus, setAiStatus] = useState<Record<string, { processed: number, total: number, active: boolean }>>({});
    const [brands, setBrands] = useState<{ id: string; name: string; productCount?: number }[]>([]);
    const [brandLabels, setBrandLabels] = useState<{ [key: string]: string }>({});
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
    const [paramValues, setParamValues] = useState<ParamValue[]>([]);

    // Moomkin.uz integratsiya state'lari
    const [moomkinRegistry, setMoomkinRegistry] = useState<Record<string, { moomkin_id: number; price: number; name_uz: string; name_ru: string }>>({});
    const [moomkinIntegrating, setMoomkinIntegrating] = useState<string | null>(null);
    const [moomkinModal, setMoomkinModal] = useState<{ supabase_id: string; moomkin_id: number; product: Product } | null>(null);
    const [moomkinModalData, setMoomkinModalData] = useState<any>(null);
    const [moomkinModalLoading, setMoomkinModalLoading] = useState(false);
    const [moomkinModalSaving, setMoomkinModalSaving] = useState(false);
    const [moomkinEditFields, setMoomkinEditFields] = useState<{ price?: number; name_uz?: string; name_ru?: string; description_uz?: string; description_ru?: string }>({});

    // Filtrlar (admin) — har qanday parametr bo'yicha
    const [filterCategory, setFilterCategory] = useState<string>("");
    const [filterBrand, setFilterBrand] = useState<string>("");
    const [filterStock, setFilterStock] = useState<"all" | "in" | "out">("all");
    const [filterPriceMin, setFilterPriceMin] = useState<string>("");
    const [filterPriceMax, setFilterPriceMax] = useState<string>("");
    const [filterOriginal, setFilterOriginal] = useState<"all" | "yes" | "no">("all");
    const [filterDiscount, setFilterDiscount] = useState<boolean>(false);
    const [sortBy, setSortBy] = useState<"new" | "old" | "price_asc" | "price_desc" | "name" | "stock_desc" | "sales_desc">("new");
    const [showFilters, setShowFilters] = useState(false);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, isGallery = false) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const { url, blurDataURL, lowResUrl, xs, md, lg } = await uploadToYandexS3(file);

            if (isGallery) {
                setNewProduct(prev => ({
                    ...prev,
                    images: [...(prev.images || []), url],
                    images_string: prev.images_string ? `${prev.images_string};${url}` : url,
                    image_metadata: {
                        ...(prev.image_metadata || {}),
                        [url]: {
                            ...(prev.image_metadata?.[url] || {}),
                            blurDataURL,
                            lowResUrl,
                            xs, md, lg,
                        }
                    }

                }));
            } else {
                setNewProduct(prev => ({
                    ...prev,
                    image: url,
                    images: prev.images?.length ? prev.images : [url],
                    image_metadata: {
                        ...(prev.image_metadata || {}),
                        [url]: {
                            ...(prev.image_metadata?.[url] || {}),
                            blurDataURL,
                            lowResUrl,
                            xs, md, lg,
                        }

                    }
                }));
            }
        } catch (error: any) {
            console.error("Upload failed:", error);
            alert("Rasm yuklashda xatolik: " + (error.message || "Noma'lum xato"));
        } finally {
            setIsUploading(false);
        }
    };

    const extractVideoThumbnailAndInfo = (file: File): Promise<{
        thumbnailBlob: Blob | null;
        width: number;
        height: number;
        duration: number;
    }> => {
        return new Promise((resolve) => {
            const video = document.createElement("video");
            video.preload = "metadata";
            video.muted = true;
            video.playsInline = true;

            const objectUrl = URL.createObjectURL(file);
            video.src = objectUrl;

            const cleanup = () => {
                try { URL.revokeObjectURL(objectUrl); } catch {}
            };

            const timeout = setTimeout(() => {
                cleanup();
                resolve({ thumbnailBlob: null, width: 0, height: 0, duration: 0 });
            }, 8000);

            video.onloadedmetadata = () => {
                const duration = video.duration || 0;
                video.currentTime = Math.min(0.5, Math.max(0, duration / 2));
            };

            video.onseeked = () => {
                clearTimeout(timeout);
                try {
                    const canvas = document.createElement("canvas");
                    const maxDim = 1080;
                    let w = video.videoWidth || 720;
                    let h = video.videoHeight || 1280;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round((h * maxDim) / w);
                            w = maxDim;
                        } else {
                            w = Math.round((w * maxDim) / h);
                            h = maxDim;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        canvas.toBlob(
                            (blob) => {
                                cleanup();
                                resolve({
                                    thumbnailBlob: blob,
                                    width: video.videoWidth,
                                    height: video.videoHeight,
                                    duration: video.duration,
                                });
                            },
                            "image/webp",
                            0.82
                        );
                        return;
                    }
                } catch (err) {
                    console.warn("Canvas thumbnail extraction error:", err);
                }
                cleanup();
                resolve({
                    thumbnailBlob: null,
                    width: video.videoWidth,
                    height: video.videoHeight,
                    duration: video.duration,
                });
            };

            video.onerror = () => {
                clearTimeout(timeout);
                cleanup();
                resolve({ thumbnailBlob: null, width: 0, height: 0, duration: 0 });
            };
        });
    };

    const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Video format tekshiruvi (faqat video fayllar)
        const validExts = ["mp4", "webm", "mov", "m4v"];
        const ext = file.name.split(".").pop()?.toLowerCase() || "";
        if (!file.type.startsWith("video/") && !validExts.includes(ext)) {
            alert("Iltimos, faqat video fayl yuklang (MP4, WebM, MOV)");
            return;
        }

        // 300MB limit tekshiruvi
        if (file.size > 300 * 1024 * 1024) {
            alert("Video hajmi juda katta! Maksimal hajm: 300 MB.");
            return;
        }

        setIsUploading(true);
        try {
            // 1. Videodan metadata va avtomatik WebP poster olish
            const { thumbnailBlob, width, height } = await extractVideoThumbnailAndInfo(file);

            if (width >= 3840 || height >= 3840) {
                alert("Diqqat: Siz 4K formatdagi og'ir video yuklamoqdasiz. Mobil foydalanuvchilar qotmasligi uchun 1080p yoki 720p tavsiya etiladi.");
            }

            // 2. Agar mahsulotda asosiy rasm bo'lmasa, videodan olingan posterni avtomatik yuklaymiz
            let autoPosterUrl = "";
            let posterMeta: any = undefined;
            if (thumbnailBlob && (!newProduct.image || newProduct.image.length === 0)) {
                try {
                    const posterFile = new File([thumbnailBlob], `poster_${Date.now()}.webp`, { type: "image/webp" });
                    const posterRes = await uploadAdminToYandexS3(posterFile);
                    autoPosterUrl = posterRes.url;
                    posterMeta = {
                        [posterRes.url]: {
                            lowResUrl: posterRes.lowResUrl,
                            xs: posterRes.xs,
                            md: posterRes.md,
                            lg: posterRes.lg,
                            blurDataURL: posterRes.blurDataURL
                        }
                    };
                } catch (pErr) {
                    console.warn("Auto-poster upload skipped:", pErr);
                }
            }

            // 3. Videoning o'zini Yandex S3 ga yuklash (300 MB limit)
            const { url } = await uploadAdminToYandexS3(file);

            setNewProduct(prev => ({
                ...prev,
                videoUrl: url,
                ...(autoPosterUrl ? {
                    image: autoPosterUrl,
                    images: prev.images && prev.images.length > 0 ? prev.images : [autoPosterUrl],
                    image_metadata: { ...(prev.image_metadata || {}), ...posterMeta }
                } : {})
            }));
        } catch (error: any) {
            console.error("Video upload failed:", error);
            alert("Video yuklashda xatolik: " + (error.message || "Noma'lum xato"));
        } finally {
            setIsUploading(false);
        }
    };

    const [newProduct, setNewProduct] = useState<Partial<Product>>({
        name: "",
        name_uz: "",
        name_ru: "",
        price: 0,
        oldPrice: 0,
        category: "",
        image: "",
        images: [],
        description: "",
        description_uz: "",
        description_ru: "",
        tag: "",
        sku: "",
        groupId: "",
        colorName: "",
        article: "",
        isDeleted: false,
        isOriginal: false,
        images_string: "",
        brand: "",
        height: "",
        width: "",
        length: "",
        weight: "",
        barcode: "",
        videoUrl: "",
        cashback_type: "global",
        cashback_value: 0,
        model: "",
        comm_seller: 0,
        comm_tm: 0,
        comm_manager: 0,
        cost_price: 0,
        additional_expenses: 0
    });

    const [draggedImgIdx, setDraggedImgIdx] = useState<number | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [refiningField, setRefiningField] = useState<{ field: 'uz' | 'ru'; mode: string } | null>(null);

    const handleRefineText = async (field: 'uz' | 'ru', mode: 'enhance' | 'bullets' | 'fix_grammar') => {
        const text = field === 'uz' ? (newProduct.description_uz || newProduct.description || '') : (newProduct.description_ru || '');
        if (!text.trim()) {
            alert(field === 'uz' ? "Avval o'zbekcha tavsif matnini kiriting!" : "Сначала введите текст описания на русском!");
            return;
        }

        setRefiningField({ field, mode });
        try {
            const res = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "refine_text",
                    context: {
                        text,
                        mode,
                        lang: field,
                        productName: field === 'uz' ? (newProduct.name_uz || newProduct.name) : (newProduct.name_ru || newProduct.name)
                    }
                })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            const resultText = data.result || data.content;
            if (typeof resultText === 'string' && resultText.trim()) {
                if (field === 'uz') {
                    setNewProduct(prev => ({ ...prev, description_uz: resultText.trim(), description: resultText.trim() }));
                } else {
                    setNewProduct(prev => ({ ...prev, description_ru: resultText.trim() }));
                }
            }
        } catch (err: any) {
            console.error("Refine text failed:", err);
            alert("AI tahrirlashda xatolik: " + err.message);
        } finally {
            setRefiningField(null);
        }
    };

    const handleCloneProduct = () => {
        if (!newProduct.name && !newProduct.name_uz) return;
        const clonedSku = newProduct.sku ? `${newProduct.sku}-NUSXA` : `SKU-${Date.now().toString().slice(-4)}`;
        const newArt = generateArticle();
        setNewProduct(prev => ({
            ...prev,
            id: undefined,
            name: `${prev.name_uz || prev.name} (Nusxa)`,
            name_uz: prev.name_uz ? `${prev.name_uz} (Nusxa)` : "",
            name_ru: prev.name_ru ? `${prev.name_ru} (Копия)` : "",
            sku: clonedSku,
            article: newArt,
        }));
        alert("✅ Yangi mahsulot nusxasi yaratildi! Kerakli maydonlarni tahrirlab 'Saqlash' tugmasini bosing.");
    };

    // 1. Initial State Restoration from URL SearchParams or sessionStorage
    useEffect(() => {
        let saved: any = {};
        try {
            const sessionData = sessionStorage.getItem("admin_products_state");
            if (sessionData) saved = JSON.parse(sessionData);
        } catch {}

        const getParam = (key: string, fallback: string = "") => {
            return searchParams?.get(key) ?? saved[key] ?? fallback;
        };

        const sTerm = getParam("search", "");
        const fCat = getParam("category", "");
        const fBrand = getParam("brand", "");
        const fStock = getParam("stock", "all") as any;
        const fPMin = getParam("priceMin", "");
        const fPMax = getParam("priceMax", "");
        const fOrig = getParam("original", "all") as any;
        const fDisc = getParam("discount", "false") === "true";
        const sBy = getParam("sortBy", "new") as any;
        const sFilters = getParam("showFilters", "false") === "true";
        const vMode = getParam("view", "grid") as any;
        const aTab = getParam("tab", "active") as any;
        const pNum = Number(getParam("page", "1")) || 1;

        if (sTerm) { setSearchTerm(sTerm); setDebouncedSearch(sTerm); }
        if (fCat) setFilterCategory(fCat);
        if (fBrand) setFilterBrand(fBrand);
        if (fStock) setFilterStock(fStock);
        if (fPMin) setFilterPriceMin(fPMin);
        if (fPMax) setFilterPriceMax(fPMax);
        if (fOrig) setFilterOriginal(fOrig);
        if (fDisc) setFilterDiscount(fDisc);
        if (sBy) setSortBy(sBy);
        if (sFilters || fCat || fBrand || fStock !== "all" || fPMin || fPMax || fOrig !== "all" || fDisc) setShowFilters(true);
        if (vMode) setView(vMode);
        if (aTab) setActiveTab(aTab);
        if (pNum) setCurrentPage(pNum);

        setIsStateInitialized(true);
    }, []);

    // 2. URL SearchParams & sessionStorage sync when state changes
    useEffect(() => {
        if (!isStateInitialized) return;

        const paramsObj: Record<string, string> = {};
        if (searchTerm) paramsObj.search = searchTerm;
        if (filterCategory) paramsObj.category = filterCategory;
        if (filterBrand) paramsObj.brand = filterBrand;
        if (filterStock !== "all") paramsObj.stock = filterStock;
        if (filterPriceMin) paramsObj.priceMin = filterPriceMin;
        if (filterPriceMax) paramsObj.priceMax = filterPriceMax;
        if (filterOriginal !== "all") paramsObj.original = filterOriginal;
        if (filterDiscount) paramsObj.discount = "true";
        if (sortBy !== "new") paramsObj.sortBy = sortBy;
        if (showFilters) paramsObj.showFilters = "true";
        if (view !== "grid") paramsObj.view = view;
        if (activeTab !== "active") paramsObj.tab = activeTab;
        if (currentPage > 1) paramsObj.page = String(currentPage);

        try {
            sessionStorage.setItem("admin_products_state", JSON.stringify(paramsObj));
        } catch {}

        const queryStr = new URLSearchParams(paramsObj).toString();
        const newUrl = queryStr ? `${pathname}?${queryStr}` : pathname;
        window.history.replaceState(null, "", newUrl);
    }, [
        searchTerm, filterCategory, filterBrand, filterStock, filterPriceMin,
        filterPriceMax, filterOriginal, filterDiscount, sortBy, showFilters,
        view, activeTab, currentPage, isStateInitialized, pathname
    ]);

    // 3a. Qidiruv matni — 400 ms debounce (har harfga so'rov ketmasin)
    useEffect(() => {
        if (!isStateInitialized) return;
        const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
        return () => clearTimeout(t);
    }, [searchTerm, isStateInitialized]);

    // 3b. YAGONA yuklash oqimi: bitta o'zgarishga bitta so'rov.
    // Qidiruv/filtr/saralash/tab o'zgarsa va sahifa 1 bo'lmasa — avval sahifa 1 ga o'tiladi,
    // so'rov keyingi renderda (sahifa=1) bitta marta ketadi.
    useEffect(() => {
        if (!isStateInitialized) return;
        const key = JSON.stringify([debouncedSearch, filterCategory, filterBrand, filterStock, filterPriceMin,
            filterPriceMax, filterOriginal, filterDiscount, sortBy, activeTab, itemsPerPage]);
        const changed = listKeyRef.current !== null && listKeyRef.current !== key;
        listKeyRef.current = key;
        if (changed && currentPage !== 1) { setCurrentPage(1); return; }
        fetchData(currentPage);
    }, [
        debouncedSearch, filterCategory, filterBrand, filterStock, filterPriceMin, filterPriceMax,
        filterOriginal, filterDiscount, sortBy, activeTab, itemsPerPage, currentPage, isStateInitialized
    ]);

    // 3c. Kategoriya va brendlar — bir marta
    useEffect(() => { loadCategoriesAndBrands(); }, []);

    // 4. Moomkin.uz Registry yuklash
    useEffect(() => {
        fetch("/api/moomkin?action=registry")
            .then(r => r.ok ? r.json() : {})
            .then(data => setMoomkinRegistry(data || {}))
            .catch(() => {});
    }, []);

    // Kategoriya + barcha ichki (rekursiv) kategoriya ID'lari — filtr uchun
    const getCategoryWithChildren = (catId: string): string[] => {
        const ids = [catId];
        const children = rawCategories.filter((c: DBCategory) => c.parent_id === catId);
        for (const child of children) ids.push(...getCategoryWithChildren(child.id));
        return ids;
    };

    const clearFilters = () => {
        setFilterCategory(""); setFilterBrand(""); setFilterStock("all");
        setFilterPriceMin(""); setFilterPriceMax(""); setFilterOriginal("all");
        setFilterDiscount(false); setSortBy("new"); setSearchTerm("");
        setCurrentPage(1);
        try { sessionStorage.removeItem("admin_products_state"); } catch {}
        window.history.replaceState(null, "", pathname);
    };

    const activeFilterCount = [
        filterCategory, filterBrand,
        filterStock !== "all" ? "1" : "",
        filterPriceMin, filterPriceMax,
        filterOriginal !== "all" ? "1" : "",
        filterDiscount ? "1" : "",
    ].filter(Boolean).length;

    const getPathForCategory = (catId: string): string[] => {
        const path: string[] = [];
        let curr = rawCategories.find((c: DBCategory) => c.id === catId);
        while (curr) {
            path.unshift(curr.id);
            const pId = curr.parent_id;
            curr = pId && pId !== "none" ? rawCategories.find((p: DBCategory) => p.id === pId) : undefined;
        }
        return path;
    };

    // Moomkin.uz: Yangi mahsulotni Moomkinga integratsiya qilish
    const handleMoomkinIntegrate = async (product: Product) => {
        setMoomkinIntegrating(product.id);
        try {
            const res = await fetch("/api/moomkin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "integrate",
                    supabase_id: product.id,
                    product: {
                        name_uz: product.name_uz || product.name,
                        name_ru: product.name_ru || product.name,
                        description_uz: product.description_uz || product.description || "",
                        description_ru: product.description_ru || "",
                        price: product.price,
                        category: product.category,
                        category_id: product.category,
                        images: product.images || (product.image ? [product.image] : []),
                        image: product.image,
                    },
                }),
            });
            const data = await res.json();
            if (data.success) {
                setMoomkinRegistry(prev => ({
                    ...prev,
                    [product.id]: {
                        moomkin_id: data.moomkin_id,
                        price: Math.round(product.price * 1.1),
                        name_uz: product.name_uz || product.name || "",
                        name_ru: product.name_ru || "",
                    },
                }));
                alert(`✅ Moomkinga muvaffaqiyatli yuklandi! ID: ${data.moomkin_id}${data.already_exists ? " (oldin yuklangan)" : ""}`);
            } else {
                alert("❌ Xatolik: " + (data.error || "Noma'lum xato"));
            }
        } catch (err: any) {
            alert("❌ Xatolik: " + err.message);
        } finally {
            setMoomkinIntegrating(null);
        }
    };

    // Moomkin.uz: Tahrirlash modalini ochish
    const openMoomkinModal = async (product: Product) => {
        const reg = moomkinRegistry[product.id];
        if (!reg) return;
        setMoomkinModal({ supabase_id: product.id, moomkin_id: reg.moomkin_id, product });
        setMoomkinEditFields({
            price: reg.price,
            name_uz: product.name_uz || product.name || "",
            name_ru: product.name_ru || "",
            description_uz: product.description_uz || product.description || "",
            description_ru: product.description_ru || "",
        });
        setMoomkinModalData(null);
        setMoomkinModalLoading(true);
        try {
            const res = await fetch(`/api/moomkin?action=product&id=${reg.moomkin_id}`);
            if (res.ok) {
                const data = await res.json();
                setMoomkinModalData(data);
                // Sync fields from live Moomkin data
                setMoomkinEditFields({
                    price: data.price || reg.price,
                    name_uz: data.name?.uz || product.name_uz || product.name || "",
                    name_ru: data.name?.ru || product.name_ru || "",
                    description_uz: data.description?.uz || product.description_uz || "",
                    description_ru: data.description?.ru || product.description_ru || "",
                });
            }
        } catch {}
        finally { setMoomkinModalLoading(false); }
    };

    // Moomkin.uz: O'zgarishlarni saqlash
    const handleMoomkinSave = async () => {
        if (!moomkinModal) return;
        setMoomkinModalSaving(true);
        try {
            const fieldsToUpdate: any = {};
            if (moomkinEditFields.price) fieldsToUpdate.price = moomkinEditFields.price;
            if (moomkinEditFields.name_uz || moomkinEditFields.name_ru) {
                fieldsToUpdate.name = {
                    uz: moomkinEditFields.name_uz || "",
                    ru: moomkinEditFields.name_ru || "",
                };
            }
            if (moomkinEditFields.description_uz || moomkinEditFields.description_ru) {
                fieldsToUpdate.description = {
                    uz: moomkinEditFields.description_uz || "",
                    ru: moomkinEditFields.description_ru || "",
                };
            }

            const res = await fetch("/api/moomkin", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update",
                    moomkin_id: moomkinModal.moomkin_id,
                    supabase_id: moomkinModal.supabase_id,
                    fields: fieldsToUpdate,
                }),
            });
            const data = await res.json();
            if (data.success) {
                if (moomkinEditFields.price) {
                    setMoomkinRegistry(prev => ({
                        ...prev,
                        [moomkinModal.supabase_id]: {
                            ...prev[moomkinModal.supabase_id],
                            price: moomkinEditFields.price!,
                        },
                    }));
                }
                alert("✅ Moomkin ma'lumotlari yangilandi!");
                setMoomkinModal(null);
            } else {
                alert("❌ Xatolik: " + (data.error || "Noma'lum xato"));
            }
        } catch (err: any) {
            alert("❌ Xatolik: " + err.message);
        } finally {
            setMoomkinModalSaving(false);
        }
    };

    const fetchData = async (page = 1, _isInitial = false) => {
        // Faqat ENG OXIRGI so'rov javobi qo'llanadi: oldingisi bekor qilinadi, kech kelgan javob tashlanadi
        const reqId = ++listReqRef.current;
        listAbortRef.current?.abort();
        const controller = new AbortController();
        listAbortRef.current = controller;
        setListLoading(true);
        setListError(null);
        try {
            const from = (page - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            let query = adminFrom("products")
                .select(ADMIN_LIST_COLUMNS, { count: "exact" });

            // Tab filter (Trash vs Active)
            query = query.eq("is_deleted", activeTab === "trash");

            // KUCHLI QIDIRUV (foydalanuvchidagidek, personalizatsiyasiz):
            // ko'p maydon (nom/SKU/tavsif/artikul/model/barkod), uz/ru aralash (translit),
            // qism-so'z ("pods" -> "airpods"), brend/sinonim normalizatsiya.
            const rawTerm = debouncedSearch.trim();
            if (rawTerm) {
                const fields = ["name", "name_uz", "name_ru", "sku", "description", "description_uz", "description_ru", "article", "model", "barcode"];
                const clean = (s: string) => (s || "").replace(/[,()"'%\\]/g, " ").trim();
                const tokens = clean(rawTerm).split(/\s+/).filter(Boolean);
                // Har token AND (chained .or), token ichida (maydon × variant) OR.
                for (const tok of tokens) {
                    const variants = Array.from(new Set([
                        tok,
                        transliterateLatin(tok),
                        normalizeQuery(tok).toLowerCase(),
                    ].map(clean).filter(Boolean)));
                    const orParts: string[] = [];
                    for (const v of variants) {
                        for (const f of fields) orParts.push(`${f}.ilike.%${v}%`);
                    }
                    if (orParts.length) query = query.or(orParts.join(","));
                }
            }

            // FILTRLAR — har qanday parametr bo'yicha
            if (filterCategory) {
                query = query.in("category_id", getCategoryWithChildren(filterCategory));
            }
            if (filterBrand) query = query.eq("brand_id", filterBrand);
            const pMin = Number(filterPriceMin), pMax = Number(filterPriceMax);
            if (filterPriceMin && !isNaN(pMin)) query = query.gte("price", pMin);
            if (filterPriceMax && !isNaN(pMax)) query = query.lte("price", pMax);
            if (filterStock === "in") query = query.gt("stock", 0);
            else if (filterStock === "out") query = query.lte("stock", 0);
            if (filterOriginal === "yes") query = query.eq("is_original", true);
            else if (filterOriginal === "no") query = query.eq("is_original", false);
            if (filterDiscount) query = query.gt("old_price", 0);

            // SARALASH
            const sortMap: Record<string, { col: string; asc: boolean }> = {
                new: { col: "created_at", asc: false },
                old: { col: "created_at", asc: true },
                price_asc: { col: "price", asc: true },
                price_desc: { col: "price", asc: false },
                name: { col: "name", asc: true },
                stock_desc: { col: "stock", asc: false },
                sales_desc: { col: "sales", asc: false },
            };
            const srt = sortMap[sortBy] || sortMap.new;

            const { data: pData, count, error: pError } = await query
                .order(srt.col, { ascending: srt.asc })
                .range(from, to)
                .abortSignal(controller.signal);

            if (reqId !== listReqRef.current || pError?.code === "ABORTED") return; // eskirgan so'rov
            if (pError) throw pError;

            setProducts((pData || []).map(mapProduct) as any);
            if (count !== null) setTotalCount(count);
        } catch (error: any) {
            if (reqId !== listReqRef.current) return;
            console.error("Error fetching products:", error);
            setListError(error?.message || "Mahsulotlarni yuklab bo'lmadi");
        } finally {
            if (reqId === listReqRef.current) {
                setListLoading(false);
                setLoading(false);
            }
        }
    };

    // Kategoriya va brendlar — sahifa ochilganda bir marta (ro'yxat so'rovidan alohida)
    const loadCategoriesAndBrands = async () => {
        try {
            {
                const [{ data: allCats }, { data: bList }] = await Promise.all([
                    supabase.from("categories").select("id, name, name_uz, name_ru, parent_id, is_deleted"),
                    supabase.from("brands").select("id, name").eq("is_deleted", false).order("name"),
                ]);

                if (allCats) {
                    setRawCategories(allCats);
                    const activeCats = allCats.filter((cat: any) => {
                        if (cat.is_deleted) return false;
                        const pId = cat.parent_id;
                        if (pId && pId !== "none") {
                            const parent = allCats.find((p: any) => p.id === pId);
                            if (!parent || parent.is_deleted) return false;
                        }
                        return true;
                    });

                    const getRecursiveLabel = (cat: DBCategory): string => {
                        const pId = cat.parent_id;
                        if (pId && pId !== "none") {
                            const parent = allCats.find((p: any) => p.id === pId);
                            if (parent) {
                                return `${getRecursiveLabel(parent)} > ${cat.name}`;
                            }
                        }
                        return cat.name;
                    };

                    const cData = activeCats.map((cat: any) => ({
                        id: cat.id,
                        label: getRecursiveLabel(cat)
                    }));

                    const labelsMap: { [key: string]: string } = {};
                    cData.forEach(c => { labelsMap[c.id] = c.label; });
                    setCategoryLabels(labelsMap);
                    setCategories(cData);
                }

                if (bList) {
                    setBrands(bList);
                    const bLabels: { [key: string]: string } = {};
                    bList.forEach(b => { bLabels[b.id] = b.name; });
                    setBrandLabels(bLabels);
                }
            }
        } catch (error) {
            console.error("Error fetching categories/brands:", error);
        }
    };

    // Tahrirlash / Moomkin uchun TO'LIQ mahsulot (ro'yxatda og'ir maydonlar yo'q — tavsif, komissiya va h.k.)
    const loadFullProduct = async (p: any): Promise<any> => {
        const { data, error } = await adminFrom("products").select("*").eq("id", p.id).single();
        if (error || !data) {
            alert("❌ Mahsulotni to'liq yuklab bo'lmadi: " + (error?.message || "topilmadi"));
            return null;
        }
        return mapProduct(data);
    };

    const openEditProduct = async (p: any) => {
        const full = await loadFullProduct(p);
        if (!full) return;
        const imagesStr = full.images ? full.images.join('; ') : full.image;
        setNewProduct({ ...full, images_string: imagesStr });
        setProductSelectionPath(getPathForCategory(full.category));
        setIsModalOpen(true);
    };

    const generateArticle = () => {
        const chars = "ABCDEFGHIJKLMNPQRSTUVWXYZ123456789";
        let result = "ART-";
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    };

    const downloadExcelTemplate = async () => {
        // Dynamically load XLSX from CDN
        const script = document.createElement("script");
        script.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
        script.onload = () => {
            const XLSX = (window as any).XLSX;

            // Sheet 1: Template Headers
            const data1 = [[
                "Nomi (UZ)*", "Nomi (RU)*", "Narxi*", "Eski Narxi", "Kategoriya ID*", "Rasm URL 1*", "Boshqa Rasmlar (nuqta-vergul bilan ajratilgan)", "Tavsif (UZ)", "Tavsif (RU)", "SKU", "Guruh ID", "Rang", "Brend ID", "Bar-kod", "Balandlik", "Kenglik", "Uzunlik", "Og'irlik (gr)", "Video URL", "Model"
            ]];
            const ws1 = XLSX.utils.aoa_to_sheet(data1);

            // Sheet 2: Category Map
            const data2 = [["ID", "Nomi (Ierarxiya)"]];
            categories.forEach(c => {
                data2.push([c.id, c.label]);
            });
            const ws2 = XLSX.utils.aoa_to_sheet(data2);

            // Sheet 3: Brand Map
            const data3 = [["ID", "Brend Nomi"]];
            brands.forEach(b => {
                data3.push([b.id, b.name]);
            });
            const ws3 = XLSX.utils.aoa_to_sheet(data3);

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws1, "Mahsulotlar");
            XLSX.utils.book_append_sheet(wb, ws2, "Kategoriyalar ID");
            XLSX.utils.book_append_sheet(wb, ws3, "Brendlar ID");

            XLSX.writeFile(wb, "mahsulotlar_shabloni.xlsx");
        };
        document.head.appendChild(script);
    };

    const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportLog(["Fayl o'qilmoqda..."]);

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                if (!(window as any).XLSX) {
                    await new Promise((resolve) => {
                        const script = document.createElement("script");
                        script.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
                        script.onload = resolve;
                        document.head.appendChild(script);
                    });
                }
                const XLSX = (window as any).XLSX;
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (data.length < 2) {
                    throw new Error("Fayl bo'sh yoki sarlavhalar noto'g'ri");
                }

                const rows = data.slice(1); // Skip headers
                const productsToInsert: any[] = [];
                let count = 0;

                for (const row of rows) {
                    if (!row[0]) continue; // Skip empty rows

                    const rawImages = row[6] ? String(row[6]).split(';').map(s => s.trim()).filter(s => s !== "") : [String(row[5])];

                    setImportLog(prev => [...prev, `${row[0]} rasmlari yuklanmoqda...`]);

                    const proxiedResults = await Promise.all(
                        rawImages.map(url => uploadFromUrlToYandexS3(url))
                    );

                    const proxiedImages = proxiedResults.map(r => r.url);
                    const localMeta: any = {};
                    proxiedResults.forEach(r => {
                        if (r.blurDataURL || r.lowResUrl || r.xs || r.md || r.lg) {
                            localMeta[r.url] = {
                                ...(r.blurDataURL && { blurDataURL: r.blurDataURL }),
                                ...(r.lowResUrl   && { lowResUrl:   r.lowResUrl   }),
                                ...(r.xs && { xs: r.xs }),
                                ...(r.md && { md: r.md }),
                                ...(r.lg && { lg: r.lg }),
                            };
                        }
                    });

                    const productData = {
                        id: crypto.randomUUID(),
                        name: String(row[0]),
                        name_uz: String(row[0]),
                        name_ru: String(row[1] || row[0]),
                        price: Number(row[2]) || 0,
                        old_price: Number(row[3]) || 0,
                        category_id: String(row[4]),
                        image: proxiedImages[0] || "",
                        images: proxiedImages,
                        image_metadata: localMeta,
                        description: String(row[7] || ""),
                        description_uz: String(row[7] || ""),
                        description_ru: String(row[8] || ""),
                        sku: String(row[9] || ""),
                        group_id: String(row[10] || ""),
                        color_name: String(row[11] || ""),
                        brand_id: String(row[12] || ""),
                        article: generateArticle(),
                        barcode: String(row[13] || ""),
                        height: String(row[14] || ""),
                        width: String(row[15] || ""),
                        length: String(row[16] || ""),
                        weight: String(row[17] || ""),
                        video_url: String(row[18] || ""),
                        model: String(row[19] || ""),
                        is_deleted: false,
                        sales: 0
                    };

                    productsToInsert.push(productData);
                    count++;
                }

                if (productsToInsert.length > 0) {
                    // Server orqali (service role) — brauzerdagi anon kalit bilan emas.
                    // 200 talik bo'laklar: Vercel so'rov hajmi limiti (4.5 MB) oshmasin.
                    for (let i = 0; i < productsToInsert.length; i += 200) {
                        await adminInsert("products", productsToInsert.slice(i, i + 200));
                    }

                    // Notify Search Engines in Bulk for the new products
                    const newIds = productsToInsert.map(p => p.id);
                    fetch('/api/admin/notify-search', {
                        method: 'POST',
                        body: JSON.stringify({ productIds: newIds })
                    }).catch(err => console.error("Bulk search notification failed:", err));

                    setImportLog(prev => [...prev, `${count} ta mahsulot muvaffaqiyatli yuklandi!`]);
                    fetchData();
                } else {
                    setImportLog(prev => [...prev, "Yuklash uchun mahsulot topilmadi."]);
                }
            } catch (error: any) {
                console.error("Excel import error:", error);
                setImportLog([`Xatolik: ${error.message}`]);
            } finally {
                setIsImporting(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleAiVision = async () => {
        const imageUrl = newProduct.image || (newProduct.images && newProduct.images[0]);
        if (!imageUrl) {
            alert("AI tahlili uchun kamida bitta rasm yuklang!");
            return;
        }

        setIsActionLoading(true);
        try {
            const response = await fetch("/api/ai", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "generate_from_image",
                    context: { image: imageUrl }
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            const res = data.result || data.content;
            if (res) {
                const kw = [...(res.keywords_uz || []), ...(res.keywords_ru || [])].filter(Boolean).join(', ');
                setNewProduct(prev => ({
                    ...prev,
                    name_uz: res.name_uz || prev.name_uz,
                    name_ru: res.name_ru || prev.name_ru,
                    name: res.name_uz || prev.name,
                    description_uz: res.description_uz || prev.description_uz,
                    description_ru: res.description_ru || prev.description_ru,
                    brand: res.brand || prev.brand,
                    tag: kw || prev.tag,
                }));
                alert("AI tahlili muvaffaqiyatli yakunlandi! (SEO kalit so'zlar tag'ga qo'shildi)");
            }
        } catch (error: any) {
            console.error("AI Vision error:", error);
            alert("AI xatoligi: " + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const triggerAiAnalysis = async (productId: string) => {
        if (!productId) return;
        
        try {
            setAiStatus(prev => ({ ...prev, [productId]: { processed: 0, total: 0, active: true } }));
            
            let remaining = 1;
            let retryCount = 0;
            const MAX_RETRIES = 3;

            while (remaining > 0) {
                const response = await fetch('/api/admin/ai/analyze-images', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ productId }),
                    keepalive: true
                });

                if (response.status === 429) {
                    console.warn("AI Rate limit hit, waiting 10s...");
                    await new Promise(r => setTimeout(r, 10000));
                    continue; 
                }

                if (!response.ok) {
                    retryCount++;
                    if (retryCount <= MAX_RETRIES) {
                        console.log(`Retry attempt ${retryCount} for product ${productId}...`);
                        await new Promise(r => setTimeout(r, 2000 * retryCount));
                        continue;
                    }
                    console.error("AI Analysis failed after max retries.");
                    break;
                }

                const data = await response.json();
                if (!data.success) {
                    console.error("Single image AI fail:", data.error);
                    break;
                }
                
                retryCount = 0; 
                remaining = data.remaining || 0;
                setAiStatus(prev => ({
                    ...prev,
                    [productId]: { 
                        processed: data.total - (data.remaining || 0), 
                        total: data.total, 
                        active: (data.remaining || 0) > 0 
                    }
                }));

                if (remaining === 0) break;
                await new Promise(r => setTimeout(r, 1000));
            }
        } catch (err) {
            console.error("AI Auto Trigger failed", err);
        } finally {
            setAiStatus(prev => ({ ...prev, [productId]: { ...prev[productId], active: false } }));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            // Proxy external images to S3
            const imagesArrayRaw = newProduct.images_string
                ? newProduct.images_string.split(';').map(u => u.trim()).filter(u => u !== "").slice(0, 30)
                : (newProduct.image ? [newProduct.image] : []);

            const proxiedResults = await Promise.all(
                imagesArrayRaw.map(url => {
                    const existing = newProduct.image_metadata?.[url] as any;
                    if (existing?.lowResUrl && existing?.xs && existing?.md && existing?.lg) {
                        return Promise.resolve({ url, lowResUrl: existing.lowResUrl, blurDataURL: existing.blurDataURL, xs: existing.xs, md: existing.md, lg: existing.lg });
                    }
                    return uploadFromUrlToYandexS3(url);
                })
            );

            const imagesArray = proxiedResults.map(r => r.url);

            const updatedMeta: any = { ...(newProduct.image_metadata || {}) };
            proxiedResults.forEach((r: any) => {
                if (r.blurDataURL || r.lowResUrl || r.xs || r.md || r.lg) {
                    updatedMeta[r.url] = {
                        ...updatedMeta[r.url],
                        ...(r.blurDataURL && { blurDataURL: r.blurDataURL }),
                        ...(r.lowResUrl   && { lowResUrl:   r.lowResUrl   }),
                        ...(r.xs && { xs: r.xs }),
                        ...(r.md && { md: r.md }),
                        ...(r.lg && { lg: r.lg }),
                    };
                }
            });

            const finalData: any = {
                name: newProduct.name_uz || newProduct.name,
                name_uz: newProduct.name_uz,
                name_ru: newProduct.name_ru,
                image: imagesArray[0] || "",
                images: imagesArray,
                image_metadata: updatedMeta,
                price: Number(newProduct.price),
                old_price: newProduct.oldPrice ? Number(newProduct.oldPrice) : 0,
                stock: newProduct.stock ?? 0,
                category_id: newProduct.category,
                description: newProduct.description,
                description_uz: newProduct.description_uz,
                description_ru: newProduct.description_ru,
                sku: newProduct.sku?.trim() || "",
                group_id: newProduct.groupId?.trim() || "",
                color_name: newProduct.colorName?.trim() || "",
                brand_id: newProduct.brand?.trim() || "",
                height: newProduct.height?.trim() || "",
                width: newProduct.width?.trim() || "",
                length: newProduct.length?.trim() || "",
                weight: newProduct.weight?.trim() || "",
                barcode: newProduct.barcode?.trim() || "",
                video_url: newProduct.videoUrl?.trim() || "",
                article: newProduct.article || generateArticle(),
                is_deleted: newProduct.isDeleted || false,
                is_original: newProduct.isOriginal || false,
                cashback_type: newProduct.cashback_type || 'global',
                cashback_value: newProduct.cashback_value || 0,
                model: newProduct.model || "",
                comm_seller: newProduct.comm_seller || 0,
                comm_tm: newProduct.comm_tm || 0,
                comm_manager: newProduct.comm_manager || 0,
                cost_price: newProduct.cost_price ? Number(newProduct.cost_price) : 0,
                additional_expenses: newProduct.additional_expenses ? Number(newProduct.additional_expenses) : 0
            };

            let finalId = newProduct.id;
            if (newProduct.id) {
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'products',
                        action: 'update',
                        payload: finalData,
                        matchConfig: { column: 'id', value: newProduct.id }
                    })
                });
                if (!res.ok) throw new Error("Mahsulotni yangilashda xatolik");
            } else {
                finalId = crypto.randomUUID();
                const res = await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'products',
                        action: 'insert',
                        payload: [{
                            ...finalData,
                            id: finalId,
                            sales: 0
                        }]
                    })
                });
                if (!res.ok) throw new Error("Mahsulot yaratishda xatolik");
            }

            // Save product parameters
            if (finalId && paramValues.length > 0) {
                const validParams = paramValues.filter(pv => 
                    (pv.value && pv.value.trim()) || 
                    (pv.value_uz && pv.value_uz.trim()) || 
                    (pv.value_ru && pv.value_ru.trim())
                );
                if (validParams.length > 0) {
                    fetch('/api/admin/product-params', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ product_id: finalId, params: validParams })
                    }).catch(err => console.error("Save product params failed:", err));
                }
            }

            // Trigger Recursive AI Background Worker for Image SEO
            if (finalId) {
                triggerAiAnalysis(finalId).catch(err => console.error("Auto AI trigger failed:", err));
                fetch('/api/admin/notify-search', {
                    method: 'POST',
                    body: JSON.stringify({ productId: finalId })
                }).catch(err => console.error("Search notification failed:", err));
            }

            setIsModalOpen(false);
            setProductSelectionPath([]);
            setNewProduct({ name: "", name_uz: "", name_ru: "", price: 0, oldPrice: 0, category: "", image: "", images: [], description: "", description_uz: "", description_ru: "", tag: "", sku: "", groupId: "", colorName: "", article: "", isDeleted: false, isOriginal: false, images_string: "", brand: "", height: "", width: "", length: "", weight: "", barcode: "", videoUrl: "", cashback_type: "global", cashback_value: 0, model: "", cost_price: 0, additional_expenses: 0 });
            setParamValues([]);
            fetchData(currentPage);
        } catch (error) {
            console.error("Error saving product:", error);
        } finally {
            setIsSaving(false);
        }
    };
    const handleBulkDelete = async () => {
        if (selectedIds.length === 0 || isBulkActionLoading) return;
        const confirmMsg = activeTab === "active"
            ? `${selectedIds.length} ta mahsulotni savatga (Trash) olib o'tmoqchimisiz?`
            : `${selectedIds.length} ta mahsulotni butunlay o'chirib yubormoqchimisiz?`;

        if (!window.confirm(confirmMsg)) return;

        setIsBulkActionLoading(true);
        try {
            if (activeTab === "active") {
                const res = await fetch('/api/admin/products', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'bulk_move_to_trash', ids: selectedIds })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Bulk trash failed');
            } else {
                const res = await fetch('/api/admin/products', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Bulk delete failed');
            }
            setSelectedIds([]);
            await fetchData(currentPage);
        } catch (error: any) {
            console.error("Bulk delete error:", error);
            alert("Xatolik: " + error.message);
        } finally {
            setIsBulkActionLoading(false);
        }
    };

    const handleBulkProxyImages = async () => {
        if (selectedIds.length === 0 || isBulkActionLoading) return;
        if (!window.confirm(`${selectedIds.length} ta mahsulot rasmlarini bizning serverga ko'chirmoqchimisiz? (Bu biroz vaqt olishi mumkin)`)) return;

        setIsBulkActionLoading(true);
        try {
            for (const id of selectedIds) {
                const p = products.find(prod => prod.id === id);
                if (!p) continue;

                const imagesArrayRaw = p.images?.length ? p.images : (p.image ? [p.image] : []);
                const proxiedImages = await Promise.all(
                    imagesArrayRaw.map(url => uploadFromUrlToYandexS3(url))
                );

                await fetch('/api/admin/crud', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        table: 'products',
                        action: 'update',
                        payload: {
                            image: proxiedImages[0]?.url || "",
                            images: proxiedImages.map((img: any) => img.url)
                        },
                        matchConfig: { column: 'id', value: id }
                    })
                });
            }
            setSelectedIds([]);
            await fetchData(currentPage);
            alert("Muvaffaqiyatli yakunlandi!");
        } catch (error: any) {
            console.error("Bulk proxy error:", error);
            alert("Xatolik: " + error.message);
        } finally {
            setIsBulkActionLoading(false);
        }
    };

    const moveToTrash = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!id || isActionLoading) return;

        try {
            if (window.confirm("Mahsulotni savatga (Trash) olib o'tmoqchimisiz?")) {
                setIsActionLoading(true);
                const res = await fetch('/api/admin/products', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'move_to_trash', id })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Trash ga o\'tkazib bo\'lmadi');
                await fetchData(currentPage);
            }
        } catch (error: any) {
            console.error("Error moving to trash:", error);
            alert("Xatolik (Trash): " + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const restoreProduct = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!id || isActionLoading) return;

        try {
            if (window.confirm("Mahsulotni tiklamoqchimisiz?")) {
                setIsActionLoading(true);
                const res = await fetch('/api/admin/products', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'restore', id })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Tiklab bo\'lmadi');
                await fetchData(currentPage);
            }
        } catch (error: any) {
            console.error("Error restoring product:", error);
            alert("Xatolik (Tiklash): " + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };

    const handleReindexAll = async () => {
        if (!window.confirm("Barcha mahsulotlarni qidiruv tizimlariga qayta yubormoqchimisiz?")) return;
        setIsActionLoading(true);
        try {
            const { data } = await adminFrom("products").select("id").eq("is_deleted", false);
            if (!data) return;
            const ids = data.map(p => p.id);
            // Process in chunks of 100 to avoid timeout
            for (let i = 0; i < ids.length; i += 100) {
                const chunk = ids.slice(i, i + 100);
                await fetch('/api/admin/notify-search', {
                    method: 'POST',
                    body: JSON.stringify({ productIds: chunk })
                });
            }
            alert("Barcha mahsulotlar indeksatsiyaga yuborildi!");
        } catch (error) {
            console.error("Reindex All failed:", error);
        } finally {
            setIsActionLoading(false);
        }
    };

    const deletePermanent = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!id || isActionLoading) return;

        try {
            if (window.confirm("DIQQAT! Mahsulot butunlay o'chiriladi. Ushbu amalni qaytarib bo'lmaydi. Rozimisiz?")) {
                setIsActionLoading(true);
                const res = await fetch('/api/admin/products', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'O\'chirib bo\'lmadi');
                await fetchData(currentPage);
            }
        } catch (error: any) {
            console.error("Error deleting permanently:", error);
            alert("Xatolik (O'chirish): " + error.message);
        } finally {
            setIsActionLoading(false);
        }
    };


    const totalPages = Math.ceil(totalCount / itemsPerPage);

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedIds(products.map(p => p.id));
        } else {
            setSelectedIds([]);
        }
    };

    return (
        <div className="p-0 text-black">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 md:gap-4 mb-6 md:mb-10">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tighter uppercase italic">Mahsulotlar boshqaruvi</h1>
                    <p className="text-gray-400 text-xs md:text-sm font-medium">Barcha mahsulotlarni ko'rish, qo'shish va tahrirlash</p>
                </div>
                <div className="flex gap-4">
                    <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
                        <button
                            onClick={() => setActiveTab("active")}
                            className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${activeTab === "active" ? "bg-black text-white shadow-lg" : "text-gray-400 hover:text-black"}`}
                        >
                            Barchasi ({activeTab === "active" ? totalCount : ""})
                        </button>
                        <button
                            onClick={() => setActiveTab("trash")}
                            className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === "trash" ? "bg-red-500 text-white shadow-lg" : "text-gray-400 hover:text-red-500"}`}
                        >
                            <Trash2 size={14} />
                            Trash ({activeTab === "trash" ? totalCount : ""})
                        </button>
                    </div>
                    <button
                        onClick={() => setIsExcelModalOpen(true)}
                        className="bg-green-500 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:bg-green-600 transition-all shadow-xl active:scale-95"
                    >
                        <FileSpreadsheet size={20} />
                        Excel Import
                    </button>
                    <button
                        onClick={handleReindexAll}
                        disabled={isActionLoading}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-4 rounded-2xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl shadow-purple-900/20"
                    >
                        {isActionLoading ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                        Indekslash
                    </button>
                    <button
                        onClick={() => {
                            setNewProduct({ name: "", name_uz: "", name_ru: "", price: 0, oldPrice: 0, category: "", image: "", images: [], description: "", description_uz: "", description_ru: "", tag: "", sku: "", groupId: "", colorName: "", article: "", isDeleted: false, isOriginal: false, images_string: "", brand: "", height: "", width: "", length: "", weight: "", barcode: "", videoUrl: "", model: "", cost_price: 0, additional_expenses: 0 });
                            setProductSelectionPath([]);
                            setIsModalOpen(true);
                        }}
                        className="bg-black text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center gap-3 hover:bg-gray-900 transition-all shadow-xl active:scale-95"
                    >
                        <Plus size={20} />
                        Yangi mahsulot
                    </button>
                </div>
            </div>

            {/* Bulk Actions */}
            {selectedIds.length > 0 && (
                <div className="flex items-center gap-4 mb-6 bg-black text-white p-4 rounded-[32px] animate-in slide-in-from-top-4 duration-300 shadow-2xl">
                    <span className="ml-4 font-black uppercase tracking-widest text-[10px]">{selectedIds.length} ta tanlandi</span>
                    <div className="flex-1 h-px bg-white/20"></div>
                    <div className="flex items-center gap-3">
                        {activeTab === "active" && (
                            <button
                                onClick={handleBulkProxyImages}
                                disabled={isBulkActionLoading}
                                className="bg-white text-black px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-100 transition-all flex items-center gap-2 disabled:opacity-50"
                            >
                                {isBulkActionLoading ? <Loader2 className="animate-spin" size={12} /> : <ImageIcon size={12} />}
                                Rasmlarni ko'chirish
                            </button>
                        )}
                        <button
                            onClick={handleBulkDelete}
                            disabled={isBulkActionLoading}
                            className="bg-red-500 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all flex items-center gap-2 disabled:opacity-50"
                        >
                            {isBulkActionLoading ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                            {activeTab === "active" ? "Savatchaga" : "O'chirish"}
                        </button>
                        <button
                            onClick={() => setSelectedIds([])}
                            className="p-2 hover:bg-white/10 rounded-lg transition-all"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Search and Filters */}
            <div className="flex flex-col md:flex-row gap-4 mb-4">
                <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-black transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder="Nom, SKU, tavsif, artikul bo'yicha qidirish (uz/ru aralash)..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-gray-100 rounded-2xl py-4 pl-12 pr-10 text-sm font-medium focus:ring-2 focus:ring-black outline-none shadow-sm transition-all"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-black transition-colors">
                            <X size={18} />
                        </button>
                    )}
                </div>
                <button
                    onClick={() => setShowFilters(v => !v)}
                    className={`relative flex items-center gap-2 px-5 rounded-2xl text-sm font-bold transition-all shadow-sm border ${showFilters || activeFilterCount > 0 ? "bg-black text-white border-black" : "bg-white text-black border-gray-100 hover:border-black"}`}
                >
                    <SlidersHorizontal size={18} />
                    Filtrlar
                    {activeFilterCount > 0 && (
                        <span className="absolute -top-2 -right-2 bg-green-500 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center">{activeFilterCount}</span>
                    )}
                </button>
                <div className="flex bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
                    <button
                        onClick={() => setView("grid")}
                        className={`p-3 rounded-xl transition-all ${view === "grid" ? "bg-black text-white shadow-lg" : "text-gray-400 hover:text-black"}`}
                    >
                        <LayoutGrid size={20} />
                    </button>
                    <button
                        onClick={() => setView("list")}
                        className={`p-3 rounded-xl transition-all ${view === "list" ? "bg-black text-white shadow-lg" : "text-gray-400 hover:text-black"}`}
                    >
                        <List size={20} />
                    </button>
                </div>
            </div>

            {/* Filtrlar paneli — har qanday parametr bo'yicha */}
            {showFilters && (
                <div className="bg-white border border-gray-100 rounded-[28px] p-5 mb-6 shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Kategoriya</label>
                        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none">
                            <option value="">Barchasi</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Brend</label>
                        <select value={filterBrand} onChange={e => setFilterBrand(e.target.value)} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none">
                            <option value="">Barchasi</option>
                            {brands.map(b => <option key={b.id} value={b.id}>{b.name} ({b.productCount || 0})</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Qoldiq</label>
                        <select value={filterStock} onChange={e => setFilterStock(e.target.value as any)} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none">
                            <option value="all">Barchasi</option>
                            <option value="in">Sotuvda (&gt; 0)</option>
                            <option value="out">Tugagan (0)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Saralash</label>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none">
                            <option value="new">Yangi qo'shilgan</option>
                            <option value="old">Eski qo'shilgan</option>
                            <option value="price_asc">Narx: arzon → qimmat</option>
                            <option value="price_desc">Narx: qimmat → arzon</option>
                            <option value="name">Nom (A–Z)</option>
                            <option value="stock_desc">Qoldiq (ko'p → kam)</option>
                            <option value="sales_desc">Sotuvlar (ko'p → kam)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Narx (dan)</label>
                        <input type="number" inputMode="numeric" value={filterPriceMin} onChange={e => setFilterPriceMin(e.target.value)} placeholder="0" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Narx (gacha)</label>
                        <input type="number" inputMode="numeric" value={filterPriceMax} onChange={e => setFilterPriceMax(e.target.value)} placeholder="∞" className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none" />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1.5 ml-1">Originallik</label>
                        <select value={filterOriginal} onChange={e => setFilterOriginal(e.target.value as any)} className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 text-sm font-medium focus:ring-2 focus:ring-black outline-none">
                            <option value="all">Barchasi</option>
                            <option value="yes">Original</option>
                            <option value="no">Original emas</option>
                        </select>
                    </div>
                    <div className="flex items-end gap-2">
                        <label className="flex items-center gap-2 flex-1 bg-gray-50 border border-gray-100 rounded-xl px-3 py-3 cursor-pointer select-none">
                            <input type="checkbox" checked={filterDiscount} onChange={e => setFilterDiscount(e.target.checked)} className="w-4 h-4 accent-black" />
                            <span className="text-sm font-bold">Chegirmali</span>
                        </label>
                        {(activeFilterCount > 0 || searchTerm) && (
                            <button onClick={clearFilters} className="px-4 py-3 rounded-xl bg-red-50 text-red-600 text-xs font-black uppercase tracking-wider hover:bg-red-100 transition-all whitespace-nowrap">Tozalash</button>
                        )}
                    </div>
                </div>
            )}

            {/* Xato: ko'rinadigan xabar + qayta urinish (ro'yxat bo'lsa u ham qoladi) */}
            {listError && (
                <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-700">
                    <div className="flex items-center gap-3 text-sm font-bold">
                        <AlertCircle size={20} />
                        <span>Mahsulotlarni yuklab bo&apos;lmadi: {listError}</span>
                    </div>
                    <button
                        onClick={() => fetchData(currentPage)}
                        className="px-5 py-2.5 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700 active:scale-95 transition-all"
                    >
                        Qayta urinish
                    </button>
                </div>
            )}

            {/* Yangilanish belgisi: eski ro'yxat ko'rinib turadi */}
            {listLoading && products.length > 0 && (
                <div className="mb-3 flex items-center gap-2 text-xs font-bold text-gray-400">
                    <Loader2 className="animate-spin" size={14} /> Yangilanmoqda...
                </div>
            )}

            {(loading || (listLoading && products.length === 0)) && !listError ? (
                <div className="flex flex-col items-center justify-center py-32 text-gray-400">
                    <Loader2 className="animate-spin mb-4" size={32} />
                    <p className="font-black uppercase tracking-widest text-xs">Yuklanmoqda...</p>
                </div>
            ) : products.length === 0 ? (
                listError ? null : (
                    // Faqat server haqiqatan 0 natija qaytarganda
                    <div className="flex flex-col items-center justify-center py-32 text-gray-400 border-2 border-dashed border-gray-100 rounded-[40px]">
                        <AlertCircle className="mb-4" size={48} strokeWidth={1} />
                        <p className="font-black uppercase tracking-widest text-xs">Mahsulotlar topilmadi</p>
                    </div>
                )
            ) : (
                <>
                    {/* Select All Bar */}
                    <div className="flex items-center gap-4 mb-4 bg-gray-50/50 p-4 rounded-3xl border border-gray-100">
                        <div className="flex items-center gap-3 ml-4">
                            <input
                                type="checkbox"
                                checked={products.length > 0 && products.every(p => selectedIds.includes(p.id))}
                                onChange={handleSelectAll}
                                className="w-6 h-6 rounded-lg border-2 border-gray-200 checked:bg-black checked:border-black transition-all cursor-pointer"
                            />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Barchasini tanlash</span>
                        </div>
                    </div>

                    {view === "grid" ? (
                        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-8">
                            {products.map((p) => (
                                <div key={p.id} className={`bg-white rounded-[40px] overflow-hidden group border border-gray-50 shadow-sm hover:shadow-2xl transition-all duration-500 text-black relative ${selectedIds.includes(p.id) ? 'ring-2 ring-black' : ''}`}>
                                    <div className="absolute top-4 left-4 z-40">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.includes(p.id)}
                                            onChange={() => {
                                                setSelectedIds(prev =>
                                                    prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                                );
                                            }}
                                            className="w-6 h-6 rounded-lg border-2 border-gray-200 checked:bg-black checked:border-black transition-all cursor-pointer"
                                        />
                                    </div>
                                    <div className="relative aspect-[3/4] overflow-hidden bg-gray-50">
                                        <Image
                                            src={(p.image && (p.image.startsWith('http') || p.image.startsWith('/'))) ? p.image : "/placeholder.png"}
                                            alt={p.name}
                                            fill
                                            sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
                                            className="object-cover transition-transform duration-700 group-hover:scale-110"
                                            loader={hasVariants(p.image_metadata, p.image) ? makeVariantLoader(p.image_metadata) : undefined}
                                            placeholder={p.image_metadata?.[p.image]?.blurDataURL ? "blur" : "empty"}
                                            blurDataURL={p.image_metadata?.[p.image]?.blurDataURL}
                                            referrerPolicy="no-referrer"
                                        />
                                        <div className="absolute top-4 right-4 flex flex-col gap-3 z-30 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300">
                                            {activeTab === "active" ? (
                                                <>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            openEditProduct(p);
                                                        }}
                                                        className="p-4 bg-white/90 backdrop-blur-md text-black rounded-2xl shadow-xl hover:bg-white transition-all border border-gray-100 active:scale-90"
                                                    >
                                                        <Edit size={20} />
                                                    </button>
                                                    <button
                                                        disabled={isActionLoading}
                                                        onClick={(e) => moveToTrash(p.id, e)}
                                                        className={`p-4 bg-white/90 backdrop-blur-md text-red-500 rounded-2xl shadow-xl hover:bg-white transition-all border border-gray-100 active:scale-90 ${isActionLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                    >
                                                        {isActionLoading ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />}
                                                    </button>
                                                    <a
                                                        href={`/${lang}/products/${getProductSlug(p, lang as string)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="p-4 bg-white/90 backdrop-blur-md text-blue-600 rounded-2xl shadow-xl hover:bg-white transition-all border border-gray-100 active:scale-90 flex items-center justify-center"
                                                        title="Saytda ko'rish"
                                                    >
                                                        <ExternalLink size={20} />
                                                    </a>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        onClick={(e) => restoreProduct(p.id, e)}
                                                        className="p-4 bg-white/90 backdrop-blur-md text-green-600 rounded-2xl shadow-xl hover:bg-white transition-all border border-gray-100 active:scale-90"
                                                        title="Tiklash"
                                                    >
                                                        <Package size={20} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => deletePermanent(p.id, e)}
                                                        className="p-4 bg-red-500 text-white rounded-2xl shadow-xl hover:bg-red-600 transition-all active:scale-90"
                                                        title="Butunlay o'chirish"
                                                    >
                                                        <Trash2 size={20} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                        <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2">
                                            <ImageIcon size={10} />
                                            {p.images?.length || 1} rasm
                                        </div>
                                    </div>
                                    <div className="p-6">
                                        <div className="flex justify-between items-start mb-1">
                                            <p className="text-[10px] font-black text-[#7000FF] uppercase tracking-widest truncate max-w-[150px] bg-[#7000FF]/5 px-2 py-0.5 rounded-md">
                                                {categoryLabels[p.category] || p.category}
                                            </p>
                                            {p.article && <span className="text-[8px] font-black bg-gray-100 px-2 py-0.5 rounded text-gray-400">#{p.article}</span>}
                                        </div>
                                        <div className="flex flex-col mb-1 overflow-hidden">
                                            {(p.brand && brandLabels[p.brand]) && <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest truncate">{brandLabels[p.brand]}</span>}
                                            <h3 className="font-black text-gray-900 group-hover:text-black transition-colors truncate">{(lang === 'ru' ? p.name_ru : p.name_uz) || p.name_uz || p.name_ru || p.name}</h3>
                                        </div>
                                        <div className="flex items-end justify-between">
                                            <div className="flex flex-col">
                                                {p.oldPrice && p.oldPrice > 0 && (
                                                    <span className="text-xs text-gray-400 line-through font-bold">{p.oldPrice.toLocaleString()} so'm</span>
                                                )}
                                                <span className="text-xl font-black italic tracking-tighter">{p.price.toLocaleString()} so'm</span>
                                            </div>
                                            <div className="text-right">
                                                {/* Stock hidden as per request - now managed via warehouses */}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="bg-white rounded-[40px] border border-gray-100 overflow-hidden shadow-sm">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-gray-50/50 border-b border-gray-100">
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Mahsulot</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Kategoriya</th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Narx</th>
                                        <th className="px-6 py-5 text-[10px] font-black text-red-500 uppercase tracking-widest">
                                            <span className="flex items-center gap-1.5">
                                                <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse" />
                                                Moomkin.uz
                                            </span>
                                        </th>
                                        <th className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amallar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {products.map((p) => (
                                        <tr key={p.id} className={`group hover:bg-gray-50/50 transition-colors ${selectedIds.includes(p.id) ? 'bg-gray-50' : ''}`}>
                                            <td className="px-4 py-5 w-4">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(p.id)}
                                                    onChange={() => {
                                                        setSelectedIds(prev =>
                                                            prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                                        );
                                                    }}
                                                    className="w-5 h-5 rounded border-2 border-gray-200 checked:bg-black checked:border-black transition-all cursor-pointer"
                                                />
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-16 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0 relative">
                                                        <Image
                                                            src={(p.image && (p.image.startsWith('http') || p.image.startsWith('/'))) ? p.image : "/placeholder.png"}
                                                            alt={p.name}
                                                            fill
                                                            sizes="48px"
                                                            className="object-cover"
                                                            loader={hasVariants(p.image_metadata, p.image) ? makeVariantLoader(p.image_metadata) : undefined}
                                                            placeholder={p.image_metadata?.[p.image]?.blurDataURL ? "blur" : "empty"}
                                                            blurDataURL={p.image_metadata?.[p.image]?.blurDataURL}
                                                            referrerPolicy="no-referrer"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-sm text-gray-900 line-clamp-1">{(lang === 'ru' ? p.name_ru : p.name_uz) || p.name_uz || p.name_ru || p.name}</span>
                                                        <div className="flex items-center gap-2">
                                                            {(p.brand && brandLabels[p.brand]) && <span className="text-[8px] font-black text-[#7000FF] bg-[#7000FF]/5 px-1.5 py-0.5 rounded uppercase tracking-widest">{brandLabels[p.brand]}</span>}
                                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{p.images?.length || 1} TA RASM</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5 text-[10px] font-black text-gray-400 uppercase tracking-tighter max-w-[200px] truncate">
                                                {categoryLabels[p.category] || p.category}
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex flex-col">
                                                    {p.oldPrice && p.oldPrice > 0 && <span className="text-[10px] text-gray-400 line-through">{p.oldPrice.toLocaleString()} so'm</span>}
                                                    <span className="font-black text-sm italic">{p.price.toLocaleString()} so'm</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                {moomkinRegistry[p.id] ? (
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-12 h-14 rounded-xl overflow-hidden relative flex-shrink-0 ring-2 ring-red-500 shadow-sm shadow-red-500/20 bg-gray-50">
                                                            <Image
                                                                src={(p.image && (p.image.startsWith('http') || p.image.startsWith('/'))) ? p.image : "/placeholder.png"}
                                                                alt="Moomkin"
                                                                fill
                                                                sizes="48px"
                                                                className="object-cover"
                                                                unoptimized
                                                            />
                                                            <div className="absolute top-0.5 right-0.5 px-1 py-0.2 bg-red-500 text-white font-black text-[7px] rounded">
                                                                MK
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-red-500 uppercase tracking-wider">
                                                                ID: #{moomkinRegistry[p.id].moomkin_id}
                                                            </span>
                                                            <span className="font-black text-xs text-gray-900 italic">
                                                                {moomkinRegistry[p.id].price ? moomkinRegistry[p.id].price.toLocaleString() : Math.round(p.price * 1.1).toLocaleString()} so'm
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    loadFullProduct(p).then(full => { if (full) openMoomkinModal(full); });
                                                                }}
                                                                className="mt-1 inline-flex items-center gap-1 text-[9px] font-black text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-md transition-colors w-fit active:scale-95"
                                                            >
                                                                <Edit size={10} />
                                                                <span>Tahrirlash</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            loadFullProduct(p).then(full => { if (full) handleMoomkinIntegrate(full); });
                                                        }}
                                                        disabled={moomkinIntegrating === p.id}
                                                        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-md shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50"
                                                    >
                                                        {moomkinIntegrating === p.id ? (
                                                            <>
                                                                <Loader2 size={12} className="animate-spin" />
                                                                <span>Yuklanmoqda...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Globe size={12} />
                                                                <span>Moomkinga integratsiya</span>
                                                            </>
                                                        )}
                                                    </button>
                                                )}
                                            </td>
                                            <td className="px-8 py-5">
                                                <div className="flex justify-end gap-3">
                                                    {activeTab === "active" ? (
                                                        <>
                                                            <a
                                                                href={`/${lang}/products/${getProductSlug(p, lang as string)}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="p-3 text-gray-400 hover:text-blue-600 hover:bg-white rounded-xl hover:shadow-lg transition-all flex items-center justify-center"
                                                                title="Saytda ko'rish"
                                                            >
                                                                <ExternalLink size={18} />
                                                            </a>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); triggerAiAnalysis(p.id); }} 
                                                                disabled={aiStatus[p.id]?.active}
                                                                className={`p-3 rounded-xl hover:shadow-lg transition-all ${aiStatus[p.id]?.active ? 'bg-black text-white animate-pulse' : 'text-gray-400 hover:text-black hover:bg-white'}`}
                                                                title="AI Tahlil"
                                                            >
                                                                <Sparkles size={18} />
                                                            </button>
                                                            <button onClick={() => openEditProduct(p)} className="p-3 text-gray-400 hover:text-black hover:bg-white rounded-xl hover:shadow-lg transition-all"><Edit size={18} /></button>
                                                            <button onClick={(e) => moveToTrash(p.id, e)} className="p-3 text-gray-400 hover:text-red-500 hover:bg-white rounded-xl hover:shadow-lg transition-all"><Trash2 size={18} /></button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={(e) => restoreProduct(p.id, e)} className="p-3 text-green-600 hover:bg-white rounded-xl hover:shadow-lg transition-all" title="Tiklash"><Package size={18} /></button>
                                                            <button onClick={(e) => deletePermanent(p.id, e)} className="p-3 text-red-500 hover:bg-white rounded-xl hover:shadow-lg transition-all" title="Butunlay o'chirish"><Trash2 size={18} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {/* Pagination & Limits */}
                    <div className="mt-12 flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-6 rounded-[40px] border border-gray-100 shadow-sm">
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ko'rsatish soni</span>
                            <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100">
                                {[20, 50, 100].map(limit => (
                                    <button
                                        key={limit}
                                        onClick={() => setItemsPerPage(limit)}
                                        className={`px-5 py-2 rounded-xl text-xs font-black transition-all ${itemsPerPage === limit ? 'bg-white text-black shadow-md' : 'text-gray-400 hover:text-black'}`}
                                    >
                                        {limit}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {totalPages > 1 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                    className="p-3 bg-gray-50 text-gray-400 hover:text-black rounded-xl border border-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronLeft size={20} />
                                </button>

                                <div className="flex items-center gap-1">
                                    {[...Array(totalPages)].map((_, i) => {
                                        const pNum = i + 1;
                                        if (
                                            pNum === 1 ||
                                            pNum === totalPages ||
                                            (pNum >= currentPage - 1 && pNum <= currentPage + 1)
                                        ) {
                                            return (
                                                <button
                                                    key={pNum}
                                                    onClick={() => setCurrentPage(pNum)}
                                                    className={`w-10 h-10 rounded-xl text-xs font-black transition-all ${currentPage === pNum ? 'bg-black text-white shadow-lg' : 'text-gray-400 hover:text-black hover:bg-gray-50'}`}
                                                >
                                                    {pNum}
                                                </button>
                                            );
                                        }
                                        if (pNum === currentPage - 2 || pNum === currentPage + 2) {
                                            return <span key={pNum} className="text-gray-300">...</span>;
                                        }
                                        return null;
                                    })}
                                </div>

                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                    className="p-3 bg-gray-50 text-gray-400 hover:text-black rounded-xl border border-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                        )}

                        <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                            Sahifa {currentPage} / {totalPages}
                        </div>
                    </div>
                </>
            )}

            {/* Excel Import Modal */}
            {isExcelModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl overflow-hidden rounded-[40px] shadow-2xl animate-in zoom-in duration-300">
                        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-green-50/50 text-black">
                            <div>
                                <h2 className="text-2xl font-black italic tracking-tighter uppercase">Excel orqali yuklash</h2>
                                <p className="text-gray-400 text-xs font-black uppercase tracking-widest">Ma'lumotlarni ommaviy qo'shish</p>
                            </div>
                            <button onClick={() => { setIsExcelModalOpen(false); setImportLog([]); }} className="p-4 hover:bg-white rounded-full transition-all shadow-sm"><X size={20} /></button>
                        </div>

                        <div className="p-8 space-y-8">
                            <div className="flex flex-col items-center justify-center p-12 border-4 border-dashed border-green-100 rounded-[40px] bg-green-50/20 text-center">
                                <FileSpreadsheet size={64} className="text-green-500 mb-6" strokeWidth={1} />
                                <h3 className="text-xl font-black mb-2">Excel faylni tanlang</h3>
                                <p className="text-sm text-gray-400 mb-8 max-w-sm font-medium">Faqat .xlsx shabloni bo'yicha tayyorlangan fayllarni yuklang</p>

                                <div className="flex flex-col w-full gap-4">
                                    <button
                                        onClick={downloadExcelTemplate}
                                        className="flex items-center justify-center gap-3 w-full bg-white border-2 border-green-500 text-green-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-green-50 transition-all active:scale-95 shadow-lg shadow-green-500/10"
                                    >
                                        <Download size={18} />
                                        Shablonni yuklab olish
                                    </button>

                                    <label className="flex items-center justify-center gap-3 w-full bg-green-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-green-600 transition-all active:scale-95 cursor-pointer shadow-xl shadow-green-500/20">
                                        <Plus size={18} strokeWidth={3} />
                                        Faylni tanlash
                                        <input
                                            type="file"
                                            accept=".xlsx, .xls"
                                            className="hidden"
                                            onChange={handleExcelImport}
                                            disabled={isImporting}
                                        />
                                    </label>
                                </div>
                            </div>

                            {importLog.length > 0 && (
                                <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 max-h-60 overflow-y-auto">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                        Yuklash jurnali
                                    </h4>
                                    <div className="space-y-2">
                                        {importLog.map((log, i) => (
                                            <p key={i} className={`text-xs font-bold ${log.startsWith('Xatolik') ? 'text-red-500' : 'text-gray-600'}`}>{log}</p>
                                        ))}
                                    </div>
                                    {isImporting && (
                                        <div className="flex items-center gap-3 mt-4 text-green-500 font-bold text-xs uppercase tracking-widest animate-pulse">
                                            <Loader2 className="animate-spin" size={14} />
                                            Yuklanmoqda...
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-0 md:p-3">
                    <div className="bg-white w-full h-full md:rounded-[32px] overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200">
                        {/* Modal Header */}
                        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/70 text-black shrink-0">
                            <div className="flex items-center gap-4">
                                <div>
                                    <h2 className="text-2xl font-black italic tracking-tighter uppercase">
                                        {newProduct.id ? (newProduct.name_uz || newProduct.name ? `Tahrirlash: ${newProduct.name_uz || newProduct.name}` : "Tahrirlash") : "Yangi mahsulot"}
                                    </h2>
                                    <p className="text-gray-400 text-xs font-black uppercase tracking-widest">Barcha ma'lumotlarni kiriting</p>
                                </div>
                                {newProduct.id && aiStatus[newProduct.id]?.active && (
                                    <div className="flex items-center gap-2 px-4 py-2 bg-black text-white rounded-2xl animate-pulse">
                                        <Sparkles size={14} />
                                        <span className="text-[10px] font-black uppercase tracking-widest">
                                            AI Tahlil: {aiStatus[newProduct.id].processed} / {aiStatus[newProduct.id].total}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                {newProduct.id && (
                                    <button
                                        type="button"
                                        onClick={handleCloneProduct}
                                        className="flex items-center gap-1.5 px-4 py-2.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-sm border border-purple-200 active:scale-95"
                                        title="Ushbu mahsulotdan nusxa olib yangi mahsulot yaratish"
                                    >
                                        <Copy size={14} />
                                        <span>Nusxa olish</span>
                                    </button>
                                )}
                                <button onClick={() => { setIsModalOpen(false); setProductSelectionPath([]); }} className="p-3 hover:bg-white rounded-full transition-all shadow-sm border border-transparent hover:border-gray-200">
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Modal Form Body */}
                        {(() => {
                            const sellingPrice = Number(newProduct.price) || 0;
                            const oldPriceVal = Number(newProduct.oldPrice) || 0;
                            const costPrice = Number(newProduct.cost_price) || 0;
                            const additionalExpenses = Number(newProduct.additional_expenses) || 0;
                            const totalCost = costPrice + additionalExpenses;
                            const netProfit = sellingPrice > 0 ? sellingPrice - totalCost : 0;
                            const marginPercent = (sellingPrice > 0 && costPrice > 0)
                                ? Math.round(((sellingPrice - totalCost) / sellingPrice) * 100)
                                : 0;
                            const discountPercent = (oldPriceVal > sellingPrice && oldPriceVal > 0)
                                ? Math.round(((oldPriceVal - sellingPrice) / oldPriceVal) * 100)
                                : 0;

                            return (
                                <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 md:p-8 text-black flex flex-col justify-between">
                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pb-10">
                                        {/* LEFT COLUMN: 60% (7 cols) - Content & Media */}
                                        <div className="lg:col-span-7 space-y-6">
                                            {/* Card 1: Asosiy Ma'lumotlar */}
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-black text-white rounded-xl flex items-center justify-center shadow-md">
                                                        <Package size={16} />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-xs font-black uppercase tracking-wider text-black">Asosiy Ma'lumotlar</h4>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Nomi, brend va toifasi</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5 relative">
                                                        <div className="flex justify-between items-center mr-1">
                                                            <div className="flex items-center gap-1">
                                                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Nomi (UZ)*</label>
                                                                <AdminTooltip
                                                                    title="Mahsulot Nomi (O'zbekcha)"
                                                                    description="Mahsulotning o'zbek tilidagi to'liq nomi. Qidiruv va vitrinada birinchi ko'rinadi."
                                                                    examples={["iPhone 15 Pro Max 256GB Natural Titanium", "VGR V-099 Professional Trimmer"]}
                                                                />
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={handleAiVision}
                                                                disabled={isActionLoading || !newProduct.image}
                                                                className="flex items-center gap-1.5 px-2.5 py-1 bg-black text-white rounded-lg text-[8px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all disabled:opacity-30 shadow-sm"
                                                                title="Rasm orqali AI tahlili"
                                                            >
                                                                {isActionLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                                                Vision AI
                                                            </button>
                                                        </div>
                                                        <input
                                                            required
                                                            value={newProduct.name_uz || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, name_uz: e.target.value, name: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-bold focus:ring-2 focus:ring-black outline-none shadow-sm"
                                                            placeholder="Masalan: iPhone 15 Pro Max"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-1">
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 italic">Mahsulot Brendi</label>
                                                            <AdminTooltip
                                                                title="Mahsulot Brendi"
                                                                description="Ishlab chiqaruvchi brendini tanlang. Mijozlar brend bo'yicha filter qilishida ishlatiladi."
                                                            />
                                                        </div>
                                                        <div className="relative">
                                                            <select
                                                                value={newProduct.brand || ""}
                                                                onChange={e => setNewProduct({ ...newProduct, brand: e.target.value })}
                                                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-bold focus:ring-2 focus:ring-black outline-none appearance-none cursor-pointer shadow-sm text-black"
                                                            >
                                                                <option value="">Brendni tanlang...</option>
                                                                {brands.map(brand => (
                                                                    <option key={brand.id} value={brand.id}>{brand.name}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" size={18} />
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-1.5">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">Название (RU)*</label>
                                                        <input
                                                            required
                                                            value={newProduct.name_ru || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, name_ru: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-bold focus:ring-2 focus:ring-black outline-none shadow-sm text-black"
                                                            placeholder="Например: Смартфон iPhone 15 Pro"
                                                        />
                                                    </div>
                                                    <div className="space-y-1.5">
                                                        <div className="flex items-center gap-1">
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 italic">Model</label>
                                                            <AdminTooltip
                                                                title="Model kodi"
                                                                description="Zavod modeli yoki seriya kodi. Qidiruvda aniq moslik uchun xizmat qiladi."
                                                                examples={["A3106", "V-099", "SM-S928B"]}
                                                            />
                                                        </div>
                                                        <input
                                                            value={newProduct.model || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, model: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-bold focus:ring-2 focus:ring-black outline-none shadow-sm text-black"
                                                            placeholder="Masalan: A3106 / VGR-V937"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Kaskadli Toifa Tanlash */}
                                                <div className="space-y-3 pt-2">
                                                    <div className="flex items-center gap-1.5">
                                                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest italic">
                                                            Tovar Toifasi (Uzum Market uslubida kaskadli)
                                                        </label>
                                                        <AdminTooltip
                                                            title="Kaskadli Toifalar"
                                                            description="Mahsulot tegishli bo'lgan asosiy toifani tanlang. Keyin avtomatik ravishda ichki toifalar menyusi ochiladi."
                                                        />
                                                    </div>
                                                    <div className="space-y-3">
                                                        {/* Level 1 dropdown */}
                                                        <div className="relative">
                                                            <select
                                                                value={productSelectionPath[0] || ""}
                                                                onChange={(e) => {
                                                                    const val = e.target.value;
                                                                    setProductSelectionPath(val ? [val] : []);
                                                                    setNewProduct({ ...newProduct, category: val });
                                                                }}
                                                                className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-bold focus:ring-2 focus:ring-black outline-none appearance-none cursor-pointer shadow-sm"
                                                            >
                                                                <option value="">Bosh toifani tanlang...</option>
                                                                {rawCategories
                                                                    .filter(c => (!c.parent_id || c.parent_id === "none") && !c.is_deleted)
                                                                    .map(cat => (
                                                                        <option key={cat.id} value={cat.id}>{cat.name_uz || cat.name}</option>
                                                                    ))}
                                                            </select>
                                                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" size={18} />
                                                        </div>

                                                        {/* Subsequent Levels */}
                                                        {productSelectionPath.map((selectedId, idx) => {
                                                            const children = rawCategories.filter(c => c.parent_id === selectedId && !c.is_deleted);
                                                            if (children.length === 0) return null;

                                                            return (
                                                                <div key={idx} className="pl-4 border-l-2 border-emerald-500/30 space-y-3 animate-in fade-in slide-in-from-left-2 duration-300">
                                                                    <div className="relative">
                                                                        <select
                                                                            value={productSelectionPath[idx + 1] || ""}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                const newPath = productSelectionPath.slice(0, idx + 1);
                                                                                if (val) {
                                                                                    newPath.push(val);
                                                                                    setNewProduct({ ...newProduct, category: val });
                                                                                } else {
                                                                                    setNewProduct({ ...newProduct, category: selectedId });
                                                                                }
                                                                                setProductSelectionPath(newPath);
                                                                            }}
                                                                            className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-bold focus:ring-2 focus:ring-black outline-none appearance-none cursor-pointer shadow-sm"
                                                                        >
                                                                            <option value="">Ichki toifani tanlang...</option>
                                                                            {children.map(cat => (
                                                                                <option key={cat.id} value={cat.id}>{cat.name_uz || cat.name}</option>
                                                                            ))}
                                                                        </select>
                                                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" size={18} />
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 2: Mahsulot Rasmlari & Video */}
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
                                                <div className="flex items-center justify-between flex-wrap gap-2">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/20">
                                                            <ImageIcon size={16} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <h4 className="text-xs font-black uppercase tracking-wider text-black">Mahsulot Rasmlari (Max 30)</h4>
                                                                <AdminTooltip
                                                                    title="Rasmlar Galereyasi"
                                                                    description="Rasmlarni surib (drag & drop) o'rnini almashtirishingiz mumkin. 1-o'rindagi rasm vitrinada asosiy bo'ladi."
                                                                />
                                                            </div>
                                                            <p className="text-[9px] text-gray-400 font-bold uppercase">{newProduct.images?.length || 0} / 30 ta yuklangan</p>
                                                        </div>
                                                    </div>
                                                    <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-emerald-200/50">
                                                        <CheckCircle2 size={12} /> ⚡ WebP Optimizatsiya
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                                                    {newProduct.images?.map((img, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            draggable
                                                            onDragStart={() => setDraggedImgIdx(idx)}
                                                            onDragOver={(e) => e.preventDefault()}
                                                            onDrop={(e) => {
                                                                e.preventDefault();
                                                                if (draggedImgIdx === null || draggedImgIdx === idx) return;
                                                                
                                                                const newImages = [...(newProduct.images || [])];
                                                                const draggedImg = newImages[draggedImgIdx];
                                                                
                                                                newImages.splice(draggedImgIdx, 1);
                                                                newImages.splice(idx, 0, draggedImg);
                                                                
                                                                setNewProduct({
                                                                    ...newProduct,
                                                                    images: newImages,
                                                                    image: newImages[0] || "",
                                                                    images_string: newImages.join(';')
                                                                });
                                                                setDraggedImgIdx(null);
                                                            }}
                                                            className="relative aspect-square rounded-2xl overflow-hidden group border-2 border-gray-100 bg-gray-50 shadow-sm cursor-move hover:border-emerald-500 transition-all"
                                                        >
                                                            <img src={img} alt={`Product ${idx}`} className="w-full h-full object-cover pointer-events-none" referrerPolicy="no-referrer" />
                                                            
                                                            {/* Action overlay */}
                                                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all backdrop-blur-xs flex items-center justify-center gap-2 p-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPreviewImage(img);
                                                                    }}
                                                                    className="w-9 h-9 bg-white/90 hover:bg-white text-black rounded-xl flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
                                                                    title="Kattalashtirib ko'rish"
                                                                >
                                                                    <Eye size={16} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        const newImages = [...(newProduct.images || [])];
                                                                        newImages.splice(idx, 1);
                                                                        setNewProduct({
                                                                            ...newProduct,
                                                                            images: newImages,
                                                                            image: newImages[0] || "",
                                                                            images_string: newImages.join(';')
                                                                        });
                                                                    }}
                                                                    className="w-9 h-9 bg-rose-500 hover:bg-rose-600 text-white rounded-xl flex items-center justify-center transition-transform hover:scale-110 shadow-lg"
                                                                    title="O'chirish"
                                                                >
                                                                    <Trash2 size={16} />
                                                                </button>
                                                            </div>

                                                            {idx === 0 && (
                                                                <div className="absolute top-2 left-2 bg-black text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md">
                                                                    Asosiy
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {(!newProduct.images || newProduct.images.length < 30) && (
                                                        <div className={`relative aspect-square rounded-2xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-2 hover:border-black hover:bg-gray-50/50 transition-all group ${isUploading ? 'bg-gray-50' : 'bg-white cursor-pointer'}`}>
                                                            {isUploading ? (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <Loader2 className="animate-spin text-black" size={22} />
                                                                    <span className="text-[8px] font-black text-gray-400 uppercase">Yuklanmoqda</span>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                                                                        <Plus size={20} className="text-gray-500 group-hover:text-black" />
                                                                    </div>
                                                                    <span className="text-[9px] font-black uppercase tracking-wider text-gray-500 group-hover:text-black">Rasm qo'shish</span>
                                                                    <input
                                                                        type="file"
                                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                                        onChange={(e) => handleFileUpload(e, true)}
                                                                        accept="image/*"
                                                                        disabled={isUploading}
                                                                    />
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Video Upload & URL */}
                                                <div className="pt-3 border-t border-gray-100 space-y-2">
                                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest flex justify-between items-center">
                                                        <span>Mahsulot Videosi (URL yoki Fayl)</span>
                                                        {isUploading && <Loader2 className="animate-spin text-black" size={14} />}
                                                    </label>
                                                    <div className="flex gap-3">
                                                        <input
                                                            type="text"
                                                            value={newProduct.videoUrl || ""}
                                                            onChange={(e) => setNewProduct({ ...newProduct, videoUrl: e.target.value })}
                                                            placeholder="Video URL yoki tugma orqali yuklang"
                                                            className="flex-1 bg-gray-50 border border-gray-100 rounded-2xl py-3 px-5 text-xs font-bold focus:ring-2 focus:ring-black outline-none transition-all shadow-sm"
                                                        />
                                                        <label className={`w-12 h-12 flex items-center justify-center rounded-2xl border-2 border-dashed transition-all cursor-pointer shrink-0 shadow-sm ${isUploading ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-200 hover:border-black'}`}>
                                                            <Video size={18} className={isUploading ? 'text-gray-300' : 'text-gray-500'} />
                                                            <input
                                                                type="file"
                                                                className="hidden"
                                                                onChange={handleVideoUpload}
                                                                accept="video/*"
                                                                disabled={isUploading}
                                                            />
                                                        </label>
                                                    </div>
                                                    {newProduct.videoUrl && (
                                                        <p className="text-[8px] font-black text-emerald-600 uppercase tracking-wider flex items-center gap-1.5 pt-1">
                                                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" /> Video biriktirildi
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card 3: Mahsulot Tavsiflari & AI Copywriting Toolbar */}
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-6">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-violet-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-violet-600/20">
                                                        <Wand2 size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <h4 className="text-xs font-black uppercase tracking-wider text-black">Mahsulot Tavsiflari</h4>
                                                            <AdminTooltip
                                                                title="AI Kopirayter Toolbari"
                                                                description="Tavsif yozib, yuqoridagi 'Jozibador qilish', 'Punktlar' yoki 'Imlo' tugmalarini bossangiz, sun'iy intellekt matnni darhol qayta ishlab beradi."
                                                            />
                                                        </div>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase">AI Yordamchi Kopirayter bilan</p>
                                                    </div>
                                                </div>

                                                {/* Tavsif UZ */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Tavsif (UZ)</label>
                                                        {/* AI Copywriting Toolbar (UZ) */}
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <button
                                                                type="button"
                                                                disabled={!!refiningField || !newProduct.description_uz}
                                                                onClick={() => handleRefineText('uz', 'enhance')}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-[9px] font-bold transition-all disabled:opacity-40"
                                                                title="Matnni yanada jozibador va xaridorgir qilish"
                                                            >
                                                                {refiningField?.field === 'uz' && refiningField.mode === 'enhance' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                                                                <span>Jozibador qilish</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={!!refiningField || !newProduct.description_uz}
                                                                onClick={() => handleRefineText('uz', 'bullets')}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[9px] font-bold transition-all disabled:opacity-40"
                                                                title="Matnni xususiyatlar bo'yicha punktlarga ajratish"
                                                            >
                                                                {refiningField?.field === 'uz' && refiningField.mode === 'bullets' ? <Loader2 size={11} className="animate-spin" /> : <List size={11} />}
                                                                <span>Punktlar</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={!!refiningField || !newProduct.description_uz}
                                                                onClick={() => handleRefineText('uz', 'fix_grammar')}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[9px] font-bold transition-all disabled:opacity-40"
                                                                title="Imlo va tinish belgilarini to'g'rilash"
                                                            >
                                                                {refiningField?.field === 'uz' && refiningField.mode === 'fix_grammar' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                                                <span>Imlo</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <textarea
                                                        rows={4}
                                                        value={newProduct.description_uz || ""}
                                                        onChange={(e) => setNewProduct({ ...newProduct, description_uz: e.target.value, description: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-medium focus:ring-2 focus:ring-black outline-none transition-all shadow-sm resize-y"
                                                        placeholder="Batafsil ma'lumot (UZ)..."
                                                    />
                                                </div>

                                                {/* Описание RU */}
                                                <div className="space-y-2">
                                                    <div className="flex items-center justify-between flex-wrap gap-2">
                                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Описание (RU)</label>
                                                        {/* AI Copywriting Toolbar (RU) */}
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <button
                                                                type="button"
                                                                disabled={!!refiningField || !newProduct.description_ru}
                                                                onClick={() => handleRefineText('ru', 'enhance')}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-violet-50 text-violet-700 hover:bg-violet-100 rounded-lg text-[9px] font-bold transition-all disabled:opacity-40"
                                                                title="Сделать описание более продающим и привлекательным"
                                                            >
                                                                {refiningField?.field === 'ru' && refiningField.mode === 'enhance' ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />}
                                                                <span>Улучшить</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={!!refiningField || !newProduct.description_ru}
                                                                onClick={() => handleRefineText('ru', 'bullets')}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg text-[9px] font-bold transition-all disabled:opacity-40"
                                                                title="Разбить по пунктам"
                                                            >
                                                                {refiningField?.field === 'ru' && refiningField.mode === 'bullets' ? <Loader2 size={11} className="animate-spin" /> : <List size={11} />}
                                                                <span>Пункты</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={!!refiningField || !newProduct.description_ru}
                                                                onClick={() => handleRefineText('ru', 'fix_grammar')}
                                                                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg text-[9px] font-bold transition-all disabled:opacity-40"
                                                                title="Исправить грамматику и пунктуацию"
                                                            >
                                                                {refiningField?.field === 'ru' && refiningField.mode === 'fix_grammar' ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={12} />}
                                                                <span>Грамматика</span>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <textarea
                                                        rows={4}
                                                        value={newProduct.description_ru || ""}
                                                        onChange={(e) => setNewProduct({ ...newProduct, description_ru: e.target.value })}
                                                        className="w-full bg-gray-50 border border-gray-100 rounded-2xl py-3.5 px-5 text-sm font-medium focus:ring-2 focus:ring-black outline-none transition-all shadow-sm resize-y"
                                                        placeholder="Описание товара (RU)..."
                                                    />
                                                </div>
                                            </div>

                                            {/* Card 4: Google SERP Preview */}
                                            <div className="bg-gradient-to-br from-gray-50 to-blue-50/20 p-5 rounded-3xl border border-gray-100 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm">
                                                            <Globe size={13} className="text-blue-600" />
                                                        </div>
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Google Qidiruv Ko'rinishi (SERP Preview)</span>
                                                        <AdminTooltip
                                                            title="Google Qidiruv Snippeti"
                                                            description="Foydalanuvchilar Google qidiruvida ushbu mahsulotni qanday ko'rishini real vaqtda ko'rsatuvchi jonli namuna."
                                                        />
                                                    </div>
                                                    <span className="text-[9px] font-bold px-2 py-0.5 bg-blue-100/60 text-blue-700 rounded-full">Jonli Snippet</span>
                                                </div>
                                                <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-1">
                                                    <div className="flex items-center gap-1.5 text-[11px] text-gray-500 truncate">
                                                        <span className="text-gray-700 font-medium">https://velari.uz</span>
                                                        <span>›</span>
                                                        <span>products</span>
                                                        <span>›</span>
                                                        <span className="text-gray-400 truncate">{newProduct.name_uz ? getProductSlug(newProduct.name_uz) : 'product-slug'}</span>
                                                    </div>
                                                    <h4 className="text-sm font-semibold text-[#1a0dab] hover:underline cursor-pointer line-clamp-1 leading-snug">
                                                        {newProduct.name_uz || newProduct.name || "Mahsulot nomi kiritilmagan"} - eng qulay narxda | Velari.uz
                                                    </h4>
                                                    <p className="text-xs text-[#4d5156] line-clamp-2 leading-relaxed">
                                                        {newProduct.description_uz || newProduct.description
                                                            ? (newProduct.description_uz || newProduct.description)?.replace(/<[^>]*>?/gm, '').slice(0, 160) + "..."
                                                            : "Tavsif yozilmagan. Mahsulot haqida ma'lumot, rasmlar, xususiyatlari va yetkazib berish xizmati bilan Velari online do'konida tanishing."}
                                                    </p>
                                                    {sellingPrice > 0 && (
                                                        <div className="pt-1.5 flex items-center gap-2 text-[11px] text-emerald-700 font-bold">
                                                            <span>Narxi: {sellingPrice.toLocaleString()} so'm</span>
                                                            <span className="text-gray-300">•</span>
                                                            <span className="text-gray-500 font-normal">Mavjud: Do'konda</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card 5: Kategoriya Parametrlari — Yandex Market uslubida */}
                                            {newProduct.category && (
                                                <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                                                    <ProductParamsEditor
                                                        categoryId={newProduct.category}
                                                        productId={newProduct.id}
                                                        paramValues={paramValues}
                                                        onParamValuesChange={setParamValues}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* RIGHT COLUMN: 40% (5 cols) - Pricing, Profit Calc & SKU Specs */}
                                        <div className="lg:col-span-5 space-y-6">
                                            {/* Card 1: Narxlar va Jonli Foyda/Marja Kalkulyatori */}
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-5">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-8 h-8 bg-blue-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-blue-500/20">
                                                            <TrendingUp size={16} />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-1.5">
                                                                <h4 className="text-xs font-black uppercase tracking-wider text-black">Narx & Marja Kalkulyatori</h4>
                                                                <AdminTooltip
                                                                    title="Rentabellik Kalkulyatori"
                                                                    description="Tannarx va qo'shimcha xarajatlarni kiritsangiz, tizim har bir sotilgan donadan qoladigan sof foyda va rentabellik marjasini avtomatik hisoblab beradi."
                                                                />
                                                            </div>
                                                            <p className="text-[9px] text-gray-400 font-bold uppercase">Jonli moliyaviy hisob-kitob</p>
                                                        </div>
                                                    </div>
                                                    {discountPercent > 0 && (
                                                        <span className="px-2.5 py-1 bg-rose-500 text-white text-[10px] font-black rounded-full uppercase tracking-wider animate-pulse">
                                                            -{discountPercent}% Chegirma
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Sotuv Narxi (so'm)*</label>
                                                        <input
                                                            required
                                                            type="number"
                                                            value={newProduct.price || ""}
                                                            onChange={(e) => setNewProduct({ ...newProduct, price: Number(e.target.value) })}
                                                            placeholder="100 000"
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-black focus:ring-2 focus:ring-black outline-none transition-all shadow-inner"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-wider">Eski Narx (so'm)</label>
                                                        <input
                                                            type="number"
                                                            value={newProduct.oldPrice || ""}
                                                            onChange={(e) => setNewProduct({ ...newProduct, oldPrice: e.target.value ? Number(e.target.value) : 0 })}
                                                            placeholder="0 bo'lsa yo'q"
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-black outline-none transition-all"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1">
                                                            <label className="block text-[10px] font-black text-amber-600 uppercase tracking-wider">Tannarx (so'm)</label>
                                                            <AdminTooltip
                                                                title="Tannarx"
                                                                description="Tovarning sotib olingan yoki ishlab chiqarilgan narxi. Faqat admin ko'radi."
                                                            />
                                                        </div>
                                                        <input
                                                            type="number"
                                                            value={newProduct.cost_price || ""}
                                                            onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value ? Number(e.target.value) : 0 })}
                                                            placeholder="Masalan: 60 000"
                                                            className="w-full bg-amber-50/40 border border-amber-100 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex items-center gap-1">
                                                            <label className="block text-[10px] font-black text-amber-600 uppercase tracking-wider">Qo'shimcha Xarajat</label>
                                                            <AdminTooltip
                                                                title="Qo'shimcha Xarajat"
                                                                description="Yetkazib berish, qadoqlash, karobka yoki boshqa logistika xarajatlari."
                                                            />
                                                        </div>
                                                        <input
                                                            type="number"
                                                            value={newProduct.additional_expenses || ""}
                                                            onChange={(e) => setNewProduct({ ...newProduct, additional_expenses: e.target.value ? Number(e.target.value) : 0 })}
                                                            placeholder="Yetkazish, qadoq..."
                                                            className="w-full bg-amber-50/40 border border-amber-100 rounded-xl py-3 px-4 text-sm font-bold focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Live Summary Box */}
                                                <div className="p-4 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 text-white space-y-3 shadow-lg">
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-gray-400 uppercase font-black tracking-wider text-[10px]">Jami Xarajat:</span>
                                                        <span className="font-bold text-gray-200">{totalCost.toLocaleString()} so'm</span>
                                                    </div>
                                                    <div className="h-px bg-white/10" />
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <span className="block text-[9px] font-black uppercase tracking-widest text-gray-400">Sof Foyda (dona)</span>
                                                            <span className={`text-base font-black ${netProfit > 0 ? 'text-emerald-400' : netProfit < 0 ? 'text-rose-400' : 'text-gray-300'}`}>
                                                                {netProfit > 0 ? '+' : ''}{netProfit.toLocaleString()} so'm
                                                            </span>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="block text-[9px] font-black uppercase tracking-widest text-gray-400">Rentabellik (Marja)</span>
                                                            <span className={`text-base font-black ${marginPercent > 30 ? 'text-emerald-400' : marginPercent > 10 ? 'text-amber-400' : 'text-rose-400'}`}>
                                                                {marginPercent}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 2: SKU, Guruhlash & Identifikatorlar */}
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-indigo-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-500/20">
                                                        <Tag size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <h4 className="text-xs font-black uppercase tracking-wider text-black">SKU va Identifikatorlar</h4>
                                                            <AdminTooltip
                                                                title="SKU va Guruhlash"
                                                                description="Mahsulotlarning ombordagi unikal kodi va turli rang/variantlarni bitta sahifada birlashtirish vositasi."
                                                            />
                                                        </div>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Mahsulot kodi va guruhlash</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <div>
                                                        <div className="flex items-center gap-1 mb-1">
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Mahsulot SKU kod (Unikal)*</label>
                                                            <AdminTooltip
                                                                title="Mahsulot SKU Kodi"
                                                                description="Har bir tovar donasi uchun unikal kod (Stock Keeping Unit)."
                                                                examples={["VGR-706-BLUE", "IPH-15P-256-BLK"]}
                                                            />
                                                        </div>
                                                        <input
                                                            required
                                                            type="text"
                                                            value={newProduct.sku || ""}
                                                            onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value })}
                                                            placeholder="Masalan: VGR-706-BLUE"
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-black outline-none transition-all shadow-sm"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <div className="flex items-center gap-1 mb-1">
                                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Guruh SKU (GroupId)</label>
                                                                <AdminTooltip
                                                                    title="Guruhlash SKU (GroupId)"
                                                                    description="Bir xil mahsulotning turli ranglari (Qora, Oq, Ko'k) ga bir xil GroupId beriladi. Saytda mijoz bitta sahifada ranglarni almashtirishi mumkin bo'ladi."
                                                                    examples={["VGR-706-GROUP", "IPHONE-15-PRO-SERIES"]}
                                                                />
                                                            </div>
                                                            <input
                                                                type="text"
                                                                value={newProduct.groupId || ""}
                                                                onChange={(e) => setNewProduct({ ...newProduct, groupId: e.target.value })}
                                                                placeholder="Masalan: VGR-706-GRP"
                                                                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-black outline-none transition-all shadow-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Rang / Variant nomi</label>
                                                            <input
                                                                type="text"
                                                                value={newProduct.colorName || ""}
                                                                onChange={(e) => setNewProduct({ ...newProduct, colorName: e.target.value })}
                                                                placeholder="Masalan: Qora matviy"
                                                                className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-black outline-none transition-all shadow-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1 mb-1">
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">Bar-kod (EAN)</label>
                                                            <AdminTooltip
                                                                title="Shtrix-kod (EAN/Barcode)"
                                                                description="Mahsulot qutisidagi shtrix-kod. Skaner orqali omborda tez topishda ishlatiladi."
                                                            />
                                                        </div>
                                                        <input
                                                            value={newProduct.barcode || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, barcode: e.target.value })}
                                                            className="w-full bg-blue-50/30 border border-blue-100 rounded-xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-black outline-none shadow-sm text-black"
                                                            placeholder="Masalan: 6970234567890"
                                                        />
                                                    </div>
                                                    
                                                    {/* Original Sifat Toggle */}
                                                    <div className="pt-2">
                                                        <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 flex items-center justify-between shadow-sm">
                                                            <div>
                                                                <div className="flex items-center gap-1">
                                                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-black">Original Sifat</h4>
                                                                    <AdminTooltip
                                                                        title="Original Sifat Belgisi"
                                                                        description="Yoqilsa, sayt vitrinasidagi rasm ustida '100% Original' yorlig'i paydo bo'ladi."
                                                                    />
                                                                </div>
                                                                <p className="text-[8px] text-gray-400 font-bold uppercase mt-0.5 italic">"Original" belgisini ko'rsatish</p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setNewProduct({ ...newProduct, isOriginal: !newProduct.isOriginal })}
                                                                className={`w-12 h-7 rounded-full transition-all relative flex items-center ${newProduct.isOriginal ? "bg-emerald-500" : "bg-gray-300"}`}
                                                            >
                                                                <div className={`absolute w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-sm ${newProduct.isOriginal ? "left-[24px]" : "left-1"}`} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 3: Gabaritlar va Og'irlik */}
                                            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-amber-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-amber-500/20">
                                                        <Layers size={16} />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-1.5">
                                                            <h4 className="text-xs font-black uppercase tracking-wider text-black">Gabaritlar & Og'irlik</h4>
                                                            <AdminTooltip
                                                                title="Yetkazib berish o'lchamlari"
                                                                description="Kuryerlik xizmati (Yandex Delivery, BTS) narxini to'g'ri hisoblash uchun kerak bo'ladi."
                                                            />
                                                        </div>
                                                        <p className="text-[9px] text-gray-400 font-bold uppercase">Yetkazib berish o'lchamlari</p>
                                                    </div>
                                                </div>

                                                <div className="space-y-3">
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 italic">Og'irlik (gr)</label>
                                                        <input
                                                            value={newProduct.weight || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, weight: e.target.value })}
                                                            className="w-full bg-gray-50 border border-gray-100 rounded-xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-black outline-none shadow-sm text-black"
                                                            placeholder="Masalan: 450"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1 italic">O'lchamlar (sm / mm)</label>
                                                        <div className="grid grid-cols-3 gap-2 pt-1">
                                                            <div className="space-y-1">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase ml-1">Balandlik</span>
                                                                <input
                                                                    value={newProduct.height || ""}
                                                                    onChange={e => setNewProduct({ ...newProduct, height: e.target.value })}
                                                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-3 text-xs font-bold focus:ring-2 focus:ring-black outline-none shadow-sm text-black"
                                                                    placeholder="h"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase ml-1">Kenglik</span>
                                                                <input
                                                                    value={newProduct.width || ""}
                                                                    onChange={e => setNewProduct({ ...newProduct, width: e.target.value })}
                                                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-3 text-xs font-bold focus:ring-2 focus:ring-black outline-none shadow-sm text-black"
                                                                    placeholder="w"
                                                                />
                                                            </div>
                                                            <div className="space-y-1">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase ml-1">Uzunlik</span>
                                                                <input
                                                                    value={newProduct.length || ""}
                                                                    onChange={e => setNewProduct({ ...newProduct, length: e.target.value })}
                                                                    className="w-full bg-gray-50 border border-gray-100 rounded-xl py-2.5 px-3 text-xs font-bold focus:ring-2 focus:ring-black outline-none shadow-sm text-black"
                                                                    placeholder="l"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Card 4: Cashback Sozlamalari */}
                                            <div className="bg-emerald-50/40 p-6 rounded-3xl border border-emerald-100 space-y-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-emerald-500/20">
                                                        <DollarSign size={16} />
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Cashback Sozlamalari</h4>
                                                        <AdminTooltip
                                                            title="Cashback (Keshbek)"
                                                            description="Xaridor bu mahsulotni sotib olganda uning saytdagi virtual hamyoniga qaytariladigan pul."
                                                            examples={["Global: Umumiy do'kon foizida beriladi", "Maxsus %: Masalan 5% qaytadi", "Maxsus Summa: Masalan 20,000 so'm qaytadi"]}
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">Hisoblash turi</label>
                                                        <select
                                                            value={newProduct.cashback_type || "global"}
                                                            onChange={e => setNewProduct({ ...newProduct, cashback_type: e.target.value as any })}
                                                            className="w-full bg-white border border-emerald-100 rounded-xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm text-black"
                                                        >
                                                            <option value="global">Global (%)</option>
                                                            <option value="percent">Maxsus % (Foiz)</option>
                                                            <option value="fixed">Maxsus Summa</option>
                                                        </select>
                                                    </div>
                                                    {newProduct.cashback_type !== 'global' && (
                                                        <div className="space-y-1 animate-in zoom-in-95 duration-200">
                                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-500 ml-1">
                                                                {newProduct.cashback_type === 'percent' ? 'Foiz (%)' : 'Summa (so\'m)'}
                                                            </label>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    value={newProduct.cashback_value || ""}
                                                                    onChange={e => setNewProduct({ ...newProduct, cashback_value: Number(e.target.value) })}
                                                                    className="w-full bg-white border border-emerald-100 rounded-xl py-3 px-4 text-xs font-bold focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm text-black pr-8"
                                                                    placeholder="0"
                                                                />
                                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 font-black text-xs">
                                                                    {newProduct.cashback_type === 'percent' ? '%' : '∑'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Card 5: Hamkorlik MLM Komissiyalari */}
                                            <div className="bg-purple-50/40 p-6 rounded-3xl border border-purple-100 space-y-4">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-8 h-8 bg-purple-500 text-white rounded-xl flex items-center justify-center shadow-md shadow-purple-500/20">
                                                        <Sparkles size={16} />
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-purple-700">Hamkorlik Komissiyasi (%)</h4>
                                                        <AdminTooltip
                                                            title="Hamkorlik (Referal) Komissiyasi"
                                                            description="Agent yoki blogger ushbu mahsulotni sotsa, 3 darajadagi hamkorlarga ajratiladigan rag'batlantirish foizlari."
                                                            examples={["Sotuvchi: Tovarni sotgan agent oladigan %", "Manager: Agentning boshlig'i oladigan %", "Top Manager: Katta rahbar oladigan %"]}
                                                        />
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-3 gap-2">
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 ml-1">Sotuvchi (%)</label>
                                                        <input
                                                            type="number"
                                                            value={newProduct.comm_seller || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, comm_seller: Number(e.target.value) })}
                                                            className="w-full bg-white border border-purple-100 rounded-xl py-2.5 px-3 text-xs font-bold focus:ring-2 focus:ring-purple-500 outline-none shadow-sm text-black"
                                                            placeholder="5"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 ml-1">Manager (%)</label>
                                                        <input
                                                            type="number"
                                                            value={newProduct.comm_manager || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, comm_manager: Number(e.target.value) })}
                                                            className="w-full bg-white border border-purple-100 rounded-xl py-2.5 px-3 text-xs font-bold focus:ring-2 focus:ring-purple-500 outline-none shadow-sm text-black"
                                                            placeholder="2"
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-500 ml-1">Top Mng (%)</label>
                                                        <input
                                                            type="number"
                                                            value={newProduct.comm_tm || ""}
                                                            onChange={e => setNewProduct({ ...newProduct, comm_tm: Number(e.target.value) })}
                                                            className="w-full bg-white border border-purple-100 rounded-xl py-2.5 px-3 text-xs font-bold focus:ring-2 focus:ring-purple-500 outline-none shadow-sm text-black"
                                                            placeholder="1"
                                                        />
                                                    </div>
                                                </div>
                                                <p className="text-[8px] font-medium text-gray-400 uppercase italic px-1">
                                                    * Foizlar sotuv narxidan kelib chiqib avtomatik taqsimlanadi.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Modal Sticky Footer */}
                                    <div className="mt-8 flex justify-end gap-4 sticky bottom-0 bg-white/95 backdrop-blur-md py-4 border-t border-gray-100 -mx-6 -mb-6 md:-mx-8 md:-mb-8 px-6 md:px-8 z-30 shadow-lg shadow-black/5">
                                        <button
                                            type="button"
                                            onClick={() => { setIsModalOpen(false); setProductSelectionPath([]); }}
                                            className="px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-black hover:bg-gray-50 transition-all"
                                        >
                                            Bekor qilish
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSaving}
                                            className="bg-black text-white px-12 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-gray-900 transition-all shadow-2xl disabled:opacity-50 flex items-center gap-3 active:scale-95"
                                        >
                                            {isSaving ? <Loader2 className="animate-spin text-white" size={18} /> : (newProduct.id ? "Yangilash" : "Saqlash")}
                                        </button>
                                    </div>
                                </form>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* High-Resolution Image Zoom Modal (Popup) */}
            {previewImage && (
                <div 
                    className="fixed inset-0 bg-black/85 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200" 
                    onClick={() => setPreviewImage(null)}
                >
                    <div 
                        className="relative max-w-4xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl p-3 border border-gray-100" 
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="relative w-full h-[65vh] md:h-[75vh] flex items-center justify-center bg-gray-950 rounded-2xl overflow-hidden">
                            <img 
                                src={previewImage} 
                                alt="Katta rasm" 
                                className="max-w-full max-h-full object-contain" 
                                referrerPolicy="no-referrer"
                            />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-white">
                            <div className="flex items-center gap-3 flex-wrap">
                                <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border border-emerald-200">
                                    <CheckCircle2 size={14} /> WebP S3 Faol
                                </span>
                                <a 
                                    href={previewImage} 
                                    target="_blank" 
                                    rel="noreferrer" 
                                    className="text-xs font-bold text-gray-500 hover:text-black flex items-center gap-1.5 underline"
                                >
                                    <ExternalLink size={13} /> Asl havolani yangi tabda ochish
                                </a>
                            </div>
                            <button
                                type="button"
                                onClick={() => setPreviewImage(null)}
                                className="px-6 py-2.5 bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-gray-800 transition-all shadow-md active:scale-95"
                            >
                                Yopish
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Moomkin.uz Tahrirlash Modali */}
            {moomkinModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-6 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-3xl rounded-[32px] overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-gray-100">
                        {/* Header */}
                        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-red-50 to-rose-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-red-500 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-red-500/20">
                                    MK
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-lg font-black uppercase text-gray-900 tracking-tight">
                                            Moomkin.uz Mahsuloti
                                        </h3>
                                        <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full font-black text-[10px] tracking-wider">
                                            ID: #{moomkinModal.moomkin_id}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-400 font-bold">
                                        {moomkinModal.product.name_uz || moomkinModal.product.name}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMoomkinModal(null)}
                                className="p-2.5 hover:bg-white rounded-full transition-all text-gray-400 hover:text-gray-700 border border-transparent hover:border-gray-200 shadow-sm"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {moomkinModalLoading ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-3 text-gray-400">
                                    <Loader2 className="animate-spin text-red-500" size={32} />
                                    <p className="text-xs font-black uppercase tracking-widest">Moomkin.uz dan ma'lumotlar olinmoqda...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Narx Bloki */}
                                    <div className="bg-gray-50/80 p-5 rounded-2xl border border-gray-100">
                                        <div className="flex items-center justify-between mb-3">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                                                Moomkin Sotuv Narxi (So'm)
                                            </label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-gray-400">
                                                    Velari narxi: {moomkinModal.product.price.toLocaleString()} so'm
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => setMoomkinEditFields(prev => ({
                                                        ...prev,
                                                        price: Math.round(moomkinModal.product.price * 1.10)
                                                    }))}
                                                    className="px-2 py-0.5 bg-red-100 hover:bg-red-200 text-red-700 text-[9px] font-black rounded uppercase tracking-wider transition-colors"
                                                >
                                                    +10% hisoblash
                                                </button>
                                            </div>
                                        </div>
                                        <input
                                            type="number"
                                            value={moomkinEditFields.price || ""}
                                            onChange={(e) => setMoomkinEditFields(prev => ({ ...prev, price: Number(e.target.value) }))}
                                            className="w-full bg-white border border-gray-200 rounded-xl py-3 px-4 text-base font-black outline-none focus:ring-2 focus:ring-red-500 text-gray-900 shadow-sm"
                                            placeholder="Masalan: 250000"
                                        />
                                    </div>

                                    {/* Mahsulot Nomi */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                                                Nomi (O'zbekcha)
                                            </label>
                                            <input
                                                value={moomkinEditFields.name_uz || ""}
                                                onChange={(e) => setMoomkinEditFields(prev => ({ ...prev, name_uz: e.target.value }))}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-xs font-bold outline-none focus:ring-2 focus:ring-red-500 text-gray-900 shadow-sm"
                                                placeholder="Moomkindagi nomi (UZ)"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                                                Название (Русский)
                                            </label>
                                            <input
                                                value={moomkinEditFields.name_ru || ""}
                                                onChange={(e) => setMoomkinEditFields(prev => ({ ...prev, name_ru: e.target.value }))}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl py-3 px-4 text-xs font-bold outline-none focus:ring-2 focus:ring-red-500 text-gray-900 shadow-sm"
                                                placeholder="Moomkindagi nomi (RU)"
                                            />
                                        </div>
                                    </div>

                                    {/* Tavsiflar */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                                                Tavsif (O'zbekcha)
                                            </label>
                                            <textarea
                                                rows={5}
                                                value={moomkinEditFields.description_uz || ""}
                                                onChange={(e) => setMoomkinEditFields(prev => ({ ...prev, description_uz: e.target.value }))}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-medium outline-none focus:ring-2 focus:ring-red-500 text-gray-900 shadow-sm resize-none"
                                                placeholder="Moomkindagi tavsif (UZ)"
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                                                Описание (Русский)
                                            </label>
                                            <textarea
                                                rows={5}
                                                value={moomkinEditFields.description_ru || ""}
                                                onChange={(e) => setMoomkinEditFields(prev => ({ ...prev, description_ru: e.target.value }))}
                                                className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-medium outline-none focus:ring-2 focus:ring-red-500 text-gray-900 shadow-sm resize-none"
                                                placeholder="Moomkindagi tavsif (RU)"
                                            />
                                        </div>
                                    </div>

                                    {/* Rasmlar Galereyasi */}
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-1">
                                            Yuklangan rasmlar ({moomkinModalData?.attachments?.length || moomkinModal.product.images?.length || 1} ta)
                                        </label>
                                        <div className="flex gap-3 overflow-x-auto pb-2">
                                            {(moomkinModalData?.attachments?.length ? moomkinModalData.attachments : (moomkinModal.product.images || [moomkinModal.product.image])).map((img: any, idx: number) => {
                                                const src = typeof img === 'string' ? img : (img.url || img.path || moomkinModal.product.image);
                                                const isMain = idx === 0;
                                                return (
                                                    <div
                                                        key={idx}
                                                        className={`relative w-20 h-24 rounded-2xl overflow-hidden flex-shrink-0 bg-gray-100 ${isMain ? 'ring-2 ring-red-500' : 'border border-gray-200'}`}
                                                    >
                                                        <img
                                                            src={src}
                                                            alt=""
                                                            className="w-full h-full object-cover"
                                                            referrerPolicy="no-referrer"
                                                        />
                                                        {isMain && (
                                                            <div className="absolute top-1 left-1 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow">
                                                                Asosiy
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 bg-gray-50/80 border-t border-gray-100 flex items-center justify-between">
                            <div className="text-[11px] font-bold text-gray-400 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                                Moomkin API ulanishi faol
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => setMoomkinModal(null)}
                                    className="px-5 py-2.5 text-xs font-black uppercase tracking-wider text-gray-500 hover:text-gray-900 transition-colors"
                                >
                                    Bekor qilish
                                </button>
                                <button
                                    type="button"
                                    onClick={handleMoomkinSave}
                                    disabled={moomkinModalSaving || moomkinModalLoading}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-red-500 hover:bg-red-600 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {moomkinModalSaving ? (
                                        <>
                                            <Loader2 size={14} className="animate-spin" />
                                            <span>Saqlanmoqda...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Check size={14} />
                                            <span>Moomkinda Saqlash</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminProductsPage() {
    return (
        <Suspense fallback={
            <div className="flex flex-col items-center justify-center py-32 text-gray-400">
                <Loader2 className="animate-spin mb-4" size={32} />
                <p className="font-black uppercase tracking-widest text-xs">Yuklanmoqda...</p>
            </div>
        }>
            <AdminProducts />
        </Suspense>
    );
}
