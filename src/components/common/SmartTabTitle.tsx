"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/store";

/**
 * SmartTabTitle (Aqlli / Jonli Yuguruvchi Satr)
 * 1. Foydalanuvchi saytda turganda: sarlavha sokin, original holatda turadi.
 * 2. Foydalanuvchi boshqa vkladkaga o'tganda (tabdan chiqqanda):
 *    - Savatda tovar bo'lsa: "🛒 Savatingizda X ta mahsulot qolib ketdi! — Velari.uz — "
 *    - Savat bo'sh bo'lsa: "🎁 Yangi chegirmalarni o'tkazib yubormang! — Velari.uz — "
 *    deb o'ngdan chapga silliq yugurib, mijozni saytga qaytaradi.
 * 3. Qaytib kelganda: yugurish darhol to'xtab, original sarlavha tiklanadi.
 */
export default function SmartTabTitle() {
    const cart = useStore((state) => state.cart);
    const cartCount = cart.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const originalTitleRef = useRef<string>("");
    const tickerIntervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Boshlang'ich sarlavhani saqlab olamiz
        originalTitleRef.current = document.title;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Foydalanuvchi boshqa vkladkaga o'tdi
                originalTitleRef.current = document.title;

                let message = cartCount > 0
                    ? `🛒 Savatingizda ${cartCount} ta mahsulot qoldi! Xaridni yakunlang — Velari.uz — `
                    : `🎁 Yangi chegirmalar va sovg'alarni o'tkazib yubormang! — Velari.uz — `;

                // Yuguruvchi satrni boshlaymiz
                let currentText = message;
                if (tickerIntervalRef.current) clearInterval(tickerIntervalRef.current);

                tickerIntervalRef.current = setInterval(() => {
                    currentText = currentText.substring(1) + currentText[0];
                    document.title = currentText;
                }, 220); // Har 220 ms da bitta harfga siljiydi
            } else {
                // Foydalanuvchi saytga qaytdi
                if (tickerIntervalRef.current) {
                    clearInterval(tickerIntervalRef.current);
                    tickerIntervalRef.current = null;
                }
                // Original sarlavhani qayta tiklaymiz
                if (originalTitleRef.current) {
                    document.title = originalTitleRef.current;
                }
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            if (tickerIntervalRef.current) clearInterval(tickerIntervalRef.current);
        };
    }, [cartCount]);

    return null;
}
