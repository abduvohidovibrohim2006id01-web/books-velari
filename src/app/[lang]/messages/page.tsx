"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/store/store";
import { MessageSquare, Search, Loader2, Headset, X, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { translations } from "@/lib/translations";

export default function MessagesPage() {
    const { user, language } = useStore();
    const t = translations[language];
    const router = useRouter();
    const [chats, setChats] = useState<any[]>([]);
    const [supportChat, setSupportChat] = useState<any>(null);
    const [userResults, setUserResults] = useState<any[]>([]);
    const [suggestedUsers, setSuggestedUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingSuggested, setLoadingSuggested] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMoreUsers, setHasMoreUsers] = useState(true);
    const [usersOffset, setUsersOffset] = useState(0);
    const [isSearching, setIsSearching] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [mounted, setMounted] = useState(false);

    // To prevent duplicate fetches
    const isFetchingRef = useRef(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const loadUsers = async (initial = false) => {
        if (isFetchingRef.current) return;
        isFetchingRef.current = true;

        if (initial) {
            setLoadingSuggested(true);
            setUsersOffset(0);
            setHasMoreUsers(true);
        } else {
            setLoadingMore(true);
        }

        const currentOffset = initial ? 0 : usersOffset;

        try {
            const res = await fetch(`/api/users/search?suggested=true&limit=20&offset=${currentOffset}`);
            const data = await res.json();
            if (data.success && Array.isArray(data.users)) {
                setSuggestedUsers(prev => {
                    if (initial) return data.users;
                    const existingIds = new Set(prev.map(u => u.id));
                    const nextBatch = data.users.filter((u: any) => !existingIds.has(u.id));
                    return [...prev, ...nextBatch];
                });
                setHasMoreUsers(Boolean(data.hasMore));
                setUsersOffset(data.nextOffset || (currentOffset + data.users.length));
            }
        } catch (e) {
            console.error("Users fetch error:", e);
        } finally {
            isFetchingRef.current = false;
            if (initial) setLoadingSuggested(false);
            else setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (!mounted) return;
        if (!user) {
            router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
        }
        // Chatlar va support chati — server orqali (faqat o'zim ishtirok etgan chatlar)
        const fetchChats = async () => {
            try {
                const res = await fetch("/api/me/chats", { cache: "no-store" });
                const data = await res.json();
                if (data?.success) {
                    setChats(data.chats || []);
                    if (data.supportChat) setSupportChat(data.supportChat);
                }
            } catch (e) {
                console.error("Chat fetch error:", e);
            } finally {
                setLoading(false);
            }
        };

        fetchChats();
        loadUsers(true);

        // Jonli yangilanish: Realtime anon kalit bilan ishlaydi (endi yopiq) — o'rniga polling,
        // faqat sahifa ko'rinib turganda; qaytib kelganda darhol yangilanadi.
        const POLL_MS = 10000;
        const timer = setInterval(() => {
            if (document.visibilityState === "visible") fetchChats();
        }, POLL_MS);
        const onVisible = () => { if (document.visibilityState === "visible") fetchChats(); };
        document.addEventListener("visibilitychange", onVisible);

        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [user, router, mounted, language]);

    // Global User Search Logic (Telegram style)
    useEffect(() => {
        const cleanQuery = searchQuery.trim().toLowerCase();
        if (cleanQuery.length < 2) {
            setUserResults([]);
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const delayDebounceFn = setTimeout(async () => {
            try {
                const response = await fetch(`/api/users/search?q=${encodeURIComponent(cleanQuery)}`);
                const data = await response.json();
                if (data.success) {
                    setUserResults(data.users || []);
                }
            } catch (e) {
                console.error("Search error:", e);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    // Infinite scroll handler on content container
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop - clientHeight < 250) {
            if (hasMoreUsers && !loadingMore && !loadingSuggested && !searchQuery.trim()) {
                loadUsers(false);
            }
        }
    };

    // Filter existing chats matching search query
    const filteredChats = chats.filter((chat: any) => {
        const otherParticipantPhone = chat.participants?.find((p: string) => p !== user?.phone?.replace(/\D/g, ''));
        const otherData = chat.participant_data?.[otherParticipantPhone || ""];
        const searchStr = `${otherData?.name || ""} ${otherData?.username || ""} ${chat.last_message || ""}`.toLowerCase();
        return searchStr.includes(searchQuery.toLowerCase());
    });

    if (!mounted || (loading && chats.length === 0)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF6]">
                <Loader2 className="animate-spin text-[#2D6E3E]" size={32} />
            </div>
        );
    }

    const hasQuery = searchQuery.trim().length > 0;

    return (
        <div className="flex flex-col h-[100svh] bg-[#FAFAF6] max-w-[480px] mx-auto relative overflow-hidden">
            {/* Top Search Bar (No back button, no Xabarlar title - clean & direct) */}
            <div className="bg-[#FAFAF6]/90 backdrop-blur-2xl px-4 pt-4 pb-3 border-b border-[rgba(15,20,16,0.06)] shrink-0 sticky top-0 z-40">
                <div className="relative flex items-center">
                    <Search className="absolute left-3.5 text-[#9AA29C] pointer-events-none" size={17} />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={language === 'uz' ? "Foydalanuvchilar yoki xabarlarni qidirish..." : "Поиск пользователей или сообщений..."}
                        className="w-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl pl-10 pr-9 py-2.5 text-sm font-medium text-[#111612] outline-none transition-colors duration-150 placeholder:text-[#9AA29C] shadow-xs"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute right-3 w-5 h-5 rounded-full bg-black/5 text-[#737D75] flex items-center justify-center hover:bg-black/10 active:scale-90 transition-transform duration-150 will-change-transform"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Content Body with 20-by-20 Infinite Scroll */}
            <div 
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto px-4 py-3 pb-24 no-scrollbar space-y-4"
            >

                {/* ========================================================= */}
                {/* 1. SEARCH ACTIVE (TELEGRAM STYLE: USERS THEN CHATS)       */}
                {/* ========================================================= */}
                {hasQuery ? (
                    <div className="space-y-4">
                        {/* Section A: Global Users Found */}
                        <div>
                            <div className="flex items-center justify-between px-1 mb-2">
                                <span className="text-xs font-bold text-[#737D75] uppercase tracking-wider">
                                    {language === 'uz' ? "👥 Foydalanuvchilar (Global qidiruv)" : "👥 Пользователи"}
                                </span>
                                {isSearching && <Loader2 className="animate-spin text-[#2D6E3E]" size={14} />}
                            </div>

                            {isSearching && userResults.length === 0 ? (
                                <div className="p-4 text-center text-xs text-[#9AA29C]">
                                    {language === 'uz' ? "Qidirilmoqda..." : "Поиск..."}
                                </div>
                            ) : userResults.length === 0 ? (
                                <div className="p-4 text-center text-xs text-[#9AA29C] bg-white/60 rounded-2xl border border-[rgba(15,20,16,0.05)]">
                                    {language === 'uz' ? "Foydalanuvchilar topilmadi" : "Пользователи не найдены"}
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {userResults.map((u) => (
                                        <Link
                                            key={u.id || u.phone}
                                            href={`/${language}/messages/${encodeURIComponent(u.id || u.phone)}`}
                                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 flex items-center justify-between p-3 rounded-2xl bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] hover:border-[#2D6E3E]/30 shadow-xs"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2D6E3E] to-[#1F5A30] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                                                    {u.name?.charAt(0).toUpperCase() || "U"}
                                                </div>
                                                <div className="min-w-0">
                                                    <h3 className="font-semibold text-sm text-[#111612] truncate">{u.name}</h3>
                                                    <p className="text-xs text-[#737D75] truncate">
                                                        {u.username ? `@${u.username}` : (u.phone || "")}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-xs font-semibold text-[#2D6E3E] bg-[#EAF3EC] px-3 py-1 rounded-full shrink-0">
                                                {language === 'uz' ? "Yozish" : "Написать"}
                                            </span>
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Section B: Existing Chats & Messages */}
                        <div>
                            <div className="px-1 mb-2">
                                <span className="text-xs font-bold text-[#737D75] uppercase tracking-wider">
                                    {language === 'uz' ? "💬 Xabarlar va suhbatlar" : "💬 Сообщения и чаты"}
                                </span>
                            </div>

                            {filteredChats.length === 0 ? (
                                <div className="p-4 text-center text-xs text-[#9AA29C] bg-white/60 rounded-2xl border border-[rgba(15,20,16,0.05)]">
                                    {language === 'uz' ? "Mavjud suhbatlardan xabar topilmadi" : "Сообщения в чатах не найдены"}
                                </div>
                            ) : (
                                <div className="space-y-1.5">
                                    {filteredChats.map((chat: any) => {
                                        const myPhoneClean = user?.phone?.replace(/\D/g, '') || "";
                                        const otherPhone = chat.participants?.find((p: string) => p.replace(/\D/g, '') !== myPhoneClean) || "";
                                        const otherData = chat.participant_data?.[otherPhone] || { name: "User", username: otherPhone };
                                        const lastMsg = chat.last_message || (language === 'uz' ? "Suhbatni boshlash" : "Начать диалог");
                                        const timestamp = chat.last_timestamp ? new Date(chat.last_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

                                        return (
                                            <Link
                                                key={chat.id}
                                                href={`/${language}/messages/${encodeURIComponent(otherPhone)}`}
                                                onClick={() => videoPreWarmer.triggerHaptic("light")}
                                                className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 flex items-center gap-3.5 p-3 rounded-2xl bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] shadow-xs hover:border-[#2D6E3E]/30"
                                            >
                                                <div className="w-11 h-11 rounded-2xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center font-bold text-sm shrink-0">
                                                    {otherData.name?.charAt(0).toUpperCase() || "U"}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between mb-0.5">
                                                        <h3 className="font-semibold text-sm text-[#111612] truncate">{otherData.name}</h3>
                                                        <span className="text-[11px] text-[#9AA29C]">{timestamp}</span>
                                                    </div>
                                                    <p className="text-xs text-[#737D75] truncate">{lastMsg}</p>
                                                </div>
                                            </Link>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ========================================================= */
                    /* 2. DEFAULT VIEW (PINNED SUPPORT CHAT + CHATS + ALL USERS) */
                    /* ========================================================= */
                    <div className="space-y-3">
                        {/* 📌 PINNED: Velari Admin / Support Service (Always at top) */}
                        <Link
                            href={`/${language}/chat`}
                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 will-change-transform flex items-center gap-3.5 p-3.5 rounded-[22px] text-white relative overflow-hidden shadow-md shadow-[#2D6E3E]/20 border border-white/20"
                            style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}
                        >
                            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-md flex items-center justify-center shrink-0 border border-white/20 shadow-xs">
                                <Headset size={22} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-bold text-sm text-white tracking-tight truncate">
                                            {t.common.supportService || "Velari Yordam va Qo'llab-quvvatlash"}
                                        </h3>
                                        <span className="bg-white/20 backdrop-blur-md text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            Admin
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-white/75 font-medium">
                                        {supportChat?.last_timestamp ? new Date(supportChat.last_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "24/7"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                    <p className={`text-xs truncate ${supportChat?.unread_by_user > 0 ? "text-white font-semibold" : "text-white/85"}`}>
                                        {supportChat?.last_message || (language === 'uz' ? "Savolingiz bormi? Yordam beramiz" : "Есть вопросы? Мы поможем")}
                                    </p>
                                    {supportChat?.unread_by_user > 0 && (
                                        <div className="min-w-[18px] h-[18px] bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold px-1 shadow-xs">
                                            {supportChat.unread_by_user}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Link>

                        {/* Existing Active Chats */}
                        {chats.length > 0 && (
                            <div className="space-y-2">
                                <div className="px-1 pt-1">
                                    <span className="text-xs font-bold text-[#737D75] uppercase tracking-wider">
                                        {language === 'uz' ? "Suhbatlar" : "Чаты"}
                                    </span>
                                </div>
                                {chats.map((chat: any) => {
                                    const myPhoneClean = user?.phone?.replace(/\D/g, '') || "";
                                    const otherPhone = chat.participants?.find((p: string) => p.replace(/\D/g, '') !== myPhoneClean) || "";
                                    const otherData = chat.participant_data?.[otherPhone] || { name: "User", username: otherPhone };
                                    const unread = chat.unread_count?.[myPhoneClean] || 0;
                                    const lastMsg = chat.last_message || (language === 'uz' ? "Suhbatni boshlash" : "Начать диалог");
                                    const timestamp = chat.last_timestamp ? new Date(chat.last_timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "";

                                    return (
                                        <Link
                                            key={chat.id}
                                            href={`/${language}/messages/${encodeURIComponent(otherPhone)}`}
                                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 flex items-center gap-3.5 p-3.5 rounded-[22px] bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] shadow-xs hover:border-[#2D6E3E]/30"
                                        >
                                            <div className="w-12 h-12 rounded-2xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center font-bold text-base shrink-0 shadow-xs">
                                                {otherData.name?.charAt(0).toUpperCase() || "U"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2 mb-0.5">
                                                    <h3 className="font-semibold text-sm text-[#111612] truncate">{otherData.name}</h3>
                                                    <span className="text-[11px] font-medium text-[#9AA29C]">{timestamp}</span>
                                                </div>
                                                <div className="flex-1 flex items-center justify-between gap-2">
                                                    <p className={`text-xs truncate ${unread > 0 ? "font-semibold text-[#111612]" : "text-[#737D75]"}`}>
                                                        {lastMsg}
                                                    </p>
                                                    {unread > 0 && (
                                                        <div className="min-w-[20px] h-5 px-1.5 bg-[#2D6E3E] text-white rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 shadow-xs">
                                                            {unread}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}

                        {/* ========================================================= */}
                        {/* 3. ALL USERS DIRECTORY WITH 20-BY-20 INFINITE SCROLL      */}
                        {/* ========================================================= */}
                        <div className="pt-2">
                            {chats.length === 0 && (
                                <div className="p-5 rounded-[24px] bg-white/80 backdrop-blur-md border border-[rgba(15,20,16,0.06)] text-center mb-4 shadow-xs">
                                    <div className="w-14 h-14 rounded-2xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center mx-auto mb-3">
                                        <Sparkles size={26} />
                                    </div>
                                    <h3 className="text-base font-bold text-[#111612]">
                                        {language === 'uz' ? "Velari hamjamiyatiga xush kelibsiz!" : "Добро пожаловать в сообщество!"}
                                    </h3>
                                    <p className="text-xs text-[#737D75] mt-1 max-w-xs mx-auto leading-relaxed">
                                        {language === 'uz' 
                                            ? "Istalgan foydalanuvchi bilan xaridlar va tajriba almashish uchun xabar yozing." 
                                            : "Общайтесь с другими покупателями и делитесь отзывами о товарах."}
                                    </p>
                                </div>
                            )}

                            <div className="flex items-center justify-between px-1 mb-2.5">
                                <span className="text-xs font-bold text-[#737D75] uppercase tracking-wider">
                                    {language === 'uz' ? "👥 Barcha foydalanuvchilar" : "👥 Все пользователи"}
                                </span>
                                {loadingSuggested && <Loader2 className="animate-spin text-[#2D6E3E]" size={14} />}
                            </div>

                            {suggestedUsers.length === 0 && !loadingSuggested ? (
                                <div className="p-4 text-center text-xs text-[#9AA29C] bg-white/50 rounded-2xl">
                                    {language === 'uz' ? "Foydalanuvchilar topilmadi" : "Пользователи не найдены"}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {suggestedUsers.map((su) => (
                                        <Link
                                            key={su.id || su.phone}
                                            href={`/${language}/messages/${encodeURIComponent(su.id || su.phone)}`}
                                            onClick={() => videoPreWarmer.triggerHaptic("light")}
                                            className="ios-tap-feedback active:scale-[0.98] transition-transform duration-150 flex items-center justify-between p-3.5 rounded-[22px] bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] hover:border-[#2D6E3E]/30 shadow-xs group"
                                        >
                                            <div className="flex items-center gap-3.5 min-w-0">
                                                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2D6E3E] to-[#1F5A30] text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0">
                                                    {su.name?.charAt(0).toUpperCase() || "U"}
                                                </div>
                                                <div className="min-w-0">
                                                    <h4 className="font-semibold text-sm text-[#111612] truncate">{su.name}</h4>
                                                    <p className="text-xs text-[#737D75] truncate">
                                                        {su.username ? `@${su.username}` : (su.phone || (language === 'uz' ? "Xaridor" : "Покупатель"))}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EAF3EC] text-[#2D6E3E] text-xs font-semibold group-hover:bg-[#2D6E3E] group-hover:text-white transition-colors duration-150 shrink-0">
                                                <MessageSquare size={13} />
                                                <span>{language === 'uz' ? "Yozish" : "Написать"}</span>
                                            </div>
                                        </Link>
                                    ))}

                                    {/* Infinite Scroll Loader */}
                                    {loadingMore && (
                                        <div className="py-4 flex items-center justify-center gap-2 text-xs text-[#737D75]">
                                            <Loader2 className="animate-spin text-[#2D6E3E]" size={16} />
                                            <span>{language === 'uz' ? "Yana yuklanmoqda..." : "Загрузка..."}</span>
                                        </div>
                                    )}

                                    {!hasMoreUsers && suggestedUsers.length >= 20 && (
                                        <div className="py-3 text-center text-[11px] text-[#9AA29C]">
                                            {language === 'uz' ? "Barcha foydalanuvchilar ko'rsatildi" : "Все пользователи показаны"}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


