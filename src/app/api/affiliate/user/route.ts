import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { verifyJwt } from "@/lib/jwt-utils";
import crypto from "crypto";
import { hashPassword } from "@/lib/auth-utils";
import { sendPinResetCode, sendMemberVerificationCode } from "@/lib/telegram";
import { getUserJwtSecret } from "@/lib/secrets";
import { checkRateLimit } from "@/lib/rate-limiter";

function hashPin(pin: string, salt?: string): string {
    const s = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(pin, s, 100000, 32, 'sha256').toString('hex');
    return `${s}:${hash}`;
}

function verifyPin(pin: string, stored: string): boolean {
    if (stored.includes(':')) {
        const [salt, hash] = stored.split(':');
        const candidate = crypto.pbkdf2Sync(pin, salt, 100000, 32, 'sha256').toString('hex');
        return candidate === hash;
    }
    // Legacy: plain SHA256 (no salt) — accepts but next set_pin will upgrade
    return crypto.createHash('sha256').update(pin).digest('hex') === stored;
}

async function getUserFromToken(req: NextRequest) {
    const token = req.cookies.get("user_token")?.value;
    if (!token) return null;
    
    const JWT_SECRET = getUserJwtSecret();
    const payload = await verifyJwt(token, JWT_SECRET);
    if (!payload || !payload.sub) return null;
    
    return payload.sub; // This is the user's phone number
}

export async function GET(req: NextRequest) {
    const userPhone = await getUserFromToken(req);
    if (!userPhone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        // 1. Get user details including MLM role and status
        const { data: user, error: userError } = await supabaseAdmin
            .from("users")
            .select("id, phone, name, affiliate_code, real_balance, affiliate_role, affiliate_pin, affiliate_agreed, upline_id")
            .eq("phone", userPhone)
            .single();

        if (userError || !user) throw userError || new Error("User not found");

        // 2. Parallel fetch for wallet, downline, transactions, and withdrawals
        const [
            { data: wallet },
            { data: teamMembers },
            { data: transactions },
            { data: withdrawals }
        ] = await Promise.all([
            supabaseAdmin.from("user_wallets").select("balance").eq("user_phone", userPhone).maybeSingle(),
            supabaseAdmin.from("users").select("id, phone, name, affiliate_role, created_at").eq("upline_id", user.id),
            supabaseAdmin.from("affiliate_transactions").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
            supabaseAdmin.from("withdraw_requests").select("*").eq("user_phone", userPhone).order("created_at", { ascending: false }),
        ]);

        const wallet_balance = wallet?.balance || 0;

        return NextResponse.json({
            success: true,
            user: {
                ...user,
                wallet_balance,
                hasPin: !!user.affiliate_pin,
                affiliate_pin: undefined // Don't send hash to client
            },
            team: teamMembers || [],
            transactions: transactions || [],
            withdrawals: withdrawals || []
        });

    } catch (error: any) {
        console.error("Affiliate User GET Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const userPhone = await getUserFromToken(req);
    if (!userPhone) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { action, pin, amount, card_number, memberPhone, verificationCode, productId } = body;

        // Brute-force himoyasi (1 daqiqada 5 ta urinish)
        const rateLimitedActions = [
            "verify_pin",
            "verify_password",
            "add_team_member",
            "verify_telegram_reset",
            "request_telegram_reset",
            "request_member_verification",
            "withdraw"
        ];
        if (rateLimitedActions.includes(action)) {
            if (!(await checkRateLimit(`${userPhone}:${action}`, 5, 60, "affiliate-pin"))) {
                return NextResponse.json({ error: "Juda ko'p urinish. 1 daqiqa kuting." }, { status: 429 });
            }
        }

        // --- PIN SETUP ---
        if (action === "set_pin") {
            if (!pin || pin.length !== 4) return NextResponse.json({ error: "PIN 4 ta raqam bo'lishi kerak" }, { status: 400 });
            const hashedPin = hashPin(pin);
            await supabaseAdmin.from("users").update({ affiliate_pin: hashedPin }).eq("phone", userPhone);
            return NextResponse.json({ success: true });
        }

        // --- PIN VERIFY ---
        if (action === "verify_pin") {
            const { data: user } = await supabaseAdmin.from("users").select("affiliate_pin").eq("phone", userPhone).single();
            if (!user?.affiliate_pin) return NextResponse.json({ error: "PIN o'rnatilmagan" }, { status: 400 });
            if (!verifyPin(pin, user.affiliate_pin)) return NextResponse.json({ error: "Noto'g'ri PIN" }, { status: 400 });
            return NextResponse.json({ success: true });
        }

        // --- AGREE CONTRACT ---
        if (action === "agree_contract") {
            const { data: curr } = await supabaseAdmin.from("users").select("affiliate_role, upline_id").eq("phone", userPhone).single();
            if (!curr?.affiliate_role && !curr?.upline_id) {
                await supabaseAdmin.from("users").update({ affiliate_agreed: true, affiliate_role: 'top_manager' }).eq("phone", userPhone);
            } else {
                await supabaseAdmin.from("users").update({ affiliate_agreed: true }).eq("phone", userPhone);
            }
            return NextResponse.json({ success: true });
        }

        // --- TRANSFER TO CASHBACK ---
        if (action === "transfer_to_cashback") {
            if (!amount || amount <= 0) return NextResponse.json({ error: "Miqdor noto'g'ri" }, { status: 400 });

            const { data: user } = await supabaseAdmin.from("users").select("id, real_balance").eq("phone", userPhone).single();
            if (!user || user.real_balance < amount) return NextResponse.json({ error: "Mablag' yetarli emas" }, { status: 400 });

            // Atomically deduct — only succeeds if balance hasn't changed since we read it
            const { data: updated } = await supabaseAdmin
                .from("users")
                .update({ real_balance: Number(user.real_balance) - Number(amount) })
                .eq("phone", userPhone)
                .eq("real_balance", user.real_balance)
                .select("id");

            if (!updated || updated.length === 0) {
                return NextResponse.json({ error: "Mablag' o'zgardi, qayta urinib ko'ring" }, { status: 409 });
            }

            // Add to user_wallets
            const { data: wallet } = await supabaseAdmin.from("user_wallets").select("balance").eq("user_phone", userPhone).single();
            if (wallet) {
                await supabaseAdmin.from("user_wallets").update({
                    balance: Number(wallet.balance) + Number(amount)
                }).eq("user_phone", userPhone);
            } else {
                await supabaseAdmin.from("user_wallets").insert({
                    user_phone: userPhone,
                    balance: amount,
                    wallet_number: userPhone.replace("+", "")
                });
            }

            return NextResponse.json({ success: true });
        }

        // --- REQUEST MEMBER VERIFICATION ---
        if (action === "request_member_verification") {
            if (!memberPhone) return NextResponse.json({ error: "Telefon raqamni kiriting" }, { status: 400 });
            
            // 1. Check if user exists
            const { data: targetUser } = await supabaseAdmin.from("users").select("id, telegram_id").eq("phone", memberPhone).single();
            if (!targetUser) return NextResponse.json({ error: "Foydalanuvchi topilmadi. Avval u ro'yxatdan o'tishi kerak." }, { status: 404 });
            if (!targetUser.telegram_id) return NextResponse.json({ error: "Foydalanuvchi botga ulanmagan. U avval botni ishga tushirishi kerak." }, { status: 400 });

            // 2. Generate and save code
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            
            await supabaseAdmin.from("wallet_otps").upsert({
                phone: `MEMBER_ADD_${memberPhone}`,
                code,
                expires_at: expires
            });

            // 3. Get sender info and send via Telegram
            const { data: sender } = await supabaseAdmin.from("users").select("name").eq("phone", userPhone).single();
            await sendMemberVerificationCode(memberPhone, sender?.name || userPhone, code);
            
            return NextResponse.json({ success: true });
        }

        // --- ADD TEAM MEMBER ---
        if (action === "add_team_member") {
            // 1. Get current user's role and ID
            const { data: currentUser } = await supabaseAdmin.from("users").select("id, affiliate_role").eq("phone", userPhone).single();
            if (!currentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

            // 2. Check team size limit (max 10)
            const { count } = await supabaseAdmin.from("users").select("*", { count: 'exact', head: true }).eq("upline_id", currentUser.id);
            if (count && count >= 10) return NextResponse.json({ error: "Maksimal jamoa a'zolari soniga yetildi (10)" }, { status: 400 });

            // 3. Find the new member by phone
            const { data: newMember } = await supabaseAdmin.from("users").select("id, phone, upline_id").eq("phone", memberPhone).single();
            if (!newMember) return NextResponse.json({ error: "Foydalanuvchi topilmadi. Avval u ro'yxatdan o'tishi kerak." }, { status: 404 });
            if (newMember.upline_id) return NextResponse.json({ error: "Ushbu foydalanuvchi allaqachon jamoada" }, { status: 400 });

            // 4. Verification Logic
            const { data: otp } = await supabaseAdmin
                .from("wallet_otps")
                .select("*")
                .eq("phone", `MEMBER_ADD_${memberPhone}`)
                .eq("code", verificationCode)
                .gt("expires_at", new Date().toISOString())
                .single();

            if (!otp) return NextResponse.json({ error: "Kod noto'g'ri yoki muddati tugagan" }, { status: 401 });

            // Clear OTP
            await supabaseAdmin.from("wallet_otps").delete().eq("phone", `MEMBER_ADD_${memberPhone}`);

            // 5. Determine new role
            let newRole: string = 'agent';
            if (currentUser.affiliate_role === 'top_manager') newRole = 'sales_manager';
            else if (currentUser.affiliate_role === 'sales_manager' || currentUser.affiliate_role === 'top_sales_manager') newRole = 'agent';

            await supabaseAdmin.from("users").update({ 
                upline_id: currentUser.id,
                affiliate_role: newRole,
                affiliate_agreed: true 
            }).eq("id", newMember.id);

            // 6. Upgrade current user if they become Top Sales Manager
            if (currentUser.affiliate_role === 'sales_manager' && newRole === 'agent') {
                await supabaseAdmin.from("users").update({ affiliate_role: 'top_sales_manager' }).eq("id", currentUser.id);
            }

            return NextResponse.json({ success: true });
        }

        // --- CREATE REFERRAL LINK ---
        if (action === "create_link") {
            const { data: user } = await supabaseAdmin.from("users").select("id").eq("phone", userPhone).single();
            if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

            // Anonim, URL-xavfsiz slug (hamkor ismi ko'rinmasligi uchun) + collision retry
            let slug = "";
            for (let i = 0; i < 5; i++) {
                const candidate = crypto.randomBytes(5).toString('hex');
                const { data: existing } = await supabaseAdmin.from("affiliate_links").select("id").eq("slug", candidate).maybeSingle();
                if (!existing) { slug = candidate; break; }
            }
            if (!slug) return NextResponse.json({ error: "Urinib ko'ring (slug collision)" }, { status: 500 });

            const { data: link, error: linkError } = await supabaseAdmin
                .from("affiliate_links")
                .insert({ user_id: user.id, product_id: productId, slug })
                .select()
                .single();
            if (linkError) throw linkError;
            return NextResponse.json({ success: true, slug, data: link });
        }

        // --- VERIFY ACCOUNT PASSWORD ---
        if (action === "verify_password") {
            const { password } = body;
            const { data: user } = await supabaseAdmin.from("users").select("password").eq("phone", userPhone).single();
            if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
            
            const isMatch = user.password === password || user.password === hashPassword(password);
            if (!isMatch) return NextResponse.json({ error: "Parol noto'g'ri" }, { status: 401 });
            
            return NextResponse.json({ success: true });
        }

        // --- REQUEST TELEGRAM RESET ---
        if (action === "request_telegram_reset") {
            const code = Math.floor(1000 + Math.random() * 9000).toString();
            const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
            
            // Save code to DB (re-use wallet_otps table or similar)
            await supabaseAdmin.from("wallet_otps").upsert({
                phone: `PIN_RESET_${userPhone}`,
                code,
                expires_at: expires
            });

            // Send via Telegram
            await sendPinResetCode(userPhone, code);
            
            return NextResponse.json({ success: true });
        }

        // --- VERIFY TELEGRAM RESET ---
        if (action === "verify_telegram_reset") {
            const { code, newPin } = body;
            const { data: otp } = await supabaseAdmin
                .from("wallet_otps")
                .select("*")
                .eq("phone", `PIN_RESET_${userPhone}`)
                .eq("code", code)
                .gt("expires_at", new Date().toISOString())
                .single();

            if (!otp) return NextResponse.json({ error: "Kod noto'g'ri yoki muddati tugagan" }, { status: 401 });

            // Set new PIN (salted PBKDF2)
            const hashedPin = hashPin(newPin);
            await supabaseAdmin.from("users").update({ affiliate_pin: hashedPin }).eq("phone", userPhone);
            
            // Clear OTP
            await supabaseAdmin.from("wallet_otps").delete().eq("phone", `PIN_RESET_${userPhone}`);
            
            return NextResponse.json({ success: true });
        }

        // --- WITHDRAW ---
        if (action === "withdraw") {
            if (!amount || amount <= 0) return NextResponse.json({ error: "Miqdor noto'g'ri" }, { status: 400 });

            const { data: user } = await supabaseAdmin.from("users").select("real_balance").eq("phone", userPhone).single();
            if (!user || user.real_balance < amount) return NextResponse.json({ error: "Mablag' yetarli emas" }, { status: 400 });

            // Atomically deduct — only succeeds if balance hasn't changed since we read it
            const { data: updated } = await supabaseAdmin
                .from("users")
                .update({ real_balance: Number(user.real_balance) - Number(amount) })
                .eq("phone", userPhone)
                .eq("real_balance", user.real_balance)
                .select("id");

            if (!updated || updated.length === 0) {
                return NextResponse.json({ error: "Mablag' o'zgardi, qayta urinib ko'ring" }, { status: 409 });
            }

            await supabaseAdmin.from("withdraw_requests").insert({
                user_phone: userPhone,
                amount,
                card_number,
                status: "pending"
            });

            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error: any) {
        console.error("Affiliate User POST Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
