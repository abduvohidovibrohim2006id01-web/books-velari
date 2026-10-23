"use client";

import { useState, useEffect } from "react";
import { useStore } from "@/store/store";
import {
    Users,
    Banknote,
    Clock,
    CheckCircle,
    XCircle,
    Settings,
    ChevronRight,
    TrendingUp,
    ShieldCheck,
    CreditCard,
    ExternalLink,
    Plus,
    Trash2,
    Edit2,
    LayoutGrid,
    Search,
    Ticket,
    ChevronDown,
    Activity,
    Loader2
} from "lucide-react";

interface WithdrawalRequest {
    id: string;
    user_phone: string;
    amount: number;
    card_number: string;
    status: "pending" | "paid" | "rejected";
    created_at: string;
    users: {
        name: string;
        phone: string;
    };
}

interface PromoCodeTariff {
    id: string;
    name: string;
    type: "fixed" | "percentage";
    discount_value: number;
    min_order_value: number;
    max_discount?: number;
    affiliate_reward_type: "fixed_per_use" | "percent_of_final_price" | "percent_of_discount";
    affiliate_reward_value: number;
    is_active: boolean;
    created_at: string;
}

interface AffiliateSettings {
    referrer_reward: number;
    buyer_discount: number;
    min_withdrawal: number;
    reward_type: "fixed" | "percent";
}

interface Stats {
    total_earned: number;
    pending_rewards: number;
    active_affiliates_count: number;
}

interface AffiliateUser {
    id: string;
    name: string;
    phone: string;
    affiliate_role: string;
    affiliate_code: string;
    real_balance: number;
    created_at: string;
}

interface AffiliateTransaction {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    order_stage: string;
    orders?: { total: number; status: string };
    products?: { name: string };
}

export default function AffiliateAdminPage() {
    const { showToast } = useStore();
    const [activeTab, setActiveTab] = useState<"overview" | "tariffs" | "hierarchy">("overview");
    const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
    const [tariffs, setTariffs] = useState<PromoCodeTariff[]>([]);
    const [settings, setSettings] = useState<AffiliateSettings>({
        referrer_reward: 15000,
        buyer_discount: 10000,
        min_withdrawal: 50000,
        reward_type: "fixed"
    });
    const [stats, setStats] = useState<Stats>({
        total_earned: 0,
        pending_rewards: 0,
        active_affiliates_count: 0
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showTariffModal, setShowTariffModal] = useState(false);
    const [editingTariff, setEditingTariff] = useState<Partial<PromoCodeTariff> | null>(null);
    
    // New states for users list
    const [users, setUsers] = useState<AffiliateUser[]>([]);
    const [loadingUsers, setLoadingUsers] = useState(false);
    const [selectedUser, setSelectedUser] = useState<AffiliateUser | null>(null);
    const [userTransactions, setUserTransactions] = useState<AffiliateTransaction[]>([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [res, tariffRes] = await Promise.all([
                fetch("/api/admin/affiliate"),
                fetch("/api/admin/affiliate/tariffs")
            ]);
            const [data, tariffData] = await Promise.all([
                res.json(),
                tariffRes.json()
            ]);
            if (data.success) {
                setWithdrawals(data.withdrawals || []);
                if (data.settings) setSettings(data.settings);
                if (data.stats) setStats(data.stats);
            }
            if (tariffData.success) setTariffs(tariffData.data);

        } catch (error) {
            showToast("Ma'lumotlarni yuklashda xatolik", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            setLoadingUsers(true);
            const res = await fetch("/api/admin/affiliate/users");
            const data = await res.json();
            if (data.success) {
                setUsers(data.data || []);
            }
        } catch (error) {
            showToast("Foydalanuvchilarni yuklashda xatolik", "error");
        } finally {
            setLoadingUsers(false);
        }
    };

    useEffect(() => {
        if (activeTab === "hierarchy" && users.length === 0) {
            fetchUsers();
        }
    }, [activeTab]);

    const handleUserClick = async (user: AffiliateUser) => {
        setSelectedUser(user);
        try {
            setLoadingTransactions(true);
            setUserTransactions([]);
            const res = await fetch(`/api/admin/affiliate/users/${user.id}/transactions`);
            const data = await res.json();
            if (data.success) {
                setUserTransactions(data.data.transactions || []);
            }
        } catch (error) {
            showToast("Tranzaksiyalarni yuklashda xatolik", "error");
        } finally {
            setLoadingTransactions(false);
        }
    };

    const handleSaveTariff = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            const res = await fetch("/api/admin/affiliate/tariffs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: editingTariff?.id ? "update" : "create",
                    tariff: editingTariff
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast("Tarif saqlandi");
                setShowTariffModal(false);
                fetchData();
            } else {
                showToast(data.error, "error");
            }
        } catch (error) {
            showToast("Xatolik", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteTariff = async (id: string) => {
        if (!confirm("Ushbu tarifni o'chirmoqchimisiz?")) return;
        try {
            const res = await fetch("/api/admin/affiliate/tariffs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "delete", id })
            });
            const data = await res.json();
            if (data.success) {
                showToast("O'chirildi");
                fetchData();
            }
        } catch (error) {
            showToast("Xatolik", "error");
        }
    };

    const handleUpdateSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSaving(true);
            const res = await fetch("/api/admin/affiliate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update_settings",
                    settings
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast("Sozlamalar yangilandi");
            } else {
                showToast(data.error || "Xatolik yuz berdi", "error");
            }
        } catch (error) {
            showToast("Server bilan bog'lanishda xatolik", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleWithdraw = async (id: string, status: "paid" | "rejected") => {
        if (!confirm(`Ushbu so'rovni ${status === 'paid' ? 'tasdiqlaysizmi' : 'rad etasizmi'}?`)) return;

        try {
            const res = await fetch("/api/admin/affiliate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "handle_withdraw",
                    id,
                    status
                })
            });
            const data = await res.json();
            if (data.success) {
                showToast("Amal bajarildi");
                fetchData();
            } else {
                showToast(data.error, "error");
            }
        } catch (error) {
            showToast("Xatolik", "error");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
            </div>
        );
    }

    return (
        <div className="space-y-12 pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-2xl md:text-4xl font-black tracking-tight italic uppercase">HAMKORLIK TIZIMI</h1>
                    <p className="text-gray-500 mt-2 font-medium">Marketing tariflari va MLM tarmog'ini boshqarish</p>
                </div>
                
                <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
                    {[
                        { id: 'overview', label: 'Umumiy', icon: LayoutGrid },
                        { id: 'tariffs', label: 'Tariflar', icon: Ticket },
                        { id: 'hierarchy', label: 'Ierarxiya', icon: Users }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-black text-white' : 'text-gray-400 hover:text-black'}`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {activeTab === 'overview' && (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <TrendingUp size={80} />
                            </div>
                            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mb-4">Jami To'langan</p>
                            <h3 className="text-3xl font-black">{stats.total_earned.toLocaleString()} <span className="text-sm text-gray-400 font-medium">SO'M</span></h3>
                            <div className="mt-4 flex items-center gap-2 text-green-600 font-bold text-xs">
                                <TrendingUp size={14} />
                                <span>Real hamyon orqali</span>
                            </div>
                        </div>

                        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <Clock size={80} />
                            </div>
                            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mb-4">Kutilayotgan Bonuslar</p>
                            <h3 className="text-3xl font-black">{stats.pending_rewards.toLocaleString()} <span className="text-sm text-gray-400 font-medium">SO'M</span></h3>
                            <div className="mt-4 flex items-center gap-2 text-orange-500 font-bold text-xs">
                                <Clock size={14} />
                                <span>Mijozlar buyurtmasi kutilmoqda</span>
                            </div>
                        </div>

                        <div className="bg-white p-8 rounded-[32px] border border-gray-100 shadow-sm relative overflow-hidden group">
                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                <Users size={80} />
                            </div>
                            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mb-4">Faol Hamkorlar</p>
                            <h3 className="text-3xl font-black">{stats.active_affiliates_count} <span className="text-sm text-gray-400 font-medium">NAFAR</span></h3>
                            <div className="mt-4 flex items-center gap-2 text-blue-600 font-bold text-xs">
                                <Users size={14} />
                                <span>O'z kodi bor foydalanuvchilar</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Settings Form */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden sticky top-32">
                                <div className="p-8 border-b border-gray-50 flex items-center gap-4">
                                    <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white">
                                        <Settings size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-xl font-black uppercase italic">Bazaviy Tarif</h2>
                                        <p className="text-xs text-gray-400 font-medium">Referal tizimi qoidalari</p>
                                    </div>
                                </div>
                                <form onSubmit={handleUpdateSettings} className="p-8 space-y-6">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Hamkor Mukofoti (So'm)</label>
                                        <input
                                            type="number"
                                            value={settings.referrer_reward}
                                            onChange={(e) => setSettings({ ...settings, referrer_reward: Number(e.target.value) })}
                                            className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-black transition-all"
                                            placeholder="Masalan: 15000"
                                        />
                                    </div>

                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest">Xaridor Chegirmasi (So'm)</label>
                                        <input
                                            type="number"
                                            value={settings.buyer_discount}
                                            onChange={(e) => setSettings({ ...settings, buyer_discount: Number(e.target.value) })}
                                            className="w-full bg-gray-50 border-none rounded-2xl px-6 py-4 font-bold focus:ring-2 focus:ring-black transition-all"
                                            placeholder="Masalan: 10000"
                                        />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className="w-full bg-black text-white py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-black/10 disabled:opacity-50"
                                    >
                                        {saving ? "SAQLANMOQDA..." : "SOZLAMALARNI SAQLASH"}
                                    </button>
                                </form>
                            </div>
                        </div>

                        {/* Withdraw Requests Table */}
                        <div className="lg:col-span-2 space-y-6">
                            <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm overflow-hidden">
                                <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center text-orange-600">
                                            <Banknote size={24} />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-black uppercase italic">To'lov So'rovlari</h2>
                                            <p className="text-xs text-gray-400 font-medium">Yechib olish uchun arizalar</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className="bg-gray-50/50">
                                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Foydalanuvchi</th>
                                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Summa</th>
                                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Karta</th>
                                                <th className="px-8 py-5 text-left text-[10px] font-black text-gray-400 uppercase tracking-widest">Holat</th>
                                                <th className="px-8 py-5 text-right text-[10px] font-black text-gray-400 uppercase tracking-widest">Amallar</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50">
                                            {withdrawals.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-8 py-12 text-center text-gray-400 font-bold italic">Hozircha so'rovlar yo'q</td>
                                                </tr>
                                            ) : (
                                                withdrawals.map((req) => (
                                                    <tr key={req.id} className="hover:bg-gray-50/30 transition-colors">
                                                        <td className="px-8 py-6">
                                                            <div className="flex items-center gap-3">
                                                                <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center font-black text-xs">
                                                                    {req.users?.name?.charAt(0) || "U"}
                                                                </div>
                                                                <div>
                                                                    <p className="font-bold text-sm">{req.users?.name || "Noma'lum"}</p>
                                                                    <p className="text-[10px] text-gray-400 font-medium">{req.user_phone}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6 font-black text-sm">
                                                            {req.amount.toLocaleString()} <span className="text-[10px] text-gray-400 font-medium">SO'M</span>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <div className="flex items-center gap-2 text-gray-600 font-bold text-xs bg-gray-100 py-2 px-3 rounded-xl inline-flex">
                                                                <CreditCard size={14} />
                                                                {req.card_number}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-6">
                                                            <span className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest ${req.status === 'pending' ? 'bg-orange-50 text-orange-600' :
                                                                    req.status === 'paid' ? 'bg-green-50 text-green-600' :
                                                                        'bg-red-50 text-red-600'
                                                                }`}>
                                                                {req.status === 'pending' ? 'Kutilmoqda' :
                                                                    req.status === 'paid' ? 'To\'landi' : 'Rad etildi'}
                                                            </span>
                                                        </td>
                                                        <td className="px-8 py-6 text-right">
                                                            {req.status === 'pending' ? (
                                                                <div className="flex items-center justify-end gap-2">
                                                                    <button
                                                                        onClick={() => handleWithdraw(req.id, 'rejected')}
                                                                        className="p-3 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all"
                                                                    >
                                                                        <XCircle size={18} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleWithdraw(req.id, 'paid')}
                                                                        className="p-3 bg-green-50 text-green-600 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-lg shadow-green-600/10"
                                                                    >
                                                                        <CheckCircle size={18} />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <span className="text-[10px] text-gray-300 font-bold uppercase tracking-widest">Bajarildi</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'tariffs' && (
                <div className="space-y-8">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-2xl font-black italic tracking-tighter uppercase">Promo-kod Tariflari</h2>
                            <p className="text-gray-500 text-sm font-medium">Marketing kampaniyalari uchun maxsus qoidalar</p>
                        </div>
                        <button 
                            onClick={() => {
                                setEditingTariff({
                                    name: "",
                                    type: "fixed",
                                    discount_value: 0,
                                    min_order_value: 0,
                                    affiliate_reward_type: "fixed_per_use",
                                    affiliate_reward_value: 0,
                                    is_active: true
                                });
                                setShowTariffModal(true);
                            }}
                            className="bg-black text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 transition-all shadow-xl shadow-black/20"
                        >
                            <Plus size={18} /> Yangi Tarif
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {tariffs.map(t => (
                            <div key={t.id} className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6 relative overflow-hidden group">
                                <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => { setEditingTariff(t); setShowTariffModal(true); }} className="p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white"><Edit2 size={14} /></button>
                                    <button onClick={() => handleDeleteTariff(t.id)} className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white"><Trash2 size={14} /></button>
                                </div>
                                <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-white">
                                    <Ticket size={24} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black italic tracking-tighter uppercase line-clamp-1">{t.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={`w-2 h-2 rounded-full ${t.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                                        <p className="text-[10px] font-black text-gray-400 uppercase">{t.is_active ? 'FAOL' : 'NOFAOL'}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
                                        <p className="text-[8px] font-black text-gray-400 uppercase">Chegirma</p>
                                        <p className="text-lg font-black italic">{t.discount_value}{t.type === 'percentage' ? '%' : ' so\'m'}</p>
                                    </div>
                                    <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100">
                                        <p className="text-[8px] font-black text-emerald-600 uppercase">Hamkor Ulushi</p>
                                        <p className="text-lg font-black italic text-emerald-700">
                                            {t.affiliate_reward_type === 'fixed_per_use' ? `${t.affiliate_reward_value.toLocaleString()}` : `${t.affiliate_reward_value}%`}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex justify-end items-center pt-2">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase">Min: {t.min_order_value.toLocaleString()} so'm</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'hierarchy' && (
                <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
                    <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gray-50/50">
                        <div>
                            <h2 className="text-2xl font-black italic tracking-tighter uppercase">Foydalanuvchilar va Hamkorlar</h2>
                            <p className="text-gray-400 text-xs font-bold mt-1 uppercase tracking-widest">Tizimdagi barcha mijozlar va ularning faolligi</p>
                        </div>
                        <button onClick={fetchUsers} className="p-3 bg-white rounded-xl shadow-sm hover:scale-105 transition-all text-black border border-gray-100">
                            {loadingUsers ? <Loader2 size={20} className="animate-spin" /> : <Activity size={20} />}
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="bg-white border-b border-gray-100">
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Foydalanuvchi</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Rol</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Promo-kod</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Balans</th>
                                    <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {loadingUsers ? (
                                    <tr><td colSpan={5} className="p-12 text-center text-gray-400 font-bold">Yuklanmoqda...</td></tr>
                                ) : users.map(user => (
                                    <tr 
                                        key={user.id} 
                                        className="hover:bg-gray-50/50 transition-colors cursor-pointer group"
                                        onClick={() => handleUserClick(user)}
                                    >
                                        <td className="p-6">
                                            <div className="font-black text-sm">{user.name || "Noma'lum"}</div>
                                            <div className="text-[10px] text-gray-400 font-bold mt-1">{user.phone}</div>
                                        </td>
                                        <td className="p-6">
                                            {user.affiliate_role ? (
                                                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                                    user.affiliate_role.includes('manager') ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'
                                                }`}>
                                                    {user.affiliate_role.replace(/_/g, ' ')}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Oddiy Mijoz</span>
                                            )}
                                        </td>
                                        <td className="p-6">
                                            {user.affiliate_code ? (
                                                <span className="font-mono text-xs font-black bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
                                                    {user.affiliate_code}
                                                </span>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="p-6 font-black italic tracking-tighter">
                                            {(user.real_balance || 0).toLocaleString()} <span className="text-[10px] text-gray-400">so'm</span>
                                        </td>
                                        <td className="p-6 text-right">
                                            <button className="text-gray-300 group-hover:text-black transition-colors">
                                                <ChevronRight size={20} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* User Transactions Modal */}
            {selectedUser && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[40px] shadow-2xl flex flex-col overflow-hidden relative animate-in zoom-in-95">
                        <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50 relative">
                            <button onClick={() => setSelectedUser(null)} className="absolute top-8 right-8 p-3 bg-white border border-gray-100 rounded-2xl hover:bg-black hover:text-white transition-all shadow-sm">
                                <XCircle size={24} />
                            </button>
                            <div>
                                <h2 className="text-3xl font-black italic tracking-tighter uppercase">{selectedUser.name || "Noma'lum Mijoz"}</h2>
                                <p className="text-gray-400 font-bold mt-1">{selectedUser.phone} • {(selectedUser.real_balance || 0).toLocaleString()} so'm</p>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
                            <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6">Tranzaksiyalar va Harakatlar</h3>
                            
                            {loadingTransactions ? (
                                <div className="py-12 flex justify-center text-gray-400">
                                    <Loader2 className="animate-spin w-8 h-8" />
                                </div>
                            ) : userTransactions.length === 0 ? (
                                <div className="py-12 text-center border-2 border-dashed border-gray-100 rounded-3xl">
                                    <Activity className="mx-auto text-gray-200 mb-4 w-12 h-12" />
                                    <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Hozircha tranzaksiyalar yo'q</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {userTransactions.map(tx => (
                                        <div key={tx.id} className="flex justify-between items-center p-6 bg-gray-50/50 rounded-3xl border border-gray-100 hover:bg-white hover:shadow-lg transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                                                    tx.status === 'approved' ? 'bg-green-100 text-green-600' :
                                                    tx.status === 'rejected' ? 'bg-red-100 text-red-600' :
                                                    'bg-orange-100 text-orange-600'
                                                }`}>
                                                    <Banknote size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-black text-sm uppercase">{tx.products?.name || "Noma'lum mahsulot"}</p>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[10px] font-bold text-gray-400">{new Date(tx.created_at).toLocaleString('uz-UZ')}</span>
                                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                                        <span className="text-[10px] font-bold text-blue-500 uppercase">{tx.order_stage}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className={`text-xl font-black italic tracking-tighter ${
                                                    tx.status === 'approved' ? 'text-green-600' : 
                                                    tx.status === 'rejected' ? 'text-red-500 line-through opacity-50' : ''
                                                }`}>
                                                    +{tx.amount?.toLocaleString()} so'm
                                                </p>
                                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-1">
                                                    {tx.status === 'approved' ? 'Tushdi' : tx.status === 'pending' ? 'Kutilmoqda' : 'Rad etildi'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showTariffModal && editingTariff && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
                    <div className="bg-white w-full max-w-2xl p-10 rounded-[40px] shadow-2xl relative max-h-[90vh] overflow-y-auto">
                        <button onClick={() => setShowTariffModal(false)} className="absolute top-8 right-8 p-3 bg-gray-100 rounded-2xl hover:bg-black hover:text-white transition-all"><XCircle size={24} /></button>
                        
                        <div className="flex items-center gap-6 mb-10">
                            <div className="w-16 h-16 bg-black text-white rounded-3xl flex items-center justify-center">
                                <Ticket size={32} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black italic tracking-tighter uppercase">{editingTariff.id ? 'Tarifni Tahrirlash' : 'Yangi Tarif'}</h2>
                                <p className="text-gray-400 font-medium">Promo-kod mantiqini sozlang</p>
                            </div>
                        </div>

                        <form onSubmit={handleSaveTariff} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="md:col-span-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest ml-4">Tarif Nomi</label>
                                <input
                                    type="text"
                                    required
                                    value={editingTariff.name}
                                    onChange={(e) => setEditingTariff({ ...editingTariff, name: e.target.value })}
                                    className="w-full bg-gray-50 border-none rounded-3xl px-8 py-5 font-black uppercase outline-none focus:ring-4 focus:ring-black/5 transition-all"
                                    placeholder="Masalan: RAMAZON 2024 BONUS"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest ml-4">Chegirma Turi</label>
                                <select 
                                    value={editingTariff.type}
                                    onChange={(e) => setEditingTariff({ ...editingTariff, type: e.target.value as any })}
                                    className="w-full bg-gray-50 border-none rounded-3xl px-8 py-5 font-black uppercase outline-none appearance-none cursor-pointer"
                                >
                                    <option value="fixed">Aniq Summa (so'm)</option>
                                    <option value="percentage">Foiz (%)</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest ml-4">Chegirma Miqdori</label>
                                <input
                                    type="number"
                                    required
                                    value={editingTariff.discount_value}
                                    onChange={(e) => setEditingTariff({ ...editingTariff, discount_value: Number(e.target.value) })}
                                    className="w-full bg-gray-50 border-none rounded-3xl px-8 py-5 font-black outline-none"
                                />
                            </div>

                            {editingTariff.type === 'percentage' && (
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest ml-4">Maksimum Chegirma (Limit)</label>
                                    <input
                                        type="number"
                                        value={editingTariff.max_discount || ""}
                                        onChange={(e) => setEditingTariff({ ...editingTariff, max_discount: Number(e.target.value) })}
                                        className="w-full bg-gray-50 border-none rounded-3xl px-8 py-5 font-black outline-none"
                                        placeholder="Masalan: 100000"
                                    />
                                </div>
                            )}

                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase mb-2 block tracking-widest ml-4">Minimal Buyurtma Summasi</label>
                                <input
                                    type="number"
                                    value={editingTariff.min_order_value}
                                    onChange={(e) => setEditingTariff({ ...editingTariff, min_order_value: Number(e.target.value) } as any)}
                                    className="w-full bg-gray-50 border-none rounded-3xl px-8 py-5 font-black outline-none"
                                />
                            </div>

                            <div className="md:col-span-2 h-px bg-gray-100 my-4" />

                            <div>
                                <label className="text-[10px] font-black text-emerald-600 uppercase mb-2 block tracking-widest ml-4">Hamkor Ulushi Turi</label>
                                <select 
                                    value={editingTariff.affiliate_reward_type}
                                    onChange={(e) => setEditingTariff({ ...editingTariff, affiliate_reward_type: e.target.value as any })}
                                    className="w-full bg-emerald-50 border-none rounded-3xl px-8 py-5 font-black uppercase outline-none appearance-none cursor-pointer text-emerald-900"
                                >
                                    <option value="fixed_per_use">Har bir ishlatish uchun (so'm)</option>
                                    <option value="percent_of_final_price">Final narxdan foiz (%)</option>
                                    <option value="percent_of_discount">Chegirmadan foiz (%)</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-emerald-600 uppercase mb-2 block tracking-widest ml-4">Ulush Miqdori</label>
                                <input
                                    type="number"
                                    required
                                    value={editingTariff.affiliate_reward_value}
                                    onChange={(e) => setEditingTariff({ ...editingTariff, affiliate_reward_value: Number(e.target.value) })}
                                    className="w-full bg-emerald-50 border-none rounded-3xl px-8 py-5 font-black outline-none text-emerald-900"
                                />
                            </div>

                            <div className="md:col-span-2">
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full bg-black text-white py-6 rounded-[32px] font-black text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-black/20"
                                >
                                    {saving ? <Loader2 className="animate-spin mx-auto" /> : 'TARIFNI TASDIQLASH VA SAQLASH'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
