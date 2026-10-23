"use client";

import { useState, useEffect } from "react";
import { Search, ChevronRight, CheckCircle, Truck, Clock, XCircle, MoreVertical, MapPin, Phone, Package, User, Globe, X, Info, Tag, Layers, Hash, ShieldCheck } from "lucide-react";
import { adminFrom } from "@/lib/admin-query";
import { normalizeOrderStatus, getStatusLabel, ADMIN_STATUS_TABS } from "@/lib/order-status";
import Image from "next/image";

interface Order {
    id: string;
    userPhone: string;
    total: number;
    status: string;
    createdAt: any;
    items: any[];
}

export default function AdminOrders() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("Barchasi");
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
    const [mainImage, setMainImage] = useState<string>("");
    const [productLoading, setProductLoading] = useState(false);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        try {
            // orders RLS tufayli anon client o'qiy olmaydi — service-role API orqali.
            // Asl tuzatish serverda (supabaseAdminFresh — Next Data Cache'ni chetlaydi);
            // bu yerda cache: "no-store" yetarli.
            const res = await fetch("/api/admin/orders", { cache: "no-store" });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "Buyurtmalarni yuklab bo'lmadi");

            const fetchedOrders = (json.orders || []).map((o: any) => ({
                id: o.id,
                userPhone: o.user_phone,
                total: o.total,
                status: o.status,
                createdAt: o.created_at,
                items: o.items,
                address: o.address,
                coords: o.coords,
                promoCode: o.promo_code,
                discountAmount: o.discount_amount,
                smartDiscountAmount: o.smart_discount_amount,
                walletAmount: o.wallet_amount,
                deliveryFee: o.delivery_fee,
                deliveryType: o.delivery_type
            })) as Order[];
            setOrders(fetchedOrders);
        } catch (error) {
            console.error("Fetch orders error:", error);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (orderId: string, newStatus: string) => {
        try {
            const res = await fetch("/api/admin/orders/status", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ orderId, status: newStatus }),
            });
            
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Holatni yangilab bo'lmadi");

            // POST muvaffaqiyatli => DB allaqachon yangilangan (Telegram ham shuni
            // tasdiqlaydi). Optimistik qiymat aynan yozilgan status, shuning uchun
            // u yagona haqiqat. DARHOL qayta o'qimaymiz: keshlangan eski GET javobi
            // statusni 0.1s ichida "qaytarib" yuborardi (race condition).
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
            setSelectedOrder(prev => (prev && prev.id === orderId ? { ...prev, status: newStatus } : prev));
        } catch (error) {
            console.error("Update status error:", error);
            alert("Holatni yangilashda xatolik yuz berdi.");
        }
    };

    const fetchFullProduct = async (productId: string) => {
        setProductLoading(true);
        try {
            const { data, error } = await adminFrom("products")
                .select("*")
                .eq("id", productId)
                .single();
            
            if (error) throw error;

            if (data) {
                setSelectedProduct({
                    id: data.id,
                    name: data.name,
                    price: data.price,
                    image: data.image,
                    images: data.images,
                    description: data.description,
                    category: data.category_id,
                    stock: data.stock,
                    article: data.article
                });
                setMainImage(data.image || (data.images && data.images[0]) || "/placeholder.png");
            } else {
                alert("Mahsulot ma'lumotlari topilmadi.");
            }
        } catch (error) {
            console.error("Fetch product error:", error);
        } finally {
            setProductLoading(false);
        }
    };

    const tabCodes: Record<string, string[]> = Object.fromEntries(ADMIN_STATUS_TABS.map(tb => [tb.label_uz, tb.codes]));
    const filteredOrders = filter === "Barchasi"
        ? orders
        : orders.filter(o => (tabCodes[filter] || []).includes(normalizeOrderStatus(o.status)));

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 md:space-y-12">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-4 md:gap-6">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4">Buyurtmalar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">{orders.length} ta buyurtma</p>
                </div>

                <div className="flex bg-white p-1 md:p-1.5 rounded-[20px] md:rounded-[24px] border border-gray-100 shadow-sm overflow-x-auto max-w-full">
                    {["Barchasi", "Kutilmoqda", "Yetkazilmoqda", "Yetkazildi", "Bekor qilingan"].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setFilter(tab)}
                            className={`px-4 md:px-8 py-2.5 md:py-3.5 rounded-[16px] md:rounded-[20px] text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${filter === tab ? "bg-black text-white shadow-2xl shadow-black/20" : "text-gray-400 hover:text-black"
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            {/* Desktop Table View */}
            <div className="bg-white rounded-[40px] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden hidden md:block">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50">
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">ID / Vaqt</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Mijoz</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Mahsulotlar</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Summa</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Holat</th>
                            <th className="p-8 text-[10px] font-black text-gray-400 uppercase tracking-widest">Holatni boshqarish</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {filteredOrders.map((order) => (
                            <tr
                                key={order.id}
                                onClick={() => setSelectedOrder(order)}
                                className="hover:bg-gray-50/50 transition-colors group cursor-pointer"
                            >
                                <td className="p-8">
                                    <div className="font-mono text-[11px] font-black text-black">#{order.id}</div>
                                    <div className="text-[10px] text-gray-400 font-bold mt-1 uppercase tracking-tighter">
                                         {order.createdAt ? new Date(order.createdAt).toLocaleString('uz-UZ') : ""}
                                     </div>
                                </td>
                                <td className="p-8">
                                    <div className="font-black text-sm">{order.userPhone}</div>
                                    <div className="text-[10px] text-blue-500 font-black uppercase mt-1">Sodiq mijoz</div>
                                </td>
                                <td className="p-8">
                                    <div className="flex -space-x-2">
                                        {order.items?.map((item, i) => (
                                            <div key={i} title={`${item.quantity}x ${item.name}`} className="w-8 h-8 rounded-full bg-white border-2 border-gray-50 flex items-center justify-center text-[10px] font-black shadow-sm group-hover:scale-110 transition-transform">
                                                {item.name[0]}
                                            </div>
                                        ))}
                                        {order.items?.length > 3 && (
                                            <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-gray-50 flex items-center justify-center text-[10px] font-black text-gray-400">
                                                +{order.items.length - 3}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="p-8">
                                    <div className="text-xl font-black italic tracking-tighter">{order.total?.toLocaleString()} so'm</div>
                                </td>
                                <td className="p-8">
                                    {(() => {
                                        const code = normalizeOrderStatus(order.status);
                                        const tone = code === "delivered" ? "bg-green-100 text-green-700"
                                            : code === "cancelled" ? "bg-red-100 text-red-600"
                                            : code === "shipping" ? "bg-blue-100 text-blue-700"
                                            : code === "awaiting_payment" ? "bg-yellow-100 text-yellow-700"
                                            : "bg-orange-100 text-orange-700";
                                        return (
                                            <span className={`inline-block px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${tone}`}>
                                                {getStatusLabel(order.status, "uz")}
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td className="p-8">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateStatus(order.id, "Kutilmoqda");
                                            }}
                                            className={`p-3 rounded-xl transition-all ${["pending", "accepted", "awaiting_payment", "paid"].includes(normalizeOrderStatus(order.status)) ? "bg-orange-500 text-white shadow-lg" : "bg-gray-50 text-gray-300 hover:bg-orange-100"}`}
                                            title="Kutilmoqda"
                                        >
                                            <Clock size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateStatus(order.id, "Yetkazilmoqda");
                                            }}
                                            className={`p-3 rounded-xl transition-all ${normalizeOrderStatus(order.status) === "shipping" ? "bg-blue-500 text-white shadow-lg" : "bg-gray-50 text-gray-300 hover:bg-blue-100"}`}
                                            title="Yetkazilmoqda"
                                        >
                                            <Truck size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                updateStatus(order.id, "Yetkazildi");
                                            }}
                                            className={`p-3 rounded-xl transition-all ${normalizeOrderStatus(order.status) === "delivered" ? "bg-green-500 text-white shadow-lg" : "bg-gray-50 text-gray-300 hover:bg-green-100"}`}
                                            title="Yetkazildi"
                                        >
                                            <CheckCircle size={16} />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (confirm("Haqiqatan ham ushbu buyurtmani bekor qilmoqchimisiz?")) {
                                                    updateStatus(order.id, "Bekor qilingan");
                                                }
                                            }}
                                            className={`p-3 rounded-xl transition-all ${normalizeOrderStatus(order.status) === "cancelled" ? "bg-red-500 text-white shadow-lg" : "bg-gray-50 text-gray-300 hover:bg-red-100"}`}
                                            title="Bekor qilish"
                                        >
                                            <XCircle size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Mobile Card View (remains for responsiveness) */}
            <div className="md:hidden space-y-6">
                {filteredOrders.map((order) => (
                    <div
                        key={order.id}
                        onClick={() => setSelectedOrder(order)}
                        className="bg-white rounded-[32px] p-6 border border-gray-100 shadow-sm space-y-4 active:scale-95 transition-all cursor-pointer"
                    >
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase">ID: #{order.id}</p>
                                <p className="font-black mt-1">{order.userPhone}</p>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase ${normalizeOrderStatus(order.status) === 'delivered' ? 'bg-green-100 text-green-600' : normalizeOrderStatus(order.status) === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                                }`}>{getStatusLabel(order.status, 'uz')}</span>
                        </div>
                        <div className="flex justify-between items-end border-t border-gray-50 pt-4">
                            <div className="text-2xl font-black italic">{order.total?.toLocaleString()} so'm</div>
                            <button className="p-3 bg-gray-50 rounded-xl"><MoreVertical size={16} /></button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Order Detail Modal */}
            {selectedOrder && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4 lg:p-10 transition-all duration-500 ease-out animate-in fade-in">
                    <div className="bg-white w-full max-w-5xl h-full max-h-[90vh] rounded-[50px] shadow-2xl flex flex-col lg:flex-row overflow-hidden animate-in slide-in-from-bottom-10">
                        {/* Left Side: Order Info */}
                        <div className="lg:w-1/3 bg-gray-50 p-10 border-r border-gray-100 overflow-y-auto custom-scrollbar">
                            <div className="flex justify-between items-center mb-10">
                                <h3 className="text-3xl font-black tracking-tighter italic">TAFSILOT</h3>
                                <button onClick={() => setSelectedOrder(null)} className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-400 hover:text-black hover:shadow-lg transition-all active:scale-90">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-8">
                                <div className="p-6 bg-white rounded-3xl shadow-sm border border-gray-100">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-10 h-10 bg-blue-50 text-blue-500 rounded-xl flex items-center justify-center"><Phone size={18} /></div>
                                        <div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mijoz Telefoni</p>
                                            <p className="font-black text-sm">{selectedOrder.userPhone}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="w-10 h-10 bg-green-50 text-green-500 rounded-xl flex items-center justify-center"><MapPin size={18} /></div>
                                        <div className="flex-1">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Manzil</p>
                                            <p className="font-black text-xs italic tracking-tighter line-clamp-2">{(selectedOrder as any).address || "Ko'rsatilmagan"}</p>
                                        </div>
                                    </div>
                                    {(selectedOrder as any).coords && (
                                        <a
                                            href={`https://yandex.uz/maps/?pt=${(selectedOrder as any).coords[1]},${(selectedOrder as any).coords[0]}&z=16&l=map`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="w-full mt-4 py-3 bg-blue-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest text-center flex items-center justify-center gap-2 hover:bg-blue-600 transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                                        >
                                            <Globe size={14} />
                                            Xaritada ochish (Yandex)
                                        </a>
                                    )}
                                </div>

                                <div className="p-6 bg-black text-white rounded-[32px] shadow-2xl shadow-black/20">
                                    <p className="text-[10px] font-black opacity-40 uppercase tracking-[0.2em] mb-4">Buyurtma Holati</p>
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${normalizeOrderStatus(selectedOrder.status) === 'delivered' ? 'bg-green-500' :
                                            normalizeOrderStatus(selectedOrder.status) === 'cancelled' ? 'bg-red-500' :
                                                'bg-orange-500 animate-pulse'
                                            }`}>
                                            <Package size={24} />
                                        </div>
                                        <div>
                                            <p className="text-xl font-black italic tracking-tighter uppercase">{getStatusLabel(selectedOrder.status, 'uz')}</p>
                                            <p className="text-[10px] font-bold opacity-40">#{selectedOrder.id}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Moliyaviy taqsimot */}
                                <div className="p-6 bg-white rounded-[32px] border border-gray-100 shadow-sm space-y-3">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Hisob-kitob</p>
                                    {(selectedOrder as any).promoCode && (
                                        <div className="flex justify-between items-center text-xs font-bold">
                                            <span className="text-gray-400">Promo-kod:</span>
                                            <span className="font-black text-purple-600 uppercase">{(selectedOrder as any).promoCode}</span>
                                        </div>
                                    )}
                                    {Number((selectedOrder as any).discountAmount) > 0 && (
                                        <div className="flex justify-between items-center text-xs font-bold">
                                            <span className="text-gray-400">Chegirma:</span>
                                            <span className="font-black text-red-500">-{Number((selectedOrder as any).discountAmount).toLocaleString()} so'm</span>
                                        </div>
                                    )}
                                    {Number((selectedOrder as any).smartDiscountAmount) > 0 && (
                                        <div className="flex justify-between items-center text-xs font-bold">
                                            <span className="text-gray-400">Smart-chegirma:</span>
                                            <span className="font-black text-red-500">-{Number((selectedOrder as any).smartDiscountAmount).toLocaleString()} so'm</span>
                                        </div>
                                    )}
                                    {Number((selectedOrder as any).walletAmount) > 0 && (
                                        <div className="flex justify-between items-center text-xs font-bold">
                                            <span className="text-gray-400">Hamyondan:</span>
                                            <span className="font-black text-blue-500">-{Number((selectedOrder as any).walletAmount).toLocaleString()} so'm</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-center text-xs font-bold">
                                        <span className="text-gray-400">Yetkazish{(selectedOrder as any).deliveryType === 'express' ? ' (tezkor)' : ''}:</span>
                                        <span className="font-black">{Number((selectedOrder as any).deliveryFee) > 0 ? `+${Number((selectedOrder as any).deliveryFee).toLocaleString()} so'm` : 'Bepul'}</span>
                                    </div>
                                    <div className="flex justify-between items-center text-sm font-black pt-2 border-t border-gray-100">
                                        <span>JAMI:</span>
                                        <span className="italic tracking-tighter">{selectedOrder.total?.toLocaleString()} so'm</span>
                                    </div>
                                </div>

                                {/* Kafolat Taloni Tugmasi */}
                                <a
                                    href={`/admin/warranty?orderId=${selectedOrder.id}`}
                                    className="w-full py-3.5 px-4 bg-teal-700 hover:bg-teal-800 text-white rounded-2xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-teal-700/20 transition-all active:scale-95"
                                >
                                    <ShieldCheck size={16} />
                                    <span>Kafolat Taloni (PDF / Print)</span>
                                </a>
                            </div>
                        </div>

                        {/* Right Side: Items List */}
                        <div className="lg:w-2/3 p-10 overflow-y-auto no-scrollbar bg-white">
                            <div className="flex justify-between items-end mb-10 pb-8 border-b border-gray-50">
                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Mahsulotlar Ro'yxati</h4>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-1">Jami Summa</p>
                                    <p className="text-4xl font-black italic tracking-tighter">{selectedOrder.total?.toLocaleString()} so'm</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {selectedOrder.items?.map((item: any, i: number) => (
                                    <div
                                        key={i}
                                        onClick={() => fetchFullProduct(item.id)}
                                        className="flex gap-4 p-5 bg-gray-50/50 rounded-[32px] border border-gray-50 hover:bg-white hover:shadow-xl transition-all cursor-pointer group/item"
                                    >
                                        <div className="w-20 h-24 bg-white rounded-2xl overflow-hidden shrink-0 border border-gray-100 shadow-sm relative">
                                            <Image
                                                src={(item.image && (item.image.startsWith('http') || item.image.startsWith('/'))) ? item.image : "/placeholder.png"}
                                                alt={item.name}
                                                fill
                                                className="object-cover group-hover/item:scale-110 transition-transform duration-500"
                                            />
                                            {productLoading && (
                                                <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                                    <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 py-1">
                                            <p className="font-black text-xs uppercase italic tracking-tighter leading-tight mb-2 line-clamp-2">{item.name}</p>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                                                    <span>Dona:</span>
                                                    <span className="text-black font-black">{item.quantity}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                                                    <span>Narxi:</span>
                                                    <span className="text-black font-black">{item.price?.toLocaleString()} so'm</span>
                                                </div>
                                                <div className="flex justify-between items-center text-[10px] font-black text-blue-500 mt-1 uppercase tracking-tighter pt-1 border-t border-blue-50">
                                                    <span>Jami:</span>
                                                    <span>{(item.price * item.quantity)?.toLocaleString()} so'm</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Product Detail Modal (Second Level) */}
            {selectedProduct && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-4xl h-full max-h-[85vh] rounded-[50px] shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-500">
                        {/* Images Section */}
                        <div className="md:w-1/2 p-8 bg-gray-50 flex flex-col items-center justify-center relative border-r border-gray-100">
                            <button onClick={() => setSelectedProduct(null)} className="absolute top-8 right-8 w-12 h-12 bg-white rounded-2xl flex items-center justify-center text-gray-400 hover:text-black hover:shadow-lg transition-all z-10">
                                <X size={24} />
                            </button>

                            <div className="w-full aspect-[3/4] relative bg-white rounded-[40px] shadow-2xl overflow-hidden border-8 border-white group/preview">
                                <Image
                                    src={(mainImage && (mainImage.startsWith('http') || mainImage.startsWith('/'))) ? mainImage : "/placeholder.png"}
                                    alt={selectedProduct.name}
                                    fill
                                    className="object-cover"
                                />
                            </div>

                            {/* Additional Images (if exist) */}
                            {selectedProduct.images && selectedProduct.images.length > 0 && (
                                <div className="flex gap-3 mt-6 overflow-x-auto p-2 no-scrollbar w-full">
                                    {/* Include primary image if it's separate */}
                                    {[...(selectedProduct.imageUrl || selectedProduct.image ? [selectedProduct.imageUrl || selectedProduct.image] : []), ...selectedProduct.images].filter((img, idx, self) => self.indexOf(img) === idx).map((img: string, idx: number) => (
                                        <button
                                            key={idx}
                                            onClick={() => setMainImage(img)}
                                            className={`w-20 h-24 bg-white rounded-2xl shrink-0 border-4 shadow-md relative overflow-hidden transition-all ${mainImage === img ? "border-blue-500 scale-105" : "border-white"}`}
                                        >
                                            <Image src={img} alt={`img-${idx}`} fill className="object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Details Section */}
                        <div className="md:w-1/2 p-10 overflow-y-auto custom-scrollbar flex flex-col">
                            <div className="mb-10">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="px-3 py-1 bg-blue-50 text-blue-500 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-100">{selectedProduct.category}</span>
                                    {selectedProduct.article && <span className="px-3 py-1 bg-gray-50 text-gray-400 rounded-full text-[9px] font-black uppercase tracking-widest border border-gray-100">Art: {selectedProduct.article}</span>}
                                </div>
                                <h2 className="text-3xl font-black tracking-tighter italic uppercase leading-tight mb-2">{selectedProduct.name}</h2>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-10">
                                <div className="p-5 bg-gray-50 rounded-3xl border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Tag size={10} /> Narxi</p>
                                    <p className="text-2xl font-black italic tracking-tighter">{selectedProduct.price?.toLocaleString()} so'm</p>
                                </div>
                                <div className="p-5 bg-gray-50 rounded-3xl border border-gray-100">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Layers size={10} /> Qoldiq</p>
                                    <p className="text-2xl font-black italic tracking-tighter text-blue-500">{selectedProduct.stock || 0} ta</p>
                                </div>
                            </div>

                            <div className="space-y-6 flex-1">
                                <div>
                                    <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Info size={14} className="text-black" />
                                        Mahsulot Tavsifi
                                    </p>
                                    <div className="text-sm font-medium text-gray-600 leading-relaxed whitespace-pre-wrap bg-gray-50/50 p-6 rounded-[32px] border border-gray-50">
                                        {selectedProduct.description || "Tavsif qo'shilmagan."}
                                    </div>
                                </div>

                                {selectedProduct.stockDetails && (
                                    <div className="pt-6 border-t border-gray-100">
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Omborlardagi qoldiq</p>
                                        <div className="space-y-3">
                                            {Object.entries(selectedProduct.stockDetails).map(([warehouse, qty]: any) => (qty > 0 &&
                                                <div key={warehouse} className="flex justify-between items-center py-1">
                                                    <span className="text-[11px] font-bold text-gray-500 uppercase flex items-center gap-2"><Hash size={12} className="text-gray-300" /> {warehouse}</span>
                                                    <span className="text-xs font-black italic tracking-tighter">{qty} ta</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {filteredOrders.length === 0 && (
                <div className="py-32 text-center bg-white rounded-[50px] border-2 border-dashed border-gray-100">
                    <XCircle size={64} className="mx-auto mb-6 text-gray-100" />
                    <p className="text-gray-400 font-black uppercase tracking-[0.3em] text-sm">Ma'lumot topilmadi</p>
                </div>
            )}
        </div>
    );
}
