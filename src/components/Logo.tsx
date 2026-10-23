"use client";

import React from "react";

interface LogoProps {
    className?: string;
    size?: "xs" | "sm" | "md" | "lg" | "xl";
    dark?: boolean;
    showSmile?: boolean;
}

export default function Logo({ className = "", size = "md", dark = false }: LogoProps) {
    const sizeClasses = {
        xs: "text-lg",
        sm: "text-xl",
        md: "text-2xl",
        lg: "text-4xl",
        xl: "text-[140px]"
    };

    const dotSizes = {
        xs: "text-sm",
        sm: "text-base",
        md: "text-xl",
        lg: "text-3xl",
        xl: "text-[100px]"
    };

    const textColor = dark ? "text-white" : "text-[#0F1410]";

    return (
        <div className={`flex items-baseline select-none ${className}`}>
            <span className={`font-['Helvetica_Neue',_Helvetica,_Arial,_sans-serif] font-black tracking-tighter leading-none ${textColor} flex items-baseline`}>
                <span className={sizeClasses[size]}>VELARI</span>
                <span className={`text-[#2D6E3E] font-black ${dotSizes[size]}`} style={{ verticalAlign: 'baseline', position: 'relative', top: size === 'xl' ? '8px' : '2px' }}>.</span>
            </span>
        </div>
    );
}
