"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
    ShieldCheck,
    Printer,
    Copy,
    Check,
    Search,
    RefreshCw,
    Calendar,
    Phone,
    MapPin,
    Package,
    Building,
    CheckCircle2,
    FileText,
    ArrowLeft
} from "lucide-react";
import Link from "next/link";

interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
    model?: string;
    sku?: string;
}

interface Order {
    id: string;
    userPhone: string;
    total: number;
    status: string;
    createdAt: string;
    items: OrderItem[];
    address?: string;
    deliveryType?: string;
}

function WarrantyContent() {
    const searchParams = useSearchParams();
    const queryOrderId = searchParams.get("orderId");

    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [searchQuery, setSearchQuery] = useState(queryOrderId || "");

    // Warranty settings
    const [warrantyMonths, setWarrantyMonths] = useState<number>(6);
    const [storeName, setStoreName] = useState('"Velari uz" internet do\'koni');
    const [storePhone, setStorePhone] = useState("+998 (95) 082 11 88");
    const [storeWebsite, setStoreWebsite] = useState("velari.uz");
    const [copied, setCopied] = useState(false);

    // Fetch orders from admin API
    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/admin/orders?limit=100", { cache: "no-store" });
            const json = await res.json();
            if (json.success && json.orders) {
                const mapped: Order[] = json.orders.map((o: any) => ({
                    id: o.id?.toString() || "",
                    userPhone: o.user_phone || "",
                    total: o.total || 0,
                    status: o.status || "",
                    createdAt: o.created_at || "",
                    items: Array.isArray(o.items) ? o.items : [],
                    address: o.address || "",
                    deliveryType: o.delivery_type || "standard"
                }));
                setOrders(mapped);

                if (queryOrderId) {
                    const target = mapped.find(
                        (ord) => ord.id.toLowerCase() === queryOrderId.toLowerCase()
                    );
                    if (target) {
                        setSelectedOrder(target);
                    } else if (mapped.length > 0) {
                        setSelectedOrder(mapped[0]);
                    }
                } else if (mapped.length > 0) {
                    setSelectedOrder(mapped[0]);
                }
            }
        } catch (err) {
            console.error("Orders fetch error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
    }, [queryOrderId]);

    // Filtered orders list
    const filteredOrders = useMemo(() => {
        if (!searchQuery.trim()) return orders;
        const q = searchQuery.toLowerCase().trim();
        return orders.filter(
            (o) =>
                o.id.toLowerCase().includes(q) ||
                o.userPhone.toLowerCase().includes(q) ||
                o.items?.some((it) => it.name?.toLowerCase().includes(q))
        );
    }, [orders, searchQuery]);

    // Dates calculation
    const purchaseDate = useMemo(() => {
        if (!selectedOrder?.createdAt) return new Date();
        const d = new Date(selectedOrder.createdAt);
        return isNaN(d.getTime()) ? new Date() : d;
    }, [selectedOrder]);

    const formattedPurchaseDate = useMemo(() => {
        const day = String(purchaseDate.getDate()).padStart(2, "0");
        const month = String(purchaseDate.getMonth() + 1).padStart(2, "0");
        const year = purchaseDate.getFullYear();
        return `${day}.${month}.${year}`;
    }, [purchaseDate]);

    const expiryDate = useMemo(() => {
        const d = new Date(purchaseDate);
        d.setMonth(d.getMonth() + warrantyMonths);
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    }, [purchaseDate, warrantyMonths]);

    // Handle Print
    const handlePrint = () => {
        window.print();
    };

    // Handle Copy Text for Telegram/SMS
    const handleCopyText = () => {
        if (!selectedOrder) return;
        const itemsText = (selectedOrder.items || [])
            .map(
                (item, idx) =>
                    `${idx + 1}. ${item.name} (${item.quantity} dona) - ${Number(item.price).toLocaleString()} so'm`
            )
            .join("\n");

        const text = `=====================================================
            KAFOLAT TALONI (WARRANTY CARD)
=====================================================
Buyurtma raqami: #${selectedOrder.id}
Sotilgan sana:   ${formattedPurchaseDate}
Xaridor telefoni:${selectedOrder.userPhone}
Yetkazish manzili: ${selectedOrder.address || "Ko'rsatilmagan"}
---------------- MAHSULOT MA'LUMOTLARI ----------------
${itemsText}
Jami qiymati:    ${selectedOrder.total?.toLocaleString()} so'm
Kafolat muddati: ${warrantyMonths} oy (Amal qilish muddati: ${formattedPurchaseDate} dan ${expiryDate} gacha)
----------------- KAFOLAT SHARTLARI -----------------
1. Kafolat muddati tovar xaridorga yetkazib berilgan kundan boshlab hisoblanadi.
2. Kafolat faqat ishlab chiqaruvchining zavod nuqsonlari (texnik brak) aniqlangan holatlarda bepul ta'mirlash yoki almashtirishni o'z ichiga oladi.
3. Quyidagi holatlarda kafolat o'z kuchini yo'qotadi:
   - Mahsulotga mexanik shikast yetkazilganda (tushib ketish, yorilish, sinish);
   - Mahsulot ichiga suv yoki boshqa begona suyuqliklar tushganda;
   - Tarmoqdagi elektr tokining me'yordan oshishi natijasida nosozlik yuz berganda;
   - Qurilma ruxsatsiz ochilganda yoki mustaqil ta'mirlashga urinilganda.
Sotuvchi:  ${storeName}
Aloqa:     ${storePhone}
=====================================================`;

        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div className="min-h-screen pb-16">
            {/* PRINT STYLES */}
            <style jsx global>{`
                @media print {
                    /* Hide EVERYTHING in the page except the printable certificate */
                    body * {
                        visibility: hidden !important;
                    }
                    #warranty-certificate-printable,
                    #warranty-certificate-printable * {
                        visibility: visible !important;
                    }
                    #warranty-certificate-printable {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 210mm !important;
                        min-height: 297mm !important;
                        margin: 0 !important;
                        padding: 20mm 18mm !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: #ffffff !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    @page {
                        size: A4 portrait;
                        margin: 0;
                    }
                }
            `}</style>

            {/* TOP BAR / HEADER (Hidden on print) */}
            <div className="print:hidden mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-100 pb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Link
                            href="/admin/orders"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                            title="Buyurtmalarga qaytish"
                        >
                            <ArrowLeft size={18} />
                        </Link>
                        <h1 className="text-2xl md:text-3xl font-black tracking-tight text-gray-900 flex items-center gap-2.5">
                            <ShieldCheck className="text-teal-600" size={28} />
                            Kafolat Talonlari (Warranty)
                        </h1>
                    </div>
                    <p className="text-xs text-gray-500 font-medium ml-8">
                        Buyurtmalar bo'yicha rasmiy kafolat xatlari va A4 PDF generatsiyasi
                    </p>
                </div>

                <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                        onClick={handleCopyText}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                        {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                        <span>{copied ? "Nusxalandi!" : "Matnni nusxalash (Telegram)"}</span>
                    </button>

                    <button
                        onClick={handlePrint}
                        disabled={!selectedOrder}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-all shadow-md shadow-teal-700/20 active:scale-95 disabled:opacity-50"
                    >
                        <Printer size={16} />
                        <span>Chop etish / PDF Saqlash</span>
                    </button>
                </div>
            </div>

            {/* MAIN CONTENT SPLIT (Hidden on print) */}
            <div className="print:hidden grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* LEFT COLUMN: Controls & Order Picker */}
                <div className="lg:col-span-5 space-y-6">
                    {/* Search & Order Selection Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                                <Package size={14} />
                                Buyurtmani tanlash
                            </h2>
                            <button
                                onClick={fetchOrders}
                                className="p-1 rounded-lg text-gray-400 hover:text-gray-900 transition-colors"
                                title="Qayta yuklash"
                            >
                                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                            </button>
                        </div>

                        {/* Search input */}
                        <div className="relative">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buyurtma ID yoki telefon (+998...)"
                                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white transition-all"
                            />
                        </div>

                        {/* Orders List scroll */}
                        <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 rounded-xl border border-gray-100">
                            {loading ? (
                                <div className="p-6 text-center text-xs text-gray-400 font-medium">
                                    Yuklanmoqda...
                                </div>
                            ) : filteredOrders.length === 0 ? (
                                <div className="p-6 text-center text-xs text-gray-400 font-medium">
                                    Buyurtma topilmadi
                                </div>
                            ) : (
                                filteredOrders.map((ord) => {
                                    const isSelected = selectedOrder?.id === ord.id;
                                    return (
                                        <button
                                            key={ord.id}
                                            onClick={() => setSelectedOrder(ord)}
                                            className={`w-full p-3 text-left transition-all flex items-center justify-between ${
                                                isSelected
                                                    ? "bg-teal-50/70 border-l-4 border-teal-600"
                                                    : "hover:bg-gray-50"
                                            }`}
                                        >
                                            <div className="min-w-0 flex-1 pr-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs font-black text-gray-900">
                                                        #{ord.id}
                                                    </span>
                                                    <span className="text-[10px] text-gray-400">
                                                        {ord.createdAt
                                                            ? new Date(ord.createdAt).toLocaleDateString("uz-UZ")
                                                            : ""}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600 font-medium truncate mt-0.5">
                                                    {ord.userPhone}
                                                </p>
                                                <p className="text-[11px] text-gray-400 truncate mt-0.5">
                                                    {ord.items?.map((i) => i.name).join(", ") || "Mahsulot"}
                                                </p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <div className="text-xs font-black text-gray-900">
                                                    {ord.total?.toLocaleString()} so'm
                                                </div>
                                                <div className="text-[10px] text-teal-700 font-semibold mt-0.5">
                                                    {ord.items?.length || 1} ta tovar
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Warranty Settings Card */}
                    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4">
                        <h2 className="text-xs font-black uppercase tracking-wider text-gray-400 flex items-center gap-2">
                            <ShieldCheck size={14} />
                            Kafolat Parametrlari
                        </h2>

                        <div className="space-y-3">
                            {/* Duration */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">
                                    Kafolat muddati
                                </label>
                                <div className="grid grid-cols-5 gap-2">
                                    {[1, 3, 6, 12, 24].map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setWarrantyMonths(m)}
                                            className={`py-2 text-center rounded-xl text-xs font-bold border transition-all ${
                                                warrantyMonths === m
                                                    ? "bg-teal-700 text-white border-teal-700 shadow-sm"
                                                    : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                                            }`}
                                        >
                                            {m} oy
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Store Name */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Do'kon nomi
                                </label>
                                <input
                                    type="text"
                                    value={storeName}
                                    onChange={(e) => setStoreName(e.target.value)}
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
                                />
                            </div>

                            {/* Store Phone */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Aloqa telefoni
                                </label>
                                <input
                                    type="text"
                                    value={storePhone}
                                    onChange={(e) => setStorePhone(e.target.value)}
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
                                />
                            </div>

                            {/* Store Website */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">
                                    Veb-sayt
                                </label>
                                <input
                                    type="text"
                                    value={storeWebsite}
                                    onChange={(e) => setStoreWebsite(e.target.value)}
                                    className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-600 focus:bg-white"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN: Live Preview of Certificate */}
                <div className="lg:col-span-7">
                    <div className="sticky top-20">
                        <div className="text-xs font-black uppercase tracking-wider text-gray-400 mb-3 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                                <FileText size={14} />
                                Jonli A4 Ko'rinish (Preview)
                            </span>
                            <span className="text-[11px] text-teal-700 font-semibold">
                                Tayyor A4 format
                            </span>
                        </div>

                        {selectedOrder ? (
                            <div className="overflow-x-auto p-4 bg-gray-100 rounded-3xl border border-gray-200 shadow-inner flex justify-center">
                                {/* The Certificate Component (Also used for printing) */}
                                <CertificateCard
                                    order={selectedOrder}
                                    purchaseDateStr={formattedPurchaseDate}
                                    expiryDateStr={expiryDate}
                                    warrantyMonths={warrantyMonths}
                                    storeName={storeName}
                                    storePhone={storePhone}
                                    storeWebsite={storeWebsite}
                                />
                            </div>
                        ) : (
                            <div className="bg-white rounded-3xl p-12 text-center border border-gray-200 text-gray-400">
                                <Package size={48} className="mx-auto mb-3 opacity-30" />
                                <p className="text-sm font-bold">Kafolat taloni ko'rish uchun buyurtmani tanlang</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* PRINT-ONLY CONTAINER: In print mode this is explicitly targeted */}
            {selectedOrder && (
                <div className="hidden print:block">
                    <div id="warranty-certificate-printable">
                        <CertificateCard
                            order={selectedOrder}
                            purchaseDateStr={formattedPurchaseDate}
                            expiryDateStr={expiryDate}
                            warrantyMonths={warrantyMonths}
                            storeName={storeName}
                            storePhone={storePhone}
                            storeWebsite={storeWebsite}
                            isPrintMode={true}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

// Pixel-perfect Certificate Component
function CertificateCard({
    order,
    purchaseDateStr,
    expiryDateStr,
    warrantyMonths,
    storeName,
    storePhone,
    storeWebsite,
    isPrintMode = false
}: {
    order: Order;
    purchaseDateStr: string;
    expiryDateStr: string;
    warrantyMonths: number;
    storeName: string;
    storePhone: string;
    storeWebsite: string;
    isPrintMode?: boolean;
}) {
    return (
        <div
            className={`bg-white text-slate-800 relative select-none ${
                isPrintMode
                    ? "w-full"
                    : "w-[720px] min-h-[960px] p-8 rounded-2xl shadow-xl border border-gray-300"
            }`}
            style={{
                boxSizing: "border-box",
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
            }}
        >
            {/* Outer Decorative Double Border */}
            <div
                className="absolute pointer-events-none rounded-lg"
                style={{
                    top: isPrintMode ? "10mm" : "12px",
                    left: isPrintMode ? "10mm" : "12px",
                    right: isPrintMode ? "10mm" : "12px",
                    bottom: isPrintMode ? "10mm" : "12px",
                    border: "2px solid #0d9488"
                }}
            />
            <div
                className="absolute pointer-events-none rounded"
                style={{
                    top: isPrintMode ? "12mm" : "16px",
                    left: isPrintMode ? "12mm" : "16px",
                    right: isPrintMode ? "12mm" : "16px",
                    bottom: isPrintMode ? "12mm" : "16px",
                    border: "1px dashed #99f6e4"
                }}
            />

            <div className="relative z-10 flex flex-col justify-between h-full space-y-6">
                {/* HEADER */}
                <div className="border-b-2 border-teal-600 pb-4 flex items-start justify-between">
                    <div>
                        <div className="text-2xl font-black uppercase tracking-widest text-teal-800">
                            VELARI.UZ
                        </div>
                        <div className="text-[11px] font-medium text-slate-500 mt-1">
                            Rasmiy Internet Do'koni & Servis Markazi
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-lg font-black tracking-wide text-slate-900">
                            KAFOLAT TALONI
                        </div>
                        <div className="text-[11px] font-bold text-teal-700 mt-0.5">
                            WARRANTY CERTIFICATE
                        </div>
                        <div className="inline-block mt-1 px-2.5 py-0.5 bg-teal-50 border border-teal-300 text-teal-800 text-[10px] font-extrabold rounded-full">
                            ✓ TASDIQLANGAN / VERIFIED
                        </div>
                    </div>
                </div>

                {/* TWO-COLUMN DETAILS */}
                <div className="grid grid-cols-2 gap-4">
                    {/* Buyer Details */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                            <span>📋</span> Buyurtma va Mijoz
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Buyurtma №:</span>
                            <span className="font-mono font-bold text-slate-900">#{order.id}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Sotilgan sana:</span>
                            <span className="font-semibold text-slate-900">{purchaseDateStr}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Mijoz telefoni:</span>
                            <span className="font-semibold text-slate-900">{order.userPhone}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Yetkazish manzili:</span>
                            <span className="font-medium text-slate-900 text-right max-w-[60%] truncate">
                                {order.address || "Toshkent shahri"}
                            </span>
                        </div>
                    </div>

                    {/* Store Details */}
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-teal-800 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                            <span>🏢</span> Sotuvchi Tafsilotlari
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Sotuvchi:</span>
                            <span className="font-semibold text-slate-900">{storeName}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Aloqa markazi:</span>
                            <span className="font-semibold text-slate-900">{storePhone}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Rasmiy sayt:</span>
                            <span className="font-semibold text-teal-700">{storeWebsite}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Xizmat turi:</span>
                            <span className="font-semibold text-slate-900">Bepul kafolatli servis</span>
                        </div>
                    </div>
                </div>

                {/* PRODUCT TABLE */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-teal-700 text-white text-[11px] font-bold uppercase tracking-wider">
                                <th className="p-2.5">№</th>
                                <th className="p-2.5">Mahsulot nomi</th>
                                <th className="p-2.5 text-center">Miqdori</th>
                                <th className="p-2.5 text-right">Summasi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                            {(order.items && order.items.length > 0 ? order.items : [{ id: "1", name: "Buyurtma mahsuloti", price: order.total, quantity: 1 }]).map((item, idx) => (
                                <tr key={idx} className="bg-white">
                                    <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                                    <td className="p-2.5">
                                        <div className="font-bold text-slate-900">{item.name}</div>
                                        {item.sku && (
                                            <div className="text-[10px] text-slate-400">SKU: {item.sku}</div>
                                        )}
                                    </td>
                                    <td className="p-2.5 text-center font-medium">{item.quantity} dona</td>
                                    <td className="p-2.5 text-right font-bold text-slate-900">
                                        {Number(item.price * (item.quantity || 1)).toLocaleString()} so'm
                                    </td>
                                </tr>
                            ))}
                            <tr className="bg-slate-50 font-bold">
                                <td colSpan={3} className="p-2.5 text-right uppercase text-[11px] text-slate-600">
                                    Jami to'langan summa:
                                </td>
                                <td className="p-2.5 text-right text-teal-800 text-sm">
                                    {order.total?.toLocaleString()} so'm
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* WARRANTY HIGHLIGHT BANNER */}
                <div className="bg-gradient-to-r from-teal-700 to-teal-900 text-white rounded-lg p-3.5 flex items-center justify-between shadow-sm">
                    <div>
                        <div className="text-sm font-extrabold tracking-wide uppercase">
                            RASMIY KAFOLAT MUDDATI: {warrantyMonths} OY
                        </div>
                        <div className="text-[11px] text-teal-100 mt-0.5">
                            Amal qilish oralig'i: {purchaseDateStr} dan {expiryDateStr} gacha
                        </div>
                    </div>
                    <div className="bg-white text-teal-800 px-3.5 py-1.5 rounded font-black text-sm tracking-wider">
                        {warrantyMonths} OY KAFOLAT
                    </div>
                </div>

                {/* TERMS & CONDITIONS */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3.5 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-800">
                        KAFOLAT SHARTLARI VA TALABLARI:
                    </div>
                    <ol className="list-decimal list-inside text-[11px] text-slate-600 space-y-1 leading-relaxed">
                        <li>
                            Kafolat muddati tovar xaridorga yetkazib berilgan kundan ({purchaseDateStr}) boshlab hisoblanadi.
                        </li>
                        <li>
                            Kafolat faqat ishlab chiqaruvchining zavod nuqsonlari (texnik brak) aniqlangan holatlarda bepul ta'mirlash yoki almashtirishni o'z ichiga oladi.
                        </li>
                        <li>
                            <strong>Quyidagi holatlarda kafolat bekor qilinadi:</strong>
                            <ul className="list-disc list-inside ml-3 mt-1 space-y-0.5 text-slate-500">
                                <li>Mahsulotga mexanik shikast yetkazilganda (tushib ketish, sinish, yorilish);</li>
                                <li>Qurilma ichiga suv yoki boshqa begona suyuqliklar kirganda;</li>
                                <li>Elektr tarmog'idagi kuchlanish sakrashi oqibatida shikastlanganda;</li>
                                <li>Qurilma ruxsatsiz ochilganda yoki mustaqil ta'mirlanganda.</li>
                            </ul>
                        </li>
                        <li>
                            Kafolatli xizmat ko'rsatish uchun ushbu Kafolat taloni hamda buyurtma raqamini taqdim etish kifoya.
                        </li>
                    </ol>
                </div>

                {/* FOOTER & SEAL */}
                <div className="border-t border-slate-200 pt-3 flex items-end justify-between">
                    <div className="text-[11px] text-slate-500 space-y-1">
                        <div className="font-bold text-slate-900">{storeName}</div>
                        <div>Mijozlarni qo'llab-quvvatlash: {storePhone}</div>
                        <div>Toshkent shahri, O'zbekiston</div>
                        <div className="text-[9px] text-slate-400 mt-1">
                            Elektron tizim tomonidan shakllantirildi: {purchaseDateStr} | ID: #{order.id}
                        </div>
                    </div>

                    {/* Official Electronic Stamp */}
                    <div className="relative w-28 h-28 flex items-center justify-center">
                        <div
                            className="w-24 h-24 rounded-full border-2 border-teal-600 flex flex-col items-center justify-center text-center text-teal-700 bg-teal-50/20"
                            style={{ transform: "rotate(-10deg)" }}
                        >
                            <div className="w-20 h-20 rounded-full border border-dashed border-teal-500 flex flex-col items-center justify-center p-1">
                                <span className="text-[9px] font-black tracking-wider uppercase">
                                    VELARI.UZ
                                </span>
                                <span className="text-[8px] font-extrabold border-y border-teal-600 my-0.5 py-0.5 w-full text-center">
                                    {warrantyMonths} OY KAFOLAT
                                </span>
                                <span className="text-[7px] font-bold text-slate-400">
                                    TASDIQLANGAN
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Legal Notice */}
                <div className="text-center text-[9px] text-slate-400 border-t border-slate-100 pt-2">
                    Mazkur hujjat elektron ravishda shakllantirilgan va O'zbekiston Respublikasining "Iste'molchilarning huquqlarini himoya qilish to'g'risida"gi Qonuniga muvofiq qonuniy kuchga ega.
                </div>
            </div>
        </div>
    );
}

export default function AdminWarrantyPage() {
    return (
        <Suspense
            fallback={
                <div className="flex justify-center items-center h-[60vh]">
                    <div className="w-10 h-10 border-4 border-teal-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
            }
        >
            <WarrantyContent />
        </Suspense>
    );
}
