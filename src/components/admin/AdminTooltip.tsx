"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface AdminTooltipProps {
    title: string;
    description: string;
    examples?: string[];
    placement?: "top" | "bottom" | "left" | "right";
    className?: string;
    iconSize?: number;
}

export default function AdminTooltip({
    title,
    description,
    examples,
    placement = "bottom",
    className = "",
    iconSize = 13,
}: AdminTooltipProps) {
    const [isOpen, setIsOpen] = useState(false);
    const tooltipRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div className={`relative inline-flex items-center group/tooltip ${className}`} ref={tooltipRef}>
            <button
                type="button"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                className="text-gray-400 hover:text-blue-600 transition-colors p-0.5 rounded-full hover:bg-blue-50 cursor-pointer focus:outline-none"
                title={title}
            >
                <HelpCircle size={iconSize} />
            </button>

            {/* Tooltip Card */}
            <div
                className={`absolute z-50 w-64 md:w-72 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-2xl border border-gray-100 text-left transition-all duration-200 pointer-events-none ${
                    isOpen
                        ? "opacity-100 visible translate-y-0 pointer-events-auto"
                        : "opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible group-hover/tooltip:pointer-events-auto"
                } ${
                    placement === "top"
                        ? "bottom-full mb-2 right-0"
                        : placement === "left"
                        ? "right-full mr-2 top-0"
                        : placement === "right"
                        ? "left-full ml-2 top-0"
                        : "top-full mt-2 right-0"
                }`}
            >
                <h5 className="text-[11px] font-black text-gray-900 uppercase tracking-tight mb-1 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                    {title}
                </h5>
                <p className="text-[11px] text-gray-600 leading-snug font-medium mb-2">
                    {description}
                </p>
                {examples && examples.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-2 space-y-1 border border-gray-100">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-wider block">Maslahat:</span>
                        <ul className="text-[10px] text-gray-600 space-y-0.5 list-disc list-inside font-medium">
                            {examples.map((ex, i) => (
                                <li key={i}>{ex}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
}
