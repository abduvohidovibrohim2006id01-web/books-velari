"use client";

import { useStore } from "@/store/store";
import { useShallow } from "zustand/react/shallow";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { AlertCircle, ArrowLeft, Loader2, PackageX, MapPin, Globe, Tag, X, Wallet, Check, Truck, Zap, Clock, Building2, Search, Phone } from "lucide-react";
import { computeStandardDelivery, fmtSom } from "@/lib/delivery";
import dynamic from "next/dynamic";
const YandexMapPicker = dynamic(() => import("@/components/YandexMapPicker"), {
    loading: () => <div className="h-64 animate-pulse bg-gray-50 rounded-3xl" />,
    ssr: false,
});
import { translations } from "@/lib/translations";
import { ymGoal, ymPurchase } from "@/lib/metrika";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { UZBEKISTAN_REGIONS, getRegionById } from "@/lib/regions";
import { getDeliveryDateText } from "@/lib/date-utils";
import { loadPickupPointsByRegion, PickupPoint } from "@/lib/pickup-points";

export default function CheckoutPage() {
    const router = useRouter();
    const { cart, user, clearCart, language, showToast, cartPromo, setCartPromo, selectedRegion, setSelectedRegion, warehouses, fetchWarehouses } = useStore(useShallow(s => ({
        cart: s.cart, user: s.user, clearCart: s.clearCart, language: s.language, showToast: s.showToast,
        cartPromo: s.cartPromo, setCartPromo: s.setCartPromo,
        selectedRegion: s.selectedRegion, setSelectedRegion: s.setSelectedRegion,
        warehouses: s.warehouses, fetchWarehouses: s.fetchWarehouses
    })));
    const [displayProducts, setDisplayProducts] = useState<any[]>([]);
    const [isFastBuy, setIsFastBuy] = useState(false);
    const t = translations[language];
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [stockErrors, setStockErrors] = useState<{ id: string, name: string, available: number }[]>([]);
    const [isValidating, setIsValidating] = useState(false);
    const [isMapOpen, setIsMapOpen] = useState(false);
    const [address, setAddress] = useState("");
    const [coords, setCoords] = useState<[number, number] | null>(null);
    const [walletBalance, setWalletBalance] = useState(0);
    const [useWallet, setUseWallet] = useState(false);
    const [personalOffers, setPersonalOffers] = useState<Record<string, number>>({});
    // Yetkazib berish: tur + tezkor (express) ma'lumoti
    const [deliveryType, setDeliveryType] = useState<"standard" | "express">("standard");
    const [expressInfo, setExpressInfo] = useState<{ eligible: boolean; price?: number; free?: boolean; etaText?: string; needCoords?: boolean } | null>(null);
    const [loadingExpress, setLoadingExpress] = useState(false);

    useEffect(() => {
        fetchWarehouses();
    }, [fetchWarehouses]);

    const currentWarehouse = warehouses?.find((w: any) => w.active) || warehouses?.[0];
    const currentRegion = getRegionById(selectedRegion);
    const regionName = language === "uz" ? currentRegion.name_uz : currentRegion.name_ru;
    const deliveryDateFormatted = getDeliveryDateText(language, currentWarehouse?.dbs_config, selectedRegion);

    // Yetkazib berish usuli: kuryer orqali eshikkacha yoki BTS / EMU punktidan olib ketish
    const [deliveryMethod, setDeliveryMethod] = useState<"courier" | "pickup">("courier");
    const [selectedPickupPoint, setSelectedPickupPoint] = useState<PickupPoint | null>(null);
    const [pickupProviderFilter, setPickupProviderFilter] = useState<"all" | "bts" | "emu">("all");
    const [pickupSearchQuery, setPickupSearchQuery] = useState("");

    // Tanlangan viloyat o'zgarganda tanlangan punkt boshqa viloyatda bo'lsa uni tozalash
    useEffect(() => {
        if (selectedPickupPoint && selectedPickupPoint.region_id !== selectedRegion) {
            setSelectedPickupPoint(null);
        }
    }, [selectedRegion, selectedPickupPoint]);

    const [regionPickupPoints, setRegionPickupPoints] = useState<PickupPoint[]>([]);

    useEffect(() => {
        let active = true;
        loadPickupPointsByRegion(selectedRegion).then((points) => {
            if (active) {
                setRegionPickupPoints(points);
            }
        });
        return () => {
            active = false;
        };
    }, [selectedRegion]);

    const btsCount = useMemo(() => regionPickupPoints.filter(p => p.provider === "bts").length, [regionPickupPoints]);
    const emuCount = useMemo(() => regionPickupPoints.filter(p => p.provider === "emu").length, [regionPickupPoints]);

    const filteredPickupPoints = useMemo(() => {
        const q = pickupSearchQuery.trim().toLowerCase();
        return regionPickupPoints.filter(p => {
            if (pickupProviderFilter !== "all" && p.provider !== pickupProviderFilter) return false;
            if (!q) return true;
            const matchName = p.name.toLowerCase().includes(q);
            const matchAddr = p.address.toLowerCase().includes(q);
            const matchLandmark = p.landmark ? p.landmark.toLowerCase().includes(q) : false;
            return matchName || matchAddr || matchLandmark;
        });
    }, [regionPickupPoints, pickupProviderFilter, pickupSearchQuery]);

    useEffect(() => {
        setMounted(true);

        // Auth check — foydalanuvchi login qilmagan bo'lsa, darhol redirect
        if (!user) {
            router.push(`/${language}/login?redirect=/${language}/checkout`);
            return;
        }

        if (isSubmitting) return;

        const searchParams = new URLSearchParams(window.location.search);
        const fast = searchParams.get('fast') === 'true';
        
        if (fast) {
            const fastItem = sessionStorage.getItem('fast_buy_item');
            if (fastItem) {
                const item = JSON.parse(fastItem);
                setDisplayProducts([item]);
                setIsFastBuy(true);
            } else {
                router.push(`/${language}`);
            }
        } else {
            if (cart.length > 0) {
                setDisplayProducts(cart);
            } else if (mounted) {
                router.push(`/${language}`);
            }
        }
    }, [cart, isSubmitting, mounted, user, language]);

    useEffect(() => {
        if (user?.phone) {
            fetchWalletBalance();
            fetchPersonalOffers();
        }
    }, [user]);

    const fetchPersonalOffers = async () => {
        try {
            const res = await fetch("/api/discount");
            const json = await res.json();
            if (json?.success && Array.isArray(json.offers)) {
                const map: Record<string, number> = {};
                for (const o of json.offers) {
                    const pid = String(o.product_id);
                    const pct = Number(o.percent) || 0;
                    if (pct > (map[pid] || 0)) map[pid] = pct;
                }
                setPersonalOffers(map);
            }
        } catch (e) {
            console.error("Fetch personal offers error:", e);
        }
    };

    const fetchWalletBalance = async () => {
        try {
            // Hamyon balansi — server orqali (faqat o'z hamyoni)
            const res = await fetch("/api/me/wallet?summary=1", { cache: "no-store" });
            const json = await res.json();
            if (json?.wallet) setWalletBalance(json.wallet.balance);
        } catch (e) {
            console.error("Fetch wallet balance error:", e);
        }
    };

    useEffect(() => {
        if (displayProducts.length > 0) {
            performStockCheck();
        }
    }, [displayProducts]);

    const performStockCheck = async () => {
        setIsValidating(true);
        try {
            const errors = await getStockErrors();
            setStockErrors(errors);
        } finally {
            setIsValidating(false);
        }
    };

    const getStockErrors = async () => {
        const errors: { id: string, name: string, available: number }[] = [];
        try {
            const ids = displayProducts.map(item => item.id).filter(Boolean);
            if (ids.length === 0) return errors;

            // Bitta batch query — N+1 o'rniga
            const { data: products } = await supabase
                .from("products")
                .select("id, stock_details")
                .in("id", ids);

            if (!products) return errors;

            const stockMap = new Map(products.map(p => [p.id, p.stock_details || {}]));

            for (const item of displayProducts) {
                if (!item.id) continue;
                const stockDetails = stockMap.get(item.id) || {};
                const actualStock = Object.values(stockDetails).reduce((a: number, b: unknown) => a + (Number(b) || 0), 0);

                if (item.quantity > actualStock) {
                    errors.push({
                        id: item.id,
                        name: item[`name_${language}`] || item.name,
                        available: actualStock as number
                    });
                }
            }
        } catch (e) {
            console.error("Stock check error:", e);
        }
        return errors;
    };

    const subtotal = displayProducts.reduce((sum, item) => sum + item.price * item.quantity, 0);
    // Shaxsiy smart-chegirma — place_order bilan bir xil hisoblanadi: floor(narx*soni*foiz/100) har mahsulot uchun
    const smartDiscount = displayProducts.reduce((sum, item) => {
        const pct = personalOffers[item.id] || 0;
        return pct > 0 ? sum + Math.floor(item.price * item.quantity * pct / 100) : sum;
    }, 0);
    // Savatda qo'llangan promo-kodni boshlang'ich qiymat sifatida olamiz
    const [promoCode, setPromoCode] = useState(cartPromo?.code || "");
    const [promoData, setPromoData] = useState<any>(cartPromo ? { code: cartPromo.code, discount: cartPromo.discount, success: true } : null);
    const [isApplyingPromo, setIsApplyingPromo] = useState(false);
    // Tovarlar summasi (barcha chegirmalardan keyin) — hamyon shunga asoslanadi
    const goodsTotal = Math.max(0, subtotal - (promoData?.discount || 0) - smartDiscount);
    // Bepul yetkazish chegarasi PROMO-KODSIZ hisoblanadi (promo narx chegirmasi emas) —
    // faqat haqiqiy narx chegirmalari (smart) kamaytiradi
    const deliveryBasis = Math.max(0, subtotal - smartDiscount);

    // Yetkazib berish narxi
    const isTashkent = selectedRegion === "tashkent_city" || selectedRegion === "tashkent_region";
    const expressEligible = !!expressInfo?.eligible && isTashkent && deliveryMethod === "courier";
    const expressUsable = expressEligible && !!coords && expressInfo?.price != null;
    const standardFee = computeStandardDelivery(deliveryBasis);
    const expressFee = expressInfo?.free ? 0 : (expressInfo?.price || 0);
    const useExpress = deliveryMethod === "courier" && deliveryType === "express" && expressUsable;
    const deliveryFee = useExpress ? expressFee : standardFee;
    const total = goodsTotal + deliveryFee; // Yakuniy summa (yetkazish bilan)

    useEffect(() => {
        if (!isTashkent && deliveryType === "express") {
            setDeliveryType("standard");
        }
    }, [isTashkent, deliveryType]);

    // Tezkor (express) yetkazish — moslik + narx/vaqtni baholash
    useEffect(() => {
        if (displayProducts.length === 0) { setExpressInfo(null); return; }
        let cancelled = false;
        (async () => {
            setLoadingExpress(true);
            try {
                const res = await fetch("/api/delivery/express", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        items: displayProducts.map(i => ({ id: i.id })),
                        coords: coords || null,
                        orderAmount: deliveryBasis,
                        language,
                    }),
                });
                const data = await res.json();
                if (cancelled) return;
                if (data?.success) {
                    setExpressInfo({ eligible: !!data.eligible, price: data.price, free: data.free, etaText: data.etaText, needCoords: data.needCoords });
                    if (!data.eligible) setDeliveryType("standard");
                } else {
                    setExpressInfo(null);
                }
            } catch {
                if (!cancelled) setExpressInfo(null);
            } finally {
                if (!cancelled) setLoadingExpress(false);
            }
        })();
        return () => { cancelled = true; };
    }, [displayProducts, coords, deliveryBasis, language]);

    const handleApplyPromo = async () => {
        if (!promoCode.trim()) return;
        setIsApplyingPromo(true);
        try {
            const res = await fetch("/api/promo-codes/validate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: promoCode, totalAmount: subtotal, userPhone: user?.phone || null })
            });
            const data = await res.json();
            if (data.success) {
                setPromoData(data);
                setCartPromo({ code: data.code, discount: data.discount });
                showToast(t.common.promoApplied, 'success');
            } else {
                showToast(data.error, 'error');
                setPromoData(null);
                setCartPromo(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsApplyingPromo(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) {
            router.push(`/${language}/login?redirect=/${language}/checkout`);
            return;
        }

        if (isSubmitting || isValidating) return;

        if (deliveryMethod === "pickup") {
            if (!selectedPickupPoint) {
                showToast(
                    language === "uz"
                        ? "Iltimos, o'zingizga qulay BTS yoki EMU punktini tanlang"
                        : "Пожалуйста, выберите пункт выдачи BTS или EMU",
                    'error'
                );
                return;
            }
        } else {
            if (!address.trim()) {
                showToast(
                    language === "uz" ? "Iltimos, yetkazib berish manzilini kiriting" : "Пожалуйста, введите адрес доставки",
                    'error'
                );
                return;
            }
        }

        setIsSubmitting(true);
        ymGoal('begin_checkout'); // Analytics: rasmiylashtirishni boshladi
        try {
            let finalAddress = "";
            let finalCoords = coords;

            if (deliveryMethod === "pickup" && selectedPickupPoint) {
                finalAddress = `[${selectedPickupPoint.provider.toUpperCase()} PUNKT]: ${selectedPickupPoint.name}, ${selectedPickupPoint.address} (Mo'ljal: ${selectedPickupPoint.landmark || '-'}, Tel: ${selectedPickupPoint.phone})`;
                finalCoords = [selectedPickupPoint.lat, selectedPickupPoint.lng];
            } else {
                finalAddress = address ? (address.toLowerCase().includes(regionName.toLowerCase()) ? address : `${regionName}, ${address}`) : regionName;
            }

            // Using secure API instead of direct RPC
            const response = await fetch(`/api/orders/place`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    p_user_phone: user.phone,
                    p_items: displayProducts.map(item => ({
                        id: item.id,
                        name: item[`name_${language}`] || item.name,
                        price: item.price,
                        quantity: item.quantity,
                        image: item.imageUrl || item.image
                    })),
                    p_address: finalAddress,
                    p_coords: finalCoords,
                    p_status: t.common.statusPendingPayment,
                    p_promo_code: promoData?.code || null,
                    p_delivery_type: (deliveryMethod === "courier" && useExpress) ? "express" : "standard",
                    p_wallet_usage: useWallet ? Math.min(walletBalance, goodsTotal) : 0,
                    p_referral_data: (() => {
                        const cookieStr = document.cookie.split('; ').find(row => row.startsWith('affiliate_data='));
                        if (cookieStr) {
                            try { return JSON.parse(decodeURIComponent(cookieStr.split('=')[1])); } catch(e) { return null; }
                        }
                        return null;
                    })()
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Xatolik yuz berdi");
            }

            if (!data.success && data.errors) {
                setStockErrors(data.errors);
                showToast(t.common.notEnoughStock, 'error');
                setIsSubmitting(false);
                return;
            }

            if (data.success && data.orderId) {
                // Analytics: konversiya (buyurtma) goal + e-commerce purchase (daromad)
                ymGoal('order', { order_id: data.orderId });
                ymPurchase(
                    displayProducts.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
                    { id: String(data.orderId), revenue: total }
                );
                try {
                    const cookieStr = document.cookie.split('; ').find(row => row.startsWith('affiliate_data='));
                    if (cookieStr) {
                        const cookieData = JSON.parse(decodeURIComponent(cookieStr.split('=')[1]));
                        displayProducts.forEach(i => delete cookieData[i.id]);
                        const expires = new Date();
                        expires.setTime(expires.getTime() + (30 * 24 * 60 * 60 * 1000));
                        document.cookie = `affiliate_data=${encodeURIComponent(JSON.stringify(cookieData))};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
                    }
                } catch(e) {}
                
                // Do NOT call clearCart here because it triggers the useEffect that redirects to '/'
                router.push(`/${language}/payment?orderId=${data.orderId}`);
            }

        } catch (error: any) {
            console.error("Order submit error:", error);
            showToast(t.common.error + ": " + error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!mounted) return null;

    return (
        <div className="p-4 md:p-6 min-h-screen pt-8 md:pt-12 pb-32" style={{ background: "#FAFAF6" }}>
            <div className="flex items-center gap-4 mb-6 md:mb-8">
                <button
                    onClick={() => {
                        videoPreWarmer.triggerHaptic("light");
                        router.back();
                    }}
                    aria-label="Orqaga"
                    className="ios-icon-tap active:scale-90 transition-transform duration-150 will-change-transform"
                    style={{ width: 40, height: 40, borderRadius: 20, background: "#fff", border: "1px solid rgba(15,20,16,0.06)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(15,20,16,0.06)", cursor: "pointer", flexShrink: 0 }}
                >
                    <ArrowLeft size={18} />
                </button>
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-[#111612] sm:truncate">{t.common.checkout}</h1>
            </div>

            {stockErrors.length > 0 && (
                <div className="mb-8 p-6 bg-red-50 rounded-[28px] border border-red-100 animate-in fade-in slide-in-from-top duration-300">
                    <div className="flex items-center gap-3 text-red-600 mb-4">
                        <AlertCircle size={22} strokeWidth={2.5} />
                        <h3 className="font-bold uppercase text-xs tracking-wider">
                            DIQQAT: {t.common.notEnoughStock.toUpperCase()}
                        </h3>
                    </div>
                    <div className="space-y-2.5">
                        {stockErrors.map(err => (
                            <div key={err.id} className="flex justify-between items-center bg-white/70 p-3.5 rounded-xl border border-red-50">
                                <span className="text-xs font-semibold text-gray-700">{err.name}</span>
                                <span className="text-xs font-bold text-red-500">
                                    {t.common.onlyLeft.replace('{count}', err.available.toString())}
                                </span>
                            </div>
                        ))}
                    </div>
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            router.push(`/${language}/cart`);
                        }}
                        className="ios-tap-feedback active:scale-[0.98] w-full mt-5 py-3.5 bg-red-500 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-md shadow-red-200 transition-transform duration-150 will-change-transform"
                    >
                        {t.common.editCart}
                    </button>
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Phone info card */}
                <div style={{ background: "#fff", borderRadius: 24, padding: "16px 18px", boxShadow: "0 4px 16px rgba(15,20,16,0.04)", border: "1px solid rgba(15,20,16,0.06)" }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: "#737D75", letterSpacing: 0.3, textTransform: "uppercase", marginBottom: 6 }}>
                        {t.account.myInfo}
                    </p>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 500, color: "#737D75" }}>{t.account.phone}:</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#111612" }}>{user?.phone || "+998 ..."}</span>
                    </div>
                </div>

                {/* Region */}
                <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#737D75", letterSpacing: 0.3, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                        {language === "uz" ? "Yetkazib berish viloyati / hududi" : "Регион доставки"}
                    </label>
                    <div style={{ position: "relative" }}>
                        <select
                            value={selectedRegion}
                            onChange={e => {
                                videoPreWarmer.triggerHaptic("selection");
                                setSelectedRegion(e.target.value);
                            }}
                            style={{ width: "100%", background: "#fff", border: "1px solid rgba(15,20,16,0.06)", borderRadius: 20, padding: "14px 44px 14px 18px", fontSize: 14, fontWeight: 600, color: "#111612", outline: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(15,20,16,0.04)", appearance: "none", WebkitAppearance: "none" }}
                        >
                            {UZBEKISTAN_REGIONS.map(r => (
                                <option key={r.id} value={r.id}>{language === "uz" ? r.name_uz : r.name_ru}</option>
                            ))}
                        </select>
                        <div style={{ position: "absolute", right: 18, top: "50%", transform: "translateY(-50%)", pointerEvents: "none", color: "#737D75", fontSize: 11 }}>▼</div>
                    </div>
                </div>

                {/* Yetkazib berish usuli (Kuryer vs Punkt) */}
                <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#737D75", letterSpacing: 0.3, textTransform: "uppercase", display: "block", marginBottom: 8 }}>
                        {language === "uz" ? "Yetkazib berish usuli" : "Способ получения"}
                    </label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                        {/* Kuryer orqali eshikkacha */}
                        <button
                            type="button"
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("selection");
                                setDeliveryMethod("courier");
                            }}
                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: 8,
                                background: deliveryMethod === "courier" ? "#F8FAF8" : "#fff",
                                border: deliveryMethod === "courier" ? "1.5px solid #2D6E3E" : "1px solid rgba(15,20,16,0.06)",
                                borderRadius: 20,
                                padding: "14px 16px",
                                cursor: "pointer",
                                textAlign: "left",
                                boxShadow: "0 4px 16px rgba(15,20,16,0.04)"
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                                <div style={{ width: 36, height: 36, borderRadius: 12, background: deliveryMethod === "courier" ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" : "#F0F2EF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Truck size={18} color={deliveryMethod === "courier" ? "#fff" : "#737D75"} />
                                </div>
                                {deliveryMethod === "courier" && (
                                    <div style={{ width: 18, height: 18, borderRadius: 9, background: "#2D6E3E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Check size={11} color="#fff" strokeWidth={3} />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p style={{ fontSize: 13.5, fontWeight: 700, color: "#111612", margin: 0 }}>
                                    {language === "uz" ? "Kuryer orqali" : "Курьером"}
                                </p>
                                <p style={{ fontSize: 11, fontWeight: 500, color: "#737D75", margin: "2px 0 0" }}>
                                    {language === "uz" ? "Eshikkacha yetkazish" : "До вашей двери"}
                                </p>
                            </div>
                        </button>

                        {/* BTS / EMU punktidan olib ketish */}
                        <button
                            type="button"
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("selection");
                                setDeliveryMethod("pickup");
                            }}
                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "flex-start",
                                gap: 8,
                                background: deliveryMethod === "pickup" ? "#F8FAF8" : "#fff",
                                border: deliveryMethod === "pickup" ? "1.5px solid #2D6E3E" : "1px solid rgba(15,20,16,0.06)",
                                borderRadius: 20,
                                padding: "14px 16px",
                                cursor: "pointer",
                                textAlign: "left",
                                boxShadow: "0 4px 16px rgba(15,20,16,0.04)"
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                                <div style={{ width: 36, height: 36, borderRadius: 12, background: deliveryMethod === "pickup" ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" : "#F0F2EF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                    <Building2 size={18} color={deliveryMethod === "pickup" ? "#fff" : "#737D75"} />
                                </div>
                                {deliveryMethod === "pickup" && (
                                    <div style={{ width: 18, height: 18, borderRadius: 9, background: "#2D6E3E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                        <Check size={11} color="#fff" strokeWidth={3} />
                                    </div>
                                )}
                            </div>
                            <div>
                                <p style={{ fontSize: 13.5, fontWeight: 700, color: "#111612", margin: 0 }}>
                                    {language === "uz" ? "Punktidan olish" : "Самовывоз"}
                                </p>
                                <p style={{ fontSize: 11, fontWeight: 500, color: "#737D75", margin: "2px 0 0" }}>
                                    {language === "uz"
                                        ? (regionPickupPoints.length > 0 ? `BTS va EMU (${regionPickupPoints.length})` : "BTS va EMU")
                                        : (regionPickupPoints.length > 0 ? `BTS и EMU (${regionPickupPoints.length})` : "BTS и EMU")}
                                </p>
                            </div>
                        </button>
                    </div>
                </div>

                {deliveryMethod === "courier" ? (
                    <>
                        {/* Address */}
                        <div>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "#737D75", letterSpacing: 0.3, textTransform: "uppercase" }}>{t.common.address}</label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("light");
                                        setIsMapOpen(true);
                                    }}
                                    className="ios-tap-feedback active:scale-95 transition-transform duration-150 will-change-transform"
                                    style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#2D6E3E", background: "#EAF3EC", border: "none", borderRadius: 12, padding: "6px 12px", cursor: "pointer" }}
                                >
                                    <MapPin size={12} />
                                    {t.common.selectOnMap}
                                </button>
                            </div>
                            <div style={{ position: "relative" }}>
                                <input
                                    required={deliveryMethod === "courier"}
                                    type="text"
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    placeholder={t.common.addressPlaceholder}
                                    style={{ width: "100%", background: "#fff", border: "1px solid rgba(15,20,16,0.06)", borderRadius: 20, padding: "14px 48px 14px 18px", fontSize: 14, fontWeight: 500, color: "#111612", outline: "none", boxSizing: "border-box", boxShadow: "0 4px 16px rgba(15,20,16,0.04)" }}
                                />
                                {coords && <Globe size={16} color="#2D6E3E" style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)" }} />}
                            </div>
                        </div>

                        {/* Courier Speed Option: Standard vs Express */}
                        <div>
                            {expressEligible ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {/* Standart */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("selection");
                                            setDeliveryType("standard");
                                        }}
                                        className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                                        style={{ display: "flex", alignItems: "center", gap: 12, background: deliveryType === "standard" ? "#F8FAF8" : "#fff", border: deliveryType === "standard" ? "1.5px solid #2D6E3E" : "1px solid rgba(15,20,16,0.06)", borderRadius: 22, padding: "14px 16px", cursor: "pointer", textAlign: "left", boxShadow: "0 4px 16px rgba(15,20,16,0.04)" }}
                                    >
                                        <div style={{ width: 42, height: 42, borderRadius: 14, background: deliveryType === "standard" ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" : "#F0F2EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <Truck size={20} color={deliveryType === "standard" ? "#fff" : "#9AA29C"} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: "#111612", margin: 0 }}>{language === "uz" ? "Standart yetkazish" : "Стандартная доставка"}</p>
                                            <p style={{ fontSize: 12, fontWeight: 500, color: "#737D75", margin: "2px 0 0" }}>
                                                {language === "uz" ? `${regionName}ga yetkazish: ${deliveryDateFormatted}` : `Доставка в ${regionName}: ${deliveryDateFormatted}`}
                                            </p>
                                        </div>
                                        <span style={{ fontSize: 13.5, fontWeight: 700, color: standardFee > 0 ? "#111612" : "#2D6E3E", flexShrink: 0 }}>
                                            {standardFee > 0 ? fmtSom(standardFee, language) : (language === "uz" ? "Bepul" : "Бесплатно")}
                                        </span>
                                    </button>

                                    {/* Tezkor */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("selection");
                                            setDeliveryType("express");
                                        }}
                                        disabled={!coords}
                                        className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                                        style={{ display: "flex", alignItems: "center", gap: 12, background: deliveryType === "express" ? "#F8FAF8" : "#fff", border: deliveryType === "express" ? "1.5px solid #2D6E3E" : "1px solid rgba(15,20,16,0.06)", borderRadius: 22, padding: "14px 16px", cursor: coords ? "pointer" : "not-allowed", textAlign: "left", boxShadow: "0 4px 16px rgba(15,20,16,0.04)", opacity: coords ? 1 : 0.7 }}
                                    >
                                        <div style={{ width: 42, height: 42, borderRadius: 14, background: deliveryType === "express" ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" : "#EEF0FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                            <Zap size={20} color={deliveryType === "express" ? "#fff" : "#2D6E3E"} />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: 14, fontWeight: 700, color: "#111612", margin: 0 }}>{language === "uz" ? "Tezkor yetkazish" : "Экспресс-доставка"}</p>
                                            <p style={{ fontSize: 12, fontWeight: 500, color: "#737D75", margin: "2px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
                                                {loadingExpress
                                                    ? (language === "uz" ? "Hisoblanmoqda..." : "Расчёт...")
                                                    : !coords
                                                        ? (language === "uz" ? "Manzilni xaritadan tanlang" : "Выберите адрес на карте")
                                                        : (<><Clock size={11} /> {expressInfo?.etaText || (language === "uz" ? "30 daqiqa — 1.5 soat" : "30 мин — 1.5 ч")}</>)}
                                            </p>
                                        </div>
                                        <span style={{ fontSize: 13.5, fontWeight: 700, color: expressFee > 0 ? "#2D6E3E" : "#2D6E3E", flexShrink: 0 }}>
                                            {!coords ? "—" : (expressFee > 0 ? fmtSom(expressFee, language) : (language === "uz" ? "Bepul" : "Бесплатно"))}
                                        </span>
                                    </button>
                                </div>
                            ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", border: "1px solid rgba(15,20,16,0.06)", borderRadius: 22, padding: "14px 16px", boxShadow: "0 4px 16px rgba(15,20,16,0.04)" }}>
                                    <div style={{ width: 42, height: 42, borderRadius: 14, background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                        <Truck size={20} color="#fff" />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ fontSize: 14, fontWeight: 700, color: "#111612", margin: 0 }}>{language === "uz" ? "Standart yetkazish" : "Стандартная доставка"}</p>
                                        <p style={{ fontSize: 12, fontWeight: 500, color: "#737D75", margin: "2px 0 0" }}>
                                            {language === "uz" ? `${regionName}ga yetkazish: ${deliveryDateFormatted}` : `Доставка в ${regionName}: ${deliveryDateFormatted}`}
                                        </p>
                                    </div>
                                    <span style={{ fontSize: 13.5, fontWeight: 700, color: standardFee > 0 ? "#111612" : "#2D6E3E", flexShrink: 0 }}>
                                        {standardFee > 0 ? fmtSom(standardFee, language) : (language === "uz" ? "Bepul" : "Бесплатно")}
                                    </span>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* BTS va EMU punktlari tanlash bloki */
                    <div style={{ background: "#fff", borderRadius: 24, padding: "16px 18px", boxShadow: "0 4px 16px rgba(15,20,16,0.04)", border: "1px solid rgba(15,20,16,0.06)", display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "#737D75", letterSpacing: 0.3, textTransform: "uppercase" }}>
                                {language === "uz" ? "Topshirish punktini tanlang" : "Выберите пункт выдачи"}
                            </label>
                            <span style={{ fontSize: 11, fontWeight: 700, color: "#2D6E3E" }}>
                                {regionName} ({regionPickupPoints.length})
                            </span>
                        </div>

                        {/* Tanlangan punkt info banner */}
                        {selectedPickupPoint ? (
                            <div style={{ background: "#EAF3EC", border: "1.5px solid #2D6E3E", borderRadius: 18, padding: "12px 14px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                                        <span style={{ fontSize: 9.5, fontWeight: 800, padding: "2px 7px", borderRadius: 6, background: selectedPickupPoint.provider === "bts" ? "#0066FF" : "#FF6600", color: "#fff", textTransform: "uppercase" }}>
                                            {selectedPickupPoint.provider.toUpperCase()} EXPRESS
                                        </span>
                                        <span style={{ fontSize: 13, fontWeight: 700, color: "#111612" }} className="truncate">
                                            {selectedPickupPoint.name}
                                        </span>
                                    </div>
                                    <p style={{ fontSize: 12, color: "#2D6E3E", margin: "2px 0 0", fontWeight: 500 }}>
                                        {selectedPickupPoint.address}
                                    </p>
                                    {selectedPickupPoint.landmark && (
                                        <p style={{ fontSize: 11, color: "#444E46", margin: "2px 0 0", fontStyle: "italic" }}>
                                            📍 {language === "uz" ? "Mo'ljal" : "Ориентир"}: {selectedPickupPoint.landmark}
                                        </p>
                                    )}
                                </div>
                                <div style={{ width: 22, height: 22, borderRadius: 11, background: "#2D6E3E", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <Check size={13} color="#fff" strokeWidth={3} />
                                </div>
                            </div>
                        ) : (
                            <div style={{ background: "#FFF9EB", border: "1px dashed #F59E0B", borderRadius: 16, padding: "10px 14px", fontSize: 12, fontWeight: 600, color: "#B45309" }}>
                                ⚠️ {language === "uz" ? "Iltimos, quyidagi ro'yxatdan eng qulay punktni tanlang:" : "Пожалуйста, выберите подходящий пункт из списка ниже:"}
                            </div>
                        )}

                        {/* Filtrlar: Barchasi, BTS, EMU */}
                        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                            <button
                                type="button"
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("selection");
                                    setPickupProviderFilter("all");
                                }}
                                style={{
                                    padding: "7px 12px",
                                    borderRadius: 12,
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    border: "none",
                                    background: pickupProviderFilter === "all" ? "#111612" : "#F0F2EF",
                                    color: pickupProviderFilter === "all" ? "#fff" : "#444E46",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap"
                                }}
                            >
                                {language === "uz" ? "Barchasi" : "Все"} ({regionPickupPoints.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("selection");
                                    setPickupProviderFilter("bts");
                                }}
                                style={{
                                    padding: "7px 12px",
                                    borderRadius: 12,
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    border: "none",
                                    background: pickupProviderFilter === "bts" ? "#0066FF" : "#F0F2EF",
                                    color: pickupProviderFilter === "bts" ? "#fff" : "#0066FF",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                    whiteSpace: "nowrap"
                                }}
                            >
                                <span style={{ width: 6, height: 6, borderRadius: 3, background: pickupProviderFilter === "bts" ? "#fff" : "#0066FF" }} />
                                BTS Express ({btsCount})
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("selection");
                                    setPickupProviderFilter("emu");
                                }}
                                style={{
                                    padding: "7px 12px",
                                    borderRadius: 12,
                                    fontSize: 11.5,
                                    fontWeight: 700,
                                    border: "none",
                                    background: pickupProviderFilter === "emu" ? "#FF6600" : "#F0F2EF",
                                    color: pickupProviderFilter === "emu" ? "#fff" : "#FF6600",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 5,
                                    whiteSpace: "nowrap"
                                }}
                            >
                                <span style={{ width: 6, height: 6, borderRadius: 3, background: pickupProviderFilter === "emu" ? "#fff" : "#FF6600" }} />
                                EMU Express ({emuCount})
                            </button>
                        </div>

                        {/* Qidiruv input */}
                        <div style={{ position: "relative" }}>
                            <Search size={15} color="#737D75" style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }} />
                            <input
                                type="text"
                                value={pickupSearchQuery}
                                onChange={e => setPickupSearchQuery(e.target.value)}
                                placeholder={language === "uz" ? "Filial nomi yoki manzil bo'yicha qidirish..." : "Поиск по названию или адресу..."}
                                style={{
                                    width: "100%",
                                    background: "#F5F5F0",
                                    border: "1px solid transparent",
                                    borderRadius: 14,
                                    padding: "10px 14px 10px 38px",
                                    fontSize: 13,
                                    fontWeight: 500,
                                    color: "#111612",
                                    outline: "none",
                                    boxSizing: "border-box"
                                }}
                            />
                            {pickupSearchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setPickupSearchQuery("")}
                                    style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#737D75", fontSize: 13 }}
                                >
                                    ✕
                                </button>
                            )}
                        </div>

                        {/* Punktlar ro'yxati (Scrollable) */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto", paddingRight: 4 }}>
                            {filteredPickupPoints.length === 0 ? (
                                <div style={{ textAlign: "center", padding: "30px 10px", color: "#737D75", fontSize: 12.5 }}>
                                    {language === "uz" ? "Ushbu qidiruv bo'yicha filiallar topilmadi" : "По вашему запросу филиалы не найдены"}
                                </div>
                            ) : (
                                filteredPickupPoints.map(point => {
                                    const isSelected = selectedPickupPoint?.id === point.id;
                                    return (
                                        <div
                                            key={point.id}
                                            onClick={() => {
                                                videoPreWarmer.triggerHaptic("selection");
                                                setSelectedPickupPoint(point);
                                            }}
                                            className="ios-tap-feedback active:scale-[0.99] transition-transform duration-150"
                                            style={{
                                                background: isSelected ? "#F8FAF8" : "#fff",
                                                border: isSelected ? "1.5px solid #2D6E3E" : "1px solid rgba(15,20,16,0.06)",
                                                borderRadius: 18,
                                                padding: "12px 14px",
                                                cursor: "pointer",
                                                boxShadow: isSelected ? "0 4px 16px rgba(45,110,62,0.08)" : "0 2px 8px rgba(15,20,16,0.03)"
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                                    <span style={{
                                                        fontSize: 9.5,
                                                        fontWeight: 800,
                                                        padding: "2px 7px",
                                                        borderRadius: 6,
                                                        background: point.provider === "bts" ? "#0066FF" : "#FF6600",
                                                        color: "#fff",
                                                        letterSpacing: 0.3
                                                    }}>
                                                        {point.provider === "bts" ? "BTS EXPRESS" : "EMU EXPRESS"}
                                                    </span>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: "#111612" }}>
                                                        {point.name}
                                                    </span>
                                                </div>
                                                <div style={{
                                                    width: 18,
                                                    height: 18,
                                                    borderRadius: 9,
                                                    border: isSelected ? "none" : "1.5px solid #C4C9C5",
                                                    background: isSelected ? "#2D6E3E" : "transparent",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    flexShrink: 0,
                                                    marginTop: 2
                                                }}>
                                                    {isSelected && <Check size={11} color="#fff" strokeWidth={3} />}
                                                </div>
                                            </div>

                                            <p style={{ fontSize: 12, fontWeight: 500, color: "#444E46", margin: "6px 0 2px", lineHeight: 1.35 }}>
                                                {point.address}
                                            </p>

                                            {point.landmark && (
                                                <p style={{ fontSize: 11, fontWeight: 500, color: "#737D75", margin: "0 0 6px", fontStyle: "italic" }}>
                                                    📍 {language === "uz" ? "Mo'ljal" : "Ориентир"}: {point.landmark}
                                                </p>
                                            )}

                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, paddingTop: 6, borderTop: "1px dashed rgba(15,20,16,0.06)", fontSize: 11, color: "#737D75", flexWrap: "wrap" }}>
                                                <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                    <Clock size={11} color="#737D75" />
                                                    {point.schedule || "09:00 - 18:00"}
                                                </span>
                                                {point.phone && (
                                                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                                        <Phone size={11} color="#737D75" />
                                                        {point.phone}
                                                    </span>
                                                )}
                                                <span style={{ fontWeight: 600, color: "#2D6E3E" }}>
                                                    {deliveryDateFormatted}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Standart yetkazish narxi punkti uchun */}
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(15,20,16,0.06)" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "#737D75" }}>
                                {language === "uz" ? "Punktga yetkazish to'lovi:" : "Стоимость доставки в пункт:"}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: standardFee > 0 ? "#111612" : "#2D6E3E" }}>
                                {standardFee > 0 ? fmtSom(standardFee, language) : (language === "uz" ? "Bepul" : "Бесплатно")}
                            </span>
                        </div>
                    </div>
                )}

                {/* Promo Code */}
                <div style={{ background: "#fff", borderRadius: 24, padding: "16px 18px", boxShadow: "0 4px 16px rgba(15,20,16,0.04)", border: "1px solid rgba(15,20,16,0.06)" }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: "#737D75", letterSpacing: 0.3, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                        <Tag size={12} color="#737D75" />
                        {t.common.promoQuestion}
                    </label>
                    <div style={{ display: "flex", gap: 8 }}>
                        <input
                            type="text"
                            value={promoCode}
                            onChange={e => setPromoCode(e.target.value.toUpperCase())}
                            placeholder={t.common.promoPlaceholder}
                            disabled={!!promoData}
                            style={{ flex: 1, background: "#F5F5F0", border: promoData ? "1.5px solid #2D6E3E" : "1px solid transparent", borderRadius: 14, padding: "12px 16px", fontSize: 14, fontWeight: 600, color: "#111612", outline: "none", letterSpacing: 0.5, opacity: promoData ? 0.8 : 1 }}
                        />
                        {promoData ? (
                            <button
                                type="button"
                                aria-label="O'chirish"
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setPromoData(null);
                                    setPromoCode("");
                                    setCartPromo(null);
                                }}
                                className="ios-icon-tap active:scale-90 transition-transform duration-150 will-change-transform"
                                style={{ padding: "12px 16px", background: "#FFF0EE", border: "none", borderRadius: 14, cursor: "pointer", display: "flex", alignItems: "center" }}
                            >
                                <X size={18} color="#FF3B30" />
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    handleApplyPromo();
                                }}
                                disabled={isApplyingPromo || !promoCode.trim()}
                                className="ios-tap-feedback active:scale-95 transition-transform duration-150 will-change-transform"
                                style={{ padding: "12px 20px", background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", border: "none", borderRadius: 14, fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (!promoCode.trim() || isApplyingPromo) ? 0.35 : 1, display: "flex", alignItems: "center", gap: 6 }}
                            >
                                {isApplyingPromo ? <Loader2 size={16} className="animate-spin" /> : t.common.apply}
                            </button>
                        )}
                    </div>
                    {promoData && (
                        <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "#2D6E3E" }}>
                            ✓ -{promoData.discount.toLocaleString()} so'm chegirma qo'llandi
                        </div>
                    )}
                </div>

                {/* Wallet */}
                {walletBalance > 0 && !promoData && (
                    <div
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("selection");
                            setUseWallet(!useWallet);
                        }}
                        className="ios-tap-feedback active:scale-[0.98] will-change-transform"
                        style={{ background: useWallet ? "#EAF3EC" : "#fff", border: useWallet ? "1.5px solid #2D6E3E" : "1px solid rgba(15,20,16,0.06)", borderRadius: 24, padding: "16px 18px", cursor: "pointer", boxShadow: "0 4px 16px rgba(15,20,16,0.04)", transition: "background-color 150ms ease, border-color 150ms ease, transform 150ms ease" }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ width: 40, height: 40, borderRadius: 14, background: useWallet ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" : "#F0F2EF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <Wallet size={18} color={useWallet ? "#fff" : "#9AA29C"} />
                                </div>
                                <div>
                                    <p style={{ fontSize: 13.5, fontWeight: 700, color: "#111612", marginBottom: 2 }}>{t.common.payFromWallet}</p>
                                    <p style={{ fontSize: 11.5, fontWeight: 500, color: "#737D75" }}>
                                        {t.common.availableBalance.replace("{balance}", walletBalance.toLocaleString())}
                                    </p>
                                </div>
                            </div>
                            <div style={{ width: 22, height: 22, borderRadius: "50%", border: useWallet ? "none" : "2px solid #D0D5CF", background: useWallet ? "#2D6E3E" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {useWallet && <Check size={13} color="#fff" strokeWidth={3} />}
                            </div>
                        </div>
                        {useWallet && (
                            <p style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: "#2D6E3E", paddingLeft: 52 }}>
                                {t.common.walletUsageHint.replace("{amount}", Math.min(walletBalance, goodsTotal).toLocaleString())}
                            </p>
                        )}
                    </div>
                )}

                {/* Summary card — Velari green */}
                <div style={{ marginTop: 24, padding: "20px", background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)", color: "#fff", borderRadius: 24, boxShadow: "0 16px 40px rgba(45,110,62,0.28)", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", top: -30, right: -30, width: 120, height: 120, borderRadius: 60, background: "rgba(255,255,255,0.08)", pointerEvents: "none" }} />
                    <div style={{ position: "relative" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13, opacity: 0.85 }}>
                            <span>{t.common.products}</span>
                            <span>{subtotal.toLocaleString()} {language === "ru" ? "сум" : "so'm"}</span>
                        </div>
                        {smartDiscount > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13, color: "#A3F0B8" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>✦ {language === "ru" ? "Персональная скидка" : "Shaxsiy chegirma"}</span>
                                <span>-{smartDiscount.toLocaleString()} {language === "ru" ? "сум" : "so'm"}</span>
                            </div>
                        )}
                        {promoData && (
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 13, color: "#A3F0B8" }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Tag size={12} /> {promoData.code}</span>
                                <span>-{promoData.discount.toLocaleString()} {language === "ru" ? "сум" : "so'm"}</span>
                            </div>
                        )}
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontSize: 13, opacity: 0.85 }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {useExpress ? <Zap size={12} /> : <Truck size={12} />}
                                {t.common.delivery}{useExpress ? (language === "uz" ? " (tezkor)" : " (экспресс)") : ""}
                            </span>
                            <span style={{ color: deliveryFee > 0 ? "#fff" : "#A3F0B8", fontWeight: 700 }}>
                                {deliveryFee > 0 ? fmtSom(deliveryFee, language) : t.cart.free}
                            </span>
                        </div>
                        <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 13, opacity: 0.75, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>{t.common.total}</span>
                            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.4 }}>
                                {total.toLocaleString()} <span style={{ fontSize: 16, opacity: 0.8 }}>{language === "ru" ? "сум" : "so'm"}</span>
                            </span>
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    onClick={() => videoPreWarmer.triggerHaptic("medium")}
                    disabled={isSubmitting || displayProducts.length === 0 || stockErrors.length > 0 || isValidating}
                    className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform"
                    style={{
                        width: "100%", height: 54, borderRadius: 22, border: "none", cursor: "pointer",
                        background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)",
                        color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: -0.1,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                        boxShadow: "0 8px 20px rgba(45,110,62,0.28)", marginTop: 14,
                        opacity: (isSubmitting || displayProducts.length === 0 || stockErrors.length > 0 || isValidating) ? 0.4 : 1,
                    }}
                >
                    {isValidating ? <Loader2 className="animate-spin" size={20} /> : (isSubmitting ? <><Loader2 className="animate-spin" size={20} /> {t.common.sending}</> : t.common.goToPayment)}
                </button>
            </form>

            <YandexMapPicker
                isOpen={isMapOpen}
                onClose={() => setIsMapOpen(false)}
                onSelect={(addr, c) => {
                    setAddress(addr);
                    setCoords(c);
                }}
            />
        </div>
    );
}
