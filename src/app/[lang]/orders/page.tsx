"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/store/store";
import { supabase } from "@/lib/supabase";
import { getProductSlug } from "@/lib/slugify";
import { Package, ChevronRight, ChevronLeft, Clock, CheckCircle, Truck, XCircle, Loader2, Star, Camera, Video, MessageCircle, Play, RefreshCw } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getOptimizedImageUrl } from "@/lib/imageVariants";
import { translations } from "@/lib/translations";
import { uploadToYandexS3 } from "@/lib/yandex-s3";
import { mapOrder, mapProduct } from "@/lib/mappers";
import { normalizeOrderStatus, getStatusLabel } from "@/lib/order-status";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface Order {
    id: string;
    total: number;
    status: string;
    createdAt: any;
    items: any[];
}

export default function OrdersPage() {
    const { language, user, showToast } = useStore();
    const t = translations[language];
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [mounted, setMounted] = useState(false);

    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [enrichedItems, setEnrichedItems] = useState<any[]>([]);
    const [isCancelling, setIsCancelling] = useState(false);
    const [orderToCancel, setOrderToCancel] = useState<string | null>(null);

    // Qaytarish (vozvrat) holatlari
    const [returnOrder, setReturnOrder] = useState<Order | null>(null);
    const [returnReason, setReturnReason] = useState("");
    const [isReturning, setIsReturning] = useState(false);
    // order_id -> eng so'nggi qaytarish so'rovi holati (badge va qayta yuborishni cheklash uchun)
    const [returnsMap, setReturnsMap] = useState<Record<string, string>>({});

    // Review states
    const [reviewProduct, setReviewProduct] = useState<any>(null);
    const [reviewRating, setReviewRating] = useState(5);
    const [reviewText, setReviewText] = useState("");
    const [reviewImages, setReviewImages] = useState<string[]>([]);
    const [reviewVideo, setReviewVideo] = useState("");
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (user) {
            fetchOrders();
            fetchReturns();
        } else {
            setLoading(false);
        }
    }, [user]);

    // Foydalanuvchining qaytarish so'rovlari -> order_id bo'yicha eng so'nggi holat
    const fetchReturns = async () => {
        try {
            const res = await fetch(`/api/orders/return?phone=${encodeURIComponent(user?.phone || '')}`, {
                credentials: "include",
                cache: "no-store",
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success && Array.isArray(data.returns)) {
                // returns created_at bo'yicha kamayuvchi tartibda keladi — birinchisi eng so'nggi
                const map: Record<string, string> = {};
                for (const r of data.returns) {
                    if (!map[r.order_id]) map[r.order_id] = r.status; // eng so'nggisi
                }
                setReturnsMap(map);
            }
        } catch (error) {
            console.error("Fetch returns error:", error);
        }
    };

    useEffect(() => {
        if (selectedOrder) {
            const enrich = async () => {
                const items = [...(selectedOrder.items || [])];
                setEnrichedItems(items);

                const missingProductIds = items
                    .filter(item => !item.image && !item.imageUrl && !item.image_url)
                    .map(item => item.id);

                if (missingProductIds.length > 0) {
                    const { data: productsData } = await supabase
                        .from("products")
                        // products jadvalida image_url yo'q — image va image_metadata (optimallashtirilgan variant uchun)
                        .select("id, image, image_metadata")
                        .in("id", missingProductIds);

                    if (productsData) {
                        const updatedItems = items.map(item => {
                            const product = productsData.find(p => p.id === item.id);
                            return product
                                ? { ...item, image: product.image, image_metadata: item.image_metadata || product.image_metadata }
                                : item;
                        });
                        setEnrichedItems(updatedItems);
                    }
                }
            };
            enrich();
        }
    }, [selectedOrder]);

    const fetchOrders = async () => {
        try {
            const response = await fetch(`/api/orders/user?phone=${encodeURIComponent(user?.phone || '')}`, {
                credentials: "include",
                cache: "no-store",
            });
            const data = await response.json().catch(() => ({}));

            if (response.ok && data.success && Array.isArray(data.orders)) {
                setOrders(data.orders.map(mapOrder));
            } else if (response.status === 401) {
                // Sessiya muddati tugagan — buyurtmalar ko'rinmasligining asosiy sababi shu bo'lishi mumkin
                showToast(language === 'uz' ? "Sessiya muddati tugadi. Iltimos, qayta kiring." : "Сессия истекла. Войдите снова.", 'info');
            } else if (response.status === 429) {
                showToast(language === 'uz' ? "Juda ko'p urinish. Biroz kuting." : "Слишком много запросов. Подождите.", 'error');
            }
        } catch (error) {
            console.error("Fetch orders error:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelOrder = async (orderId: string) => {
        setOrderToCancel(orderId);
    };

    const confirmCancelOrder = async () => {
        if (!orderToCancel) return;
        const orderId = orderToCancel;
        setOrderToCancel(null);

        setIsCancelling(true);
        try {
            const statusLabel = t.common.statusCancelled;

            // API parametrlari: orderId / status / userPhone (oldin order_id/new_status/user_phone
            // yuborilgani sababli bekor qilish umuman ishlamasdi)
            const response = await fetch('/api/orders/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    status: statusLabel,
                    userPhone: user?.phone
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || t.common.error);

            // Update local state + serverdan qayta o'qish (manba haqiqiy holat)
            setOrders(orders.map(o => o.id === orderId ? { ...o, status: statusLabel } : o));
            if (selectedOrder?.id === orderId) {
                setSelectedOrder({ ...selectedOrder, status: statusLabel });
            }
            fetchOrders();
        } catch (error) {
            console.error("Cancel order error:", error);
            const errorMsg = t.common.error + ". " + (language === 'uz' ? "Iltimos, qaytadan urinib ko'ring." : "Пожалуйста, попробуйте еще раз.");
            alert(errorMsg);
        } finally {
            setIsCancelling(false);
        }
    };

    const handleSubmitReturn = async () => {
        if (!returnOrder || !user?.phone || !returnReason.trim()) return;
        setIsReturning(true);
        try {
            const response = await fetch('/api/orders/return', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    order_id: returnOrder.id,
                    user_phone: user.phone,
                    items: returnOrder.items,
                    reason: returnReason.trim(),
                }),
            });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.message || t.common.error);

            showToast(language === 'uz' ? "Qaytarish so'rovi yuborildi" : "Запрос на возврат отправлен", 'success');
            setReturnOrder(null);
            setReturnReason("");
            // Holatni yangilash — endi buyurtmada "so'rov yuborilgan" ko'rinadi
            setReturnsMap(prev => ({ ...prev, [returnOrder.id]: 'pending' }));
            fetchReturns();
        } catch (error: any) {
            console.error("Return order error:", error);
            showToast(t.common.error + ": " + (error.message || ""), 'error');
        } finally {
            setIsReturning(false);
        }
    };

    // Qaytarish holati uchun yorliq va rang (badge)
    const returnStatusInfo = (status: string): { label: string; cls: string } => {
        switch (status) {
            case 'pending':
                return { label: language === 'uz' ? "Qaytarish so'ralgan" : "Возврат запрошен", cls: "bg-orange-100 text-orange-600" };
            case 'approved':
                return { label: language === 'uz' ? "Qaytarish tasdiqlandi" : "Возврат подтверждён", cls: "bg-blue-100 text-blue-600" };
            case 'processing':
                return { label: language === 'uz' ? "Qayta ishlanmoqda" : "В обработке", cls: "bg-indigo-100 text-indigo-600" };
            case 'completed':
                return { label: language === 'uz' ? "Qaytarish yakunlandi" : "Возврат завершён", cls: "bg-green-100 text-green-600" };
            case 'rejected':
                return { label: language === 'uz' ? "Qaytarish rad etildi" : "Возврат отклонён", cls: "bg-red-100 text-red-600" };
            default:
                return { label: status, cls: "bg-gray-100 text-gray-600" };
        }
    };

    const handleSubmitReview = async () => {
        if (!user) return;
        if (!user.username) {
            showToast(t.common.usernameRequired, 'info');
            return;
        }
        if (!reviewProduct || !reviewText.trim()) return;
        if (isUploadingMedia) {
            showToast(t.common.mediaUploading, 'info');
            return;
        }

        setIsSubmittingReview(true);
        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'insert',
                    p_user_phone: user?.phone || user?.id,
                    p_comment_data: {
                        product_id: reviewProduct.id,
                        username: user?.username || user?.phone,
                        text: reviewText,
                        rating: reviewRating,
                        type: 'review',
                        data: {
                            images: reviewImages,
                            video: reviewVideo
                        }
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Xatolik yuz berdi");

            // Update product rating
            // Rating update is now handled by the server-side DB trigger for security.

            setReviewProduct(null);
            setReviewText("");
            setReviewRating(5);
            setReviewImages([]);
            setReviewVideo("");
            showToast(t.common.reviewSaved);
        } catch (error: any) {
            console.error("Review error:", error);
            showToast(t.common.error + ": " + (error.message || ""), 'error');
        } finally {
            setIsSubmittingReview(false);
        }
    };

    const formatDate = (date: any) => {
        if (!date) return t.common.justNow;
        const d = new Date(date);
        const now = new Date();
        const diffInMs = now.getTime() - d.getTime();
        const diffInMins = Math.floor(diffInMs / (1000 * 60));
        const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
        const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

        if (diffInMins < 1) {
            return t.common.justNow;
        }
        if (diffInMins < 60) {
            return language === 'uz' ? `${diffInMins} daqiqa avval` : `${diffInMins} мин. назад`;
        }
        if (diffInHours < 24) {
            return language === 'uz' ? `${diffInHours} soat avval` : `${diffInHours} час. назад`;
        }
        if (diffInDays <= 3) {
            return language === 'uz' ? `${diffInDays} kun avval` : `${diffInDays} дн. назад`;
        }

        return d.toLocaleString(language === 'uz' ? 'uz-UZ' : 'ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    if (!mounted) return null;

    if (!user) {
        return (
            <div className="p-6 min-h-screen flex flex-col items-center justify-center gap-4 text-center" style={{ background: "#FAFAF6" }}>
                <div className="w-20 h-20 rounded-full flex items-center justify-center mb-2" style={{ background: "#EAF3EC", color: "#2D6E3E" }}>
                    <Package size={40} />
                </div>
                <p className="text-gray-500 font-medium">
                    {t.common.loginToSeeOrders}
                </p>
                <Link href="/login" className="px-8 py-3 rounded-full font-bold shadow-lg text-white" style={{ background: "#2D6E3E" }}>
                    {t.account.login}
                </Link>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 min-h-screen pt-8 pb-24" style={{ background: "#FAFAF6" }}>
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-4 mb-6">
                    <Link
                        href={`/${language}/account`}
                        onClick={() => videoPreWarmer.triggerHaptic("light")}
                        className="ios-icon-tap active:scale-90 w-10 h-10 rounded-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] shadow-sm flex items-center justify-center text-[#111612] transition-transform duration-150 will-change-transform hover:bg-white"
                        aria-label={language === 'uz' ? 'Orqaga' : 'Назад'}
                    >
                        <ChevronLeft size={20} />
                    </Link>
                    <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612]">{t.account.orders}</h1>
                </div>

                {loading ? (
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white/80 rounded-[24px] p-6 border border-[rgba(15,20,16,0.06)] animate-pulse">
                                <div className="h-4 bg-gray-200 rounded-full w-24 mb-4"></div>
                                <div className="h-5 bg-gray-200 rounded-full w-48 mb-4"></div>
                                <div className="h-4 bg-gray-200 rounded-full w-32 mb-6"></div>
                                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                                    <div className="h-6 bg-gray-200 rounded-full w-28"></div>
                                    <div className="h-4 bg-gray-200 rounded-full w-16"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : orders.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-[#737D75]">
                        <div className="w-16 h-16 rounded-full bg-[#EAF3EC] flex items-center justify-center text-[#2D6E3E] mb-4">
                            <Truck size={32} />
                        </div>
                        <p className="font-semibold text-sm mb-4">
                            {t.common.noOrders}
                        </p>
                        <Link
                            href={`/${language}`}
                            className="px-6 py-3 rounded-full bg-[#2D6E3E] text-white font-semibold text-xs tracking-wide shadow-md shadow-[#2D6E3E]/20 ios-tap-feedback active:scale-95 transition-transform"
                        >
                            {t.cart.startShopping}
                        </Link>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {orders.map((order) => {
                            const s = normalizeOrderStatus(order.status);
                            return (
                                <div
                                    key={order.id}
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("light");
                                        setSelectedOrder(order);
                                    }}
                                    className="bg-white/90 backdrop-blur-md rounded-[24px] p-5 border border-[rgba(15,20,16,0.06)] shadow-sm hover:shadow-md ios-tap-feedback active:scale-[0.99] transition-[transform,box-shadow] duration-150 will-change-transform cursor-pointer"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-3">
                                        <div>
                                            <p className="text-[11px] font-semibold text-[#737D75] uppercase tracking-wider mb-0.5">{t.common.orderId}</p>
                                            <div className="font-mono text-sm font-semibold text-[#111612]">#{order.id.slice(0, 12)}</div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 justify-end">
                                            {s === 'delivered' && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                    {getStatusLabel(order.status, language)}
                                                </span>
                                            )}
                                            {s === 'paid' && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                                    {getStatusLabel(order.status, language)}
                                                </span>
                                            )}
                                            {s === 'awaiting_payment' && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                                    {getStatusLabel(order.status, language)}
                                                </span>
                                            )}
                                            {s === 'cancelled' && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                                                    {getStatusLabel(order.status, language)}
                                                </span>
                                            )}
                                            {!['delivered', 'paid', 'awaiting_payment', 'cancelled'].includes(s) && (
                                                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full bg-[#EAF3EC] text-[#2D6E3E] border border-[#2D6E3E]/20">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-[#2D6E3E]" />
                                                    {getStatusLabel(order.status, language)}
                                                </span>
                                            )}
                                            {returnsMap[order.id] && (
                                                <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-semibold ${returnStatusInfo(returnsMap[order.id]).cls}`}>
                                                    <RefreshCw size={11} /> {returnStatusInfo(returnsMap[order.id]).label}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-xs font-medium text-[#737D75] mb-4">
                                        <Clock size={14} className="text-[#737D75]" />
                                        <span>
                                            {formatDate(order.createdAt)} • {order.items?.length || 0} {t.cart.items}
                                        </span>
                                    </div>

                                    <div className="flex justify-between items-center pt-3.5 border-t border-[rgba(15,20,16,0.06)]">
                                        <div className="text-base font-bold text-[#111612] tracking-tight">{order.total?.toLocaleString()} so'm</div>
                                        <span className="flex items-center text-xs font-semibold text-[#2D6E3E]">
                                            {t.common.details} <ChevronRight size={14} className="ml-0.5" />
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Order Details Modal */}
            {selectedOrder && (
                <div onClick={() => setSelectedOrder(null)} className="fixed inset-0 bg-black/40 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
                    <div onClick={e => e.stopPropagation()} className="bg-white/95 backdrop-blur-xl w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] shadow-2xl border border-[rgba(15,20,16,0.08)] overflow-hidden pb-8 max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300">
                        {/* Grab bar on mobile */}
                        <div className="w-12 h-1.5 bg-black/15 rounded-full mx-auto mt-3 sm:hidden" />

                        <div className="p-6 pb-4 border-b border-[rgba(15,20,16,0.06)] flex justify-between items-center">
                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-[#111612]">
                                    {t.common.orderDetail}
                                </h2>
                                <p className="text-xs font-medium text-[#737D75] font-mono mt-0.5">#{selectedOrder.id}</p>
                            </div>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setSelectedOrder(null);
                                }}
                                className="ios-icon-tap active:scale-90 w-9 h-9 bg-black/5 rounded-full flex items-center justify-center text-[#111612] transition-transform duration-150 will-change-transform hover:bg-black/10"
                                aria-label="Close"
                            >
                                <ChevronRight size={20} className="rotate-90" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto no-scrollbar flex-1 space-y-6">
                            {/* Items List */}
                            <div className="space-y-3">
                                {enrichedItems.map((item: any, i: number) => (
                                    <div key={i} className="bg-[#F8FAF8] p-4 rounded-[22px] border border-[rgba(15,20,16,0.05)] space-y-3">
                                        <div className="flex items-center gap-3.5">
                                            <div className="w-16 h-20 bg-white rounded-xl overflow-hidden shrink-0 shadow-xs border border-[rgba(15,20,16,0.06)] relative">
                                                {(item.image || item.imageUrl || item.image_url) && (String(item.image || item.imageUrl || item.image_url).startsWith('http') || String(item.image || item.imageUrl || item.image_url).startsWith('/')) ? (
                                                    <Image
                                                        src={getOptimizedImageUrl(item.image_metadata, item.image || item.imageUrl || item.image_url, 'xs')}
                                                        alt={item[`name_${language}`] || item.name}
                                                        width={160}
                                                        height={214}
                                                        quality={60}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-gray-50 text-gray-300">
                                                        <Package size={24} />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-sm text-[#111612] leading-snug line-clamp-2 mb-1">
                                                    {item[`name_${language}`] || item.name}
                                                </p>
                                                <p className="text-xs font-medium text-[#737D75]">
                                                    {item.quantity} {language === 'uz' ? 'dona' : 'шт'} × {item.price.toLocaleString()} so'm
                                                </p>
                                                <div className="font-bold text-sm text-[#111612] mt-1">
                                                    {(item.price * item.quantity).toLocaleString()} so'm
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 w-full pt-1">
                                            <Link
                                                href={`/products/${getProductSlug(item, language)}`}
                                                onClick={() => videoPreWarmer.triggerHaptic("light")}
                                                className="ios-tap-feedback active:scale-[0.98] flex-1 py-2.5 bg-white border border-[rgba(15,20,16,0.08)] rounded-xl text-xs font-semibold text-[#111612] text-center flex items-center justify-center gap-1.5 hover:bg-gray-50 transition-transform duration-150 will-change-transform"
                                            >
                                                {t.common.inMarket}
                                            </Link>
                                            {(normalizeOrderStatus(selectedOrder.status) === 'delivered') && (
                                                <button
                                                    onClick={() => {
                                                        videoPreWarmer.triggerHaptic("light");
                                                        setReviewProduct(item);
                                                    }}
                                                    className="ios-tap-feedback active:scale-[0.98] flex-1 py-2.5 text-white rounded-xl text-xs font-semibold text-center flex items-center justify-center gap-1.5 shadow-sm transition-transform duration-150 will-change-transform"
                                                    style={{ background: "#2D6E3E" }}
                                                >
                                                    <Star size={13} fill="currentColor" />
                                                    {t.common.review}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Info Section */}
                            <div className="bg-[#F5F7F5] p-4 rounded-[22px] space-y-3 border border-[rgba(15,20,16,0.05)]">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#EAF3EC] text-[#2D6E3E]">
                                        <CheckCircle size={16} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-semibold text-[#737D75] uppercase tracking-wider">{t.common.status}</p>
                                        <p className="font-semibold text-xs text-[#111612]">{getStatusLabel(selectedOrder.status, language)}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#EAF3EC] text-[#2D6E3E]">
                                        <Truck size={16} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[11px] font-semibold text-[#737D75] uppercase tracking-wider">{t.common.delivery} {language === 'uz' ? 'manzili' : 'адрес'}</p>
                                        <p className="font-medium text-xs text-[#111612] line-clamp-2">{(selectedOrder as any).address || t.common.addressNotSet}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Cancel Order Button */}
                            {['awaiting_payment', 'accepted', 'pending'].includes(normalizeOrderStatus(selectedOrder.status)) && (
                                <button
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("medium");
                                        handleCancelOrder(selectedOrder.id);
                                    }}
                                    disabled={isCancelling}
                                    className="ios-tap-feedback active:scale-[0.98] w-full py-3.5 bg-rose-50 text-rose-600 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-transform duration-150 will-change-transform disabled:opacity-50 border border-rose-100"
                                >
                                    {isCancelling ? (
                                        <Loader2 className="animate-spin" size={16} />
                                    ) : (
                                        <>
                                            <XCircle size={16} />
                                            {t.common.cancelOrder}
                                        </>
                                    )}
                                </button>
                            )}

                            {/* Qaytarish (vozvrat) */}
                            {normalizeOrderStatus(selectedOrder.status) === 'delivered' && (() => {
                                const rStatus = returnsMap[selectedOrder.id];
                                if (rStatus && rStatus !== 'rejected') {
                                    const info = returnStatusInfo(rStatus);
                                    return (
                                        <div className={`w-full py-3.5 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 ${info.cls}`}>
                                            <RefreshCw size={14} /> {info.label}
                                        </div>
                                    );
                                }
                                return (
                                    <button
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("medium");
                                            setReturnOrder(selectedOrder);
                                            setReturnReason("");
                                        }}
                                        className="ios-tap-feedback active:scale-[0.98] w-full py-3.5 bg-amber-50 text-amber-700 rounded-2xl text-xs font-semibold flex items-center justify-center gap-2 transition-transform duration-150 will-change-transform border border-amber-200/60"
                                    >
                                        <RefreshCw size={14} />
                                        {rStatus === 'rejected'
                                            ? (language === 'uz' ? "Qayta so'rov yuborish" : "Запросить снова")
                                            : (language === 'uz' ? "Mahsulotni qaytarish" : "Вернуть товар")}
                                    </button>
                                );
                            })()}

                            {/* Total */}
                            <div className="p-5 rounded-[22px] flex justify-between items-center text-white shadow-md shadow-[#2D6E3E]/20" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}>
                                <div className="text-xs uppercase tracking-wider font-semibold opacity-80">{t.common.total}</div>
                                <div className="text-2xl font-bold tracking-tight">{selectedOrder.total?.toLocaleString()} so'm</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Review Modal */}
            {reviewProduct && (
                <div onClick={() => setReviewProduct(null)} className="fixed inset-0 bg-black/40 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
                    <div onClick={e => e.stopPropagation()} className="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl border border-white/20 animate-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                        <div className="p-6 pb-4 flex justify-between items-center border-b border-[rgba(15,20,16,0.06)]">
                            <h3 className="text-lg font-bold tracking-tight text-[#111612]">
                                {t.common.leaveReviewTitle}
                            </h3>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setReviewProduct(null);
                                }}
                                className="ios-icon-tap active:scale-90 w-8 h-8 bg-black/5 rounded-full flex items-center justify-center text-[#111612] transition-transform duration-150 will-change-transform hover:bg-black/10"
                                aria-label="Close"
                            >
                                <XCircle size={18} />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto no-scrollbar space-y-6">
                            {/* Product Info */}
                            <div className="flex items-center gap-3 bg-[#F8FAF8] p-3 rounded-2xl border border-[rgba(15,20,16,0.05)]">
                                <div className="w-11 h-11 rounded-xl bg-white overflow-hidden border border-[rgba(15,20,16,0.06)] shrink-0">
                                    <img src={reviewProduct.image || reviewProduct.imageUrl} className="w-full h-full object-cover" />
                                </div>
                                <p className="font-semibold text-xs text-[#111612] line-clamp-2 leading-snug">
                                    {reviewProduct[`name_${language}`] || reviewProduct.name}
                                </p>
                            </div>

                            {/* Stars */}
                            <div>
                                <p className="text-xs font-semibold text-[#737D75] uppercase tracking-wider mb-3 text-center">{t.product.rating}</p>
                                <div className="flex justify-center gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            onClick={() => {
                                                videoPreWarmer.triggerHaptic("selection");
                                                setReviewRating(star);
                                            }}
                                            className={`ios-icon-tap p-1.5 transition-transform duration-150 will-change-transform ${reviewRating >= star ? 'scale-110' : 'opacity-30'}`}
                                        >
                                            <Star size={28} fill={reviewRating >= star ? "#F59E0B" : "none"} className={reviewRating >= star ? "text-amber-500" : "text-gray-300"} />
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Text Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-semibold text-[#737D75] uppercase tracking-wider ml-1">{t.common.yourOpinion}</label>
                                <textarea
                                    value={reviewText}
                                    onChange={(e) => setReviewText(e.target.value)}
                                    placeholder={t.common.productOpinionPlaceholder}
                                    className="w-full bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl p-4 text-sm font-medium h-28 outline-none transition-colors resize-none"
                                />
                            </div>

                            {/* Media Upload Simulation */}
                            <div className="space-y-3">
                                <div className="flex gap-2.5">
                                    <label className={`flex-1 bg-[#F5F7F5] border border-dashed border-[rgba(15,20,16,0.12)] py-3.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors hover:bg-black/5 ${isUploadingMedia ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    setIsUploadingMedia(true);
                                                    try {
                                                        const { url } = await uploadToYandexS3(file);
                                                        setReviewImages(prev => [...prev, url]);
                                                    } catch (err) {
                                                        showToast(language === 'uz' ? "Rasm yuklashda xatolik" : "Ошибка при загрузке изображения", 'error');
                                                    } finally {
                                                        setIsUploadingMedia(false);
                                                    }
                                                }
                                            }}
                                        />
                                        {isUploadingMedia ? <Loader2 size={16} className="animate-spin text-[#2D6E3E]" /> : <Camera size={16} className="text-[#737D75]" />}
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737D75]">
                                            {isUploadingMedia ? "..." : t.common.photo}
                                        </span>
                                    </label>

                                    <label className={`flex-1 bg-[#F5F7F5] border border-dashed border-[rgba(15,20,16,0.12)] py-3.5 rounded-2xl flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors hover:bg-black/5 ${isUploadingMedia || reviewVideo ? 'opacity-50 pointer-events-none' : ''}`}>
                                        <input
                                            type="file"
                                            accept="video/*"
                                            className="hidden"
                                            onChange={async (e) => {
                                                const file = e.target.files?.[0];
                                                if (file) {
                                                    setIsUploadingMedia(true);
                                                    try {
                                                        const { url } = await uploadToYandexS3(file);
                                                        setReviewVideo(url);
                                                    } catch (err) {
                                                        showToast(language === 'uz' ? "Video yuklashda xatolik" : "Ошибка при загрузке видео", 'error');
                                                    } finally {
                                                        setIsUploadingMedia(false);
                                                    }
                                                }
                                            }}
                                        />
                                        {isUploadingMedia ? <Loader2 size={16} className="animate-spin text-[#2D6E3E]" /> : <Video size={16} className="text-[#737D75]" />}
                                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#737D75]">
                                            {isUploadingMedia ? "..." : t.common.video}
                                        </span>
                                    </label>
                                </div>

                                {/* Media Previews */}
                                {(reviewImages.length > 0 || reviewVideo) && (
                                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                                        {reviewImages.map((img, i) => (
                                            <div key={i} className="w-14 h-14 rounded-xl overflow-hidden border border-gray-200 relative shrink-0">
                                                <img src={img} className="w-full h-full object-cover" />
                                                <button onClick={() => setReviewImages(reviewImages.filter((_, idx) => idx !== i))} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5">
                                                    <XCircle size={12} />
                                                </button>
                                            </div>
                                        ))}
                                        {reviewVideo && (
                                            <div className="w-14 h-14 rounded-xl bg-black overflow-hidden relative shrink-0">
                                                <video src={reviewVideo} className="w-full h-full object-cover opacity-50" />
                                                <Play size={12} className="absolute inset-0 m-auto text-white" />
                                                <button onClick={() => setReviewVideo("")} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5">
                                                    <XCircle size={12} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    handleSubmitReview();
                                }}
                                disabled={isSubmittingReview || !reviewText.trim()}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-3.5 rounded-2xl font-semibold text-xs tracking-wide uppercase flex items-center justify-center gap-2 transition-transform duration-150 will-change-transform disabled:opacity-50 text-white shadow-md shadow-[#2D6E3E]/20"
                                style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}
                            >
                                {isSubmittingReview ? <Loader2 className="animate-spin" size={16} /> : (
                                    <>
                                        {t.common.send}
                                        <MessageCircle size={15} />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancellation Confirmation Modal */}
            {orderToCancel && (
                <div onClick={() => setOrderToCancel(null)} className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
                    <div onClick={e => e.stopPropagation()} className="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-[32px] p-7 text-center space-y-5 shadow-2xl border border-white/20 animate-in zoom-in duration-200">
                        <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center mx-auto shadow-sm">
                            <XCircle size={32} />
                        </div>
                        <div className="space-y-1.5">
                            <h3 className="text-xl font-bold tracking-tight text-[#111612]">
                                {t.common.cancelConfirmTitle}
                            </h3>
                            <p className="text-xs font-medium text-[#737D75]">
                                {t.common.cancelConfirmText}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2.5">
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    confirmCancelOrder();
                                }}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-3.5 bg-rose-500 text-white rounded-2xl font-semibold text-xs uppercase tracking-wider shadow-md shadow-rose-500/20 transition-transform duration-150 will-change-transform"
                            >
                                {t.common.confirm}
                            </button>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setOrderToCancel(null);
                                }}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-3.5 bg-[#F5F7F5] text-[#737D75] rounded-2xl font-semibold text-xs uppercase tracking-wider hover:text-[#111612] transition-colors duration-150 will-change-transform"
                            >
                                {t.common.back}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Qaytarish (Return) Modal */}
            {returnOrder && (
                <div onClick={() => { setReturnOrder(null); setReturnReason(""); }} className="fixed inset-0 bg-black/40 backdrop-blur-md z-[200] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
                    <div onClick={e => e.stopPropagation()} className="bg-white/95 backdrop-blur-xl w-full max-w-sm rounded-[32px] p-7 space-y-5 shadow-2xl border border-white/20 animate-in zoom-in duration-200">
                        <div className="flex flex-col items-center text-center space-y-3">
                            <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center shadow-sm">
                                <RefreshCw size={28} />
                            </div>
                            <h3 className="text-xl font-bold tracking-tight text-[#111612]">
                                {language === 'uz' ? "Mahsulotni qaytarish" : "Возврат товара"}
                            </h3>
                            <p className="text-xs font-medium text-[#737D75]">
                                {language === 'uz'
                                    ? "Qaytarish sababini yozing. So'rovingiz ko'rib chiqiladi."
                                    : "Укажите причину возврата. Ваш запрос будет рассмотрен."}
                            </p>
                        </div>

                        <textarea
                            value={returnReason}
                            onChange={(e) => setReturnReason(e.target.value)}
                            placeholder={language === 'uz' ? "Qaytarish sababi..." : "Причина возврата..."}
                            className="w-full bg-[#F5F7F5] border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl p-4 text-sm font-medium h-28 outline-none transition-colors resize-none"
                        />

                        <div className="flex flex-col gap-2.5">
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    handleSubmitReturn();
                                }}
                                disabled={isReturning || !returnReason.trim()}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-3.5 bg-amber-600 text-white rounded-2xl font-semibold text-xs uppercase tracking-wider shadow-md shadow-amber-600/20 transition-transform duration-150 will-change-transform disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {isReturning ? <Loader2 className="animate-spin" size={16} /> : (language === 'uz' ? "So'rov yuborish" : "Отправить запрос")}
                            </button>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setReturnOrder(null);
                                    setReturnReason("");
                                }}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-3.5 bg-[#F5F7F5] text-[#737D75] rounded-2xl font-semibold text-xs uppercase tracking-wider hover:text-[#111612] transition-colors duration-150 will-change-transform"
                            >
                                {t.common.back}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
