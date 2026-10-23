"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useStore } from "@/store/store";
import { ymGoal } from "@/lib/metrika";

const GREEN = "#2D6E3E";

function TelegramAuthContent() {
    const router = useRouter();
    const params = useParams();
    const searchParams = useSearchParams();
    const setUser = useStore((s) => s.setUser);
    const setCart = useStore((s) => s.setCart);
    const currentCart = useStore((s) => s.cart);

    const lang = (params?.lang as string) === "ru" ? "ru" : "uz";
    const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
    const [message, setMessage] = useState("");
    const ran = useRef(false);

    useEffect(() => {
        if (ran.current) return; // tokenni faqat bir marta yuboramiz (StrictMode himoyasi)
        ran.current = true;

        const token = searchParams.get("lt");
        if (!token) {
            setStatus("error");
            setMessage(lang === "uz" ? "Havola noto'g'ri" : "Неверная ссылка");
            return;
        }

        (async () => {
            try {
                const res = await fetch("/api/auth/telegram-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    setUser(data.user);
                    if (data.cart && data.cart.length > 0 && (!currentCart || currentCart.length === 0)) {
                        setCart(data.cart);
                    }
                    ymGoal('login', { method: 'telegram' }); // Analytics: Telegram orqali kirish
                    setStatus("ok");
                    const next = data.next && data.next.startsWith("/") ? data.next : `/${lang}`;
                    setTimeout(() => router.replace(next), 700);
                } else {
                    setStatus("error");
                    setMessage(data.error || (lang === "uz" ? "Kirish amalga oshmadi" : "Не удалось войти"));
                }
            } catch {
                setStatus("error");
                setMessage(lang === "uz" ? "Tarmoq xatosi" : "Ошибка сети");
            }
        })();
    }, [searchParams, lang, router, setUser]);

    return (
        <div style={{ minHeight: "100vh", background: "#FAFAF6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
            {status === "loading" && (
                <>
                    <Loader2 size={48} color={GREEN} style={{ animation: "spin 1s linear infinite" }} />
                    <p style={{ marginTop: 20, fontSize: 16, fontWeight: 600, color: "#0F1410" }}>
                        {lang === "uz" ? "Saytga kiritilmoqda..." : "Выполняется вход..."}
                    </p>
                </>
            )}
            {status === "ok" && (
                <>
                    <CheckCircle2 size={56} color={GREEN} />
                    <p style={{ marginTop: 20, fontSize: 18, fontWeight: 700, color: "#0F1410" }}>
                        {lang === "uz" ? "Xush kelibsiz! 🎉" : "Добро пожаловать! 🎉"}
                    </p>
                    <p style={{ marginTop: 6, fontSize: 14, color: "#5A625C" }}>
                        {lang === "uz" ? "Davom etilmoqda..." : "Перенаправление..."}
                    </p>
                </>
            )}
            {status === "error" && (
                <>
                    <AlertCircle size={56} color="#FF3B30" />
                    <p style={{ marginTop: 20, fontSize: 17, fontWeight: 700, color: "#0F1410" }}>{message}</p>
                    <button
                        onClick={() => router.replace(`/${lang}/login`)}
                        style={{
                            marginTop: 20, padding: "13px 28px", borderRadius: 16, border: "none",
                            background: GREEN, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
                        }}
                    >
                        {lang === "uz" ? "Kirish sahifasiga o'tish" : "На страницу входа"}
                    </button>
                </>
            )}
        </div>
    );
}

export default function TelegramAuthPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: "100vh", background: "#FAFAF6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={48} color={GREEN} style={{ animation: "spin 1s linear infinite" }} />
            </div>
        }>
            <TelegramAuthContent />
        </Suspense>
    );
}

