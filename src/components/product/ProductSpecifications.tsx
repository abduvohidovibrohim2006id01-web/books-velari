"use client";

import { useState, useEffect } from "react";
import { Settings } from "lucide-react";

interface SpecItem {
    name: string;
    name_uz: string | null;
    name_ru: string | null;
    value: string;
    value_uz: string | null;
    value_ru: string | null;
}

export function ProductSpecifications({ productId, language }: { productId: string; language: "uz" | "ru" }) {
    const [specs, setSpecs] = useState<SpecItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!productId) return;
        setLoading(true);
        // Ommaviy o'qish endpointi (admin API mijozlar uchun yopiq — 401)
        fetch(`/api/products/${encodeURIComponent(productId)}/params?t=${Date.now()}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache, no-store' }
        })
            .then(res => res.json())
            .then(data => {
                if (data.data && data.data.length > 0) {
                    const items: SpecItem[] = data.data
                        .filter((d: any) => (d.value && d.value.trim()) || (d.value_uz && d.value_uz.trim()) || (d.value_ru && d.value_ru.trim()))
                        .map((d: any) => ({
                            name: d.category_params?.name || "",
                            name_uz: d.category_params?.name_uz || d.category_params?.name || "",
                            name_ru: d.category_params?.name_ru || d.category_params?.name || "",
                            value: d.value || "",
                            value_uz: d.value_uz || d.value || "",
                            value_ru: d.value_ru || d.value || ""
                        }));
                    setSpecs(items);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [productId]);

    if (loading || specs.length === 0) return null;

    return (
        <div className="mx-4 md:mx-10 my-8">
            <div className="ios-grouped-section">
                {/* Header */}
                <div className="flex items-center gap-3 px-6 md:px-8 py-4 border-b border-[var(--glass-divider)] bg-black/[0.02]">
                    <div className="w-8 h-8 bg-[#EAF3EC] text-[#2D6E3E] rounded-xl flex items-center justify-center">
                        <Settings size={15} strokeWidth={2} />
                    </div>
                    <h3 className="text-sm md:text-base font-semibold text-[#111612] tracking-tight">
                        {language === "uz" ? "Xususiyatlari" : "Характеристики"}
                    </h3>
                    <span className="text-[10px] font-semibold text-[#2D6E3E] bg-[#EAF3EC] px-2.5 py-0.5 rounded-full">
                        {specs.length}
                    </span>
                </div>

                {/* Specs table */}
                <div className="divide-y divide-[var(--glass-divider)]">
                    {specs.map((spec, idx) => (
                        <div
                            key={idx}
                            className="flex items-center justify-between px-6 md:px-8 py-3.5 hover:bg-black/[0.01]"
                        >
                            <span className="text-xs md:text-sm font-normal text-[#737D75] flex-shrink-0 max-w-[45%]">
                                {language === "uz" ? (spec.name_uz || spec.name) : (spec.name_ru || spec.name)}
                            </span>
                            <span className="text-xs md:text-sm font-semibold text-[#111612] text-right">
                                {language === "uz" ? (spec.value_uz || spec.value) : (spec.value_ru || spec.value)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
