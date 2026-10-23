"use client";

import { useState, useEffect } from "react";
import { adminSelect, adminUpdate } from "@/lib/admin-api";
import { Database, Search, Package, Home as WarehouseIcon, Save, Loader2, CheckCircle2, History, AlertCircle, FileSpreadsheet, Download, X, Upload } from "lucide-react";

interface Product {
    id: string;
    name: string;
    image: string;
    price: number;
    sku?: string;
    stockDetails?: { [warehouseId: string]: number };
}

interface Warehouse {
    id: string;
    name: string;
}

export default function AdminInventory() {
    const [products, setProducts] = useState<Product[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [changingStock, setChangingStock] = useState<{ [productId: string]: { [warehouseId: string]: number } }>({});
    const [showSuccess, setShowSuccess] = useState(false);
    const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importLog, setImportLog] = useState<string[]>([]);

    const fetchData = async () => {
        try {
            const [productsData, warehousesData] = await Promise.all([
                adminSelect<any[]>("products", {
                    columns: "id, name, image, price, sku, stock_details",
                    match: { column: "is_deleted", value: false },
                    limit: 1000,
                }),
                adminSelect<any[]>("warehouses", { columns: "id, name", match: { column: "active", value: true } })
            ]);

            setProducts((productsData || []).map(p => ({
                id: p.id,
                name: p.name,
                image: p.image,
                price: p.price,
                sku: p.sku,
                stockDetails: p.stock_details
            })) as Product[]);

            setWarehouses(warehousesData as Warehouse[]);
            setLoading(false);
        } catch (error) {
            console.error("Fetch inventory error:", error);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleStockChange = (productId: string, warehouseId: string, val: string) => {
        const num = parseInt(val) || 0;
        setChangingStock(prev => ({
            ...prev,
            [productId]: {
                ...(prev[productId] || {}),
                [warehouseId]: num
            }
        }));
    };

    const handleSave = async (product: Product) => {
        const updates = changingStock[product.id];
        if (!updates) return;

        setIsSaving(true);
        try {
            const newStockDetails = { ...(product.stockDetails || {}), ...updates };
            const totalStock = Object.values(newStockDetails).reduce((a, b: any) => a + (Number(b) || 0), 0);

            await adminUpdate("products", {
                stock_details: newStockDetails,
                stock: totalStock
            }, { column: "id", value: product.id });

            const newChanging = { ...changingStock };
            delete newChanging[product.id];
            setChangingStock(newChanging);

            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
            fetchData();
        } catch (e) {
            console.error(e);
            alert("Saqlashda xatolik!");
        } finally {
            setIsSaving(false);
        }
    };

    const downloadExcelTemplate = async () => {
        const script = document.createElement("script");
        script.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
        script.onload = () => {
            const XLSX = (window as any).XLSX;

            const headers = ["SKU (Majburiy)", "Mahsulot nomi (O'zgartirmang)"];
            warehouses.forEach(w => {
                headers.push(`Ombor: ${w.name} [ID:${w.id}]`);
            });

            const data = [headers];

            products.forEach(p => {
                const row: any[] = [p.sku || p.id, p.name];
                warehouses.forEach(w => {
                    row.push(p.stockDetails?.[w.id] || 0);
                });
                data.push(row);
            });

            const ws = XLSX.utils.aoa_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Inventory");
            XLSX.writeFile(wb, "ombor_qoldiqlari_shabloni.xlsx");
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
                const ws = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

                if (data.length < 2) throw new Error("Fayl bo'sh");

                const headers = data[0].map(h => String(h));
                const warehousesInExcel: { id: string, name: string, colIndex: number }[] = [];

                headers.forEach((h, idx) => {
                    const match = h.match(/\[ID:(.*?)\]/);
                    if (match && match[1]) {
                        warehousesInExcel.push({ id: match[1], name: h, colIndex: idx });
                    }
                });

                if (warehousesInExcel.length === 0) throw new Error("Faylda ombor ustunlari topilmadi. Iltimos shablondan foydalaning.");

                const rows = data.slice(1);
                let updateCount = 0;

                setImportLog(prev => [...prev, `${rows.length} ta qator topildi. Bazadan SKU bo'yicha qidirilmoqda...`]);

                for (const row of rows) {
                    const sku = String(row[0] || "").trim();
                    if (!sku) continue;

                    const product = products.find(p => (p.sku && p.sku === sku) || p.id === sku);
                    if (product) {
                        const newStockDetails = { ...(product.stockDetails || {}) };
                        warehousesInExcel.forEach(w => {
                            const val = parseInt(row[w.colIndex]) || 0;
                            newStockDetails[w.id] = val;
                        });

                        const totalStock = Object.values(newStockDetails).reduce((a, b: any) => a + (Number(b) || 0), 0);

                        try {
                            await adminUpdate("products", {
                                stock_details: newStockDetails,
                                stock: totalStock
                            }, { column: "id", value: product.id });
                            updateCount++;
                        } catch (err) {
                            console.error("Error updating product stock:", err);
                        }
                    }
                }

                if (updateCount > 0) {
                    setImportLog(prev => [...prev, `Muvaffaqiyatli! ${updateCount} ta mahsulot yangilandi.`]);
                    fetchData();
                } else {
                    setImportLog(prev => [...prev, `Hech qanday mahsulot topilmadi.`]);
                }

            } catch (err: any) {
                console.error(err);
                setImportLog(prev => [...prev, `Xatolik: ${err.message}`]);
            } finally {
                setIsImporting(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const filteredProducts = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

    if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-12 pb-20">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-4 italic uppercase">Qoldiqlar</h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">Mahsulotlar sonini omborlar bo'yicha boshqarish</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => setIsExcelModalOpen(true)}
                        className="flex items-center gap-3 bg-black text-white px-8 py-4 rounded-3xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-black/10"
                    >
                        <FileSpreadsheet size={16} /> Excel orqali yangilash
                    </button>
                    <div className="relative w-80">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Mahsulot qidirish..."
                            className="w-full bg-white border-none rounded-2xl py-4 pl-12 pr-6 font-bold shadow-sm focus:ring-2 focus:ring-black outline-none transition-all"
                        />
                    </div>
                </div>
            </div>

            {showSuccess && (
                <div className="fixed top-10 right-10 z-[100] bg-black text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-3 animate-in fade-in slide-in-from-right duration-500 shadow-2xl">
                    <CheckCircle2 size={16} /> Muvaffaqiyatli saqlandi!
                </div>
            )}

            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto no-scrollbar">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-gray-50 bg-gray-50/50">
                                <th className="px-8 py-6 text-left text-[10px] font-black uppercase tracking-widest text-gray-400">Mahsulot</th>
                                {warehouses.map(w => (
                                    <th key={w.id} className="px-8 py-6 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        <div className="flex flex-col items-center gap-1">
                                            <WarehouseIcon size={14} />
                                            {w.name}
                                        </div>
                                    </th>
                                ))}
                                <th className="px-8 py-6 text-center text-[10px] font-black uppercase tracking-widest text-gray-400">Jami</th>
                                <th className="px-8 py-6 text-right text-[10px] font-black uppercase tracking-widest text-gray-400">Harakat</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredProducts.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-8 py-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-2xl bg-gray-100 overflow-hidden shrink-0 shadow-inner">
                                                <img src={p.image} className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <h4 className="text-xs font-black italic uppercase tracking-tighter line-clamp-1">{p.name}</h4>
                                                <p className="text-[10px] font-bold text-gray-400">{p.price.toLocaleString()} $</p>
                                            </div>
                                        </div>
                                    </td>
                                    {warehouses.map(w => {
                                        const currentStock = p.stockDetails?.[w.id] || 0;
                                        const changing = changingStock[p.id]?.[w.id];
                                        const color = (changing !== undefined && changing !== currentStock) ? "text-blue-600 bg-blue-50 border-blue-200" : "text-black bg-gray-50 border-transparent";

                                        return (
                                            <td key={w.id} className="px-4 py-6 text-center">
                                                <input
                                                    type="number"
                                                    defaultValue={currentStock}
                                                    onChange={e => handleStockChange(p.id, w.id, e.target.value)}
                                                    className={`w-20 py-2.5 rounded-xl text-center text-sm font-black italic border-2 outline-none transition-all focus:border-black shadow-sm ${color}`}
                                                />
                                            </td>
                                        );
                                    })}
                                    <td className="px-8 py-6 text-center">
                                        <div className="inline-flex flex-col items-center p-3 bg-black text-white rounded-2xl min-w-[60px] shadow-lg shadow-black/10">
                                            <Package size={14} className="opacity-40" />
                                            <span className="text-sm font-black italic">{Object.values(p.stockDetails || {}).reduce((a, b: any) => a + (Number(b) || 0), 0)}</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-right">
                                        <button
                                            onClick={() => handleSave(p)}
                                            disabled={!changingStock[p.id] || isSaving}
                                            className="p-4 bg-gray-100 text-gray-400 hover:bg-black hover:text-white rounded-2xl transition-all disabled:opacity-30 disabled:cursor-not-allowed group-hover:bg-white border border-transparent hover:border-black"
                                        >
                                            <Save size={18} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {warehouses.length === 0 && (
                <div className="py-20 flex flex-col items-center text-center bg-red-50 rounded-[40px] border border-red-100">
                    <AlertCircle size={48} className="text-red-300 mb-4" />
                    <p className="text-red-500 font-black uppercase text-xs tracking-widest">Avval ombor qo'shing!</p>
                    <p className="text-[10px] text-red-400 max-w-xs mt-2 font-bold uppercase italic">Qoldiqlarni boshqarish uchun kamida bitta ombor ro'yxatdan o'tgan bo'lishi shart.</p>
                </div>
            )}

            {/* Excel Import Modal */}
            {isExcelModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl overflow-hidden rounded-[40px] shadow-2xl animate-in zoom-in duration-300">
                        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-green-50/50 text-black">
                            <div>
                                <h2 className="text-2xl font-black italic tracking-tighter uppercase">Excel orqali yangilash</h2>
                                <p className="text-gray-400 text-xs font-black uppercase tracking-widest">Ombor qoldiqlarini ommaviy o'zgartirish</p>
                            </div>
                            <button onClick={() => { setIsExcelModalOpen(false); setImportLog([]); }} className="p-4 hover:bg-white rounded-full transition-all shadow-sm"><X size={20} /></button>
                        </div>
                        <div className="p-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                                <div className="p-6 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center mb-4">
                                        <Download size={24} />
                                    </div>
                                    <h4 className="text-xs font-black uppercase mb-2">1. Shablonni oling</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mb-4">Hozirgi qoldiqlar bilan Excel faylni yuklab oling</p>
                                    <button onClick={downloadExcelTemplate} className="w-full py-3 bg-white border border-gray-200 rounded-2xl text-[10px] font-black uppercase hover:border-black transition-all">Yuklab olish</button>
                                </div>
                                <div className="p-6 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-200 flex flex-col items-center text-center">
                                    <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                                        <Upload size={24} />
                                    </div>
                                    <h4 className="text-xs font-black uppercase mb-2">2. Faylni yuklang</h4>
                                    <p className="text-[10px] text-gray-400 font-medium mb-4">O'zgartirilgan Excel faylni tizimga yuklang</p>
                                    <label className="w-full py-3 bg-black text-white rounded-2xl text-[10px] font-black uppercase text-center cursor-pointer hover:scale-105 transition-all">
                                        Faylni tanlash
                                        <input type="file" accept=".xlsx, .xls" onChange={handleExcelImport} hidden />
                                    </label>
                                </div>
                            </div>

                            {importLog.length > 0 && (
                                <div className="p-6 bg-black rounded-[32px] max-h-48 overflow-y-auto no-scrollbar">
                                    <div className="flex items-center gap-2 mb-4 text-green-500">
                                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Jarayon jurnali</span>
                                    </div>
                                    <div className="space-y-2">
                                        {importLog.map((log, i) => (
                                            <p key={i} className="text-[10px] font-mono text-gray-400 break-all">{`> ${log}`}</p>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {isImporting && (
                                <div className="mt-6 flex items-center justify-center gap-3 py-4 bg-gray-50 rounded-2xl">
                                    <Loader2 size={18} className="animate-spin text-black" />
                                    <p className="text-[10px] font-black uppercase tracking-tighter">Ma'lumotlar ishlanmoqda...</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
