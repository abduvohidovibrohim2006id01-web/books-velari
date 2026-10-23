import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimit } from "@/lib/rate-limiter";
import { authSchema } from "@/lib/validators";
import { writeVisitorLog, getGeoByIp } from "@/lib/visitor-log";

/**
 * Iron Bank: JWT Token Creator (Edge-compatible)
 */
function createToken(payload: Record<string, unknown>, secret: string): string {
    const header = { alg: "HS256", typ: "JWT" };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString("base64url");
    const bodyB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
    
    const signature = crypto
        .createHmac("sha256", secret)
        .update(`${headerB64}.${bodyB64}`)
        .digest("base64url");
        
    return `${headerB64}.${bodyB64}.${signature}`;
}

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    try {
        // 0. RATE LIMITING (5 attempts per minute)
        if (!await checkRateLimit(ip, 5, 60)) {
            return NextResponse.json({ error: "Siz juda ko'p urinish qildingiz. Birozdan so'ng qayta urining." }, { status: 429 });
        }

        const body = await req.json();
        const validation = authSchema.safeParse(body);
        
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
        }

        const { id, password, code, step = "password" } = validation.data;

        // 1. IRON BANK: Brute Force & Vault Lock Shield
        const { data: userData } = await supabaseAdmin.from("users").select("is_vault_locked").eq("phone", id).single();
        if (userData?.is_vault_locked) {
            return NextResponse.json({ error: "VAULT LOCK: Admin panel favqulodda holat tufayli yopilgan." }, { status: 403 });
        }

        const { data: trap } = await supabaseAdmin.from("security_traps").select("*").eq("ip_address", ip).single();
        if (trap?.is_blocked) {
            return NextResponse.json({ error: "XAVFSIZLIK: IP-manzilingiz shubhali harakat tufayli bloklangan." }, { status: 403 });
        }

        const ADMIN_ID = process.env.ADMIN_LOGIN?.trim();
        const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim();
        const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
        const BOT_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN;
        const ADMIN_CHAT_ID = process.env.TELEGRAM_ADMIN_ID;

        if (!ADMIN_ID || !ADMIN_PASSWORD || !ADMIN_SECRET) {
            return NextResponse.json(
                { error: "Server konfiguratsiyasi noto'g'ri. Admin muhit o'zgaruvchilari o'rnatilmagan." },
                { status: 500 }
            );
        }

        // STEP 1: PASSWORD VERIFICATION
        if (step === "password") {
            if (!id || !password) return NextResponse.json({ error: "Ma'lumotlar to'liq emas" }, { status: 400 });

            if (id.toLowerCase() !== ADMIN_ID.toLowerCase() || password !== ADMIN_PASSWORD) {
                // Security Trap Logic
                const currentAttempts = (trap?.attempts || 0) + 1;
                await supabaseAdmin.from("security_traps").upsert({
                    ip_address: ip,
                    attempts: currentAttempts,
                    is_blocked: currentAttempts >= 3,
                    last_attempt: new Date().toISOString()
                });

                // Audit Log
                await supabaseAdmin.from("admin_audit_logs").insert([{
                    admin_phone: id,
                    action: "FAILED_LOGIN_ATTEMPT",
                    target: "Vault Entry",
                    ip_address: ip,
                    user_agent: userAgent
                }]);

                return NextResponse.json({ error: "Xatolik! Qolgan urinishlar: " + (3 - currentAttempts) }, { status: 401 });
            }

            // Correct Password -> Generate 2FA
            const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
            const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();

            // Save OTP to DB (bypass RLS)
            await supabaseAdmin.from("wallet_otps").delete().eq("phone", "ADMIN_VAULT");
            await supabaseAdmin.from("wallet_otps").insert([{
                phone: "ADMIN_VAULT",
                code: otpCode,
                expires_at: expires
            }]);

            // Notify via Telegram
            if (BOT_TOKEN && ADMIN_CHAT_ID) {
                const text = `🏦 *IRON BANK SECURITY*\n\nAdmin panelga kirishga urinish.\n🔐 Tasdiqlash kodi: \`${otpCode}\`\n📍 IP: ${ip}\n📱 Qurilma: ${userAgent}\n\n🕒 Amal qilish muddati: 5 daqiqa.`;
                await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ chat_id: ADMIN_CHAT_ID, text: text, parse_mode: "Markdown" })
                });
            }

            return NextResponse.json({ success: true, step: "2fa" });
        }

        // STEP 2: 2FA VERIFICATION
        if (step === "2fa") {
            if (!code) return NextResponse.json({ error: "Kod kiriting" }, { status: 400 });

            const { data: otp } = await supabaseAdmin
                .from("wallet_otps")
                .select("*")
                .eq("phone", "ADMIN_VAULT")
                .eq("code", code)
                .gt("expires_at", new Date().toISOString())
                .single();

            if (!otp) {
                return NextResponse.json({ error: "Kod noto'g'ri yoki muddati tugagan" }, { status: 401 });
            }

            // SUCCESS! Create Token
            const now = Math.floor(Date.now() / 1000);
            const token = createToken({
                sub: ADMIN_ID,
                role: "admin",
                iat: now,
                exp: now + 604800, // 7 kun
                vault_level: 5
            }, ADMIN_SECRET);

            // Audit
            await supabaseAdmin.from("admin_audit_logs").insert([{
                admin_phone: ADMIN_ID,
                action: "SUCCESSFUL_VAULT_ENTRY",
                target: "Dashboard",
                ip_address: ip,
                user_agent: userAgent
            }]);

            // Clear Traps
            await supabaseAdmin.from("security_traps").delete().eq("ip_address", ip);
            await supabaseAdmin.from("wallet_otps").delete().eq("phone", "ADMIN_VAULT");

            const response = NextResponse.json({
                success: true,
                user: { id: "ADMIN", phone: "ADMIN", name: "Master Administrator", isAdmin: true },
                token
            });

            // ✍️ ADMIN LOGIN LOG (Kirdi-chiqdi jurnaliga qo'shish)
            getGeoByIp(ip).then(geo => {
                writeVisitorLog({
                    user_phone: ADMIN_ID,
                    name: "ADMIN",
                    event_type: "login",
                    ip_address: ip,
                    ...geo,
                    current_path: "/admin",
                });
            });

            // Set cookie with maximum compatibility
            response.cookies.set("admin_token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                maxAge: 604800, // 7 kun
                path: "/"
            });

            return response;
        }

        return NextResponse.json({ error: "Invalid Step" }, { status: 400 });
    } catch (error) {
        console.error("Iron Bank Auth Error:", error);
        return NextResponse.json({ error: "Tizim xatoligi" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const token = req.cookies.get("admin_token")?.value;
    if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });

    const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
    if (!ADMIN_SECRET) return NextResponse.json({ authenticated: false }, { status: 500 });
    try {
        const [header, body, signature] = token.split(".");
        const expectedSig = crypto
            .createHmac("sha256", ADMIN_SECRET)
            .update(`${header}.${body}`)
            .digest("base64url");
        if (signature !== expectedSig) return NextResponse.json({ authenticated: false }, { status: 401 });

        const payload = JSON.parse(Buffer.from(body, "base64url").toString());
        const now = Math.floor(Date.now() / 1000);
        if (payload.exp < now || payload.role !== "admin") return NextResponse.json({ authenticated: false }, { status: 401 });

        return NextResponse.json({ authenticated: true, user: { id: "ADMIN", name: "Master Administrator" } });
    } catch {
        return NextResponse.json({ authenticated: false }, { status: 401 });
    }
}
