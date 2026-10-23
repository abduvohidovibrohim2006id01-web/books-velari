"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useStore } from "@/store/store";
import { supabase } from "@/lib/supabase";
import { getProductSlug } from "@/lib/slugify";
import { getOptimizedImageUrl } from "@/lib/imageVariants";
import {
    X,
    ShoppingBag,
    Zap,
    Check,
    Plus,
    Minus,
    Loader2,
    Sparkles,
    Phone,
    User,
    MapPin,
    ChevronRight,
} from "lucide-react";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface QuickBuySheetProps {
    product: any;
    onClose: () => void;
    language: "uz" | "ru";
    t: any;
}

export const QuickBuySheet = ({ product, onClose, language, t }: QuickBuySheetProps) => {
    const router = useRouter();
    const { user, addToCart, showToast } = useStore();

    const [currentProduct, setCurrentProduct] = useState<any>(product);
    const [quantity, setQuantity] = useState(1);
    const [selectedVariant, setSelectedVariant] = useState<string>(product.colorName || "");
    const [groupVariants, setGroupVariants] = useState<any[]>([]);
    const [isFastBuyOpen, setIsFastBuyOpen] = useState(false);
    const [addedToCart, setAddedToCart] = useState(false);

    // Fast Buy form inputs
    const [customerName, setCustomerName] = useState(user?.name || user?.username || "");
    const [customerPhone, setCustomerPhone] = useState(user?.phone || "+998");
    const [customerAddress, setCustomerAddress] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderSuccess, setOrderSuccess] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Drag to dismiss gesture with velocity tracking
    const sheetRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const dragStartY = useRef(0);
    const lastTouchY = useRef(0);
    const dragStartTime = useRef(0);
    const velocity = useRef(0);
    const currentTranslateY = useRef(0);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const productName = currentProduct[`name_${language}`] || currentProduct.name || "Mahsulot";
    const productPrice = Number(currentProduct.price || 0);
    const productOldPrice = Number(currentProduct.oldPrice || 0);
    const rawImg = currentProduct.imageUrl || currentProduct.image || "";
    const productImage = getOptimizedImageUrl(currentProduct.image_metadata, rawImg, 'xs');
    const discountPercent =
        productOldPrice > productPrice
            ? Math.round(((productOldPrice - productPrice) / productOldPrice) * 100)
            : 0;

    // Fetch real variants if product belongs to a group (group_id)
    useEffect(() => {
        setCurrentProduct(product);
        setSelectedVariant(product.colorName || "");

        const gid = product.groupId || product.group_id;
        if (!gid) {
            setGroupVariants([]);
            return;
        }

        let isCancelled = false;

        (async () => {
            try {
                const { data } = await supabase
                    .from("products")
                    .select("id,name,name_uz,name_ru,price,old_price,image,images,image_metadata,color_name,model,article,stock")
                    .eq("group_id", gid)
                    .eq("is_deleted", false);

                if (!isCancelled && data && data.length > 0) {
                    setGroupVariants(data);
                    const match = data.find((p: any) => p.id === (product.productId || product.id));
                    if (match) {
                        setSelectedVariant(match.color_name || match.model || match.name);
                    }
                }
            } catch {}
        })();

        return () => {
            isCancelled = true;
        };
    }, [product]);

    const handleQuantityChange = (delta: number) => {
        const next = Math.max(1, quantity + delta);
        if (next !== quantity) {
            videoPreWarmer.triggerHaptic("light");
            setQuantity(next);
        }
    };

    const handleSelectVariant = (variant: any) => {
        videoPreWarmer.triggerHaptic("light");
        const label = variant.color_name || variant.model || variant.name;
        setSelectedVariant(label);
        setCurrentProduct({
            ...currentProduct,
            ...variant,
            id: variant.id,
            productId: variant.id,
            image: variant.image || currentProduct.image,
            imageUrl: variant.image || currentProduct.imageUrl,
            price: Number(variant.price) || currentProduct.price,
            oldPrice: Number(variant.old_price) || currentProduct.oldPrice,
        });
    };

    const handleOpenProductPage = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        videoPreWarmer.triggerHaptic("medium");
        const target = {
            id: currentProduct.productId || currentProduct.id,
            article: currentProduct.article,
            name: currentProduct.name,
            name_uz: currentProduct.name_uz,
            name_ru: currentProduct.name_ru,
        };
        const slug = getProductSlug(target, language);
        router.push(`/${language}/products/${slug}`);
    };

    const handleAddToCart = () => {
        videoPreWarmer.triggerHaptic("medium");
        addToCart({
            ...currentProduct,
            id: currentProduct.productId || currentProduct.id,
            quantity,
            selectedColor: selectedVariant || currentProduct.colorName || undefined,
        });
        setAddedToCart(true);
        showToast(language === "uz" ? "Savatga qo'shildi!" : "Добавлено в корзину!", "success");
        setTimeout(() => setAddedToCart(false), 2000);
    };

    const handleFastBuySubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const cleanedPhone = customerPhone.replace(/[^\d+]/g, "");
        if (cleanedPhone.length < 9) {
            showToast(language === "uz" ? "Telefon raqamingizni to'liq kiriting" : "Введите корректный номер", "error");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch("/api/orders/place", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    p_user_phone: cleanedPhone,
                    p_items: [{
                        id: currentProduct.productId || currentProduct.id,
                        name: productName,
                        price: productPrice,
                        quantity,
                        image: productImage,
                    }],
                    p_address: customerAddress || (language === "uz" ? "Tezkor Reels buyurtmasi" : "Быстрый заказ из Reels"),
                    p_status: "Yangi (Reels)",
                    p_delivery_type: "standard",
                    p_comment: `Ism: ${customerName}, Variant: ${selectedVariant || currentProduct.colorName || "Standart"}`
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                videoPreWarmer.triggerHaptic("double");
                setOrderSuccess(true);
            } else {
                showToast(data?.error || (language === "uz" ? "Buyurtma yuborilmadi. Qayta urinib ko'ring." : "Не удалось оформить заказ. Попробуйте снова."), "error");
            }
        } catch (err: any) {
            console.error("Quick buy error:", err);
            showToast(language === "uz" ? "Tarmoq xatosi. Internet aloqasini tekshiring." : "Ошибка сети. Проверьте подключение к интернету.", "error");
        } finally {
            setIsSubmitting(false);
        }
    };

    // Touch drag down to dismiss with iOS velocity & spring physics & Pointer Capture
    const isDragging = useRef(false);

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
            sheetRef.current.style.animation = "none";
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
        if (isDragging.current) return;
        if (contentRef.current && contentRef.current.scrollTop > 0) {
            return;
        }
        const y = e.touches[0].clientY;
        dragStartY.current = y;
        lastTouchY.current = y;
        dragStartTime.current = performance.now();
        velocity.current = 0;
        isDragging.current = true;
        if (sheetRef.current) {
            sheetRef.current.style.animation = "none";
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
        if (!sheetRef.current || !isDragging.current) return;
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

    const handleCloseWithAnimation = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        if (sheetRef.current) {
            sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out";
            sheetRef.current.style.transform = "translate3d(0, 100%, 0)";
            sheetRef.current.style.opacity = "0";
        }
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 250);
    }, [isClosing, onClose]);

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[99999] flex flex-col justify-end pointer-events-auto"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: "none" }}
        >
            {/* Backdrop with native blur */}
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-250 ease-out ${
                    isClosing ? "opacity-0" : "opacity-100 animate-in fade-in"
                }`}
                style={{ touchAction: "none" }}
                onClick={handleCloseWithAnimation}
            />

            {/* Bottom Sheet Container */}
            <div
                ref={sheetRef}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                style={{
                    willChange: "transform",
                    WebkitOverflowScrolling: "touch",
                    overscrollBehavior: "contain",
                    transition: isClosing ? "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out" : undefined,
                    transform: isClosing ? "translate3d(0, 100%, 0)" : undefined,
                    animation: (!isClosing && !isDragging.current && currentTranslateY.current === 0)
                        ? "velari-sheet-up 320ms cubic-bezier(0.22, 1, 0.36, 1)"
                        : "none",
                }}
                className="relative w-full max-w-[500px] mx-auto bg-white text-[#111612] rounded-t-[32px] shadow-[0_-15px_40px_rgba(0,0,0,0.3)] flex flex-col max-h-[85dvh] overflow-hidden will-change-transform overscroll-contain"
            >
                {/* Drag pill handle & Header (Dedicated Touch-Action None Drag Zone) */}
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="w-full shrink-0 select-none cursor-grab active:cursor-grabbing"
                    style={{ touchAction: "none" }}
                >
                    <div className="w-full flex items-center justify-center pt-3 pb-2">
                        <div className="w-11 h-1.5 bg-gray-200 rounded-full" />
                    </div>

                    {/* Header */}
                    <div className="px-5 pb-3 flex items-center justify-between border-b border-gray-100">
                        <div className="flex items-center gap-2 pointer-events-none">
                            <span className="p-1.5 bg-[#2D6E3E]/10 text-[#2D6E3E] rounded-xl">
                                <Sparkles size={16} />
                            </span>
                            <h3 className="font-semibold text-[17px] text-[#111612] tracking-tight">
                                {language === "uz" ? "Tezkor Xarid" : "Быстрая покупка"}
                            </h3>
                        </div>
                        <button
                            type="button"
                            onClick={handleCloseWithAnimation}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-10 h-10 flex items-center justify-center bg-gray-100/80 rounded-full text-gray-500 hover:text-black active:scale-90 transition-transform"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div ref={contentRef} className="p-5 pb-[max(20px,env(safe-area-inset-bottom))] overflow-y-auto space-y-5 no-scrollbar">
                    {orderSuccess ? (
                        /* Success View */
                        <div className="py-8 flex flex-col items-center text-center space-y-4 animate-in zoom-in-95 duration-300">
                            <div className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-xl shadow-emerald-500/30">
                                <Check size={40} strokeWidth={3} />
                            </div>
                            <div className="space-y-1">
                                <h4 className="font-black text-xl text-black uppercase tracking-tight">
                                    {language === "uz" ? "Buyurtma qabul qilindi!" : "Заказ принят!"}
                                </h4>
                                <p className="text-xs text-gray-500 max-w-xs font-medium">
                                    {language === "uz"
                                        ? "Operatorimiz tez orada tafsilotlarni tasdiqlash uchun siz bilan bog'lanadi."
                                        : "Наш оператор свяжется с вами в ближайшее время для подтверждения деталей."}
                                </p>
                            </div>
                            <button
                                onClick={handleCloseWithAnimation}
                                className="w-full py-4 bg-black text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition-transform duration-150 shadow-lg"
                            >
                                {language === "uz" ? "Reels tomosha qilishda davom etish" : "Продолжить просмотр"}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* ── 1. Interactive Premium Product Card (Clickable to PDP) ── */}
                            <div
                                onClick={handleOpenProductPage}
                                className="group relative flex items-center gap-4 bg-gradient-to-br from-gray-50 via-white to-gray-50 p-3.5 rounded-2xl border border-gray-200/90 shadow-sm hover:shadow-md hover:border-gray-300 transition-colors duration-150 cursor-pointer active:scale-[0.98]"
                                role="button"
                                tabIndex={0}
                                aria-label={language === "uz" ? "Mahsulot sahifasiga o'tish" : "Перейти на страницу товара"}
                            >
                                {/* Left: Product Thumbnail with aspect ratio & badge */}
                                <div className="relative w-24 h-28 rounded-xl overflow-hidden bg-white shrink-0 border border-gray-200 shadow-inner">
                                    <img
                                        src={productImage}
                                        alt={productName}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    />
                                    {discountPercent > 0 && (
                                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 bg-red-600 text-white rounded-md text-[9px] font-black uppercase tracking-wider shadow-sm">
                                            -{discountPercent}%
                                        </span>
                                    )}
                                </div>

                                {/* Right: Product Info */}
                                <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-1">
                                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-gray-400">
                                                {currentProduct.category || "Velari"}
                                            </span>
                                            {currentProduct.article && (
                                                <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                                                    #{currentProduct.article}
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="font-bold text-[13px] text-gray-900 line-clamp-2 leading-snug group-hover:text-[#6335ED] transition-colors">
                                            {productName}
                                        </h4>
                                    </div>

                                    {/* Price and Stock */}
                                    <div className="mt-2">
                                        <div className="flex items-baseline gap-2 flex-wrap">
                                            <span className="font-black text-base text-[#6335ED]">
                                                {(productPrice * quantity).toLocaleString("ru-RU")}{" "}
                                                <span className="text-xs font-bold text-gray-600">
                                                    {language === "uz" ? "so'm" : "сум"}
                                                </span>
                                            </span>
                                            {productOldPrice > productPrice && (
                                                <span className="text-xs text-gray-400 line-through font-medium">
                                                    {(productOldPrice * quantity).toLocaleString("ru-RU")}
                                                </span>
                                            )}
                                        </div>

                                        {/* Bottom Action Cue */}
                                        <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-gray-100">
                                            <span className="text-[10.5px] text-emerald-600 font-bold flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                {language === "uz" ? "Omborda mavjud" : "В наличии"}
                                            </span>
                                            <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-[#6335ED] group-hover:translate-x-0.5 transition-transform">
                                                {language === "uz" ? "Batafsil" : "Подробнее"}
                                                <ChevronRight size={13} strokeWidth={2.5} />
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* ── 2. Real Variants Selector (Group Products) ── */}
                            {groupVariants.length > 1 ? (
                                <div className="space-y-2 pt-1">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-black uppercase text-gray-400 tracking-wider">
                                            {language === "uz" ? "Variant / Rang" : "Вариант / Цвет"}
                                        </label>
                                        {selectedVariant && (
                                            <span className="text-[11px] font-bold text-gray-800">
                                                {selectedVariant}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {groupVariants.map((v) => {
                                            const isSelected = v.id === (currentProduct.productId || currentProduct.id);
                                            const label = v.color_name || v.model || v.name;
                                            return (
                                                <button
                                                    key={v.id}
                                                    type="button"
                                                    onClick={() => handleSelectVariant(v)}
                                                    className={`flex items-center gap-2 p-1.5 pr-3 rounded-xl text-xs font-bold transition-colors duration-150 border ${
                                                        isSelected
                                                            ? "bg-black text-white border-black shadow-md scale-102 ring-2 ring-black/20"
                                                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-400"
                                                    }`}
                                                >
                                                    {v.image && (
                                                        <img
                                                            src={getOptimizedImageUrl(v.image_metadata, v.image, 'xs')}
                                                            alt=""
                                                            className="w-6 h-6 rounded-lg object-cover border border-white/20"
                                                        />
                                                    )}
                                                    <span className="truncate max-w-[120px]">{label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : currentProduct.colorName ? (
                                <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
                                    <span className="font-bold text-gray-400 uppercase text-[10px] tracking-wider">
                                        {language === "uz" ? "Rang:" : "Цвет:"}
                                    </span>
                                    <span className="font-bold text-gray-800">{currentProduct.colorName}</span>
                                </div>
                            ) : null}

                            {/* ── 3. Quantity Selector ── */}
                            <div className="flex items-center justify-between py-2 border-y border-gray-100">
                                <span className="text-xs font-black uppercase tracking-wider text-gray-700">
                                    {language === "uz" ? "Miqdori:" : "Количество:"}
                                </span>
                                <div className="flex items-center gap-3 bg-gray-100 p-1.5 rounded-2xl">
                                    <button
                                        type="button"
                                        onClick={() => handleQuantityChange(-1)}
                                        disabled={quantity <= 1}
                                        className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-black shadow-sm disabled:opacity-30 active:scale-90 transition-transform"
                                        aria-label="Kamaytirish"
                                    >
                                        <Minus size={14} strokeWidth={3} />
                                    </button>
                                    <span className="font-black text-sm px-2 min-w-[20px] text-center">{quantity}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleQuantityChange(1)}
                                        className="w-8 h-8 rounded-xl bg-white text-black flex items-center justify-center font-black shadow-sm active:scale-90 transition-transform"
                                        aria-label="Ko'paytirish"
                                    >
                                        <Plus size={14} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>

                            {/* ── 4. Fast Buy Form Accordion or Action Buttons ── */}
                            {isFastBuyOpen ? (
                                <form onSubmit={handleFastBuySubmit} className="space-y-3 pt-1 animate-in fade-in duration-300">
                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                            {language === "uz" ? "Ismingiz" : "Ваше имя"}
                                        </label>
                                        <div className="relative">
                                            <User size={16} className="absolute left-3.5 top-3.5 text-gray-400" />
                                            <input
                                                type="text"
                                                required
                                                placeholder={language === "uz" ? "Azizbek" : "Имя"}
                                                value={customerName}
                                                onChange={(e) => setCustomerName(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-black focus:outline-none focus:border-black transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                            {language === "uz" ? "Telefon raqam" : "Номер телефона"}
                                        </label>
                                        <div className="relative">
                                            <Phone size={16} className="absolute left-3.5 top-3.5 text-gray-400" />
                                            <input
                                                type="tel"
                                                required
                                                placeholder="+998 90 123 45 67"
                                                value={customerPhone}
                                                onChange={(e) => setCustomerPhone(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-black focus:outline-none focus:border-black transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[10px] font-black uppercase text-gray-500 tracking-wider">
                                            {language === "uz" ? "Yetkazib berish manzili" : "Адрес доставки"}
                                        </label>
                                        <div className="relative">
                                            <MapPin size={16} className="absolute left-3.5 top-3.5 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder={language === "uz" ? "Toshkent shahar, Chilonzor..." : "Ташкент, Чиланзар..."}
                                                value={customerAddress}
                                                onChange={(e) => setCustomerAddress(e.target.value)}
                                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-black focus:outline-none focus:border-black transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex gap-2 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setIsFastBuyOpen(false)}
                                            className="px-4 py-3.5 bg-gray-100 text-gray-700 font-bold text-xs rounded-2xl active:scale-95 transition-transform duration-150"
                                        >
                                            {language === "uz" ? "Orqaga" : "Назад"}
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={isSubmitting}
                                            className="flex-1 py-3.5 bg-[#6335ED] hover:bg-[#5026cb] text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition-transform duration-150 shadow-xl shadow-[#6335ED]/30 flex items-center justify-center gap-2"
                                        >
                                            {isSubmitting ? (
                                                <Loader2 size={18} className="animate-spin" />
                                            ) : (
                                                <>
                                                    <Check size={18} strokeWidth={3} />
                                                    <span>{language === "uz" ? "Buyurtmani Tasdiqlash" : "Подтвердить заказ"}</span>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                /* Action Buttons */
                                <div className="space-y-2.5 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("medium");
                                            setIsFastBuyOpen(true);
                                        }}
                                        className="w-full py-4 bg-[#6335ED] hover:bg-[#5329cf] text-white font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition-transform duration-150 shadow-xl shadow-[#6335ED]/25 flex items-center justify-center gap-2"
                                    >
                                        <Zap size={18} fill="currentColor" />
                                        <span>{language === "uz" ? "1-Bosqichda Tezkor Xarid" : "Купить в 1 клик"}</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleAddToCart}
                                        className="w-full py-4 bg-gray-100 hover:bg-gray-200 text-black font-black text-xs uppercase tracking-widest rounded-2xl active:scale-95 transition-transform duration-150 flex items-center justify-center gap-2"
                                    >
                                        {addedToCart ? (
                                            <>
                                                <Check size={18} className="text-emerald-600" strokeWidth={3} />
                                                <span className="text-emerald-600">
                                                    {language === "uz" ? "Savatga qo'shildi!" : "В корзине!"}
                                                </span>
                                            </>
                                        ) : (
                                            <>
                                                <ShoppingBag size={18} strokeWidth={2.5} />
                                                <span>{language === "uz" ? "Savatga Qo'shish" : "В корзину"}</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};
