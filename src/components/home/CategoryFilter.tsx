"use client";

import { ChevronLeft } from "lucide-react";
import { videoPreWarmer } from "@/lib/videoPreWarmer";

interface Category {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    parentId?: string;
}

interface CategoryFilterProps {
    allCategories: Category[];
    activeFilter: string;
    setActiveFilter: (filter: string) => void;
    activeParent: string;
    setActiveParent: (parent: string) => void;
    language: "uz" | "ru";
    translations: any;
    setHomeActiveFilter: (filter: string) => void;
}

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

export const CategoryFilter = ({
    allCategories,
    activeFilter,
    setActiveFilter,
    activeParent,
    setActiveParent,
    language,
    translations,
    setHomeActiveFilter,
}: CategoryFilterProps) => {
    const t = translations;
    const mainCategories = allCategories.filter(c => !c.parentId);
    const subCategories = allCategories.filter(c => c.parentId === (activeParent !== "all" ? activeParent : null));
    const hasSubCats = subCategories.length > 0 && activeParent !== "all";

    const handleMainClick = (id: string) => {
        videoPreWarmer.triggerHaptic("light");
        setActiveFilter(id);
        setActiveParent(id);
        setHomeActiveFilter(id);
    };

    const handleSubClick = (id: string) => {
        videoPreWarmer.triggerHaptic("light");
        setActiveFilter(id);
        setHomeActiveFilter(id);
    };

    const handleBack = () => {
        videoPreWarmer.triggerHaptic("light");
        const current = allCategories.find(c => c.id === activeFilter);
        if (current?.parentId) {
            setActiveFilter(current.parentId);
            setHomeActiveFilter(current.parentId);
        }
    };

    const catName = (cat: Category) =>
        (language === "uz" ? cat.name_uz : cat.name_ru) || cat.name;

    if (allCategories.length === 0) {
        return (
            <div className="mt-6 px-4 flex gap-2 overflow-x-auto no-scrollbar py-2">
                {[...Array(5)].map((_, i) => (
                    <div key={i} style={{ flexShrink: 0, width: 80, height: 36, borderRadius: 18, background: "#F0F0EC", animation: "velari-shimmer 1.6s infinite", backgroundSize: "200% 100%" }} />
                ))}
            </div>
        );
    }

    return (
        <div className="mt-4 flex flex-col" style={{ gap: 0 }}>
            {/* ── Mobile: Velari Liquid Glass chips ── */}
            <div
                className="md:hidden flex gap-2 overflow-x-auto no-scrollbar px-4 py-2 overscroll-x-contain touch-pan-x"
                style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
            >
                {/* "Hammasi" chip */}
                <button
                    onClick={() => handleMainClick("all")}
                    className="ios-tap-feedback active:scale-95 will-change-transform select-none"
                    style={{
                        flexShrink: 0,
                        height: 36,
                        padding: "0 16px",
                        borderRadius: 18,
                        border: activeFilter === "all" ? "none" : "1px solid rgba(15,20,16,0.08)",
                        background: activeFilter === "all" ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" : "rgba(255,255,255,0.85)",
                        backdropFilter: "blur(14px)",
                        WebkitBackdropFilter: "blur(14px)",
                        color: activeFilter === "all" ? "#fff" : "#111612",
                        fontSize: 13.5,
                        fontWeight: activeFilter === "all" ? 600 : 500,
                        letterSpacing: -0.1,
                        cursor: "pointer",
                        boxShadow: activeFilter === "all" ? "0 4px 14px rgba(45,110,62,0.25)" : "0 2px 8px rgba(0,0,0,0.02)",
                        transition: "all 180ms ease",
                        WebkitTapHighlightColor: "transparent",
                        whiteSpace: "nowrap",
                    }}
                >
                    {t.common.all}
                </button>

                {mainCategories.map(cat => {
                    const isActive = activeFilter === cat.id || activeParent === cat.id;
                    return (
                        <button
                            key={cat.id}
                            onClick={() => handleMainClick(cat.id)}
                            className="ios-tap-feedback active:scale-95 will-change-transform select-none"
                            style={{
                                flexShrink: 0,
                                height: 36,
                                padding: "0 16px",
                                borderRadius: 18,
                                border: isActive ? "none" : "1px solid rgba(15,20,16,0.08)",
                                background: isActive ? "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" : "rgba(255,255,255,0.85)",
                                backdropFilter: "blur(14px)",
                                WebkitBackdropFilter: "blur(14px)",
                                color: isActive ? "#fff" : "#111612",
                                fontSize: 13.5,
                                fontWeight: isActive ? 600 : 500,
                                letterSpacing: -0.1,
                                cursor: "pointer",
                                boxShadow: isActive ? "0 4px 14px rgba(45,110,62,0.25)" : "0 2px 8px rgba(0,0,0,0.02)",
                                transition: "all 180ms ease",
                                WebkitTapHighlightColor: "transparent",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {catName(cat)}
                        </button>
                    );
                })}
            </div>

            {/* Mobile subcategories row */}
            {hasSubCats && (
                <div
                    className="md:hidden flex gap-2 overflow-x-auto no-scrollbar px-4 pb-2 overscroll-x-contain touch-pan-x"
                    style={{ animation: "velari-slide-in 260ms cubic-bezier(0.22,1,0.36,1)", WebkitOverflowScrolling: "touch" }}
                >
                    {/* Back button */}
                    {allCategories.find(c => c.id === activeFilter)?.parentId && (
                        <button
                            onClick={handleBack}
                            aria-label="Orqaga"
                            className="ios-icon-tap active:scale-90 will-change-transform"
                            style={{
                                flexShrink: 0,
                                width: 34,
                                height: 32,
                                borderRadius: 16,
                                background: "rgba(255,255,255,0.85)",
                                backdropFilter: "blur(12px)",
                                WebkitBackdropFilter: "blur(12px)",
                                border: "1px solid rgba(15,20,16,0.08)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "transform 150ms ease-out",
                            }}
                        >
                            <ChevronLeft size={16} color="#5A625C" />
                        </button>
                    )}

                    {subCategories.map(sub => {
                        const isActive = activeFilter === sub.id;
                        return (
                            <button
                                key={sub.id}
                                onClick={() => handleSubClick(sub.id)}
                                className="ios-tap-feedback active:scale-95 will-change-transform select-none"
                                style={{
                                    flexShrink: 0,
                                    height: 32,
                                    padding: "0 14px",
                                    borderRadius: 16,
                                    background: isActive ? "#EAF3EC" : "rgba(255,255,255,0.85)",
                                    backdropFilter: "blur(12px)",
                                    WebkitBackdropFilter: "blur(12px)",
                                    border: isActive ? "1.5px solid #2D6E3E" : "1px solid rgba(15,20,16,0.08)",
                                    color: isActive ? "#2D6E3E" : "#5A625C",
                                    fontSize: 12.5,
                                    fontWeight: isActive ? 600 : 500,
                                    cursor: "pointer",
                                    transition: "all 180ms ease",
                                    WebkitTapHighlightColor: "transparent",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {catName(sub)}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* ── Desktop: Liquid Glass pills ── */}
            <div className="hidden md:flex flex-col gap-3 px-0 mt-6">
                <div className="flex gap-2.5 overflow-x-auto no-scrollbar py-2 overscroll-x-contain touch-pan-x" style={{ WebkitOverflowScrolling: "touch" }}>
                    <button
                        onClick={() => handleMainClick("all")}
                        className={`shrink-0 px-6 py-2.5 rounded-full text-[13.5px] font-semibold tracking-tight transition-[transform,colors,box-shadow] duration-150 ios-tap-feedback active:scale-95 will-change-transform border ${activeFilter === "all" ? "bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] text-white border-transparent shadow-md shadow-[#2D6E3E]/20" : "bg-white/80 backdrop-blur-md text-[#2C332E] border-black/5 hover:bg-white hover:text-black hover:shadow-sm"}`}
                    >
                        {t.common.all}
                    </button>
                    {mainCategories.map(cat => {
                        const isActive = activeFilter === cat.id || activeParent === cat.id;
                        return (
                            <button
                                key={cat.id}
                                onClick={() => handleMainClick(cat.id)}
                                className={`shrink-0 px-6 py-2.5 rounded-full text-[13.5px] font-semibold tracking-tight transition-[transform,colors,box-shadow] duration-150 ios-tap-feedback active:scale-95 will-change-transform border ${isActive ? "bg-gradient-to-r from-[#2D6E3E] to-[#1F5A30] text-white border-transparent shadow-md shadow-[#2D6E3E]/20" : "bg-white/80 backdrop-blur-md text-[#2C332E] border-black/5 hover:bg-white hover:text-black hover:shadow-sm"}`}
                            >
                                {catName(cat)}
                            </button>
                        );
                    })}
                </div>

                {activeFilter !== "all" && subCategories.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 overscroll-x-contain touch-pan-x" style={{ WebkitOverflowScrolling: "touch" }}>
                        {allCategories.find(c => c.id === activeFilter)?.parentId && (
                            <button
                                onClick={handleBack}
                                aria-label="Orqaga"
                                className="shrink-0 p-2.5 bg-white/80 backdrop-blur-md rounded-xl text-gray-500 hover:text-black transition-colors border border-black/5 ios-icon-tap active:scale-90 will-change-transform"
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}
                        {subCategories.map(sub => {
                            const isSubActive = activeFilter === sub.id;
                            return (
                                <button
                                    key={sub.id}
                                    onClick={() => handleSubClick(sub.id)}
                                    className={`shrink-0 px-4 py-2 rounded-xl text-[12.5px] font-semibold transition-[transform,colors,border-color] duration-150 ios-tap-feedback active:scale-95 will-change-transform border ${isSubActive ? "bg-[#EAF3EC] text-[#2D6E3E] border-[#2D6E3E]/30" : "bg-white/70 backdrop-blur-md text-[#5A625C] border-black/5 hover:bg-white hover:text-black"}`}
                                >
                                    {catName(sub)}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
