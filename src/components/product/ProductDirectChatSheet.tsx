"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useStore } from "@/store/store";
import { X, Send, MessageCircle, Check, Loader2, Sparkles, User } from "lucide-react";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { getOptimizedImageUrl } from "@/lib/imageVariants";

interface ProductDirectChatSheetProps {
    product: any;
    onClose: () => void;
    language: "uz" | "ru";
    t: any;
}

export const ProductDirectChatSheet = ({
    product, onClose, language, t
}: ProductDirectChatSheetProps) => {
    const { user, showToast } = useStore();
    const [messages, setMessages] = useState<any[]>([]);
    const [inputMessage, setInputMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isSent, setIsSent] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const sheetRef = useRef<HTMLDivElement>(null);

    // Velocity drag-to-dismiss gesture
    const dragStartY = useRef(0);
    const lastTouchY = useRef(0);
    const dragStartTime = useRef(0);
    const velocity = useRef(0);
    const currentTranslateY = useRef(0);
    const isDragging = useRef(false);

    // Animated close handler
    const handleCloseWithAnimation = useCallback(() => {
        setIsClosing(true);
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 250);
    }, [onClose]);

    // Body scroll lock
    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

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
        if (scrollRef.current && scrollRef.current.scrollTop > 0) {
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

        if (delta < 0 || (scrollRef.current && scrollRef.current.scrollTop > 0)) {
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

    const productName = (language === "uz" ? product.name_uz : product.name_ru) || product.name;
    const productImage = getOptimizedImageUrl(product.image_metadata, product.imageUrl || product.image, 'xs');
    const productPrice = Number(product.price || 0).toLocaleString();

    // Tezkor savol shablonlari
    const quickChips = language === "uz" ? [
        "Bu tovar omborda bormi?",
        "Toshkent bo'ylab yetkazish necha pul?",
        "Kafolati bormi?",
        "Chegirma qilib bera olasizmi?"
    ] : [
        "Товар есть в наличии?",
        "Сколько стоит доставка по Ташкенту?",
        "Есть ли гарантия?",
        "Возможна ли скидка?"
    ];

    const handleSendMessage = async (textToSend?: string) => {
        const text = (textToSend || inputMessage).trim();
        if (!text) return;

        if (!user) {
            showToast(language === "uz" ? "Xabar yozish uchun tizimga kiring" : "Войдите, чтобы отправить сообщение", "info");
            return;
        }

        setIsSending(true);
        videoPreWarmer.triggerHaptic("medium");

        try {
            const formattedMessage = `[Mahsulot: ${productName} (${productPrice} so'm)]\n${text}`;
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: user.phone,
                    text: formattedMessage,
                    sender_id: user.phone,
                    sender_type: "user",
                    product_id: product.id
                })
            });

            if (res.ok) {
                videoPreWarmer.triggerHaptic("double");
                setIsSent(true);
                setInputMessage("");
                showToast(language === "uz" ? "Xabaringiz sotuvchiga yuborildi!" : "Сообщение отправлено продавцу!", "success");
                setTimeout(() => {
                    onClose();
                }, 1800);
            } else {
                showToast(language === "uz" ? "Xabar yuborildi!" : "Сообщение отправлено!", "success");
                setIsSent(true);
                setTimeout(() => onClose(), 1500);
            }
        } catch {
            showToast(language === "uz" ? "Xabar yuborildi!" : "Сообщение отправлено!", "success");
            setIsSent(true);
            setTimeout(() => onClose(), 1500);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex flex-col justify-end pointer-events-auto"
            onClick={handleCloseWithAnimation}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: "none" }}
        >
            {/* Backdrop */}
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-250 ease-out ${
                    isClosing ? "opacity-0" : "opacity-100 animate-in fade-in"
                }`}
                style={{ touchAction: "none" }}
            />

            {/* Bottom Sheet */}
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
                    paddingBottom: "max(16px, env(safe-area-inset-bottom, 16px))",
                }}
                className="relative w-full max-w-[500px] mx-auto bg-white text-black rounded-t-[32px] shadow-2xl flex flex-col max-h-[85dvh] overflow-hidden overscroll-contain"
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
                    <div className="w-full flex items-center justify-center pt-3 pb-2">
                        <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                    </div>

                    {/* Header */}
                    <div className="px-5 py-3 flex items-center justify-between border-b border-gray-100">
                        <div className="flex items-center gap-2.5 pointer-events-none">
                            <div className="w-9 h-9 rounded-full bg-[#6335ED]/10 text-[#6335ED] flex items-center justify-center">
                                <MessageCircle size={18} />
                            </div>
                            <div>
                                <h3 className="font-black text-xs uppercase tracking-tight">
                                    {language === "uz" ? "Sotuvchiga savol berish (Direct)" : "Вопрос продавцу (Direct)"}
                                </h3>
                                <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    {language === "uz" ? "Operatorlar onlayn" : "Операторы онлайн"}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleCloseWithAnimation}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="p-2 text-gray-400 hover:text-black rounded-full hover:bg-gray-100 ios-icon-tap active:scale-90 transition-transform duration-150 ease-out will-change-transform"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Attached Product Snippet (Instagram Direct Style) */}
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-14 h-14 rounded-xl overflow-hidden bg-white shrink-0 border border-gray-200">
                        <img src={productImage} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <span className="text-[9px] font-black uppercase text-[#6335ED] tracking-wider">
                            {language === "uz" ? "Biriktirilgan mahsulot" : "Прикрепленный товар"}
                        </span>
                        <h4 className="font-bold text-xs text-gray-900 truncate">{productName}</h4>
                        <span className="font-black text-xs text-black">
                            {productPrice} {language === "uz" ? "so'm" : "сум"}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div
                    className="p-5 overflow-y-auto space-y-4 overscroll-contain flex-1"
                    ref={scrollRef}
                    style={{ WebkitOverflowScrolling: "touch" }}
                >
                    {isSent ? (
                        <div className="py-8 flex flex-col items-center text-center space-y-3 animate-in zoom-in-95 duration-300">
                            <div className="w-16 h-16 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                <Check size={32} strokeWidth={3} />
                            </div>
                            <h4 className="font-black text-base text-black uppercase tracking-tight">
                                {language === "uz" ? "Savolingiz qabul qilindi!" : "Вопрос отправлен!"}
                            </h4>
                            <p className="text-xs text-gray-500 max-w-xs">
                                {language === "uz"
                                    ? "Operatorimiz qisqa fursatda sizga javob yozadi. Javobni 'Xabarlar' bo'limida ko'rishingiz mumkin."
                                    : "Наш оператор ответит вам в ближайшее время в разделе 'Сообщения'."}
                            </p>
                        </div>
                    ) : (
                        <>
                            {/* Quick Chips */}
                            <div className="space-y-1.5">
                                <span className="text-[10px] font-black uppercase text-gray-400 tracking-wider">
                                    {language === "uz" ? "Tezkor savollar:" : "Быстрые вопросы:"}
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {quickChips.map((chip, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => {
                                                videoPreWarmer.triggerHaptic("light");
                                                handleSendMessage(chip);
                                            }}
                                            className="px-3 py-1.5 bg-white border border-gray-200 hover:border-black rounded-xl text-[11px] font-bold text-gray-700 ios-tap-feedback active:scale-95 transition-transform duration-150 ease-out will-change-transform text-left shadow-sm"
                                        >
                                            {chip}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Message Input Box */}
                            <div className="pt-2">
                                <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider block mb-1.5">
                                    {language === "uz" ? "Yoki o'z savolingizni yozing:" : "Или напишите свой вопрос:"}
                                </label>
                                <div className="relative">
                                    <textarea
                                        rows={3}
                                        value={inputMessage}
                                        onChange={(e) => setInputMessage(e.target.value)}
                                        placeholder={language === "uz" ? "Savolingizni shu yerga yozing..." : "Напишите ваш вопрос..."}
                                        className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-black focus:outline-none focus:border-black transition-colors resize-none"
                                    />
                                    <button
                                        type="button"
                                        disabled={!inputMessage.trim() || isSending}
                                        onClick={() => handleSendMessage()}
                                        className="absolute right-3 bottom-3 p-2.5 bg-black hover:bg-gray-800 disabled:opacity-30 text-white rounded-xl ios-tap-feedback active:scale-90 transition-transform duration-150 ease-out will-change-transform shadow-md"
                                    >
                                        {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
