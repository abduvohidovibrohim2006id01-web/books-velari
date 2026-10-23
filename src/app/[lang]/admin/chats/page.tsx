"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { adminSelect, adminInsert, adminUpdate, adminDelete } from "@/lib/admin-api";
import { MessageSquare, Users, Star, Trash2, Reply, Send, CheckCircle2, Search, Headphones, AlertCircle, Loader2, ChevronRight, Paperclip, ChevronLeft, Image as ImageIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
const { uploadToYandexS3 } = require("@/lib/yandex-s3");

export default function AdminChatPage() {
    const [activeTab, setActiveTab] = useState<'support' | 'comments'>('support');
    const [supportChats, setSupportChats] = useState<any[]>([]);
    const [comments, setComments] = useState<any[]>([]);
    const [selectedChat, setSelectedChat] = useState<any | null>(null);
    const [messages, setMessages] = useState<any[]>([]);
    const [replyText, setReplyText] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [moderationType, setModerationType] = useState<'all' | 'review' | 'question'>('all');

    // Media Upload Support
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const fileInputRef = require("react").useRef(null);

    const fetchData = async () => {
        try {
            const [chatsData, commentsData] = await Promise.all([
                adminSelect<any[]>("support_chats", { orderBy: { column: "last_timestamp", ascending: false }, limit: 100 }),
                adminSelect<any[]>("comments", { orderBy: { column: "created_at", ascending: false }, limit: 100 })
            ]);

            setSupportChats((chatsData || []).map(c => ({
                id: c.id,
                username: c.username,
                lastMessage: c.last_message,
                lastTimestamp: c.last_timestamp,
                unreadByAdmin: c.unread_by_admin
            })));

            setComments((commentsData || []).map(c => ({
                id: c.id,
                username: c.username,
                text: c.text,
                timestamp: c.created_at,
                type: c.type,
                productId: c.product_id,
                rating: c.rating,
                media: c.reactions?.media || []
            })));
        } catch (error) {
            console.error("Fetch chats error:", error);
        }
    };

    useEffect(() => {
        fetchData();
        
        // Subscribe to changes
        const chatSub = supabase.channel('support_chats_all')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'support_chats' }, () => fetchData())
            .subscribe();
        
        const commentSub = supabase.channel('comments_all')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, () => fetchData())
            .subscribe();

        return () => {
            supabase.removeChannel(chatSub);
            supabase.removeChannel(commentSub);
        };
    }, []);

    const fetchMessages = async (chatId: string) => {
        try {
            const data = await adminSelect<any[]>("support_messages", {
                match: { column: "chat_id", value: chatId },
                orderBy: { column: "created_at", ascending: true },
            });

            setMessages((data || []).map(m => ({
                id: m.id,
                text: m.text,
                image: m.image,
                video: m.video,
                sender: m.sender_type,
                timestamp: { toDate: () => new Date(m.created_at) }
            })));

            // Mark as read
            await adminUpdate("support_chats", { unread_by_admin: 0 }, { column: "id", value: chatId });
        } catch (error) {
            console.error("Fetch messages error:", error);
        }
    };

    useEffect(() => {
        if (selectedChat) {
            fetchMessages(selectedChat.id);

            const msgSub = supabase.channel(`messages_${selectedChat.id}`)
                .on('postgres_changes', { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'support_messages',
                    filter: `chat_id=eq.${selectedChat.id}`
                }, () => fetchMessages(selectedChat.id))
                .subscribe();

            return () => {
                supabase.removeChannel(msgSub);
            };
        }
    }, [selectedChat]);

    const handleFileSelect = (e: any) => {
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

    const handleSendReply = async () => {
        if ((!replyText.trim() && !selectedFile) || !selectedChat || isSending) return;
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


            const messageId = crypto.randomUUID();
            await adminInsert("support_messages", [{
                id: messageId,
                chat_id: selectedChat.id,
                text: replyText,
                image: fileType === 'image' ? uploadedUrl : null,
                video: fileType === 'video' ? uploadedUrl : null,
                sender_type: "admin",
            }]);

            const lastMsgText = uploadedUrl ? (fileType === 'image' ? "🖼️ Rasm" : "🎥 Video") : replyText;
            await adminUpdate("support_chats", {
                last_message: lastMsgText,
                last_timestamp: new Date().toISOString(),
                unread_by_admin: 0
            }, { column: "id", value: selectedChat.id });

            setReplyText("");
            setSelectedFile(null);
            setMediaPreview(null);
            fetchMessages(selectedChat.id);
            fetchData();
        } catch (e) {
            console.error(e);
        } finally {
            setIsSending(false);
            setIsUploadingMedia(false);
        }
    };

    const deleteComment = async (id: string) => {
        if (confirm("Ushbu sharhni o'chirishni tasdiqlaysizmi?")) {
            try {
                await adminDelete("comments", { column: "id", value: id });
                fetchData();
            } catch (error) {
                console.error("Delete comment error:", error);
            }
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
            {/* Admin Header */}
            <div className="bg-white px-8 py-6 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center shadow-2xl">
                        <MessageSquare size={24} />
                    </div>
                    <div>
                        <h1 className="text-xl font-black italic tracking-tighter uppercase">Communications Hub</h1>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">User interactions & Support</p>
                    </div>
                </div>

                <div className="flex bg-gray-100 p-1.5 rounded-2xl gap-1">
                    <button
                        onClick={() => setActiveTab('support')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'support' ? 'bg-black text-white shadow-xl' : 'text-gray-400 hover:text-black'}`}
                    >
                        <Headphones size={14} /> Support {supportChats.some(c => c.unreadByAdmin > 0) && <span className="w-2 h-2 bg-red-500 rounded-full"></span>}
                    </button>
                    <button
                        onClick={() => setActiveTab('comments')}
                        className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === 'comments' ? 'bg-black text-white shadow-xl' : 'text-gray-400 hover:text-black'}`}
                    >
                        <AlertCircle size={14} /> Moderation
                    </button>
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {activeTab === 'support' && (
                    <>
                        {/* Users List */}
                        <div className="w-1/3 bg-white border-r border-gray-100 flex flex-col">
                            <div className="p-6">
                                <div className="relative">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={16} />
                                    <input
                                        type="text"
                                        placeholder="Search users..."
                                        className="w-full bg-gray-50 border-none rounded-xl py-3 pl-12 pr-4 text-xs font-bold outline-none focus:ring-2 focus:ring-black/5"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
                                {supportChats.filter(c => c.username?.toLowerCase().includes(searchQuery.toLowerCase())).map(chat => (
                                    <button
                                        key={chat.id}
                                        onClick={() => setSelectedChat(chat)}
                                        className={`w-full p-4 rounded-2xl flex items-center gap-4 transition-all group ${selectedChat?.id === chat.id ? 'bg-black text-white shadow-2xl' : 'hover:bg-gray-50'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${selectedChat?.id === chat.id ? 'bg-white/10 border border-white/10' : 'bg-gray-100 text-gray-500'}`}>
                                            {chat.username?.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 text-left min-w-0">
                                            <div className="flex items-center justify-between mb-1">
                                                <h4 className="font-black italic text-sm truncate uppercase tracking-tighter">@{chat.username}</h4>
                                                {chat.unreadByAdmin > 0 && <span className="w-2 h-2 bg-red-500 rounded-full shadow-lg shadow-red-500/20"></span>}
                                            </div>
                                            <p className={`text-[10px] font-bold truncate ${selectedChat?.id === chat.id ? 'text-white/60' : 'text-gray-400'}`}>
                                                {chat.lastMessage || "No messages yet"}
                                            </p>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Chat Context */}
                        <div className="flex-1 flex flex-col bg-gray-50/50">
                            {selectedChat ? (
                                <>
                                    <div className="p-6 bg-white border-b border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-black text-white rounded-xl flex items-center justify-center">
                                                <Users size={20} />
                                            </div>
                                            <div>
                                                <h3 className="text-sm font-black italic uppercase tracking-tighter">Active with @{selectedChat.username}</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{selectedChat.userId}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex-1 overflow-y-auto p-8 space-y-6">
                                        {messages.map(msg => (
                                            <div key={msg.id} className={`flex ${msg.sender === "admin" ? "justify-end" : "justify-start"}`}>
                                                <div className={`max-w-[85%] rounded-[24px] overflow-hidden shadow-sm transition-all ${msg.sender === "admin"
                                                    ? "rounded-br-none"
                                                    : "rounded-bl-none border border-gray-100 shadow-sm"}`}>

                                                    <div className="relative">
                                                        {msg.image && (
                                                            <img src={msg.image} className="w-full max-h-[400px] object-cover cursor-pointer hover:opacity-95 transition-all" alt="Media" onClick={() => window.open(msg.image, '_blank')} />
                                                        )}
                                                        {msg.video && (
                                                            <video src={msg.video} className="w-full max-h-[400px] object-cover" controls playsInline muted />
                                                        )}

                                                        {(msg.image || msg.video) && !msg.text && (
                                                            <div className="absolute bottom-2 right-2 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-lg">
                                                                <p className="text-[9px] font-bold text-white uppercase tracking-widest opacity-80">
                                                                    {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "..."}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {(msg.text || (!msg.image && !msg.video)) && (
                                                        <div className={`p-4 px-6 ${msg.sender === "admin" ? "bg-black text-white" : "bg-white text-gray-800"}`}>
                                                            {msg.text && <p className="text-sm font-medium leading-relaxed mb-1">{msg.text}</p>}
                                                            <span className={`text-[8px] font-black uppercase tracking-widest opacity-40 block text-right mt-1 ${msg.sender === "admin" ? "text-white/60" : "text-gray-400"}`}>
                                                                {msg.timestamp?.toDate ? msg.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Hozirgina"}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="p-6 bg-white border-t border-gray-100">
                                        {mediaPreview && (
                                            <div className="mb-4 relative w-32 aspect-video group shadow-xl">
                                                {selectedFile?.type.startsWith('video/') ? (
                                                    <video src={mediaPreview} className="w-full h-full object-cover rounded-xl border border-gray-200" muted />
                                                ) : (
                                                    <img src={mediaPreview} className="w-full h-full object-cover rounded-xl border border-gray-200" alt="Preview" />
                                                )}
                                                <button
                                                    onClick={() => { setSelectedFile(null); setMediaPreview(null); }}
                                                    className="absolute -top-3 -right-3 bg-black text-white rounded-full p-1.5 shadow-2zl active:scale-90 border-2 border-white hover:bg-gray-800 transition-colors"
                                                >
                                                    <ChevronLeft size={16} className="rotate-45" />
                                                </button>
                                                {isUploadingMedia && (
                                                    <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center">
                                                        <Loader2 size={24} className="animate-spin text-white" />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        <div className="flex gap-3 relative">
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                onChange={handleFileSelect}
                                                accept="image/*,video/*"
                                                className="hidden"
                                            />
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-14 h-14 bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center hover:bg-black hover:text-white transition-all active:scale-95 shadow-sm"
                                            >
                                                <Paperclip size={20} />
                                            </button>
                                            <input
                                                type="text"
                                                value={replyText}
                                                onChange={(e) => setReplyText(e.target.value)}
                                                onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                                                placeholder="Type your reply..."
                                                className="flex-1 bg-gray-50 border-none rounded-2xl px-6 py-4 text-sm font-bold focus:ring-2 focus:ring-black/5 outline-none"
                                            />
                                            <button
                                                onClick={handleSendReply}
                                                disabled={(!replyText.trim() && !selectedFile) || isSending}
                                                className="bg-black text-white px-8 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                {isSending ? <Loader2 className="animate-spin" /> : "Send"}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex flex-col items-center justify-center text-gray-300 opacity-50">
                                    <MessageSquare size={64} strokeWidth={1} className="mb-4" />
                                    <p className="font-black uppercase tracking-widest text-xs italic">Select a conversation to start</p>
                                </div>
                            )}
                        </div>
                    </>
                )}

                {activeTab === 'comments' && (
                    <div className="flex-1 overflow-y-auto p-8 bg-white">
                        <div className="max-w-4xl mx-auto space-y-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 border-b-4 border-black pb-4">
                                <h1 className="text-2xl font-black italic tracking-tighter uppercase">Product Moderation</h1>

                                <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                                    {(['all', 'review', 'question'] as const).map((type) => (
                                        <button
                                            key={type}
                                            onClick={() => setModerationType(type)}
                                            className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${moderationType === type ? 'bg-black text-white shadow-sm' : 'text-gray-400 hover:text-black'}`}
                                        >
                                            {type === 'all' ? 'Barchasi' : type === 'review' ? 'Sharhlar' : 'Savollar'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {comments.filter(c => moderationType === 'all' || c.type === moderationType).length === 0 ? (
                                <div className="text-center py-20 bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-100 grayscale">
                                    <AlertCircle size={48} className="mx-auto text-gray-300 mb-4" />
                                    <p className="text-xs font-black uppercase tracking-widest text-gray-400">Hech narsa topilmadi</p>
                                </div>
                            ) : (
                                comments.filter(c => moderationType === 'all' || c.type === moderationType).map(comment => (
                                    <div key={comment.id} className="bg-white border border-gray-100 p-8 rounded-[40px] shadow-sm hover:shadow-xl transition-all group">
                                        <div className="flex items-start justify-between mb-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center font-black text-sm border border-gray-100">
                                                    {comment.username?.charAt(0).toUpperCase()}
                                                </div>
                                                <div>
                                                    <h4 className="font-black italic uppercase tracking-tighter">@{comment.username}</h4>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{new Date(comment.timestamp).toLocaleString()}</p>
                                                </div>
                                                <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${comment.type === 'review' ? 'bg-green-50 text-green-600' : 'bg-blue-50 text-blue-600'}`}>
                                                    {comment.type}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => deleteComment(comment.id)}
                                                className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                                            >
                                                <Trash2 size={20} />
                                            </button>
                                        </div>

                                        <p className="text-sm font-medium text-gray-700 leading-relaxed mb-6 bg-gray-50 p-6 rounded-3xl border border-gray-50 italic">
                                            "{comment.text}"
                                        </p>

                                        {comment.media && comment.media.length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar">
                                                {comment.media.map((url: string, i: number) => (
                                                    <div key={i} className="min-w-[150px] aspect-square rounded-2xl overflow-hidden border border-gray-100">
                                                        <Image src={url} alt="Media" width={150} height={150} className="w-full h-full object-cover" />
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4 text-xs font-black text-gray-400 italic">
                                                <span>Product ID: {comment.productId}</span>
                                                <ChevronRight size={14} />
                                                <Link href={`/products/${comment.productId}`} target="_blank" className="text-black underline underline-offset-4">Context</Link>
                                            </div>

                                            {comment.rating && (
                                                <div className="flex text-yellow-400 gap-0.5">
                                                    {[...Array(comment.rating)].map((_, i) => <Star key={i} size={14} fill="currentColor" />)}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
