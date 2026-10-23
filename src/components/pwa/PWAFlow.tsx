"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useStore } from "@/store/store";
import { FREE_DELIVERY_THRESHOLD, fmtSom } from "@/lib/delivery";

const LANG_KEY = "velari_lang_picked";
const ONBOARDED_KEY = "velari_onboarded";

type Step = "splash" | "lang" | "onboard" | "done";

function isPWA() {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches
        || (window.navigator as any).standalone === true
        || document.referrer.includes("android-app://");
}

// ── Splash ──────────────────────────────────────────────────────────────────
function SplashScreen({ onDone }: { onDone: () => void }) {
    useEffect(() => {
        const t = setTimeout(onDone, 1600);
        return () => clearTimeout(t);
    }, [onDone]);

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "#FAFAF6",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            animation: "velari-fade-in 300ms ease both",
        }}>
            {/* Logo */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
                <img 
                    src="/icons/icon-192x192.png" 
                    alt="Velari" 
                    style={{
                        width: 80, height: 80, borderRadius: "50%",
                        boxShadow: "0 8px 32px rgba(15,20,16,0.08)",
                        animation: "velari-pop-in 600ms cubic-bezier(0.34,1.56,0.64,1) 200ms both",
                    }} 
                />
                <div style={{
                    fontSize: 28, fontWeight: 900, letterSpacing: -1.5, color: "#0F1410",
                    animation: "velari-slide-in 400ms cubic-bezier(0.22,1,0.36,1) 400ms both",
                }}>
                    VELARI<span style={{ color: "#2D6E3E" }}>.</span>
                </div>
            </div>

            {/* Loading dot */}
            <div style={{
                position: "absolute", bottom: 60,
                display: "flex", gap: 6,
            }}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: "#2D6E3E",
                        opacity: 0.3,
                        animation: `velari-pulse-soft 1.2s ease ${i * 200}ms infinite`,
                    }} />
                ))}
            </div>
        </div>
    );
}

// ── Lang Picker ──────────────────────────────────────────────────────────────
function LangPickerScreen({ onPick }: { onPick: (lang: "uz" | "ru") => void }) {
    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "#FAFAF6",
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            padding: 32,
            animation: "velari-fade-in 300ms ease both",
        }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🌐</div>
                <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, color: "#0F1410", margin: 0 }}>
                    Tilni tanlang
                </h2>
                <p style={{ fontSize: 15, color: "#9AA29C", marginTop: 8, fontWeight: 500 }}>
                    Выберите язык
                </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14, width: "100%", maxWidth: 320 }}>
                <button
                    onClick={() => onPick("uz")}
                    style={{
                        width: "100%", padding: "18px 24px",
                        borderRadius: 20, border: "2px solid rgba(15,20,16,0.08)",
                        background: "#fff", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 14,
                        WebkitTapHighlightColor: "transparent",
                        transition: "all 200ms ease",
                        boxShadow: "0 2px 12px rgba(15,20,16,0.04)",
                    }}
                >
                    <span style={{ fontSize: 28 }}>🇺🇿</span>
                    <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: "#0F1410", letterSpacing: -0.3 }}>O'zbekcha</div>
                        <div style={{ fontSize: 12, color: "#9AA29C", fontWeight: 500 }}>UZ</div>
                    </div>
                </button>

                <button
                    onClick={() => onPick("ru")}
                    style={{
                        width: "100%", padding: "18px 24px",
                        borderRadius: 20, border: "2px solid rgba(15,20,16,0.08)",
                        background: "#fff", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 14,
                        WebkitTapHighlightColor: "transparent",
                        transition: "all 200ms ease",
                        boxShadow: "0 2px 12px rgba(15,20,16,0.04)",
                    }}
                >
                    <span style={{ fontSize: 28 }}>🇷🇺</span>
                    <div style={{ textAlign: "left" }}>
                        <div style={{ fontSize: 17, fontWeight: 800, color: "#0F1410", letterSpacing: -0.3 }}>Русский</div>
                        <div style={{ fontSize: 12, color: "#9AA29C", fontWeight: 500 }}>RU</div>
                    </div>
                </button>
            </div>
        </div>
    );
}

// ── Onboarding ───────────────────────────────────────────────────────────────
const SLIDES_UZ = [
    { emoji: "🛍️", title: "Barcha mahsulotlar bir joyda", sub: "Premium texnika, gadjetlar va ko'p narsalar" },
    // Chegara faqat src/lib/delivery.ts da
    { emoji: "🚀", title: "Tez va bepul yetkazib berish", sub: `${fmtSom(FREE_DELIVERY_THRESHOLD, "uz")}dan yuqori buyurtmalarga bepul` },
    { emoji: "🔒", title: "Xavfsiz to'lov", sub: "Click, Payme va naqd to'lov imkoniyati" },
];

const SLIDES_RU = [
    { emoji: "🛍️", title: "Все товары в одном месте", sub: "Премиум техника, гаджеты и многое другое" },
    { emoji: "🚀", title: "Быстрая и бесплатная доставка", sub: `Бесплатно при заказе от ${fmtSom(FREE_DELIVERY_THRESHOLD, "ru")}` },
    { emoji: "🔒", title: "Безопасная оплата", sub: "Click, Payme и наличными" },
];

function OnboardingScreen({ lang, onDone }: { lang: "uz" | "ru"; onDone: () => void }) {
    const [idx, setIdx] = useState(0);
    const slides = lang === "uz" ? SLIDES_UZ : SLIDES_RU;
    const slide = slides[idx];
    const isLast = idx === slides.length - 1;

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 99999,
            background: "#FAFAF6",
            display: "flex", flexDirection: "column",
            animation: "velari-fade-in 300ms ease both",
        }}>
            {/* Skip */}
            <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "flex-end" }}>
                <button onClick={onDone} style={{ background: "none", border: "none", fontSize: 14, color: "#9AA29C", fontWeight: 600, cursor: "pointer" }}>
                    {lang === "uz" ? "O'tkazib yuborish" : "Пропустить"}
                </button>
            </div>

            {/* Slide */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
                <div key={idx} style={{ animation: "velari-slide-in 300ms cubic-bezier(0.22,1,0.36,1) both" }}>
                    <div style={{ fontSize: 72, marginBottom: 32, lineHeight: 1 }}>{slide.emoji}</div>
                    <h2 style={{ fontSize: 26, fontWeight: 900, letterSpacing: -1, color: "#0F1410", margin: "0 0 12px", lineHeight: 1.2 }}>
                        {slide.title}
                    </h2>
                    <p style={{ fontSize: 16, color: "#9AA29C", fontWeight: 500, lineHeight: 1.5, margin: 0, maxWidth: 280 }}>
                        {slide.sub}
                    </p>
                </div>
            </div>

            {/* Dots */}
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 24 }}>
                {slides.map((_, i) => (
                    <div key={i} style={{
                        width: i === idx ? 20 : 6, height: 6, borderRadius: 3,
                        background: i === idx ? "#2D6E3E" : "rgba(15,20,16,0.12)",
                        transition: "all 300ms cubic-bezier(0.22,1,0.36,1)",
                    }} />
                ))}
            </div>

            {/* Button */}
            <div style={{ padding: "0 24px 48px" }}>
                <button
                    onClick={() => isLast ? onDone() : setIdx(i => i + 1)}
                    style={{
                        width: "100%", height: 56,
                        borderRadius: 27, border: "none",
                        background: "#2D6E3E", color: "#fff",
                        fontSize: 17, fontWeight: 700,
                        letterSpacing: -0.3, cursor: "pointer",
                        WebkitTapHighlightColor: "transparent",
                        boxShadow: "0 8px 24px rgba(45,110,62,0.28)",
                        transition: "transform 120ms ease",
                    }}
                >
                    {isLast
                        ? (lang === "uz" ? "Boshlash →" : "Начать →")
                        : (lang === "uz" ? "Davom etish" : "Далее")}
                </button>
            </div>
        </div>
    );
}

// ── Main Controller ──────────────────────────────────────────────────────────
export default function PWAFlow() {
    const [step, setStep] = useState<Step | null>(null);
    const [pickedLang, setPickedLang] = useState<"uz" | "ru">("uz");
    const { setLanguage } = useStore();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isPWA()) return;
        if (pathname.startsWith("/uz/admin") || pathname.startsWith("/ru/admin")) return;

        const langPicked = localStorage.getItem(LANG_KEY);
        const onboarded = localStorage.getItem(ONBOARDED_KEY);

        if (!langPicked) {
            setStep("splash");
        } else if (!onboarded) {
            const saved = langPicked as "uz" | "ru";
            setPickedLang(saved);
            setStep("onboard");
        }
        // agar ikkalasi ham bor bo'lsa — hech narsa ko'rsatmaymiz
    }, [pathname]);

    const afterSplash = () => {
        const langPicked = localStorage.getItem(LANG_KEY);
        if (!langPicked) { setStep("lang"); return; }
        const onboarded = localStorage.getItem(ONBOARDED_KEY);
        if (!onboarded) { setPickedLang(langPicked as "uz" | "ru"); setStep("onboard"); return; }
        setStep("done");
    };

    const afterLang = (lang: "uz" | "ru") => {
        localStorage.setItem(LANG_KEY, lang);
        setPickedLang(lang);
        setLanguage(lang);
        // URL ni yangilash
        const newPath = pathname.replace(/^\/(uz|ru)/, `/${lang}`);
        router.replace(newPath);
        setStep("onboard");
    };

    const afterOnboard = () => {
        localStorage.setItem(ONBOARDED_KEY, "1");
        setStep("done");
    };

    if (!step || step === "done") return null;
    if (step === "splash") return <SplashScreen onDone={afterSplash} />;
    if (step === "lang") return <LangPickerScreen onPick={afterLang} />;
    if (step === "onboard") return <OnboardingScreen lang={pickedLang} onDone={afterOnboard} />;
    return null;
}
