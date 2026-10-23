"use client";

import { useState, useEffect, useRef } from "react";
import { useStore } from "@/store/store";
import { supabase } from "@/lib/supabase";
import { Send, ChevronLeft, Loader2, User, Headset, Image as ImageIcon, Paperclip } from "lucide-react";
import { useRouter } from "next/navigation";
import { mapMessage } from "@/lib/mappers";
import { videoPreWarmer } from "@/lib/videoPreWarmer";
import { uploadToYandexS3 } from "@/lib/yandex-s3";

interface Message {
    id: string;
    text: string;
    senderId: string;
    timestamp: any;
    isAdmin: boolean;
    image?: string;
    video?: string;
    senderType: string;
}

export default function ChatPage() {
    const { user, language } = useStore();
    const router = useRouter();
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState("");
    const [loading, setLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;
        if (!user) {
            router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`);
            return;
        }

        const fetchMessages = async () => {
            const response = await fetch(`/api/chat?chat_id=${user.phone}`);
            const data = await response.json();
            if (data.success) setMessages(data.messages.map(mapMessage));
            setLoading(false);
            scrollToBottom();
        };

        fetchMessages();

        // Subscribe to new messages
        const channel = supabase
            .channel('public:support_messages')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'support_messages',
                filter: `chat_id=eq.${user.phone}`
            }, (payload) => {
                const newMessage = mapMessage(payload.new);
                setMessages((prev) => [...prev, newMessage]);
                scrollToBottom();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, mounted, router]);

    const scrollToBottom = () => {
        setTimeout(() => {
            scrollRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setSelectedFile(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setMediaPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleSendMessage = async () => {
        if (!user || (!inputText.trim() && !selectedFile)) return;

        setIsSending(true);
        try {
            let uploadedUrl = "";
            let fileType = "";

            if (selectedFile) {
                setIsUploadingMedia(true);
                const { url } = await uploadToYandexS3(selectedFile);
                uploadedUrl = url;
                fileType = selectedFile.type.startsWith('image/') ? 'image' : 'video';
                setIsUploadingMedia(false);
            }


            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: user.phone,
                    text: inputText,
                    image: fileType === 'image' ? uploadedUrl : null,
                    video: fileType === 'video' ? uploadedUrl : null,
                    sender_id: user.phone,
                    sender_type: "user"
                })
            });

            if (!response.ok) throw new Error("Xabar yuborishda xatolik");

            setInputText("");
            setSelectedFile(null);
            setMediaPreview(null);
            scrollToBottom();
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setIsSending(false);
            setIsUploadingMedia(false);
        }
    };

    if (!mounted || (loading && !messages.length)) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FAFAF6]">
                <Loader2 className="animate-spin text-[#2D6E3E]" size={32} />
            </div>
        );
    }

    const quickPrompts = language === 'uz' ? [
        "📦 Yetkazib berish vaqti qancha?",
        "🛡️ Kafolat va qaytarish qoidalari",
        "💳 Qanday to'lov usullari bor?"
    ] : [
        "📦 Сколько времени занимает доставка?",
        "🛡️ Правила гарантии и возврата",
        "💳 Какие способы оплаты доступны?"
    ];

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
                    <div className="w-10 h-10 rounded-2xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center shrink-0 shadow-xs">
                        <Headset size={20} />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-sm font-bold text-[#111612] tracking-tight truncate leading-tight mb-0.5">
                            {language === 'uz' ? "Qo'llab-quvvatlash" : "Служба поддержки"}
                        </h1>
                        <p className="text-[11px] font-semibold text-[#2D6E3E] flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-[#2D6E3E] inline-block ring-2 ring-[#2D6E3E]/20 animate-pulse" />
                            Online
                        </p>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 no-scrollbar">
                {messages.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
                        <div className="w-20 h-20 rounded-[28px] bg-gradient-to-br from-[#EAF3EC] to-[#DBEADB] text-[#2D6E3E] flex items-center justify-center mb-4 shadow-sm">
                            <Headset size={36} />
                        </div>
                        <h2 className="text-lg font-bold tracking-tight text-[#111612] mb-1.5">
                            {language === 'uz' ? "Qanday yordam bera olamiz?" : "Чем мы можем помочь?"}
                        </h2>
                        <p className="text-xs text-[#737D75] leading-relaxed max-w-[280px] mb-6">
                            {language === 'uz' ? "Savol yoki taklifingiz bo'lsa yozing, operatorlarimiz tezda javob berishadi." : "Если у вас есть вопросы или пожелания, напишите нам, и операторы быстро ответят."}
                        </p>

                        {/* Quick Prompts */}
                        <div className="w-full flex flex-col gap-2">
                            {quickPrompts.map((prompt, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => {
                                        videoPreWarmer.triggerHaptic("selection");
                                        setInputText(prompt.replace(/^[^a-zA-Z0-9А-Яа-я]+/, '').trim());
                                    }}
                                    className="ios-tap-feedback active:scale-[0.98] transition-transform w-full text-left p-3 rounded-2xl bg-white/90 backdrop-blur-md border border-[rgba(15,20,16,0.06)] shadow-xs hover:border-[#2D6E3E]/30 text-xs font-semibold text-[#111612] flex items-center justify-between"
                                >
                                    <span>{prompt}</span>
                                    <span className="text-[#9AA29C] text-sm">➔</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = msg.senderId === user?.phone;
                        const hasMedia = msg.image || msg.video;
                        return (
                            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                                {!isMe && (
                                    <div className="w-8 h-8 rounded-xl bg-[#EAF3EC] text-[#2D6E3E] flex items-center justify-center shrink-0 mb-1 shadow-xs">
                                        <Headset size={14} />
                                    </div>
                                )}
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
                                            alt="Chat" 
                                            onClick={() => window.open(msg.image, '_blank')} 
                                        />
                                    )}
                                    {msg.video && (
                                        <video src={msg.video} className="w-full max-h-[280px] object-cover" controls playsInline muted />
                                    )}
                                    {(msg.text || !hasMedia) && (
                                        <div className="px-3.5 py-2.5">
                                            {msg.text && (
                                                <p className={`text-sm font-normal leading-relaxed mb-1 ${isMe ? "text-white" : "text-[#111612]"}`}>
                                                    {msg.text}
                                                </p>
                                            )}
                                            <p className={`text-[10px] font-medium ${isMe ? "text-white/70 text-right" : "text-[#9AA29C] text-left"}`}>
                                                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "•••"}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
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
                    <input type="file" ref={fileInputRef} onChange={handleFileSelect} accept="image/*,video/*" className="hidden" />
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
                            placeholder={language === 'uz' ? "Xabaringizni yozing..." : "Напишите сообщение..."}
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
