"use client";

import { useState } from "react";
import { Bell, Send, Link as LinkIcon, Loader2 } from "lucide-react";
import { useStore } from "@/store/store";

export default function PushNotificationsPage() {
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const [url, setUrl] = useState("/");
    const [loading, setLoading] = useState(false);
    const { showToast } = useStore();

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !body) {
            showToast("Iltimos, barcha maydonlarni to'ldiring", "error");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch("/api/admin/push-send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title, body, url }),
            });
            const data = await res.json();
            if (data.success) {
                showToast(`Xabar yuborildi! (${data.results.success} muvaffaqiyatli, ${data.results.failed} xato)`, "success");
                setTitle("");
                setBody("");
                setUrl("/");
            } else {
                showToast(data.error || "Xatolik yuz berdi", "error");
            }
        } catch (error) {
            showToast("Server xatosi", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-black tracking-tighter uppercase italic flex items-center gap-3">
                    <Bell size={32} strokeWidth={3} className="text-blue-500" />
                    Push Xabarnomalar
                </h1>
                <p className="text-gray-400 text-sm mt-1">
                    Barcha obuna bo'lgan foydalanuvchilarning telefoniga push-xabar yuborish
                </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
                {/* Form */}
                <form onSubmit={handleSend} className="bg-white rounded-[40px] p-8 shadow-sm border border-gray-100 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Sarlavha</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="Masalan: Yangi chegirmalar!"
                            className="w-full bg-gray-50 border-none rounded-3xl p-4 font-bold focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Xabar matni</label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            placeholder="Xabar mazmunini yozing..."
                            rows={4}
                            className="w-full bg-gray-50 border-none rounded-3xl p-4 font-bold focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4 flex items-center gap-2">
                            <LinkIcon size={12} /> O'tish manzili (URL)
                        </label>
                        <input
                            type="text"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            placeholder="/catalog"
                            className="w-full bg-gray-50 border-none rounded-3xl p-4 font-bold focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-black text-white rounded-3xl p-5 font-black uppercase tracking-widest hover:bg-gray-900 transition-all flex items-center justify-center gap-3 shadow-xl shadow-black/10 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="animate-spin" /> : <Send size={20} />}
                        Barchaga yuborish
                    </button>

                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                const { subscribeToPushNotifications } = await import("@/lib/push-notifications");
                                const sub = await subscribeToPushNotifications();
                                if (!sub) {
                                    showToast("Push obuna o'rnatilmadi. Brauzer ruxsatini tekshiring.", "error");
                                    return;
                                }
                                const res = await fetch("/api/admin/push-send", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ 
                                        title: title || "Velari — Test Bildirishnoma 🔔", 
                                        body: body || "Ushbu test xabari brauzeringizga muvaffaqiyatli yetib keldi! 🚀", 
                                        url: url || "/" 
                                    }),
                                });
                                const data = await res.json();
                                if (data.success) {
                                    showToast(`Test xabari yuborildi! (${data.results?.success || 0} ta qurilmaga)`, "success");
                                } else {
                                    showToast("Xato: " + (data.error || "Yuborib bo'lmadi"), "error");
                                    console.error("Push send xato:", data);
                                }
                            } catch (e: any) {
                                showToast("Xatolik: " + e.message, "error");
                                console.error("Push test exception:", e);
                            }
                        }}
                        className="w-full bg-blue-50 text-blue-700 border border-blue-200 rounded-3xl p-4 font-black uppercase tracking-wider hover:bg-blue-100 transition-all flex items-center justify-center gap-2 text-xs"
                    >
                        <Bell size={16} />
                        Mening brauzerimga test xabar yuborish
                    </button>
                </form>

                {/* Preview */}
                <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 ml-4">Ko'rinishi (Preview)</label>
                    <div className="bg-gray-100 rounded-[32px] p-6 border-2 border-dashed border-gray-200">
                        <div className="bg-white rounded-2xl p-4 shadow-lg max-w-xs mx-auto">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 bg-blue-500 rounded-lg shrink-0 flex items-center justify-center">
                                    <Bell size={20} className="text-white" />
                                </div>
                                <div className="overflow-hidden">
                                    <h4 className="font-black text-sm truncate">{title || "Sarlavha kutilmoqda..."}</h4>
                                    <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{body || "Xabar matni bu yerda ko'rinadi..."}</p>
                                    <div className="mt-2 flex gap-2">
                                        <div className="px-3 py-1 bg-gray-100 rounded-md text-[9px] font-black uppercase">Ko'rish</div>
                                        <div className="px-3 py-1 bg-gray-50 rounded-md text-[9px] font-black uppercase text-gray-400">Yopish</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <p className="text-center text-[10px] text-gray-400 mt-6 font-bold uppercase tracking-widest italic">
                            Bu xabar mobil qurilmalarda xuddi shunday ko'rinadi
                        </p>
                    </div>

                    <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100">
                        <h4 className="text-blue-900 font-black text-xs uppercase tracking-widest mb-2">Maslahat:</h4>
                        <p className="text-blue-700 text-xs font-medium leading-relaxed">
                            Push xabarlar foydalanuvchilarning qaytish darajasini (retention) 40% gacha oshirishi mumkin. 
                            Ammo juda ko'p xabar yubormaslikka harakat qiling, aks holda ular obunani o'chirib qo'yishlari mumkin.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
