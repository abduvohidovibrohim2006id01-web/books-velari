"use client";

import { useState } from "react";
import Link from "next/link";
import { Star, MessageSquare, Send, Reply, Pencil, Trash2, Smile, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { AppleEmoji } from "./AppleEmoji";
import { supabase } from "@/lib/supabase";

import { Product, User, Language, Comment } from "@/types";
import { TranslationType } from "@/lib/translations";
import { useRouter } from "next/navigation";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface ReviewsSectionProps {
    productId: string;
    product: Product | null;
    user: User | null;
    language: Language;
    t: TranslationType;
    comments: any[]; // Some fields in comments are still dynamic from DB
    fetchComments: () => void;
    showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
    router: ReturnType<typeof useRouter>;
}

export const ReviewsSection = ({
    productId, product, user, language, t, comments, fetchComments, showToast, router
}: ReviewsSectionProps) => {
    const [activeCommentTab, setActiveCommentTab] = useState<'review' | 'question'>('review');
    const [commentText, setCommentText] = useState("");
    const [commentRating, setCommentRating] = useState(5);
    const [replyTo, setReplyTo] = useState<any | null>(null);
    const [isPosting, setIsPosting] = useState(false);
    const [visibleCommentsCount, setVisibleCommentsCount] = useState(2);
    const [expandedCommentIds, setExpandedCommentIds] = useState<string[]>([]);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState("");
    const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
    const [commentToDelete, setCommentToDelete] = useState<string | null>(null);

    const EMOJIS = ["😂", "👍", "👎", "❤️", "🔥", "💯", "⚡", "🍌", "🏆", "💔"];

    const maskPhone = (phone: string) => {
        if (!phone) return "user";
        if (phone.length < 7) return phone;
        // e.g. +998901234567 -> +99890***4567
        return phone.slice(0, 7) + "***" + phone.slice(-4);
    };

    const submitComment = async () => {
        if (!user) { router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
        if (!user.username) {
            alert(language === 'uz' ? "Sharh qoldirish uchun profil sozlangan bo'lishi kerak (username kiritilmagan)" : "Для того чтобы оставить комментарий должен быть настроен профиль (не введено имя пользователя)");
            router.push(`/${language}/account`);
            return;
        }
        if (!commentText.trim()) return;

        setIsPosting(true);
        try {
            if (!replyTo && activeCommentTab === 'review' && !user.isAdmin) {
                const hasReview = comments.some(c => c.userId === (user.id || user.phone) && !c.parentId && c.type === 'review');
                if (hasReview) {
                    showToast(language === 'uz' ? "Siz ushbu mahsulotga allaqachon sharh qoldirgansiz" : "Вы уже оставили отзыв", 'error');
                    setIsPosting(false);
                    return;
                }
            }

            // Use secure API for comment insertion
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'insert',
                    p_user_phone: user.phone || user.id,
                    p_comment_data: {
                        product_id: productId,
                        username: user.username,
                        text: commentText,
                        type: replyTo ? replyTo.type : activeCommentTab,
                        parent_id: replyTo?.id || null,
                        is_admin: !!(user?.isAdmin || user?.phone === "ADMIN"),
                        rating: (!replyTo && activeCommentTab === 'review') ? commentRating : null,
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Xatolik yuz berdi");

            setCommentText("");
            setReplyTo(null);
            showToast(language === 'uz' ? "Muvaffaqiyatli yuborildi!" : "Успешно отправлено!");
            fetchComments();
        } catch (e: any) {
            console.error("Comment error:", e);
            showToast(e.message || t.common.error, 'error');
        } finally {
            setIsPosting(false);
        }
    };

    const handleUpdateComment = async (commentId: string) => {
        if (!user) { router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
        if (!editingText.trim()) return;
        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update',
                    p_user_phone: user.phone || user.id,
                    p_comment_id: commentId,
                    p_comment_data: { text: editingText }
                })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || "Xatolik");
            }
            
            setEditingCommentId(null);
            setEditingText("");
            showToast(language === 'uz' ? "Tahrirlandi!" : "Изменено!");
            fetchComments();
        } catch (e) {
            showToast(t.common.error, 'error');
        }
    };

    const confirmDelete = async () => {
        if (!user) { router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
        if (!commentToDelete) return;
        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'delete',
                    p_user_phone: user.phone || user.id,
                    p_comment_id: commentToDelete
                })
            });
            if (!response.ok) throw new Error("O'chirishda xatolik");
            showToast(language === 'uz' ? "O'chirildi!" : "Удалено!");
            fetchComments();
            setCommentToDelete(null);
        } catch (e) {
            showToast(t.common.error, 'error');
            setCommentToDelete(null);
        }
    };

    const handleReaction = async (commentId: string, emoji: string) => {
        if (!user) { router.push(`/${language}/login?redirect=${encodeURIComponent(window.location.pathname)}`); return; }
        const currentId = user.id || user.phone;
        const comment = comments.find(c => c.id === commentId);
        if (!comment) return;

        const currentReactions = { ...(comment.reactions || {}) };
        let existingEmoji: string | null = null;
        Object.entries(currentReactions).forEach(([e, users]: [string, any]) => {
            if (Array.isArray(users) && users.includes(currentId)) existingEmoji = e;
        });

        if (existingEmoji === emoji) {
            currentReactions[emoji] = currentReactions[emoji].filter((id: string) => id !== currentId);
            if (currentReactions[emoji].length === 0) delete currentReactions[emoji];
        } else {
            if (existingEmoji) {
                currentReactions[existingEmoji] = currentReactions[existingEmoji].filter((id: string) => id !== currentId);
                if (currentReactions[existingEmoji].length === 0) delete currentReactions[existingEmoji];
            }
            currentReactions[emoji] = [...(currentReactions[emoji] || []), currentId];
        }

        try {
            const response = await fetch('/api/comments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'react',
                    p_user_phone: currentId,
                    p_comment_id: commentId,
                    p_comment_data: { reactions: currentReactions }
                })
            });
            if (!response.ok) throw new Error("Reaksiyada xatolik");
            fetchComments();
            setActiveReactionPicker(null);
        } catch (e) { console.error(e); }
    };

    const GREEN = "#2D6E3E";

    return (
        <div className="mt-8 px-4 mb-20 text-black" style={{ background: "#FAFAF6" }}>
            <div className="flex border-b border-gray-100 mb-6">
                <button
                    onClick={() => {
                        videoPreWarmer.triggerHaptic("selection");
                        setActiveCommentTab('review');
                    }}
                    className={`ios-tap-feedback flex-1 py-4 text-xs font-black uppercase tracking-widest relative ${activeCommentTab === 'review' ? '' : 'text-gray-400'}`}
                    style={activeCommentTab === 'review' ? { color: GREEN } : {}}
                >
                    {language === 'uz' ? "Sharhlar" : "Отзывы"}
                    {activeCommentTab === 'review' && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: GREEN }} />}
                </button>
                <button
                    onClick={() => {
                        videoPreWarmer.triggerHaptic("selection");
                        setActiveCommentTab('question');
                    }}
                    className={`ios-tap-feedback flex-1 py-4 text-xs font-black uppercase tracking-widest relative ${activeCommentTab === 'question' ? '' : 'text-gray-400'}`}
                    style={activeCommentTab === 'question' ? { color: GREEN } : {}}
                >
                    {language === 'uz' ? "Savollar" : "Вопросы"}
                    {activeCommentTab === 'question' && <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: GREEN }} />}
                </button>
            </div>

            {user ? (
                <div id="comment-input" className="p-5 rounded-[24px] mb-8 shadow-sm" style={{ background: "#fff", border: "1px solid rgba(15,20,16,0.06)" }}>
                    {replyTo && (
                        <div className="flex items-center justify-between bg-white px-4 py-2 rounded-xl mb-4 text-[10px] italic">
                            <span className="text-gray-400">Replying to @{replyTo.username}</span>
                            <button onClick={() => { setReplyTo(null); setCommentText(""); }} className="text-red-500 font-bold uppercase">Cancel</button>
                        </div>
                    )}
                    {!replyTo && activeCommentTab === 'review' && (
                        <div className="flex items-center gap-4 mb-6 bg-white p-4 rounded-2xl border border-gray-50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{language === 'uz' ? 'Baholang:' : 'Оцените:'}</span>
                            <div className="flex gap-1">
                                {[1, 2, 3, 4, 5].map(star => (
                                    <button
                                        key={star}
                                        onClick={() => {
                                            videoPreWarmer.triggerHaptic("light");
                                            setCommentRating(star);
                                        }}
                                        className="ios-icon-tap active:scale-90 transition-transform duration-150"
                                    >
                                        <Star size={24} fill={commentRating >= star ? "#FBBF24" : "none"} className={commentRating >= star ? "text-yellow-400" : "text-gray-200"} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="relative">
                        <textarea
                            id="comment-textarea"
                            value={commentText}
                            onChange={(e) => setCommentText(e.target.value)}
                            placeholder={activeCommentTab === 'review' ? (language === 'uz' ? "Sharh qoldiring..." : "Оставить отзыв...") : (language === 'uz' ? "Savolingizni bering..." : "Задать вопрос...")}
                            className="w-full rounded-2xl p-4 pr-16 text-sm font-medium outline-none transition-colors duration-200 min-h-[100px] resize-none focus:bg-white focus:ring-2 focus:ring-[#2D6E3E]/20"
                            style={{ background: "#F5F5F0", border: "none" }}
                        />
                        <div className="absolute bottom-3 right-3 flex gap-2">
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    submitComment();
                                }}
                                className="ios-icon-tap active:scale-90 text-white p-3 rounded-xl shadow-lg transition-transform duration-150 disabled:opacity-50"
                                style={{ background: GREEN }}
                            >
                                {isPosting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <Link href="/login" className="block text-center p-8 rounded-[24px] border-2 border-dashed text-sm font-bold mb-8" style={{ background: "#fff", borderColor: "rgba(45,110,62,0.18)", color: GREEN }}>
                    {language === 'uz' ? "Sharh qoldirish uchun kiring" : "Войдите чтобы оставить отзыв"}
                </Link>
            )}

            <div className="space-y-8">
                {comments
                    .filter(c => c.type === activeCommentTab && !c.parentId)
                    .slice(0, visibleCommentsCount)
                    .map(comment => (
                        <div key={comment?.id} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center font-black text-xs shrink-0">
                                    {(comment?.username || comment?.userId || "?").charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-xs font-black italic flex items-center gap-2">
                                                @{comment?.username || maskPhone(comment?.userId || "user")} {comment?.isAdmin && <span className="bg-black text-white text-[8px] px-1.5 py-0.5 rounded uppercase not-italic tracking-tighter">Admin</span>}
                                            </h4>
                                        </div>
                                        <span className="text-[10px] text-gray-400 font-bold">
                                            {comment?.timestamp || comment?.created_at ? new Date(comment.timestamp || comment.created_at).toLocaleDateString() : ""}
                                        </span>
                                    </div>
                                    {comment?.rating && (
                                        <div className="flex text-yellow-400 mb-2">
                                            {[...Array(Number(comment.rating || 0))].map((_, i) => <Star key={i} size={10} fill="currentColor" />)}
                                        </div>
                                    )}
                                    <p className="text-sm text-gray-600 font-medium leading-relaxed mb-4">{comment?.text || comment?.content || ""}</p>
                                    
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => { setReplyTo(comment); setCommentText(`@${comment.username} `); document.getElementById('comment-textarea')?.focus(); }} className="text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-black flex items-center gap-1"><Reply size={12} /> Javob berish</button>
                                        {user && (user.id === comment.userId || user.phone === comment.userId || user.isAdmin) && (
                                            <div className="flex items-center gap-3">
                                                <button onClick={() => { setEditingCommentId(comment.id); setEditingText(comment.text); }} className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-600 flex items-center gap-1"><Pencil size={12} /> Tahrirlash</button>
                                                <button onClick={() => setCommentToDelete(comment.id)} className="text-[10px] font-black uppercase tracking-widest text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={12} /> O'chirish</button>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => {
                                                videoPreWarmer.triggerHaptic("light");
                                                setActiveReactionPicker(activeReactionPicker === comment.id ? null : comment.id);
                                            }}
                                            className="ios-icon-tap active:scale-90 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-black flex items-center gap-1 ml-auto transition-transform duration-150"
                                        >
                                            <Smile size={12} />
                                        </button>
                                    </div>

                                    {activeReactionPicker === comment.id && (
                                        <div className="mt-4 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] rounded-[24px] p-2 border border-gray-100 animate-in fade-in zoom-in-90 slide-in-from-top-4 duration-300 z-50 w-full max-w-[320px]">
                                            <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-1 px-1 overscroll-x-contain touch-pan-x">
                                                {EMOJIS.map(emoji => (
                                                    <button
                                                        key={emoji}
                                                        onClick={() => {
                                                            videoPreWarmer.triggerHaptic("light");
                                                            handleReaction(comment.id, emoji);
                                                        }}
                                                        className="ios-icon-tap hover:scale-110 active:scale-90 transition-transform duration-150 flex items-center justify-center shrink-0"
                                                    >
                                                        <AppleEmoji emoji={emoji} size={30} />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {comment.reactions && Object.keys(comment.reactions).length > 0 && (
                                        <div className="flex flex-wrap gap-3 mt-4">
                                            {Object.entries(comment.reactions).map(([emoji, users]: [string, any]) => (
                                                <button
                                                    key={emoji}
                                                    onClick={() => {
                                                        videoPreWarmer.triggerHaptic("light");
                                                        handleReaction(comment.id, emoji);
                                                    }}
                                                    className={`ios-tap-feedback flex items-center gap-1.5 transition-transform duration-150 active:scale-90 ${users.includes(user?.id || user?.phone || "") ? "opacity-100 scale-105" : "opacity-60"}`}
                                                >
                                                    <AppleEmoji emoji={emoji} size={22} />
                                                    <span className="text-xs font-black text-gray-500">{users.length}</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}

                                    {editingCommentId === comment.id && (
                                        <div className="mt-4 bg-white p-4 rounded-2xl border-2 border-blue-100">
                                            <textarea value={editingText} onChange={(e) => setEditingText(e.target.value)} className="w-full text-sm font-medium outline-none resize-none min-h-[80px]" autoFocus />
                                            <div className="flex justify-end gap-2 mt-2">
                                                <button onClick={() => setEditingCommentId(null)} className="px-4 py-2 text-[10px] font-black uppercase text-gray-400">Bekor qilish</button>
                                                <button
                                                    onClick={() => {
                                                        videoPreWarmer.triggerHaptic("medium");
                                                        handleUpdateComment(comment.id);
                                                    }}
                                                    className="ios-tap-feedback active:scale-95 px-6 py-2 text-white rounded-xl text-[10px] font-black uppercase shadow-lg transition-transform duration-150"
                                                    style={{ background: GREEN }}
                                                >
                                                    Saqlash
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Replies List */}
                                    <div className="mt-4 space-y-4">
                                        {comments.filter(r => r.parentId === comment.id).map(reply => (
                                            <div key={reply.id} className="ml-8 pt-4 border-l-2 border-gray-50 pl-6">
                                                <div className="flex items-center gap-2 mb-1"><h4 className="text-[11px] font-black italic">@{reply.username || maskPhone(reply.userId || "user")}</h4><span className="text-[9px] text-gray-400 font-bold ml-auto">{new Date(reply.timestamp).toLocaleDateString()}</span></div>
                                                <p className="text-sm text-gray-500 font-medium">{reply.text}</p>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <button onClick={() => { setReplyTo(comment); setCommentText(`@${reply.username} `); document.getElementById('comment-textarea')?.focus(); }} className="text-[9px] font-black uppercase text-gray-300">Javob berish</button>
                                                    {user && (user.id === reply.userId || user.phone === reply.userId || user.isAdmin) && (
                                                        <button onClick={() => setCommentToDelete(reply.id)} className="text-[9px] font-black uppercase text-red-300">O'chirish</button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}

                {comments.filter(c => c.type === activeCommentTab && !c.parentId).length > visibleCommentsCount && (
                    <button
                        onClick={() => {
                            videoPreWarmer.triggerHaptic("light");
                            setVisibleCommentsCount(prev => prev + 5);
                        }}
                        className="ios-tap-feedback active:scale-[0.98] w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-transform duration-150 flex items-center justify-center gap-2"
                        style={{ background: "#EAF3EC", color: GREEN }}
                    >
                        <ChevronDown size={14} strokeWidth={3} /> {language === 'uz' ? "Ko'proq ko'rish" : "Показать ещё"}
                    </button>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {commentToDelete && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center px-6">
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-md" onClick={() => setCommentToDelete(null)} />
                    <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl relative">
                        <Trash2 size={32} className="text-red-500 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-center mb-8">{language === 'uz' ? "Sharhni o'chirish" : "Удалить комментарий"}</h3>
                        <div className="flex flex-col gap-3">
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("medium");
                                    confirmDelete();
                                }}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-4 bg-red-500 text-white rounded-2xl font-black uppercase transition-transform duration-150"
                            >
                                O'chirish
                            </button>
                            <button
                                onClick={() => {
                                    videoPreWarmer.triggerHaptic("light");
                                    setCommentToDelete(null);
                                }}
                                className="ios-tap-feedback active:scale-[0.98] w-full py-4 bg-gray-50 text-gray-400 rounded-2xl font-black uppercase transition-transform duration-150"
                            >
                                Bekor qilish
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
