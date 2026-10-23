"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { X, Camera, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { Product } from "@/types";

interface VisualSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    imagePreview: string | null;
    isAnalyzing: boolean;
    results?: Product[];
    language: "uz" | "ru";
    onChangePhoto?: () => void;
    onSelectTag?: (tag: string) => void;
    onCropSearch?: (croppedBase64: string) => void;
    onViewResults?: () => void;
}

export default function VisualSearchModal({
    isOpen,
    onClose,
    imagePreview,
    isAnalyzing,
    results = [],
    language,
    onChangePhoto,
    onCropSearch,
    onViewResults
}: VisualSearchModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Modal yuqoriga yig'ilgan (collapsed) yoki to'liq ochiq (expanded) holati
    const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
    const prevAnalyzingRef = useRef<boolean>(isAnalyzing);
    const initialCollapseDone = useRef<boolean>(false);

    // Google Lens Crop Box (foizlarda: 0 - 100)
    const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
        x: 4,
        y: 4,
        width: 92,
        height: 92
    });
    const [isDraggingBox, setIsDraggingBox] = useState<boolean>(false);

    const dragInfo = useRef<{
        handle: 'move' | 'nw' | 'ne' | 'se' | 'sw' | null;
        startX: number;
        startY: number;
        initialBox: { x: number; y: number; width: number; height: number };
        hasMoved: boolean;
    }>({
        handle: null,
        startX: 0,
        startY: 0,
        initialBox: { x: 4, y: 4, width: 92, height: 92 },
        hasMoved: false
    });

    const touchStartY = useRef<number>(0);

    // Escape tugmasi bilan butunlay yopish
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        if (isOpen) {
            window.addEventListener("keydown", handleKeyDown);
        }
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose]);

    // Oyna ochiq bo'lganda scrollni boshqarish:
    // Faqat to'liq ochiq (expanded) bo'lganda scroll bloklanadi;
    // Tepaga yig'ilganda (collapsed) foydalanuvchi pastdagi mahsulotlarni bemalol ko'ra oladi.
    useEffect(() => {
        if (isOpen && !isCollapsed) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen, isCollapsed]);

    // Yangi rasm kelganda holatlarni reset qilish
    useEffect(() => {
        if (!imagePreview) return;
        setCropBox({ x: 4, y: 4, width: 92, height: 92 });
        setIsCollapsed(false);
        initialCollapseDone.current = false;
    }, [imagePreview]);

    // Modal yopilganda qayta ochilish uchun reset
    useEffect(() => {
        if (!isOpen) {
            setIsCollapsed(false);
            initialCollapseDone.current = false;
        }
    }, [isOpen]);

    // NATIJA BO'LISHI BILAN AVTOMATIK TEPAGA SURILISH:
    // Qidiruv tahlili yakunlanib natijalar topilganda modal avtomatik tepaga yig'iladi
    useEffect(() => {
        if (prevAnalyzingRef.current && !isAnalyzing && results && results.length > 0) {
            const timer = setTimeout(() => {
                setIsCollapsed(true);
            }, 350);
            return () => clearTimeout(timer);
        }
        prevAnalyzingRef.current = isAnalyzing;
    }, [isAnalyzing, results]);

    // Boshlang'ich yuklanganda allaqachon natijalar mavjud bo'lsa
    useEffect(() => {
        if (isOpen && !isAnalyzing && results && results.length > 0 && !initialCollapseDone.current) {
            initialCollapseDone.current = true;
            const timer = setTimeout(() => {
                setIsCollapsed(true);
            }, 350);
            return () => clearTimeout(timer);
        }
    }, [isOpen, isAnalyzing, results]);

    // Tanlangan qutini kesib (crop) qidiruvga yuborish
    const triggerCropSearch = useCallback((box: { x: number; y: number; width: number; height: number }) => {
        if (!imagePreview || !onCropSearch) return;

        // Agar butun rasmni qamragan bo'lsa (>90%), to'g'ridan-to'g'ri yuborish
        if (box.width >= 90 && box.height >= 90 && box.x <= 5 && box.y <= 5) {
            onCropSearch(imagePreview);
            return;
        }

        const img = new window.Image();
        img.onload = () => {
            try {
                const canvas = document.createElement("canvas");
                const cropX = Math.round((box.x / 100) * img.naturalWidth);
                const cropY = Math.round((box.y / 100) * img.naturalHeight);
                const cropW = Math.round((box.width / 100) * img.naturalWidth);
                const cropH = Math.round((box.height / 100) * img.naturalHeight);

                if (cropW < 10 || cropH < 10) return;

                const maxDim = 1024;
                let targetW = cropW;
                let targetH = cropH;
                if (targetW > maxDim || targetH > maxDim) {
                    if (targetW > targetH) {
                        targetH = Math.round((targetH * maxDim) / targetW);
                        targetW = maxDim;
                    } else {
                        targetW = Math.round((targetW * maxDim) / targetH);
                        targetH = maxDim;
                    }
                }

                canvas.width = targetW;
                canvas.height = targetH;
                const ctx = canvas.getContext("2d");
                if (!ctx) return;
                ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
                const croppedBase64 = canvas.toDataURL("image/jpeg", 0.85);
                onCropSearch(croppedBase64);
            } catch (err) {
                console.error("Visual crop canvas error:", err);
            }
        };
        img.src = imagePreview;
    }, [imagePreview, onCropSearch]);

    // Pointer (Touch / Mouse) surish boshlanishi
    const handlePointerDown = (handle: 'move' | 'nw' | 'ne' | 'se' | 'sw', e: React.PointerEvent) => {
        e.stopPropagation();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        dragInfo.current = {
            handle,
            startX: e.clientX,
            startY: e.clientY,
            initialBox: { ...cropBox },
            hasMoved: false
        };
        setIsDraggingBox(true);
    };

    // Pointer surilishi (Crop box yoki burchaklarni o'zgartirish)
    const handlePointerMove = (e: React.PointerEvent) => {
        const { handle, startX, startY, initialBox } = dragInfo.current;
        if (!handle || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        const deltaX = ((e.clientX - startX) / rect.width) * 100;
        const deltaY = ((e.clientY - startY) / rect.height) * 100;

        if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
            dragInfo.current.hasMoved = true;
        }

        const minSize = 16; // minimal 16% o'lcham

        if (handle === 'move') {
            const maxX = 100 - initialBox.width;
            const maxY = 100 - initialBox.height;
            const newX = Math.max(0, Math.min(maxX, initialBox.x + deltaX));
            const newY = Math.max(0, Math.min(maxY, initialBox.y + deltaY));
            setCropBox(prev => ({ ...prev, x: newX, y: newY }));
        } else if (handle === 'se') {
            const maxW = 100 - initialBox.x;
            const maxH = 100 - initialBox.y;
            const newW = Math.max(minSize, Math.min(maxW, initialBox.width + deltaX));
            const newH = Math.max(minSize, Math.min(maxH, initialBox.height + deltaY));
            setCropBox(prev => ({ ...prev, width: newW, height: newH }));
        } else if (handle === 'nw') {
            const maxDeltaX = initialBox.width - minSize;
            const maxDeltaY = initialBox.height - minSize;
            const clampedDeltaX = Math.max(-initialBox.x, Math.min(maxDeltaX, deltaX));
            const clampedDeltaY = Math.max(-initialBox.y, Math.min(maxDeltaY, deltaY));
            setCropBox({
                x: initialBox.x + clampedDeltaX,
                y: initialBox.y + clampedDeltaY,
                width: initialBox.width - clampedDeltaX,
                height: initialBox.height - clampedDeltaY
            });
        } else if (handle === 'ne') {
            const maxDeltaY = initialBox.height - minSize;
            const clampedDeltaY = Math.max(-initialBox.y, Math.min(maxDeltaY, deltaY));
            const maxW = 100 - initialBox.x;
            const newW = Math.max(minSize, Math.min(maxW, initialBox.width + deltaX));
            setCropBox({
                x: initialBox.x,
                y: initialBox.y + clampedDeltaY,
                width: newW,
                height: initialBox.height - clampedDeltaY
            });
        } else if (handle === 'sw') {
            const maxDeltaX = initialBox.width - minSize;
            const clampedDeltaX = Math.max(-initialBox.x, Math.min(maxDeltaX, deltaX));
            const maxH = 100 - initialBox.y;
            const newH = Math.max(minSize, Math.min(maxH, initialBox.height + deltaY));
            setCropBox({
                x: initialBox.x + clampedDeltaX,
                y: initialBox.y,
                width: initialBox.width - clampedDeltaX,
                height: newH
            });
        }
    };

    // Qo'l / Sichqoncha ko'tarilganda qidiruvni ishga tushirish
    const handlePointerUp = (e: React.PointerEvent) => {
        try {
            (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {}
        const hadMovement = dragInfo.current.hasMoved;
        dragInfo.current.handle = null;
        setIsDraggingBox(false);

        if (hadMovement) {
            triggerCropSearch(cropBox);
        }
    };

    // Rasm ustiga bosilganda o'sha ob'yektga avtomatik fokus qilish (Tap to focus)
    const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current || isDraggingBox || dragInfo.current.hasMoved) return;
        const rect = containerRef.current.getBoundingClientRect();
        const clickX = ((e.clientX - rect.left) / rect.width) * 100;
        const clickY = ((e.clientY - rect.top) / rect.height) * 100;

        const boxSize = 48;
        const newX = Math.max(0, Math.min(100 - boxSize, clickX - boxSize / 2));
        const newY = Math.max(0, Math.min(100 - boxSize, clickY - boxSize / 2));
        const newBox = { x: newX, y: newY, width: boxSize, height: boxSize };
        setCropBox(newBox);
        triggerCropSearch(newBox);
    };

    // Pastki tasmada surish (Touch swipe up/down)
    const onHandleTouchStart = (e: React.TouchEvent) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const onHandleTouchEnd = (e: React.TouchEvent) => {
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
        if (isCollapsed && deltaY > 20) {
            setIsCollapsed(false);
        } else if (!isCollapsed && deltaY < -20) {
            setIsCollapsed(true);
        }
    };

    if (!isOpen) return null;

    const isUz = language === "uz";

    return (
        <div className="fixed top-0 left-0 right-0 z-[140] pointer-events-none flex flex-col items-center">
            {/* Orqa qorong'i backdrop (faqat oyna to'liq ochiq bo'lganda ko'rinadi) */}
            <div 
                className={`fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 z-[139] ${
                    !isCollapsed ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
                }`}
                onClick={() => setIsCollapsed(true)}
            />

            {/* Tepadan pastga tushuvchi ixcham Google Lens oynasi */}
            <div 
                ref={modalRef}
                style={{
                    transform: isCollapsed ? 'translateY(calc(-100% + 46px))' : 'translateY(0)',
                    transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)'
                }}
                className="pointer-events-auto relative w-full max-w-md mx-auto bg-white text-[#111612] rounded-b-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden border-b border-black/10 z-[140] will-change-transform"
            >
                {/* 1. Rasm va Google Lens Ob'yekt tanlash ramkasi */}
                <div className="p-3 sm:p-4 flex flex-col items-center bg-[#FBFBFB] select-none">
                    <div 
                        ref={containerRef}
                        onClick={handleContainerClick}
                        className="relative inline-flex max-w-full rounded-2xl overflow-hidden bg-black/5 border border-gray-200 shadow-md select-none cursor-crosshair touch-none mx-auto"
                    >
                        {imagePreview ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={imagePreview}
                                alt="Lens"
                                className="block max-h-[280px] sm:max-h-[320px] max-w-full w-auto h-auto pointer-events-none select-none"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center text-gray-400 gap-2 p-12">
                                <Camera size={28} />
                                <span className="text-xs">{isUz ? "Rasm yo'q" : "Нет фото"}</span>
                            </div>
                        )}

                        {/* X tugmasi - rasmni o'ng burchagida */}
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                            }}
                            className="absolute top-2.5 right-2.5 z-40 w-8 h-8 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center shadow-lg backdrop-blur-md transition-transform active:scale-90"
                            aria-label="Yopish"
                            title={isUz ? "Yopish" : "Закрыть"}
                        >
                            <X size={17} />
                        </button>

                        {/* Google Lens interaktiv ob'yekt tanlash ramkasi (Crop Box) */}
                        {imagePreview && (
                            <div
                                style={{
                                    left: `${cropBox.x}%`,
                                    top: `${cropBox.y}%`,
                                    width: `${cropBox.width}%`,
                                    height: `${cropBox.height}%`,
                                    boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.45)"
                                }}
                                className="absolute border border-white/90 rounded-xl transition-[box-shadow] duration-75 cursor-move"
                                onPointerDown={(e) => handlePointerDown('move', e)}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                            >
                                {/* Lazer skaner chizig'i (faqat qidiruv ketayotganda) */}
                                {isAnalyzing && (
                                    <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#10B981] to-transparent shadow-[0_0_15px_#10B981] pointer-events-none animate-lens-scan" />
                                )}

                                {/* 4 ta Google Lens burchakli nishoni */}
                                <div
                                    onPointerDown={(e) => handlePointerDown('nw', e)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    className="absolute -top-3 -left-3 w-8 h-8 flex items-center justify-center cursor-nwse-resize touch-none z-20 group"
                                    title="Burchakni surish"
                                >
                                    <div className="w-4 h-4 border-t-[3px] border-l-[3px] border-white rounded-tl-[4px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] transition-transform group-active:scale-125" />
                                </div>

                                <div
                                    onPointerDown={(e) => handlePointerDown('ne', e)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    className="absolute -top-3 -right-3 w-8 h-8 flex items-center justify-center cursor-nesw-resize touch-none z-20 group"
                                    title="Burchakni surish"
                                >
                                    <div className="w-4 h-4 border-t-[3px] border-r-[3px] border-white rounded-tr-[4px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] transition-transform group-active:scale-125" />
                                </div>

                                <div
                                    onPointerDown={(e) => handlePointerDown('sw', e)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    className="absolute -bottom-3 -left-3 w-8 h-8 flex items-center justify-center cursor-nesw-resize touch-none z-20 group"
                                    title="Burchakni surish"
                                >
                                    <div className="w-4 h-4 border-b-[3px] border-l-[3px] border-white rounded-bl-[4px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] transition-transform group-active:scale-125" />
                                </div>

                                <div
                                    onPointerDown={(e) => handlePointerDown('se', e)}
                                    onPointerMove={handlePointerMove}
                                    onPointerUp={handlePointerUp}
                                    className="absolute -bottom-3 -right-3 w-8 h-8 flex items-center justify-center cursor-nwse-resize touch-none z-20 group"
                                    title="Burchakni surish"
                                >
                                    <div className="w-4 h-4 border-b-[3px] border-r-[3px] border-white rounded-br-[4px] drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)] transition-transform group-active:scale-125" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Pastki tutqich / boshqaruv tasmasi (46px balandlikda):
                       Modal yuqoriga surilganda faqat shu tasma ekranning yuqori qismida ko'rinib turadi */}
                <div 
                    onTouchStart={onHandleTouchStart}
                    onTouchEnd={onHandleTouchEnd}
                    onClick={() => setIsCollapsed(prev => !prev)}
                    className="w-full h-[46px] px-4 bg-white/95 backdrop-blur-md border-t border-gray-100 flex items-center justify-between cursor-pointer select-none"
                >
                    {isCollapsed ? (
                        <>
                            <div className="flex items-center gap-2">
                                {imagePreview ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img 
                                        src={imagePreview} 
                                        alt="Lens" 
                                        className="w-6 h-6 rounded-md object-cover border border-gray-200 shadow-xs" 
                                    />
                                ) : (
                                    <Sparkles size={14} className="text-[#2D6E3E]" />
                                )}
                                <span className="text-xs font-semibold text-gray-800">
                                    {isUz ? "Rasm ob'yektini o'zgartirish" : "Изменить область фото"}
                                </span>
                                <ChevronDown size={14} className="text-[#2D6E3E] animate-bounce" />
                            </div>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onClose();
                                }}
                                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-900 flex items-center justify-center transition active:scale-90"
                                aria-label="Yopish"
                            >
                                <X size={14} />
                            </button>
                        </>
                    ) : (
                        <div className="w-full flex flex-col items-center justify-center">
                            <div className="w-10 h-1 bg-gray-300 rounded-full mb-1" />
                            <div className="flex items-center gap-1 text-[11px] font-semibold text-gray-500">
                                <ChevronUp size={13} />
                                <span>{isUz ? "Natijalarni ko'rish uchun tepaga suring" : "Свернуть к результатам"}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
