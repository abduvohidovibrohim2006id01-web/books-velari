"use client";

import { useState, useEffect, useMemo } from "react";
import { adminSelect, adminInsert, adminUpdate, adminDelete } from "@/lib/admin-api";
import {
    Search, UserPlus, Pencil, Trash2, X, Loader2, Eye, EyeOff,
    User, Phone, Lock, ShieldCheck, ShieldOff, Save, Plus, CheckCircle2, AlertCircle
} from "lucide-react";

interface AppUser {
    id: string;
    phone: string;
    name: string;
    username: string | null;
    password: string | null;
    is_admin: boolean;
    created_at: string;
    banned_until: string | null;
}

type FormData = {
    phone: string;
    name: string;
    username: string;
    password: string;
    is_admin: boolean;
};

const emptyForm: FormData = { phone: "", name: "", username: "", password: "", is_admin: false };

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
    return (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm animate-in slide-in-from-bottom-4 duration-300 ${type === "success" ? "bg-black text-white" : "bg-red-500 text-white"}`}>
            {type === "success" ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            {msg}
        </div>
    );
}

export default function AdminUsersPage() {
    const [users, setUsers] = useState<AppUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [showPwd, setShowPwd] = useState<Record<string, boolean>>({});
    const [modal, setModal] = useState<{ mode: "create" | "edit"; user?: AppUser } | null>(null);
    const [form, setForm] = useState<FormData>(emptyForm);
    const [formPwdVisible, setFormPwdVisible] = useState(false);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    const showToast = (msg: string, type: "success" | "error" = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await adminSelect<AppUser[]>("users", {
                columns: "id, phone, name, username, password, is_admin, created_at, banned_until",
                orderBy: { column: "created_at", ascending: false },
                limit: 500,
            });
            setUsers(data || []);
        } catch {
            showToast("Foydalanuvchilar yuklanmadi", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchUsers(); }, []);

    const filtered = useMemo(() =>
        users.filter(u =>
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.phone?.includes(search) ||
            (u.username || "").toLowerCase().includes(search.toLowerCase())
        ), [users, search]);

    const openCreate = () => { setForm(emptyForm); setFormPwdVisible(false); setModal({ mode: "create" }); };
    const openEdit = (u: AppUser) => {
        setForm({ phone: u.phone, name: u.name || "", username: u.username || "", password: u.password || "", is_admin: u.is_admin });
        setFormPwdVisible(false);
        setModal({ mode: "edit", user: u });
    };
    const closeModal = () => setModal(null);

    const handleSave = async () => {
        if (!form.phone.trim()) { showToast("Telefon raqam kiritilishi shart", "error"); return; }
        if (!form.name.trim()) { showToast("Ism kiritilishi shart", "error"); return; }
        setSaving(true);
        try {
            if (modal?.mode === "create") {
                await adminInsert("users", {
                    phone: form.phone.trim(),
                    name: form.name.trim(),
                    username: form.username.trim() || null,
                    password: form.password || null,
                    is_admin: form.is_admin,
                });
                showToast("Foydalanuvchi qo'shildi");
            } else if (modal?.mode === "edit" && modal.user) {
                const payload: any = {
                    name: form.name.trim(),
                    username: form.username.trim() || null,
                    is_admin: form.is_admin,
                };
                if (form.password) payload.password = form.password;
                await adminUpdate("users", payload, { column: "id", value: modal.user.id });
                showToast("O'zgarishlar saqlandi");
            }
            closeModal();
            await fetchUsers();
        } catch (e: any) {
            showToast(e?.message || "Xatolik yuz berdi", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (u: AppUser) => {
        if (!window.confirm(`"${u.name}" foydalanuvchini o'chirasizmi? Bu amalni qaytarib bo'lmaydi.`)) return;
        setDeleting(u.id);
        try {
            await adminDelete("users", { column: "id", value: u.id });
            setUsers(prev => prev.filter(x => x.id !== u.id));
            showToast("Foydalanuvchi o'chirildi");
        } catch (e: any) {
            showToast(e?.message || "O'chirishda xatolik", "error");
        } finally {
            setDeleting(null);
        }
    };

    const togglePwd = (id: string) => setShowPwd(prev => ({ ...prev, [id]: !prev[id] }));

    if (loading) {
        return (
            <div className="flex justify-center items-center h-[60vh]">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="animate-spin text-black" size={48} />
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Yuklanmoqda...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700 pb-24">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
                <div>
                    <h1 className="text-2xl md:text-5xl font-black tracking-tighter mb-1 md:mb-3 italic uppercase">
                        Foydalanuvchilar
                    </h1>
                    <p className="text-gray-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                        Jami • {users.length} ta
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-3 bg-black text-white px-6 py-4 rounded-2xl font-black text-sm hover:bg-gray-800 active:scale-95 transition-all shadow-lg shadow-black/20 whitespace-nowrap"
                >
                    <Plus size={18} />
                    Yangi foydalanuvchi
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                    type="text"
                    placeholder="Ism, telefon yoki username..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-white border border-gray-100 rounded-2xl py-4 pl-14 pr-5 font-bold shadow-sm focus:ring-4 focus:ring-black/5 outline-none transition-all text-sm"
                />
            </div>

            {/* Stats bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                    { label: "Jami", value: users.length, color: "bg-black text-white" },
                    { label: "Admin", value: users.filter(u => u.is_admin).length, color: "bg-purple-600 text-white" },
                    { label: "Bloklangan", value: users.filter(u => u.banned_until).length, color: "bg-red-500 text-white" },
                    { label: "Natija", value: filtered.length, color: "bg-gray-100 text-black" },
                ].map(s => (
                    <div key={s.label} className={`${s.color} rounded-2xl px-5 py-4 flex flex-col gap-1`}>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-60">{s.label}</p>
                        <p className="text-2xl font-black italic">{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Table — Desktop */}
            <div className="hidden md:block bg-white rounded-[28px] border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-100">
                                {["Ism", "Telefon (Login)", "Username", "Parol", "Rol", "Sana", "Amallar"].map(h => (
                                    <th key={h} className="text-left px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-16 text-gray-400 font-bold">
                                        Foydalanuvchi topilmadi
                                    </td>
                                </tr>
                            ) : filtered.map((u, i) => (
                                <tr
                                    key={u.id}
                                    className={`border-b border-gray-50 hover:bg-gray-50/70 transition-colors ${i === filtered.length - 1 ? "border-none" : ""}`}
                                >
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0">
                                                {(u.name || "?").charAt(0).toUpperCase()}
                                            </div>
                                            <span className="font-black text-sm">{u.name || "—"}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="font-mono text-sm bg-gray-100 px-3 py-1.5 rounded-lg">{u.phone}</span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-sm text-blue-600 font-bold">
                                            {u.username ? `@${u.username}` : <span className="text-gray-300">—</span>}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs bg-amber-50 text-amber-800 px-3 py-1.5 rounded-lg max-w-[180px] truncate">
                                                {u.password
                                                    ? (showPwd[u.id] ? u.password : "•".repeat(Math.min(u.password.length, 12)))
                                                    : <span className="text-gray-300 font-sans">Yo'q</span>
                                                }
                                            </span>
                                            {u.password && (
                                                <button
                                                    onClick={() => togglePwd(u.id)}
                                                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-400 flex-shrink-0"
                                                >
                                                    {showPwd[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        {u.is_admin
                                            ? <span className="flex items-center gap-1.5 text-purple-600 font-black text-xs bg-purple-50 px-3 py-1.5 rounded-full w-fit"><ShieldCheck size={12} />Admin</span>
                                            : <span className="flex items-center gap-1.5 text-gray-400 font-bold text-xs bg-gray-50 px-3 py-1.5 rounded-full w-fit"><User size={12} />Oddiy</span>
                                        }
                                        {u.banned_until && (
                                            <span className="mt-1 flex items-center gap-1 text-red-500 text-[10px] font-black uppercase tracking-widest">
                                                <ShieldOff size={10} /> Bloklangan
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-5">
                                        <span className="text-xs text-gray-400 font-bold">
                                            {u.created_at ? new Date(u.created_at).toLocaleDateString("uz-UZ") : "—"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => openEdit(u)}
                                                className="p-2.5 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-all"
                                                title="Tahrirlash"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(u)}
                                                disabled={deleting === u.id}
                                                className="p-2.5 bg-red-50 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                                                title="O'chirish"
                                            >
                                                {deleting === u.id
                                                    ? <Loader2 size={14} className="animate-spin" />
                                                    : <Trash2 size={14} />
                                                }
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Cards — Mobile */}
            <div className="md:hidden space-y-4">
                {filtered.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 font-bold bg-white rounded-3xl">
                        Foydalanuvchi topilmadi
                    </div>
                ) : filtered.map(u => (
                    <div key={u.id} className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 space-y-4">
                        {/* Card header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-11 h-11 bg-black text-white rounded-2xl flex items-center justify-center font-black text-base flex-shrink-0">
                                    {(u.name || "?").charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-black text-sm uppercase italic">{u.name || "—"}</p>
                                    <p className="text-[10px] font-bold text-blue-500">
                                        {u.username ? `@${u.username}` : <span className="text-gray-300">username yo'q</span>}
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {u.is_admin && (
                                    <span className="text-purple-600 bg-purple-50 p-2 rounded-xl">
                                        <ShieldCheck size={14} />
                                    </span>
                                )}
                                {u.banned_until && (
                                    <span className="text-red-500 bg-red-50 p-2 rounded-xl">
                                        <ShieldOff size={14} />
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Phone */}
                        <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                            <Phone size={14} className="text-gray-400 flex-shrink-0" />
                            <span className="font-mono text-sm font-bold">{u.phone}</span>
                        </div>

                        {/* Password */}
                        <div className="flex items-center gap-3 bg-amber-50 rounded-2xl px-4 py-3">
                            <Lock size={14} className="text-amber-600 flex-shrink-0" />
                            <span className="font-mono text-xs text-amber-800 flex-1 truncate">
                                {u.password
                                    ? (showPwd[u.id] ? u.password : "•".repeat(Math.min(u.password.length, 16)))
                                    : <span className="font-sans text-gray-400">Parol yo'q</span>
                                }
                            </span>
                            {u.password && (
                                <button
                                    onClick={() => togglePwd(u.id)}
                                    className="flex-shrink-0 p-1 text-amber-600"
                                >
                                    {showPwd[u.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-gray-400 font-bold">
                                {u.created_at ? new Date(u.created_at).toLocaleDateString("uz-UZ") : "—"}
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => openEdit(u)}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-xl font-bold text-xs hover:bg-black hover:text-white transition-all"
                                >
                                    <Pencil size={13} /> Tahrirlash
                                </button>
                                <button
                                    onClick={() => handleDelete(u)}
                                    disabled={deleting === u.id}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-500 rounded-xl font-bold text-xs hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                                >
                                    {deleting === u.id
                                        ? <Loader2 size={13} className="animate-spin" />
                                        : <><Trash2 size={13} /> O'chirish</>
                                    }
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {modal && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg bg-white rounded-[32px] shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden">
                        {/* Modal header */}
                        <div className="flex items-center justify-between px-8 pt-8 pb-6 border-b border-gray-100">
                            <div>
                                <h2 className="text-2xl font-black italic uppercase tracking-tight">
                                    {modal.mode === "create" ? "Yangi foydalanuvchi" : "Tahrirlash"}
                                </h2>
                                {modal.mode === "edit" && (
                                    <p className="text-xs text-gray-400 font-bold mt-1">{modal.user?.phone}</p>
                                )}
                            </div>
                            <button onClick={closeModal} className="p-3 bg-gray-100 rounded-2xl hover:bg-black hover:text-white transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Form */}
                        <div className="px-8 py-6 space-y-4">
                            {/* Phone (only for create) */}
                            {modal.mode === "create" && (
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                                        Telefon raqam (Login) *
                                    </label>
                                    <div className="relative">
                                        <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="tel"
                                            placeholder="+998901234567"
                                            value={form.phone}
                                            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                                            className="w-full border border-gray-200 rounded-2xl py-4 pl-11 pr-4 font-bold text-sm focus:ring-4 focus:ring-black/5 outline-none"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Name */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                                    Ism *
                                </label>
                                <div className="relative">
                                    <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="To'liq ism"
                                        value={form.name}
                                        onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-2xl py-4 pl-11 pr-4 font-bold text-sm focus:ring-4 focus:ring-black/5 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Username */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    placeholder="@username (ixtiyoriy)"
                                    value={form.username}
                                    onChange={e => setForm(p => ({ ...p, username: e.target.value.replace(/^@/, "") }))}
                                    className="w-full border border-gray-200 rounded-2xl py-4 px-4 font-bold text-sm focus:ring-4 focus:ring-black/5 outline-none"
                                />
                            </div>

                            {/* Password */}
                            <div>
                                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2 block">
                                    Parol {modal.mode === "edit" && <span className="normal-case font-bold text-gray-300">(bo'sh qolsa o'zgarmaydi)</span>}
                                </label>
                                <div className="relative">
                                    <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                    <input
                                        type={formPwdVisible ? "text" : "password"}
                                        placeholder={modal.mode === "edit" ? "Yangi parol (ixtiyoriy)" : "Parol"}
                                        value={form.password}
                                        onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                                        className="w-full border border-gray-200 rounded-2xl py-4 pl-11 pr-12 font-bold text-sm focus:ring-4 focus:ring-black/5 outline-none"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setFormPwdVisible(v => !v)}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-black transition-colors"
                                    >
                                        {formPwdVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            {/* Admin toggle */}
                            <div
                                onClick={() => setForm(p => ({ ...p, is_admin: !p.is_admin }))}
                                className={`flex items-center justify-between p-5 rounded-2xl border-2 cursor-pointer transition-all ${form.is_admin ? "border-purple-500 bg-purple-50" : "border-gray-100 bg-gray-50"}`}
                            >
                                <div className="flex items-center gap-3">
                                    {form.is_admin ? <ShieldCheck size={20} className="text-purple-600" /> : <ShieldOff size={20} className="text-gray-400" />}
                                    <div>
                                        <p className="font-black text-sm">Admin huquqi</p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
                                            {form.is_admin ? "Admin panel kirishi bor" : "Oddiy foydalanuvchi"}
                                        </p>
                                    </div>
                                </div>
                                <div className={`w-12 h-6 rounded-full transition-all relative ${form.is_admin ? "bg-purple-500" : "bg-gray-200"}`}>
                                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${form.is_admin ? "left-7" : "left-1"}`} />
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-8 pb-8 flex gap-3">
                            <button
                                onClick={closeModal}
                                className="flex-1 py-4 rounded-2xl font-black text-sm bg-gray-100 hover:bg-gray-200 transition-all"
                            >
                                Bekor qilish
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex-1 py-4 rounded-2xl font-black text-sm bg-black text-white hover:bg-gray-800 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                            >
                                {saving
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : modal.mode === "create"
                                        ? <><UserPlus size={16} /> Qo'shish</>
                                        : <><Save size={16} /> Saqlash</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && <Toast msg={toast.msg} type={toast.type} />}
        </div>
    );
}
