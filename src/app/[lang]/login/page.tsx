"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Send, Key, Loader2, ChevronLeft, ShieldCheck, User } from "lucide-react";
import { useStore } from "@/store/store";
import { translations } from "@/lib/translations";
import { ymGoal } from "@/lib/metrika";

const GREEN = "#2D6E3E";
const GREEN_DEEP = "#1F5A30";
const GREEN_TINT = "#EAF3EC";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

const BOT_USERNAME = "velari_uz_xabarnoma_bot";

// Brauzerda base64url (Telegram /start payload uchun)
function toB64Url(s: string): string {
    return btoa(unescape(encodeURIComponent(s)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function LoginContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const setUser = useStore((state) => state.setUser);
    const { language, showToast } = useStore();
    const t = translations[language];

    // Login majburlangan joydan kelgan bo'lsa — o'sha manzilga qaytamiz
    const redirectRaw = searchParams.get("redirect");
    const redirect = redirectRaw && redirectRaw.startsWith("/") && !redirectRaw.startsWith("//") ? redirectRaw : null;
    // Telegram bot ham shu manzilni bilib, ro'yxatdan o'tgach o'sha joyga qaytaradi
    const BOT_URL = `https://t.me/${BOT_USERNAME}?start=${redirect ? toB64Url(redirect) : "register"}`;

    const [id, setId] = useState("");
    const [password, setPassword] = useState("");
    const [otp, setOtp] = useState("");
    const [error, setError] = useState("");
    const [errorType, setErrorType] = useState<"none" | "not_found" | "wrong_password">("none");
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<"password" | "2fa">("password");

    // Telegram WebApp orqali to'g'ridan-to'g'ri kirish va ro'yxatdan o'tish
    const [tgPromptPhone, setTgPromptPhone] = useState(false);
    const [tgPhone, setTgPhone] = useState("");
    const [tgUserInfo, setTgUserInfo] = useState<any>(null);
    const [tgAuthLoading, setTgAuthLoading] = useState(false);

    const handleTelegramAuth = async () => {
        const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
        const initData = tg?.initData;

        // 1. Agar Telegram Web App ichida ochilgan bo'lsa -> To'g'ridan-to'g'ri avtorizatsiya
        if (initData) {
            setTgAuthLoading(true);
            setError("");
            setErrorType("none");
            try {
                const res = await fetch("/api/auth/telegram-webapp", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ initData })
                });
                const data = await res.json();

                if (res.ok && data.success) {
                    if (data.registered && data.user) {
                        setUser(data.user);
                        if (data.cart && data.cart.length > 0) {
                            useStore.getState().setCart(data.cart);
                        }
                        ymGoal('login', { method: 'telegram_webapp' });
                        showToast(language === 'uz' ? "Xush kelibsiz!" : "Добро пожаловать!");
                        router.replace(redirect || `/${language}`);
                        return;
                    } else if (!data.registered) {
                        setTgUserInfo(data.telegramUser);
                        setTgPromptPhone(true);
                        setTgAuthLoading(false);
                        return;
                    }
                } else {
                    setError(data.error || (language === 'uz' ? "Telegram orqali kirishda xatolik" : "Ошибка входа"));
                }
            } catch {
                setError(language === 'uz' ? "Tarmoq xatosi" : "Ошибка сети");
            } finally {
                setTgAuthLoading(false);
            }
            return;
        }

        // 2. Oddiy tashqi brauzerda bo'lsa -> Telegram botga yo'naltirish
        window.location.href = BOT_URL;
    };

    const handleTelegramRegisterSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
        const initData = tg?.initData;
        if (!initData || !tgPhone.trim()) return;

        setTgAuthLoading(true);
        setError("");
        try {
            const cleanPhone = tgPhone.replace(/[\s\-\(\)]/g, "");
            const res = await fetch("/api/auth/telegram-webapp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    initData,
                    phone: cleanPhone.startsWith("+") ? cleanPhone : `+998${cleanPhone}`
                })
            });
            const data = await res.json();
            if (res.ok && data.success && data.user) {
                setUser(data.user);
                ymGoal('register', { method: 'telegram_webapp' });
                showToast(language === 'uz' ? "Muvaffaqiyatli ro'yxatdan o'tdingiz!" : "Регистрация успешна!");
                router.replace(redirect || `/${language}`);
            } else {
                setError(data.error || (language === 'uz' ? "Xatolik yuz berdi" : "Произошла ошибка"));
                setTgAuthLoading(false);
            }
        } catch {
            setError(language === 'uz' ? "Tarmoq xatosi" : "Ошибка сети");
            setTgAuthLoading(false);
        }
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        setErrorType("none");

        try {
            // 1. Admin 2FA tasdiqlash bosqichi
            if (step === "2fa") {
                const authRes = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: id.trim(),
                        password,
                        code: otp,
                        step: "2fa"
                    })
                });
                const authData = await authRes.json();
                if (authRes.ok && authData.success) {
                    setUser(authData.user);
                    const params = new URLSearchParams(window.location.search);
                    const target = params.get('redirect') || `/${language}/admin`;
                    const vaultRedirect = target.includes("?") ? `${target}&vault=Abdulaziz2244` : `${target}?vault=Abdulaziz2244`;
                    window.location.href = vaultRedirect;
                    return;
                } else {
                    setError(authData.error || (language === 'uz' ? "Tasdiqlash kodi noto'g'ri" : "Неверный код"));
                    setLoading(false);
                    return;
                }
            }

            const trimmedId = id.trim();
            // Harflar yoki maxsus belgilar bo'lsa (masalan: admin, vault, etc.) -> Faqat shunda Admin tekshiriladi!
            const hasLettersOrSymbols = /[a-zA-Z_@#$%^&*!]/.test(trimmedId);
            const digitsOnly = trimmedId.replace(/\D/g, "");

            // 2. ADMIN PANELGA KIRISH (Faqat harflar yoki maxsus login kiritilganda)
            if (hasLettersOrSymbols) {
                const authRes = await fetch("/api/auth", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        id: trimmedId,
                        password,
                        step: "password"
                    })
                });
                const authData = await authRes.json();

                if (authRes.ok) {
                    if (authData.step === "2fa") {
                        setStep("2fa");
                        setLoading(false);
                        return;
                    }
                    if (authData.success) {
                        setUser(authData.user);
                        const params = new URLSearchParams(window.location.search);
                        const target = params.get('redirect') || `/${language}/admin`;
                        const vaultRedirect = target.includes("?") ? `${target}&vault=Abdulaziz2244` : `${target}?vault=Abdulaziz2244`;
                        window.location.href = vaultRedirect;
                        return;
                    }
                } else {
                    // Admin login xatoligi (Faqat haqiqiy admin login urinishlari audit logga tushadi)
                    setError(authData.error || (language === 'uz' ? "Login yoki parol noto'g'ri" : "Неверный логин или пароль"));
                    setLoading(false);
                    return;
                }
            }

            // 3. ODDIY FOYDALANUVCHI (TELEFON RAQAM)
            // Raqam bo'lsa to'g'ridan-to'g'ri foydalanuvchilar tekshiriladi (Admin audit loglariga aslo ta'sir qilmaydi)
            if (digitsOnly.length < 9) {
                setError(language === 'uz' 
                    ? "Telefon raqamingizni to'liq kiriting (kamida 9 ta raqam)" 
                    : "Введите полный номер телефона (не менее 9 цифр)");
                setLoading(false);
                return;
            }

            let queryPhone = trimmedId;
            if (digitsOnly.length === 9) {
                queryPhone = `+998${digitsOnly}`;
            } else if (digitsOnly.startsWith("998") && digitsOnly.length === 12) {
                queryPhone = `+${digitsOnly}`;
            } else if (!queryPhone.startsWith("+")) {
                queryPhone = `+${digitsOnly}`;
            }

            const userAuthRes = await fetch("/api/auth/user", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ phone: queryPhone, password })
            });
            const userAuthData = await userAuthRes.json();

            if (userAuthRes.ok && userAuthData.success) {
                setUser(userAuthData.user);
                ymGoal('login'); // Analytics: muvaffaqiyatli kirish
                showToast(language === 'uz' ? "Xush kelibsiz!" : "Добро пожаловать!");
                router.push(redirect || "/");
            } else {
                const code = userAuthData.code;
                const errorMsg = userAuthData.error;

                if (code === "not_found" || errorMsg === "User not found") {
                    setErrorType("not_found");
                    setError(language === 'uz'
                        ? "Bu telefon raqam ro'yxatdan o'tmagan."
                        : "Этот номер не зарегистрирован.");
                } else if (code === "wrong_password" || errorMsg === "Invalid password") {
                    setErrorType("wrong_password");
                    setError(language === 'uz' ? "Parol noto'g'ri." : "Неверный пароль.");
                } else {
                    setError(userAuthData.error || (language === 'uz' ? "Xatolik yuz berdi" : "Произошла ошибка"));
                }
            }
        } catch {
            setError(language === 'uz' ? "Xatolik yuz berdi" : "Произошла ошибка");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: "100vh", background: "#FAFAF6", display: "flex", flexDirection: "column" }}>

            {/* Back button */}
            <div style={{ padding: "54px 16px 12px", display: "flex", alignItems: "center" }}>
                <button
                    onClick={() => router.back()}
                    style={{
                        width: 40, height: 40, borderRadius: 20, background: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "none", cursor: "pointer",
                        boxShadow: "0 2px 8px rgba(15,20,16,0.06)",
                    }}
                >
                    <ChevronLeft size={20} color="#0F1410" />
                </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, padding: "20px 24px 0" }}>

                {step === "password" ? (
                    <>
                        {/* Icon */}
                        <div style={{
                            width: 76, height: 76, borderRadius: 22, background: GREEN_TINT,
                            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18,
                        }}>
                            <User size={36} color={GREEN} />
                        </div>

                        {/* Heading */}
                        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: "#0F1410", lineHeight: 1.15 }}>
                            {language === 'uz' ? "Velari'ga kiring" : 'Войдите в Velari'}
                        </h1>
                        <p style={{ marginTop: 8, fontSize: 15, color: "#5A625C", lineHeight: 1.5, letterSpacing: -0.1 }}>
                            {language === 'uz'
                                ? "Telefon va parolingizni kiriting"
                                : "Введите телефон и пароль"}
                        </p>

                        <form onSubmit={handleLogin} style={{ marginTop: 28, display: "flex", flexDirection: "column", gap: 12 }}>
                            {/* Phone input */}
                            <div style={{
                                background: "#fff", borderRadius: 18,
                                border: `1.5px solid ${id.length > 5 ? GREEN : "rgba(15,20,16,0.06)"}`,
                                padding: "14px 16px", display: "flex", alignItems: "center", gap: 10,
                                transition: `border 200ms ${EASE}`,
                            }}>
                                <span style={{ fontSize: 17, fontWeight: 600, color: "#0F1410", whiteSpace: "nowrap" }}>🇺🇿 +998</span>
                                <input
                                    type="text"
                                    inputMode="text"
                                    value={id}
                                    onChange={(e) => setId(e.target.value)}
                                    placeholder="90 123 45 67 yoki ID"
                                    style={{
                                        flex: 1, border: "none", outline: "none", background: "transparent",
                                        fontSize: 17, fontWeight: 600, color: "#0F1410", letterSpacing: -0.1,
                                        fontFamily: "inherit",
                                    }}
                                />
                            </div>

                            {/* Password input */}
                            <div style={{
                                background: "#fff", borderRadius: 18,
                                border: `1.5px solid ${password.length > 0 ? GREEN : "rgba(15,20,16,0.06)"}`,
                                padding: "14px 16px",
                                transition: `border 200ms ${EASE}`,
                            }}>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder={language === 'uz' ? "Parol" : "Пароль"}
                                    style={{
                                        width: "100%", border: "none", outline: "none", background: "transparent",
                                        fontSize: 17, fontWeight: 600, color: "#0F1410", letterSpacing: -0.1,
                                        fontFamily: "inherit",
                                    }}
                                />
                            </div>

                            {/* Error */}
                            {error && (
                                <div>
                                    {errorType === "not_found" ? (
                                        <div style={{
                                            background: "#FFF8F0",
                                            border: "1.5px solid #FED7AA",
                                            borderRadius: 16,
                                            padding: "16px",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 12,
                                        }}>
                                            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                                <span style={{ fontSize: 20, lineHeight: 1 }}>⚠️</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "#C2410C" }}>
                                                        {language === 'uz' ? "Bu raqam ro'yxatdan o'tmagan" : "Номер не зарегистрирован"}
                                                    </div>
                                                    <div style={{ fontSize: 13, color: "#9A3412", marginTop: 3, lineHeight: 1.45 }}>
                                                        {language === 'uz'
                                                            ? "Kiritilgan telefon raqami bo'yicha profil topilmadi. Telegram botimiz orqali bir necha soniyada bepul ro'yxatdan o'tishingiz mumkin:"
                                                            : "Профиль с таким номером не найден. Вы можете бесплатно зарегистрироваться через наш Telegram бот за пару секунд:"}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleTelegramAuth}
                                                disabled={tgAuthLoading}
                                                style={{
                                                    width: "100%",
                                                    padding: "12px 16px",
                                                    borderRadius: 14,
                                                    background: "#0088cc",
                                                    color: "#fff",
                                                    border: "none",
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    gap: 8,
                                                    boxShadow: "0 4px 12px rgba(0,136,204,0.28)",
                                                }}
                                            >
                                                <Send size={16} />
                                                {language === 'uz' ? "Telegram orqali ro'yxatdan o'tish" : "Зарегистрироваться через Telegram"}
                                            </button>
                                        </div>
                                    ) : errorType === "wrong_password" ? (
                                        <div style={{
                                            background: "#FEF2F2",
                                            border: "1.5px solid #FECACA",
                                            borderRadius: 16,
                                            padding: "16px",
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 12,
                                        }}>
                                            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                                                <span style={{ fontSize: 20, lineHeight: 1 }}>🔒</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontSize: 14.5, fontWeight: 700, color: "#DC2626" }}>
                                                        {language === 'uz' ? "Parol noto'g'ri" : "Неверный пароль"}
                                                    </div>
                                                    <div style={{ fontSize: 13, color: "#991B1B", marginTop: 3, lineHeight: 1.45 }}>
                                                        {language === 'uz'
                                                            ? "Kiritilgan parol ushbu raqamga mos kelmadi. Parolni unutgan bo'lsangiz, Telegram orqali parolsiz bir zumda kiring yoki tiklang:"
                                                            : "Введённый пароль не подходит к этому номеру. Если забыли пароль, войдите без пароля или восстановите доступ через Telegram:"}
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const tg = typeof window !== "undefined" ? (window as any).Telegram?.WebApp : null;
                                                    if (tg?.openTelegramLink) {
                                                        tg.openTelegramLink(BOT_URL);
                                                    } else {
                                                        window.location.href = BOT_URL;
                                                    }
                                                }}
                                                style={{
                                                    width: "100%",
                                                    padding: "12px 16px",
                                                    borderRadius: 14,
                                                    background: "#0088cc",
                                                    color: "#fff",
                                                    border: "none",
                                                    fontSize: 14,
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    gap: 8,
                                                    boxShadow: "0 4px 12px rgba(0,136,204,0.28)",
                                                }}
                                            >
                                                <Key size={16} />
                                                {language === 'uz' ? "Telegram orqali tezkor kirish / tiklash" : "Быстрый вход / сброс через Telegram"}
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: "#FFF0F0",
                                            border: "1px solid #FFD0D0",
                                            borderRadius: 14,
                                            padding: "12px 16px",
                                            fontSize: 13,
                                            color: "#FF3B30",
                                            lineHeight: 1.4,
                                        }}>
                                            {error}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading || !id.trim() || !password.trim()}
                                style={{
                                    width: "100%", padding: "17px 0", borderRadius: 18, border: "none",
                                    background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`,
                                    color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                    boxShadow: "0 8px 20px rgba(45,110,62,0.28)",
                                    opacity: loading || !id.trim() || !password.trim() ? 0.5 : 1,
                                    transition: `opacity 200ms ${EASE}`,
                                }}
                            >
                                {loading ? <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /> : (language === 'uz' ? "Kirish" : "Войти")}
                            </button>
                        </form>

                        {/* Terms */}
                        <p style={{ marginTop: 14, fontSize: 12, color: "#9AA29C", lineHeight: 1.5 }}>
                            {language === 'uz'
                                ? "Davom etish bilan siz Velari foydalanish shartlari va maxfiylik siyosatiga rozilik bildirasiz"
                                : "Продолжая, вы соглашаетесь с условиями использования и политикой конфиденциальности Velari"}
                        </p>

                        {/* Telegram register */}
                        <div style={{ marginTop: 32 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                                <div style={{ flex: 1, height: 1, background: "rgba(15,20,16,0.06)" }} />
                                <span style={{ fontSize: 11, color: "#9AA29C", whiteSpace: "nowrap" }}>
                                    {language === 'uz' ? "Yangi foydalanuvchi" : "Новый пользователь"}
                                </span>
                                <div style={{ flex: 1, height: 1, background: "rgba(15,20,16,0.06)" }} />
                            </div>

                            {tgPromptPhone ? (
                                <div style={{
                                    background: "#F4FBF6", border: `1.5px solid ${GREEN}`,
                                    borderRadius: 22, padding: "20px 18px", boxShadow: "0 8px 24px rgba(45,110,62,0.12)"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                                        <div style={{
                                            width: 42, height: 42, borderRadius: 14, background: GREEN,
                                            display: "flex", alignItems: "center", justifyContent: "center"
                                        }}>
                                            <User size={20} color="#fff" />
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: "#0F1410" }}>
                                                {tgUserInfo?.displayName || "Telegram foydalanuvchisi"}
                                            </div>
                                            <div style={{ fontSize: 12, color: GREEN, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                                                <ShieldCheck size={13} /> {language === 'uz' ? "Telegram orqali tasdiqlandi" : "Подтверждено через Telegram"}
                                            </div>
                                        </div>
                                    </div>

                                    <p style={{ fontSize: 13, color: "#5A625C", lineHeight: 1.5, marginBottom: 14 }}>
                                        {language === 'uz'
                                            ? "Buyurtmalarni yetkazib berish va hisobingiz uchun telefon raqamingizni kiriting:"
                                            : "Введите номер телефона для доставки заказов и привязки аккаунта:"}
                                    </p>

                                    <form onSubmit={handleTelegramRegisterSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                        <div style={{
                                            background: "#fff", borderRadius: 16, border: "1.5px solid rgba(15,20,16,0.1)",
                                            padding: "12px 14px", display: "flex", alignItems: "center", gap: 8
                                        }}>
                                            <span style={{ fontSize: 16, fontWeight: 600, color: "#0F1410" }}>🇺🇿 +998</span>
                                            <input
                                                type="tel"
                                                inputMode="numeric"
                                                value={tgPhone}
                                                onChange={(e) => setTgPhone(e.target.value)}
                                                placeholder="90 123 45 67"
                                                autoFocus
                                                required
                                                style={{
                                                    flex: 1, border: "none", outline: "none", background: "transparent",
                                                    fontSize: 16, fontWeight: 600, color: "#0F1410", fontFamily: "inherit"
                                                }}
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={tgAuthLoading || !tgPhone.trim()}
                                            style={{
                                                width: "100%", padding: "15px 0", borderRadius: 16, border: "none",
                                                background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`,
                                                color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer",
                                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                                boxShadow: "0 8px 20px rgba(45,110,62,0.28)",
                                                opacity: tgAuthLoading || !tgPhone.trim() ? 0.6 : 1
                                            }}
                                        >
                                            {tgAuthLoading ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : (language === 'uz' ? "Ro'yxatdan o'tish" : "Зарегистрироваться")}
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => setTgPromptPhone(false)}
                                            style={{
                                                background: "transparent", border: "none", color: "#8E8E93",
                                                fontSize: 13, cursor: "pointer", padding: "4px 0", textAlign: "center"
                                            }}
                                        >
                                            {language === 'uz' ? "Bekor qilish" : "Отмена"}
                                        </button>
                                    </form>
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={handleTelegramAuth}
                                    disabled={tgAuthLoading}
                                    style={{
                                        width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                                        display: "block",
                                        background: "linear-gradient(135deg, #2299d9 0%, #1d88c2 100%)",
                                        borderRadius: 22, padding: "20px 20px",
                                        boxShadow: "0 8px 24px rgba(34,153,217,0.25)",
                                        position: "relative", overflow: "hidden",
                                        opacity: tgAuthLoading ? 0.7 : 1
                                    }}
                                >
                                    <div style={{ position: "absolute", top: -20, right: -20, width: 100, height: 100, borderRadius: 50, background: "rgba(255,255,255,0.1)" }} />
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, position: "relative" }}>
                                        <div>
                                            <div style={{ fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: -0.3 }}>
                                                {language === 'uz' ? "Telegram orqali" : "Через Telegram"}
                                            </div>
                                            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 3 }}>
                                                {tgAuthLoading
                                                    ? (language === 'uz' ? "Tekshirilmoqda..." : "Проверка...")
                                                    : (language === 'uz' ? "Tezkor ro'yxatdan o'tish / Kirish" : "Мгновенная регистрация / Вход")}
                                            </div>
                                        </div>
                                        <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            {tgAuthLoading ? <Loader2 size={20} color="#fff" style={{ animation: "spin 1s linear infinite" }} /> : <Send size={22} color="#fff" style={{ transform: "rotate(-10deg)" }} />}
                                        </div>
                                    </div>
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    /* 2FA step */
                    <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{
                            width: 76, height: 76, borderRadius: 22, background: GREEN_TINT,
                            display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10,
                        }}>
                            <ShieldCheck size={36} color={GREEN} />
                        </div>
                        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.6, color: "#0F1410", lineHeight: 1.15 }}>
                            {language === 'uz' ? "Xavfsizlik kodi" : "Код безопасности"}
                        </h1>
                        <p style={{ margin: 0, fontSize: 15, color: "#5A625C", lineHeight: 1.5 }}>
                            {language === 'uz' ? "Telegram botingizga yuborilgan kodni kiriting" : "Введите код из Telegram"}
                        </p>

                        <input
                            required autoFocus type="text" maxLength={6}
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            placeholder="000000"
                            style={{
                                background: "#fff", borderRadius: 18,
                                border: `1.5px solid ${otp.length > 0 ? GREEN : "rgba(15,20,16,0.06)"}`,
                                padding: "20px 16px", textAlign: "center",
                                fontSize: 32, fontWeight: 700, color: "#0F1410",
                                letterSpacing: "0.5em", outline: "none", width: "100%",
                                fontFamily: "ui-monospace, monospace",
                                boxSizing: "border-box",
                            }}
                        />

                        {error && (
                            <div style={{ background: "#FFF0F0", borderRadius: 14, padding: "12px 16px", fontSize: 13, color: "#FF3B30" }}>
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading || otp.length < 4}
                            style={{
                                width: "100%", padding: "17px 0", borderRadius: 18, border: "none",
                                background: `linear-gradient(135deg, ${GREEN} 0%, ${GREEN_DEEP} 100%)`,
                                color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
                                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                                boxShadow: "0 8px 20px rgba(45,110,62,0.28)",
                                opacity: loading || otp.length < 4 ? 0.5 : 1,
                            }}
                        >
                            {loading ? <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} /> : (language === 'uz' ? "Tasdiqlash" : "Подтвердить")}
                        </button>

                        <button
                            type="button"
                            onClick={() => setStep("password")}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA29C", fontSize: 14, fontWeight: 500 }}
                        >
                            {language === 'uz' ? "← Orqaga" : "← Назад"}
                        </button>
                    </form>
                )}
            </div>

            {/* Vault tag — hidden */}
            <div style={{ padding: "24px 0", display: "flex", justifyContent: "center", opacity: 0.08 }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: "0.3em", textTransform: "uppercase", color: "#0F1410" }}>Iron Bank Vault v5.2</span>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div style={{ minHeight: "100vh", background: "#FAFAF6", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <Loader2 size={36} color={GREEN} style={{ animation: "spin 1s linear infinite" }} />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}

