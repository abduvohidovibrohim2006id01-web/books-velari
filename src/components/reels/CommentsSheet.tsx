"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useStore } from "@/store/store";
import { X, MessageCircle, Loader2, Heart, Send } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface CommentsSheetProps {
    productId: string;
    onClose: () => void;
    language: "uz" | "ru";
    t: any;
}

export const CommentsSheet = ({ productId, onClose, language, t }: CommentsSheetProps) => {
    const { user, showToast } = useStore();
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [newComment, setNewComment] = useState("");
    const [isPosting, setIsPosting] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [mounted, setMounted] = useState(false);
    const sheetRef = useRef<HTMLDivElement>(null);
    const commentsListRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Drag to dismiss gesture with velocity tracking & Pointer Capture
    const dragStartY = useRef(0);
    const lastTouchY = useRef(0);
    const dragStartTime = useRef(0);
    const velocity = useRef(0);
    const currentTranslateY = useRef(0);
    const isDragging = useRef(false);

    // Non-passive touch listener to prevent pull-to-refresh
    useEffect(() => {
        const el = sheetRef.current;
        if (!el) return;
        const onNativeTouchMove = (e: TouchEvent) => {
            if (isDragging.current && e.cancelable) {
                e.preventDefault();
            }
        };
        el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
        return () => el.removeEventListener("touchmove", onNativeTouchMove);
    }, []);

    // Handle animated close
    const handleCloseWithAnimation = useCallback(() => {
        if (isClosing) return;
        setIsClosing(true);
        if (sheetRef.current) {
            sheetRef.current.style.transition = "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out";
            sheetRef.current.style.transform = "translate3d(0, 100%, 0)";
            sheetRef.current.style.opacity = "0";
        }
        setTimeout(() => {
            setIsClosing(false);
            onClose();
        }, 250);
    }, [isClosing, onClose]);

    // Pointer Events on Header / Drag Pill with Pointer Capture
    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const y = e.clientY;
        dragStartY.current = y;
        lastTouchY.current = y;
        dragStartTime.current = performance.now();
        velocity.current = 0;
        isDragging.current = true;
        if (sheetRef.current) {
            sheetRef.current.style.animation = "none";
            sheetRef.current.style.transition = "none";
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        const y = e.clientY;
        const delta = y - dragStartY.current;

        if (delta < 0) {
            if (sheetRef.current) sheetRef.current.style.transform = "translate3d(0, 0, 0)";
            currentTranslateY.current = 0;
            return;
        }

        const now = performance.now();
        const dt = Math.max(1, now - dragStartTime.current);
        const dy = y - lastTouchY.current;
        velocity.current = dy / dt;
        lastTouchY.current = y;
        dragStartTime.current = now;

        if (sheetRef.current) {
            currentTranslateY.current = delta;
            sheetRef.current.style.transform = `translate3d(0, ${delta}px, 0)`;
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
        isDragging.current = false;

        // Dismiss if dragged down > 80px OR flicked down with velocity > 0.45 px/ms
        if (currentTranslateY.current > 80 || velocity.current > 0.45) {
            videoPreWarmer.triggerHaptic("light");
            handleCloseWithAnimation();
        } else if (sheetRef.current) {
            sheetRef.current.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
            sheetRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        currentTranslateY.current = 0;
        velocity.current = 0;
    };

    const handleTouchStart = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (isDragging.current) return;
        if (commentsListRef.current && commentsListRef.current.scrollTop > 0) {
            return;
        }
        const y = e.touches[0].clientY;
        dragStartY.current = y;
        lastTouchY.current = y;
        dragStartTime.current = performance.now();
        velocity.current = 0;
        isDragging.current = true;
        if (sheetRef.current) {
            sheetRef.current.style.animation = "none";
            sheetRef.current.style.transition = "none";
        }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging.current) return;
        e.stopPropagation();
        const y = e.touches[0].clientY;
        const delta = y - dragStartY.current;

        if (delta < 0 || (commentsListRef.current && commentsListRef.current.scrollTop > 0)) {
            return;
        }

        const now = performance.now();
        const dt = Math.max(1, now - dragStartTime.current);
        const dy = y - lastTouchY.current;
        velocity.current = dy / dt;
        lastTouchY.current = y;
        dragStartTime.current = now;

        if (sheetRef.current) {
            currentTranslateY.current = delta;
            sheetRef.current.style.transform = `translate3d(0, ${delta}px, 0)`;
        }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        e.stopPropagation();
        if (!isDragging.current || !sheetRef.current) {
            isDragging.current = false;
            return;
        }
        isDragging.current = false;

        // Dismiss if dragged down > 80px OR swiped down with velocity > 0.45 px/ms
        if (currentTranslateY.current > 80 || velocity.current > 0.45) {
            videoPreWarmer.triggerHaptic("light");
            handleCloseWithAnimation();
        } else {
            sheetRef.current.style.transition = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1)";
            sheetRef.current.style.transform = "translate3d(0, 0, 0)";
        }
        currentTranslateY.current = 0;
        velocity.current = 0;
    };

    useEffect(() => {
        const fetchComments = async () => {
            try {
                const { data, error } = await supabase
                    .from("comments")
                    .select("*")
                    .eq("product_id", productId)
                    .order("created_at", { ascending: false });
                
                if (error) throw error;
                setComments(data.map(c => ({
                    id: c.id,
                    productId: c.product_id,
                    userId: c.user_id,
                    username: c.username,
                    text: c.text,
                    timestamp: c.created_at,
                    type: c.type
                })));
            } catch (error) {
                console.error("Error fetching comments:", error);
            } finally {
                setLoading(false);
            }
        };
        fetchComments();
    }, [productId]);

    const handleSubmit = async () => {
        if (!user) {
            showToast(language === 'uz' ? "Sharh yozish uchun tizimga kiring" : "Войдите, чтобы оставить комментарий", 'info');
            return;
        }
        if (!newComment.trim()) return;

        setIsPosting(true);
        try {
            const commentId = crypto.randomUUID();
            const commentData = {
                id: commentId,
                product_id: productId,
                user_id: user.phone,
                username: user.username || (language === 'uz' ? "Mijoz" : "Клиент"),
                text: newComment,
                type: 'review'
            };
            const { error } = await supabase.from("comments").insert([commentData]);
            if (error) throw error;

            setComments([{ 
                id: commentId, 
                productId: commentData.product_id,
                userId: commentData.user_id,
                username: commentData.username,
                text: commentData.text,
                timestamp: new Date().toISOString(),
                type: commentData.type 
            }, ...comments]);
            setNewComment("");
            showToast(t.common.confirm);
        } catch (error) {
            console.error("Error posting comment:", error);
        } finally {
            setIsPosting(false);
        }
    };

    if (!mounted) return null;

    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex flex-col justify-end pointer-events-auto"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            style={{ overscrollBehavior: "none" }}
        >
            <div
                className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-250 ease-out ${
                    isClosing ? "opacity-0" : "opacity-100 animate-in fade-in"
                }`}
                style={{ touchAction: "none" }}
                onClick={handleCloseWithAnimation}
            />
            <div
                ref={sheetRef}
                onClick={(e) => e.stopPropagation()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onTouchCancel={handleTouchEnd}
                style={{
                    willChange: "transform",
                    WebkitOverflowScrolling: "touch",
                    overscrollBehavior: "contain",
                    transition: isClosing ? "transform 250ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease-out" : undefined,
                    transform: isClosing ? "translate3d(0, 100%, 0)" : undefined,
                    animation: (!isClosing && !isDragging.current && currentTranslateY.current === 0)
                        ? "velari-sheet-up 320ms cubic-bezier(0.22, 1, 0.36, 1)"
                        : "none",
                }}
                className="relative bg-white text-[#111612] h-[70dvh] max-w-[500px] mx-auto w-full rounded-t-[32px] flex flex-col shadow-2xl overflow-hidden will-change-transform overscroll-contain"
            >
                {/* Drag pill handle & header (Dedicated Touch-Action None Drag Zone) */}
                <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    className="w-full shrink-0 select-none cursor-grab active:cursor-grabbing"
                    style={{ touchAction: "none" }}
                >
                    <div className="w-full flex items-center justify-center pt-3 pb-2">
                        <div className="w-11 h-1.5 bg-gray-200 rounded-full" />
                    </div>

                    <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between">
                        <h3 className="font-semibold text-[17px] text-[#111612] tracking-tight pointer-events-none">
                            {t.reels?.comments || "Sharhlar"}
                            <span className="ml-2 text-sm text-gray-400 font-normal">({comments.length})</span>
                        </h3>
                        <button
                            type="button"
                            onClick={handleCloseWithAnimation}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="w-10 h-10 flex items-center justify-center bg-gray-100/80 rounded-full text-gray-500 hover:text-black active:scale-90 transition-transform"
                            aria-label="Close"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                <div
                    ref={commentsListRef}
                    className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar"
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20">
                            <Loader2 size={32} className="animate-spin mb-4" />
                            <p className="text-xs font-bold uppercase tracking-widest">{t.common.loading}</p>
                        </div>
                    ) : comments.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-20 text-center">
                            <MessageCircle size={48} className="mb-4" />
                            <p className="text-xs font-bold uppercase tracking-widest">{t.reels?.noComments || "No comments yet"}</p>
                        </div>
                    ) : (
                        comments.map((comment) => (
                            <div key={comment.id} className="flex gap-4 group">
                                <div className="w-10 h-10 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center border border-gray-50 overflow-hidden shrink-0">
                                    <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center text-[10px] font-black uppercase text-gray-400">
                                        {comment.username?.charAt(0) || "U"}
                                    </div>
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-baseline justify-between mb-1">
                                        <span className="font-bold text-xs text-gray-900">{comment.username}</span>
                                        <span className="text-[10px] text-gray-400">
                                            {new Date(comment.timestamp).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed font-medium">{comment.text}</p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 bg-white border-t border-gray-100 pb-[max(20px,env(safe-area-inset-bottom))] shrink-0">
                    <div className="flex items-center gap-3 bg-gray-50 rounded-2xl p-2 px-4 group focus-within:ring-2 focus-within:ring-black/5 transition-colors">
                        <input
                            type="text"
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder={t.reels?.writeComment || "Write a comment..."}
                            className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-bold placeholder:text-gray-300 py-2 text-black"
                        />
                        <button
                            onClick={handleSubmit}
                            disabled={isPosting || !newComment.trim()}
                            className="p-2 rounded-xl disabled:opacity-20 transition-transform duration-150 active:scale-90 velari-green-btn"
                        >
                            {isPosting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
