"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/store/store";
import { Send, ChevronLeft, Loader2, Paperclip, MoreVertical } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { uploadToYandexS3 } from "@/lib/yandex-s3";

const GREEN = "#2D6E3E";
const GREEN_DEEP = "#1F5A30";
const GREEN_TINT = "#EAF3EC";

export default function P2PChatPage() {
    const { user, language } = useStore();
    const router = useRouter();
    const params = useParams();
    const targetPhoneRaw = params.id as string;
    const targetPhone = decodeURIComponent(targetPhoneRaw);

    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState("");
    const [loading, setLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [targetUserData, setTargetUserData] = useState<any>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const roomId = user && targetPhone ? [user.phone.replace(/\D/g, ''), targetPhone.replace(/\D/g, '')].sort().join("_") : "";

    // Oxirgi olingan xabar vaqti — polling faqat yangilarini so'raydi
    const lastTsRef = useRef<string | null>(null);

    const mergeMessages = (incoming: any[]) => {
        if (!incoming.length) return false;
        let added = false;
        setMessages(prev => {
            const ids = new Set(prev.map(m => m.id));
            const fresh = incoming.filter(m => !ids.has(m.id));
            if (!fresh.length) return prev;
            added = true;
            return [...prev, ...fresh];
        });
        const newest = incoming[incoming.length - 1]?.created_at;
        if (newest && (!lastTsRef.current || newest > lastTsRef.current)) lastTsRef.current = newest;
        return added;
    };

    useEffect(() => {
        if (!mounted) return;
        if (!user || !targetPhone) {
            router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
        }

        const redirectToLogin = () => router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`);

        // Xabarlar + suhbatdosh profili — server orqali (faqat o'zim ishtirok etgan chat);
        // server chatni "o'qildi" deb ham belgilaydi.
        const fetchInitial = async () => {
            try {
                const res = await fetch(`/api/me/messages?with=${encodeURIComponent(targetPhone)}`, { cache: "no-store" });
                if (res.status === 401) return redirectToLogin();
                const data = await res.json();
                if (data?.success) {
                    if (data.target) setTargetUserData(data.target);
                    const list = data.messages || [];
                    setMessages(list);
                    lastTsRef.current = list.length ? list[list.length - 1].created_at : null;
                    scrollToBottom();
                }
            } catch (e) {
                console.error("Messages fetch error:", e);
            } finally {
                setLoading(false);
            }
        };

        const fetchNew = async () => {
            if (document.visibilityState !== "visible") return;
            try {
                const since = lastTsRef.current ? `&since=${encodeURIComponent(lastTsRef.current)}` : "";
                const res = await fetch(`/api/me/messages?with=${encodeURIComponent(targetPhone)}${since}`, { cache: "no-store" });
                if (!res.ok) return;
                const data = await res.json();
                if (data?.success && mergeMessages(data.messages || [])) scrollToBottom();
            } catch { /* keyingi urinishda */ }
        };

        fetchInitial();

        // Jonli yangilanish: Realtime anon kalit bilan ishlaydi (endi yopiq) — o'rniga polling
        const timer = setInterval(fetchNew, 4000);
        document.addEventListener("visibilitychange", fetchNew);
        return () => {
            clearInterval(timer);
            document.removeEventListener("visibilitychange", fetchNew);
        };
    }, [user, targetPhone, roomId, router, mounted]);

    const scrollToBottom = () => {
        setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollIntoView({ behavior: "smooth" });
            }
        }, 100);
    };

    const handleSendMessage = async () => {
        if (!user || !roomId || (!inputText.trim() && !selectedFile)) return;

        setIsSending(true);
        const tempId = crypto.randomUUID();
        const msgText = inputText;

        try {
            const optimisticMsg = {
                id: tempId,
                chat_id: roomId,
                text: msgText,
                sender_id: user.phone,
                created_at: new Date().toISOString(),
                isPending: true
            };
            setMessages(prev => [...prev, optimisticMsg]);
            setInputText("");
            scrollToBottom();

            let uploadedUrl = "";
            let fileType = "";

            if (selectedFile) {
                const { url } = await uploadToYandexS3(selectedFile);
                uploadedUrl = url;
                fileType = selectedFile.type.startsWith('image/') ? 'image' : 'video';
                setMessages(prev => prev.map(m => m.id === tempId ? { ...m, image: fileType === 'image' ? uploadedUrl : null, video: fileType === 'video' ? uploadedUrl : null } : m));
            }

            // Server chatni (kerak bo'lsa) yaratadi, xabarni yozadi, last_message/unread'ni yangilaydi
            const res = await fetch("/api/me/messages", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    to: targetPhone,
                    text: msgText,
                    image: fileType === 'image' ? uploadedUrl : null,
                    video: fileType === 'video' ? uploadedUrl : null,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data?.success || !data.message) throw new Error(data?.error || `HTTP ${res.status}`);

            const realMsg = data.message;
            setMessages(prev => prev.map(m => m.id === tempId ? realMsg : m));
            if (!lastTsRef.current || realMsg.created_at > lastTsRef.current) lastTsRef.current = realMsg.created_at;

            setSelectedFile(null);
            setMediaPreview(null);
            scrollToBottom();
        } catch (error) {
            console.error("Error sending message:", error);
            setMessages(prev => prev.filter(m => m.id !== tempId));
        } finally {
            setIsSending(false);
            setIsUploadingMedia(false);
        }
    };

    // "Faqat mendan" (scope=me) — menda yashiriladi, suhbatdoshda qoladi;
    // "Ikkala tarafdan" (scope=all) — butunlay o'chiriladi (faqat o'z xabarini)
    const handleDeleteMessage = async (msgId: string, forEveryone: boolean) => {
        try {
            const scope = forEveryone ? "all" : "me";
            const res = await fetch(`/api/me/messages?id=${encodeURIComponent(msgId)}&scope=${scope}`, { method: "DELETE" });
            if (res.ok) setMessages(prev => prev.filter(m => m.id !== msgId));
        } catch (error) {
            console.error("Error deleting message:", error);
        }
    };

    const [showDeleteChat, setShowDeleteChat] = useState(false);

    const handleDeleteChat = async (scope: "me" | "all") => {
        setShowDeleteChat(false);
        try {
            const res = await fetch(`/api/me/messages?with=${encodeURIComponent(targetPhone)}&scope=${scope}`, { method: "DELETE" });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            router.push(`/${language}/messages`);
        } catch (error) {
            console.error("Error deleting chat:", error);
        }
    };

    if (!mounted || (loading && !messages.length)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF6]">
                <Loader2 className="animate-spin text-[#2D6E3E]" size={32} />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[100dvh] bg-[#FAFAF6] max-w-[480px] mx-auto relative overflow-hidden">
            {/* Header */}
            <div className="bg-[#FAFAF6]/85 backdrop-blur-2xl px-4 pt-12 pb-3 flex items-center gap-3 border-b border-[rgba(15,20,16,0.06)] shrink-0 sticky top-0 z-40">
                <button
                    onClick={() => {
                        videoPreWarmer.triggerHaptic("light");
                        router.back();
                    }}
                    className="ios-tap-feedback active:scale-90 transition-transform w-10 h-10 rounded-2xl bg-white/80 backdrop-blur-md border border-[rgba(15,20,16,0.08)] text-[#111612] flex items-center justify-center shadow-xs shrink-0"
                    aria-label="Back"
                >
                    <ChevronLeft size={20} />
                </button>

                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                        {targetUserData?.name?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-sm font-bold text-[#111612] tracking-tight truncate leading-tight mb-0.5">
                            {targetUserData?.name}
                        </h1>
                        <p className={`text-[11px] font-semibold flex items-center gap-1.5 ${targetUserData?.isOnline ? "text-[#2D6E3E]" : "text-[#737D75]"}`}>
                            {targetUserData?.isOnline ? (
                                <>
                                    <span className="w-2 h-2 rounded-full bg-[#2D6E3E] inline-block ring-2 ring-[#2D6E3E]/20 animate-pulse" />
                                    Online
                                </>
                            ) : `@${targetUserData?.username || targetUserData?.phone}`}
                        </p>
                    </div>
                </div>

                <div className="relative group/menu">
                    <button
                        onClick={() => videoPreWarmer.triggerHaptic("light")}
                        className="ios-icon-tap active:scale-90 transition-transform w-10 h-10 rounded-2xl bg-white/80 backdrop-blur-md border border-[rgba(15,20,16,0.08)] text-[#737D75] flex items-center justify-center shadow-xs"
                        aria-label="More options"
                    >
                        <MoreVertical size={18} />
                    </button>
                    <div className="absolute right-0 top-full mt-2 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-xl border border-[rgba(15,20,16,0.08)] min-w-[170px] z-50 p-1.5 opacity-0 pointer-events-none group-hover/menu:opacity-100 group-hover/menu:pointer-events-auto transition-opacity duration-150">
                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("medium");
                                setShowDeleteChat(true);
                            }}
                            className="w-full text-left px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
                        >
                            {language === 'uz' ? "Suhbatni o'chirish" : "Удалить чат"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Suhbatni o'chirish — ikki tanlov */}
            {showDeleteChat && (
                <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={() => setShowDeleteChat(false)}>
                    <div className="w-full max-w-[380px] bg-white rounded-3xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <p className="text-base font-bold text-[#111612] mb-1">
                            {language === 'uz' ? "Suhbatni o'chirish" : "Удалить чат"}
                        </p>
                        <p className="text-xs text-[#737D75] mb-4">
                            {language === 'uz'
                                ? "“Faqat mendan” — suhbat sizda tozalanadi, suhbatdoshda qoladi. “Ikkala tarafdan” — hammasi butunlay o'chiriladi."
                                : "«Только у меня» — чат очистится у вас, у собеседника останется. «У обоих» — всё будет удалено полностью."}
                        </p>
                        <div className="flex flex-col gap-2">
                            <button onClick={() => handleDeleteChat("me")} className="w-full py-3 rounded-2xl text-sm font-semibold bg-[#F5F7F5] text-[#111612] active:scale-[0.98] transition-transform">
                                {language === 'uz' ? "Faqat mendan" : "Только у меня"}
                            </button>
                            <button onClick={() => handleDeleteChat("all")} className="w-full py-3 rounded-2xl text-sm font-semibold bg-rose-50 text-rose-600 active:scale-[0.98] transition-transform">
                                {language === 'uz' ? "Ikkala tarafdan" : "У обоих"}
                            </button>
                            <button onClick={() => setShowDeleteChat(false)} className="w-full py-2.5 rounded-2xl text-sm font-medium text-[#737D75]">
                                {language === 'uz' ? "Bekor qilish" : "Отмена"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5 no-scrollbar">
                <div className="text-center mb-1">
                    <span className="bg-white/80 backdrop-blur-md border border-[rgba(15,20,16,0.06)] text-[#737D75] text-[11px] font-medium py-1 px-3.5 rounded-full shadow-xs inline-block">
                        {language === 'uz' ? "Xavfsiz muloqot boshlandi" : "Защищённый чат начат"}
                    </span>
                </div>

                {messages.map((msg) => {
                    const isMe = msg.sender_id === user?.phone;
                    const hasMedia = msg.image || msg.video;
                    return (
                        <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group/msg relative`}>
                            <div className={`max-w-[82%] rounded-[22px] overflow-hidden shadow-xs relative ${
                                isMe 
                                    ? "rounded-br-[6px] text-white border border-[#2D6E3E]/20" 
                                    : "rounded-bl-[6px] bg-white/95 backdrop-blur-md border border-[rgba(15,20,16,0.06)] text-[#111612]"
                            }`}
                            style={isMe ? { background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" } : {}}
                            >
                                {msg.image && (
                                    <img 
                                        src={msg.image} 
                                        className="w-full max-h-[280px] object-cover block cursor-pointer" 
                                        alt="Media" 
                                        onClick={() => window.open(msg.image, '_blank')} 
                                    />
                                )}
                                {msg.video && (
                                    <video src={msg.video} className="w-full max-h-[280px] object-cover" controls playsInline />
                                )}
                                <div className="px-3.5 py-2.5">
                                    {msg.text && (
                                        <p className={`text-sm font-normal leading-relaxed mb-1 ${isMe ? "text-white" : "text-[#111612]"}`}>
                                            {msg.text}
                                        </p>
                                    )}
                                    <div className={`flex items-center justify-end gap-1.5 text-[10px] font-medium ${isMe ? "text-white/70" : "text-[#9AA29C]"}`}>
                                        <span>
                                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {isMe && <span>✓✓</span>}
                                    </div>
                                </div>

                                {/* Message context actions */}
                                <div className={`absolute top-1 ${isMe ? "-left-8" : "-right-8"} opacity-0 group-hover/msg:opacity-100 transition-opacity`}>
                                    <div className="relative group/opt">
                                        <button 
                                            className="w-6 h-6 rounded-full bg-white/90 backdrop-blur-md shadow-xs border border-[rgba(15,20,16,0.08)] flex items-center justify-center text-[#737D75] hover:text-[#111612]"
                                            aria-label="Message options"
                                        >
                                            <MoreVertical size={11} />
                                        </button>
                                        <div className={`absolute ${isMe ? "right-0" : "left-0"} top-full mt-1 bg-white/95 backdrop-blur-2xl rounded-xl shadow-lg border border-[rgba(15,20,16,0.08)] min-w-[110px] z-20 p-1 opacity-0 pointer-events-none group-hover/opt:opacity-100 group-hover/opt:pointer-events-auto transition-opacity duration-150`}>
                                            <button 
                                                onClick={() => handleDeleteMessage(msg.id, false)} 
                                                className="w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] font-semibold text-[#111612] hover:bg-[#F5F7F5]"
                                            >
                                                {language === 'uz' ? "Faqat mendan" : "Только у меня"}
                                            </button>
                                            {isMe && (
                                                <button 
                                                    onClick={() => handleDeleteMessage(msg.id, true)} 
                                                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                                                >
                                                    {language === 'uz' ? "Ikkala tarafdan" : "У обоих"}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={scrollRef} className="h-1" />
            </div>

            {/* Input Area */}
            <div className="bg-[#FAFAF6]/85 backdrop-blur-2xl px-4 pt-2.5 pb-6 border-t border-[rgba(15,20,16,0.06)] shrink-0">
                {mediaPreview && (
                    <div className="mb-2 relative w-24">
                        {selectedFile?.type.startsWith('video/') ? (
                            <video src={mediaPreview} className="w-24 h-16 object-cover rounded-xl border border-[rgba(15,20,16,0.08)]" muted />
                        ) : (
                            <img src={mediaPreview} className="w-24 h-16 object-cover rounded-xl border border-[rgba(15,20,16,0.08)]" alt="Preview" />
                        )}
                        <button 
                            onClick={() => { setSelectedFile(null); setMediaPreview(null); }} 
                            className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-xs shadow-xs"
                        >
                            ✕
                        </button>
                        {isUploadingMedia && (
                            <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center">
                                <Loader2 size={16} className="text-white animate-spin" />
                            </div>
                        )}
                    </div>
                )}
                <div className="flex items-center gap-2.5">
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) { setSelectedFile(file); setMediaPreview(URL.createObjectURL(file)); }
                        }} 
                        className="hidden" 
                        accept="image/*,video/*" 
                    />
                    <button 
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            fileInputRef.current?.click();
                        }} 
                        className="ios-icon-tap active:scale-90 transition-transform w-11 h-11 rounded-2xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center shrink-0 shadow-xs"
                        aria-label="Attach media"
                    >
                        <Paperclip size={18} />
                    </button>
                    <div className="flex-1 relative flex items-center">
                        <input
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                            placeholder={language === 'uz' ? "Xabar yozing..." : "Напишите сообщение..."}
                            className="w-full bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.08)] focus:border-[#2D6E3E] rounded-2xl pl-4 pr-12 py-3 text-sm font-medium text-[#111612] outline-none shadow-xs placeholder:text-[#9AA29C] transition-colors duration-150"
                        />
                        <button
                            onClick={() => {
                                videoPreWarmer.triggerHaptic("medium");
                                handleSendMessage();
                            }}
                            disabled={isSending || (!inputText.trim() && !selectedFile)}
                            className="ios-tap-feedback active:scale-90 transition-transform absolute right-2 w-8 h-8 rounded-xl flex items-center justify-center disabled:opacity-30 shadow-xs"
                            style={{
                                background: (inputText.trim() || selectedFile) 
                                    ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" 
                                    : "#F5F7F5",
                                color: (inputText.trim() || selectedFile) ? "#fff" : "#9AA29C"
                            }}
                            aria-label="Send message"
                        >
                            {isSending ? <Loader2 size={15} className="animate-spin text-white" /> : <Send size={15} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
