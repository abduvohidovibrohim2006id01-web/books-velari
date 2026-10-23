"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/store";

/**
 * DynamicFavicon
 * Toza oppoq dumaloq favikonda katta qalin VELARI. yozuvi va
 * savatda tovar bo'lsa jonli qizil nishon (live badge) chizadi.
 */
export default function DynamicFavicon() {
    const cart = useStore((state) => state.cart);
    const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);

    useEffect(() => {
        if (typeof window === "undefined") return;

        let link: HTMLLinkElement | null = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement("link");
            link.rel = "shortcut icon";
            document.head.appendChild(link);
        }

        const canvas = document.createElement("canvas");
        const size = 64; // Ultra HD 64x64 canvas
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const center = size / 2;
        const radius = size / 2 - 0.5;

        // 1. Butun maydonni egallovchi Toza Oppoq Doira (Full White Circle)
        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();

        // 2. Maksimal Katta va Qalin VELARI. Yozuvi (Mitti tabda ham tiniq ko'rinishi uchun)
        ctx.fillStyle = "#0F1410";
        ctx.font = "900 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.letterSpacing = "-0.4px";

        // VELARI matni
        ctx.fillText("VELARI", center - 2, center + 1);

        // Yashil nuqta .
        ctx.fillStyle = "#2D6E3E";
        ctx.beginPath();
        ctx.arc(center + 26, center + 3.5, 2.2, 0, Math.PI * 2);
        ctx.fill();

        // 3. Savatda tovar bo'lsa Jonli Qizil Nishon (Cart Badge)
        if (cartCount > 0) {
            const badgeRadius = 10;
            const badgeX = size - badgeRadius - 0.5;
            const badgeY = badgeRadius + 0.5;

            // Oq chegara
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeRadius + 2, 0, Math.PI * 2);
            ctx.fillStyle = "#FFFFFF";
            ctx.fill();

            // Qizil nishon
            ctx.beginPath();
            ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
            ctx.fillStyle = "#EF4444";
            ctx.fill();

            // Soni
            ctx.fillStyle = "#FFFFFF";
            ctx.font = "bold 11px -apple-system, BlinkMacSystemFont, Segoe UI, Arial, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(cartCount > 9 ? "9+" : cartCount.toString(), badgeX, badgeY + 0.5);
        }

        if (link) {
            link.href = canvas.toDataURL("image/png");
        }
    }, [cartCount]);

    return null;
}
