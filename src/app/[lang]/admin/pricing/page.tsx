"use client";

import { useState, useEffect } from "react";
import { adminFrom } from "@/lib/admin-query";
import { adminSelect } from "@/lib/admin-api";
import { 
    Search, 
    Save, 
    Download, 
    Upload, 
    Loader2, 
    DollarSign,
    ChevronLeft,
    ChevronRight,
    RefreshCw
} from "lucide-react";
import Image from "next/image";
import { useStore } from "@/store/store";

interface PricingProduct {
    id: string;
    name: string;
    image: string;
    brand_id: string | null;
    brandName: string;
    model: string;
    price: number;
    oldPrice: number;
    cashback_type: "global" | "percent" | "fixed";
    cashback_value: number;
    comm_seller: number;
    comm_manager: number;
    comm_tm: number;
    cost_price: number;
    additional_expenses: number;
    // Track if edited locally
    _isEdited?: boolean;
}

export default function PricingAdminPage() {
    const { showToast } = useStore();
    const [products, setProducts] = useState<PricingProduct[]>([]);
    const [originalProducts, setOriginalProducts] = useState<PricingProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    // Brendlar (brand_id -> nom) — jadval va Excelda nom ko'rsatish uchun
    const [brandsMap, setBrandsMap] = useState<Record<string, string>>({});

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const itemsPerPage = 20;

    // Excel states
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [importLog, setImportLog] = useState<string[]>([]);
    const [showLogModal, setShowLogModal] = useState(false);

    useEffect(() => {
        fetchBrands();
        fetchProducts(1);
    }, []);

    const fetchBrands = async () => {
        try {
            const data = await adminSelect<any[]>("brands", { columns: "id, name", match: { column: "is_deleted", value: false } });
            if (data) {
                const map: Record<string, string> = {};
                data.forEach((b: any) => { map[String(b.id)] = b.name; });
                setBrandsMap(map);
            }
        } catch (e) {
            console.error("Fetch brands error:", e);
        }
    };

    const fetchProducts = async (page = 1) => {
        setLoading(true);
        try {
            const from = (page - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            let query = adminFrom("products")
                .select("id, name, image, brand_id, model, price, old_price, cashback_type, cashback_value, comm_seller, comm_manager, comm_tm, cost_price, additional_expenses, is_deleted", { count: "exact" })
                .eq("is_deleted", false);

            if (searchTerm) {
                query = query.ilike("name", `%${searchTerm}%`);
            }

            const { data, count, error } = await query
                .order("created_at", { ascending: false })
                .range(from, to);

            if (error) throw error;

            if (data) {
                const mapped = data.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    image: p.image,
                    brand_id: p.brand_id || null,
                    brandName: p.brand_id ? (brandsMap[String(p.brand_id)] || "") : "",
                    model: p.model || "",
                    price: p.price || 0,
                    oldPrice: p.old_price || 0,
                    cashback_type: p.cashback_type || "global",
                    cashback_value: p.cashback_value || 0,
                    comm_seller: p.comm_seller || 0,
                    comm_manager: p.comm_manager || 0,
                    comm_tm: p.comm_tm || 0,
                    cost_price: p.cost_price || 0,
                    additional_expenses: p.additional_expenses || 0,
                    _isEdited: false
                }));
                setProducts(mapped);
                setOriginalProducts(JSON.parse(JSON.stringify(mapped)));
                if (count !== null) setTotalCount(count);
            }
        } catch (error: any) {
            console.error("Fetch products error:", error);
            showToast("Ma'lumotlarni yuklashda xatolik", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setCurrentPage(1);
        fetchProducts(1);
    };

    const handleFieldChange = (id: string, field: keyof PricingProduct, value: any) => {
        setProducts(prev => prev.map(p => {
            if (p.id === id) {
                const updated = { ...p, [field]: value };
                const orig = originalProducts.find(op => op.id === id);
                let isEdited = false;
                if (orig) {
                    isEdited = orig.model !== updated.model ||
                               orig.price !== updated.price ||
                               orig.oldPrice !== updated.oldPrice ||
                               orig.cashback_type !== updated.cashback_type ||
                               orig.cashback_value !== updated.cashback_value ||
                               orig.comm_seller !== updated.comm_seller ||
                               orig.comm_manager !== updated.comm_manager ||
                               orig.comm_tm !== updated.comm_tm ||
                               orig.cost_price !== updated.cost_price ||
                               orig.additional_expenses !== updated.additional_expenses;
                }
                return { ...updated, _isEdited: isEdited };
            }
            return p;
        }));
    };

    const handleSave = async (product: PricingProduct) => {
        setSavingId(product.id);
        try {
            const res = await fetch('/api/admin/crud', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'products',
                    action: 'update',
                    payload: {
                        model: product.model || null,
                        price: Number(product.price),
                        old_price: Number(product.oldPrice),
                        cashback_type: product.cashback_type,
                        cashback_value: Number(product.cashback_value),
                        comm_seller: Number(product.comm_seller),
                        comm_manager: Number(product.comm_manager),
                        comm_tm: Number(product.comm_tm),
                        cost_price: Number(product.cost_price),
                        additional_expenses: Number(product.additional_expenses)
                    },
                    matchConfig: { column: 'id', value: product.id }
                })
            });

            if (!res.ok) throw new Error("Saqlashda xatolik");

            showToast("Muvaffaqiyatli saqlandi");
            
            // O'zgargan holatni asl holat bilan sinxronlash
            setProducts(prev => prev.map(p => p.id === product.id ? { ...p, _isEdited: false } : p));
            setOriginalProducts(prev => prev.map(p => p.id === product.id ? { ...product, _isEdited: false } : p));

        } catch (error: any) {
            console.error(error);
            showToast("Xatolik: " + error.message, "error");
        } finally {
            setSavingId(null);
        }
    };

    const exportToExcel = async () => {
        setIsExporting(true);
        try {
            // Fetch all products (not just current page) to export
            const { data, error } = await adminFrom("products")
                .select("id, name, brand_id, model, price, old_price, cashback_type, cashback_value, comm_seller, comm_manager, comm_tm, cost_price, additional_expenses")
                .eq("is_deleted", false);

            if (error) throw error;
            if (!data || data.length === 0) {
                showToast("Eksport qilish uchun mahsulot yo'q", "error");
                return;
            }

            // Dynamically load XLSX
            const script = document.createElement("script");
            script.src = "https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js";
            script.onload = () => {
                const XLSX = (window as any).XLSX;
                
                const headers = [
                    "ID (TEGMINLMASTIN)", "Nomi", "Brend", "Model", "Hozirgi Narx", "Eski Narx",
                    "Cashback Turi (global/percent/fixed)", "Cashback Qiymati",
                    "Sotuvchi Komissiyasi (%)", "Manager Komissiyasi (%)", "Top Manager Komissiyasi (%)",
                    "Tan Narx", "Qo'shimcha Xarajatlar"
                ];

                const rows = data.map((p: any) => [
                    p.id,
                    p.name,
                    p.brand_id ? (brandsMap[String(p.brand_id)] || "") : "",
                    p.model || "",
                    p.price || 0,
                    p.old_price || 0,
                    p.cashback_type || "global",
                    p.cashback_value || 0,
                    p.comm_seller || 0,
                    p.comm_manager || 0,
                    p.comm_tm || 0,
                    p.cost_price || 0,
                    p.additional_expenses || 0
                ]);

                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                
                // Ustunlar kengligini sozlash
                ws['!cols'] = [
                    { wch: 36 }, // ID
                    { wch: 50 }, // Nomi
                    { wch: 20 }, // Brend
                    { wch: 20 }, // Model
                    { wch: 15 }, // Narx
                    { wch: 15 }, // Eski Narx
                    { wch: 25 }, // Cashback Turi
                    { wch: 18 }, // Cashback Qiymati
                    { wch: 22 }, // Sotuvchi
                    { wch: 22 }, // Manager
                    { wch: 25 },  // Top Manager
                    { wch: 15 }, // Tan Narx
                    { wch: 20 }  // Qo'shimcha Xarajatlar
                ];

                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, "Narxlar");
                XLSX.writeFile(wb, "mahsulotlar_narxlari.xlsx");
                showToast("Fayl yuklab olindi");
            };
            document.head.appendChild(script);

        } catch (error: any) {
            console.error(error);
            showToast("Eksportda xatolik yuz berdi", "error");
        } finally {
            setIsExporting(false);
        }
    };

    const importFromExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportLog(["Fayl o'qilmoqda..."]);
        setShowLogModal(true);

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

                const rows = data.slice(1);
                let successCount = 0;
                let errorCount = 0;

                setImportLog(prev => [...prev, `${rows.length} ta qator topildi. Yangilash boshlandi...`]);

                // Brend nomi -> brand_id (kichik harfda solishtirish)
                const nameToBrandId: Record<string, string> = {};
                Object.entries(brandsMap).forEach(([bid, bname]) => {
                    nameToBrandId[String(bname).toLowerCase().trim()] = bid;
                });

                for (const row of rows) {
                    const id = row[0];
                    if (!id) continue;

                    try {
                        const payload: any = {
                            model: row[3] != null ? String(row[3]).trim() : "",
                            price: Number(row[4]) || 0,
                            old_price: Number(row[5]) || 0,
                            cashback_type: String(row[6]).toLowerCase().trim() === 'fixed' || String(row[6]).toLowerCase().trim() === 'percent' ? String(row[6]).toLowerCase().trim() : 'global',
                            cashback_value: Number(row[7]) || 0,
                            comm_seller: Number(row[8]) || 0,
                            comm_manager: Number(row[9]) || 0,
                            comm_tm: Number(row[10]) || 0,
                            cost_price: Number(row[11]) || 0,
                            additional_expenses: Number(row[12]) || 0,
                        };

                        // Brend nomi berilgan va bazadagi brendga mos kelsa, brand_id yangilanadi
                        const brandName = row[2] != null ? String(row[2]).toLowerCase().trim() : "";
                        if (brandName && nameToBrandId[brandName]) {
                            payload.brand_id = nameToBrandId[brandName];
                        }

                        const res = await fetch('/api/admin/crud', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                table: 'products',
                                action: 'update',
                                payload: payload,
                                matchConfig: { column: 'id', value: id }
                            })
                        });

                        if (!res.ok) throw new Error("API xatosi");
                        successCount++;
                    } catch (err: any) {
                        errorCount++;
                        setImportLog(prev => [...prev, `ID ${id} yangilashda xatolik: ${err.message}`]);
                    }
                }

                setImportLog(prev => [...prev, "==============================="]);
                setImportLog(prev => [...prev, `Yakunlandi! ${successCount} ta muvaffaqiyatli, ${errorCount} ta xato.`]);
                
                // Refresh list
                fetchProducts(currentPage);

            } catch (error: any) {
                console.error("Excel import error:", error);
                setImportLog(prev => [...prev, `Xatolik: ${error.message}`]);
            } finally {
                setIsImporting(false);
                // Reset file input
                e.target.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const totalPages = Math.ceil(totalCount / itemsPerPage);

    return (
        <div className="space-y-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-4xl font-black italic uppercase tracking-tighter text-emerald-600 flex items-center gap-4">
                        <DollarSign size={40} />
                        Narxlar Markazi
                    </h1>
                    <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mt-2">
                        Narxlar, cashback va komissiyalarni ommaviy boshqarish
                    </p>
                </div>

                <div className="flex items-center gap-4">
                    <button
                        onClick={exportToExcel}
                        disabled={isExporting}
                        className="bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:bg-emerald-100 transition-all border border-emerald-100"
                    >
                        {isExporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        Excelga Yuklash
                    </button>
                    
                    <div className="relative">
                        <input 
                            type="file" 
                            accept=".xlsx, .xls"
                            onChange={importFromExcel}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                        <button className="bg-black text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl shadow-black/10 hover:scale-105 transition-all">
                            {isImporting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                            Exceldan Import
                        </button>
                    </div>
                </div>
            </div>

            {/* Search */}
            <form onSubmit={handleSearch} className="bg-white p-2 rounded-[24px] border border-gray-100 shadow-sm flex items-center">
                <div className="pl-4 pr-2 text-gray-400">
                    <Search size={20} />
                </div>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Mahsulot nomi bo'yicha qidiring..."
                    className="flex-1 bg-transparent border-none focus:ring-0 px-2 py-4 font-bold outline-none"
                />
                <button type="submit" className="bg-gray-100 px-8 py-3 rounded-xl font-black text-xs uppercase hover:bg-gray-200 transition-colors mr-2">
                    Qidirish
                </button>
                <button 
                    type="button" 
                    onClick={() => { setSearchTerm(""); setCurrentPage(1); fetchProducts(1); }}
                    className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-black hover:text-white transition-colors mr-1"
                >
                    <RefreshCw size={18} />
                </button>
            </form>

            {/* Table */}
            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left min-w-[1200px]">
                    <thead className="bg-gray-50 border-b border-gray-100">
                        <tr>
                            <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest w-64">Mahsulot</th>
                            <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Brend / Model</th>
                            <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Narx / Eski Narx</th>
                            <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Tan Narx / Xarajat</th>
                            <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Cashback Sozlamalari</th>
                            <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Komissiya (%)</th>
                            <th className="px-6 py-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amal</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-20 text-center">
                                    <Loader2 size={40} className="animate-spin text-gray-300 mx-auto" />
                                </td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-20 text-center font-bold text-gray-400">
                                    Mahsulotlar topilmadi
                                </td>
                            </tr>
                        ) : (
                            products.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-14 bg-gray-100 rounded-xl overflow-hidden shrink-0">
                                                {p.image ? (
                                                    <img src={p.image} className="w-full h-full object-cover" alt="" referrerPolicy="no-referrer" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-gray-300"><DollarSign size={20} /></div>
                                                )}
                                            </div>
                                            <p className="font-bold text-xs uppercase line-clamp-2 leading-relaxed max-w-[200px]">{p.name}</p>
                                        </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-2">
                                            <span className="inline-flex items-center w-fit px-3 py-1.5 bg-gray-100 rounded-lg text-[10px] font-black uppercase tracking-tighter text-gray-700">
                                                {(p.brand_id ? (brandsMap[String(p.brand_id)] || p.brandName) : "") || "—"}
                                            </span>
                                            <input
                                                type="text"
                                                value={p.model}
                                                onChange={(e) => handleFieldChange(p.id, 'model', e.target.value)}
                                                placeholder="Model"
                                                className="w-32 bg-gray-50 border-2 border-transparent focus:border-black rounded-xl px-3 py-2 text-xs font-bold outline-none"
                                            />
                                        </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-2">
                                            <input
                                                type="number"
                                                value={p.price}
                                                onChange={(e) => handleFieldChange(p.id, 'price', Number(e.target.value))}
                                                placeholder="Joriy narx"
                                                className="w-28 bg-gray-50 border-2 border-transparent focus:border-black rounded-xl px-3 py-2 text-sm font-black italic outline-none"
                                            />
                                            <input 
                                                type="number"
                                                value={p.oldPrice}
                                                onChange={(e) => handleFieldChange(p.id, 'oldPrice', Number(e.target.value))}
                                                placeholder="Eski narx"
                                                className="w-28 bg-gray-50 border-2 border-transparent focus:border-black rounded-xl px-3 py-2 text-sm font-black italic outline-none text-gray-500"
                                            />
                                        </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-2">
                                            <input 
                                                type="number"
                                                value={p.cost_price}
                                                onChange={(e) => handleFieldChange(p.id, 'cost_price', Number(e.target.value))}
                                                placeholder="Tan narx"
                                                className="w-28 bg-blue-50 text-blue-900 border-2 border-transparent focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-black italic outline-none"
                                            />
                                            <input 
                                                type="number"
                                                value={p.additional_expenses}
                                                onChange={(e) => handleFieldChange(p.id, 'additional_expenses', Number(e.target.value))}
                                                placeholder="Qo'sh. xarajat"
                                                className="w-28 bg-red-50 text-red-900 border-2 border-transparent focus:border-red-500 rounded-xl px-3 py-2 text-xs font-black italic outline-none"
                                            />
                                        </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={p.cashback_type}
                                                onChange={(e) => handleFieldChange(p.id, 'cashback_type', e.target.value)}
                                                className="w-28 bg-emerald-50 text-emerald-900 border-2 border-transparent focus:border-emerald-500 rounded-xl px-2 py-2 text-[10px] font-black uppercase outline-none"
                                            >
                                                <option value="global">Global (%)</option>
                                                <option value="percent">Maxsus %</option>
                                                <option value="fixed">Summa (so'm)</option>
                                            </select>
                                            <input 
                                                type="number"
                                                disabled={p.cashback_type === 'global'}
                                                value={p.cashback_value}
                                                onChange={(e) => handleFieldChange(p.id, 'cashback_value', Number(e.target.value))}
                                                className="w-20 bg-gray-50 border-2 border-transparent focus:border-emerald-500 rounded-xl px-3 py-2 text-sm font-black italic outline-none disabled:opacity-30"
                                            />
                                        </div>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="flex flex-col gap-1 items-center">
                                                <span className="text-[8px] font-black text-gray-400 uppercase">Sotuvchi</span>
                                                <input 
                                                    type="number"
                                                    value={p.comm_seller}
                                                    onChange={(e) => handleFieldChange(p.id, 'comm_seller', Number(e.target.value))}
                                                    className="w-14 bg-purple-50 text-purple-900 border-2 border-transparent focus:border-purple-500 rounded-xl px-2 py-1 text-xs font-black italic text-center outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <span className="text-[8px] font-black text-gray-400 uppercase">Manager</span>
                                                <input 
                                                    type="number"
                                                    value={p.comm_manager}
                                                    onChange={(e) => handleFieldChange(p.id, 'comm_manager', Number(e.target.value))}
                                                    className="w-14 bg-blue-50 text-blue-900 border-2 border-transparent focus:border-blue-500 rounded-xl px-2 py-1 text-xs font-black italic text-center outline-none"
                                                />
                                            </div>
                                            <div className="flex flex-col gap-1 items-center">
                                                <span className="text-[8px] font-black text-gray-400 uppercase">Top Man.</span>
                                                <input 
                                                    type="number"
                                                    value={p.comm_tm}
                                                    onChange={(e) => handleFieldChange(p.id, 'comm_tm', Number(e.target.value))}
                                                    className="w-14 bg-orange-50 text-orange-900 border-2 border-transparent focus:border-orange-500 rounded-xl px-2 py-1 text-xs font-black italic text-center outline-none"
                                                />
                                            </div>
                                        </div>
                                    </td>

                                    <td className="px-6 py-4 text-right">
                                        <button
                                            disabled={!p._isEdited || savingId === p.id}
                                            onClick={() => handleSave(p)}
                                            className={`p-3 rounded-2xl transition-all ${
                                                p._isEdited 
                                                    ? 'bg-black text-white hover:scale-105 shadow-xl shadow-black/20' 
                                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                            }`}
                                        >
                                            {savingId === p.id ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {!loading && totalPages > 1 && (
                <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-4">
                        Jami: {totalCount} ta
                    </p>
                    <div className="flex items-center gap-2 pr-2">
                        <button
                            disabled={currentPage === 1}
                            onClick={() => { setCurrentPage(p => p - 1); fetchProducts(currentPage - 1); }}
                            className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-black hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-gray-50 disabled:hover:text-gray-400"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="px-4 text-xs font-black">
                            {currentPage} / {totalPages}
                        </span>
                        <button
                            disabled={currentPage === totalPages}
                            onClick={() => { setCurrentPage(p => p + 1); fetchProducts(currentPage + 1); }}
                            className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:bg-black hover:text-white transition-all disabled:opacity-30 disabled:hover:bg-gray-50 disabled:hover:text-gray-400"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Import Log Modal */}
            {showLogModal && (
                <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-xl rounded-[40px] shadow-2xl p-10 max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black italic uppercase tracking-tighter">Import Natijasi</h2>
                            {!isImporting && (
                                <button onClick={() => setShowLogModal(false)} className="px-6 py-2 bg-gray-100 rounded-xl font-bold text-xs uppercase hover:bg-black hover:text-white transition-colors">
                                    Yopish
                                </button>
                            )}
                        </div>
                        <div className="flex-1 bg-gray-900 rounded-3xl p-6 overflow-y-auto font-mono text-[10px] text-green-400 space-y-2">
                            {importLog.map((log, i) => (
                                <div key={i} className={log.includes('Xatolik') ? 'text-red-400' : ''}>
                                    {'> '} {log}
                                </div>
                            ))}
                            {isImporting && (
                                <div className="flex items-center gap-2 mt-4 text-white">
                                    <Loader2 size={14} className="animate-spin" /> Jarayon davom etmoqda...
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
