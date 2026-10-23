import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * SERVER-ONLY Supabase Admin Client (bypasses RLS)
 * 
 * ⚠️ Bu fayl faqat API routes va Server Components dan import qilinishi kerak!
 * Hech qachon "use client" komponentlardan import QILMANG!
 * 
 * Service Role Key — bu Supabase RLS ni to'liq chetlab o'tadi.
 * Client-side ga tushib ketsa, barcha ma'lumotlar ochiq bo'ladi.
 */

let _supabaseAdmin: SupabaseClient | null = null;
let _supabaseAdminFresh: SupabaseClient | null = null;

function getSupabaseAdmin(fresh = false): SupabaseClient {
    if (typeof window !== 'undefined') {
        throw new Error(
            'XAVFSIZLIK BUZILISHI: supabase-admin.ts client-side da import qilindi! ' +
            'Faqat server-side (API routes, Server Components) da ishlatish kerak.'
        );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-role-key';

    if (fresh) {
        if (!_supabaseAdminFresh) {
            _supabaseAdminFresh = createClient(supabaseUrl, supabaseServiceKey, {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                },
                global: {
                    fetch: (url, init) => fetch(url, { ...init, cache: 'no-store' })
                }
            });
        }
        return _supabaseAdminFresh;
    }

    if (!_supabaseAdmin) {
        _supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    }
    return _supabaseAdmin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const client = getSupabaseAdmin(false);
        const val = (client as any)[prop];
        return typeof val === 'function' ? val.bind(client) : val;
    }
});

/**
 * LIVE ma'lumotlar uchun (buyurtma holati kabi) — Next.js Data Cache'ni
 * chetlab o'tadigan alohida klient.
 *
 * ⚠️ NEGA ALOHIDA: oddiy `supabaseAdmin` ommaviy ISR sahifalarda ham ishlatiladi
 * (bosh sahifa, mahsulotlar, katalog — `export const revalidate`). Agar no-store'ni
 * GLOBAL qilsak, o'sha sahifalar ISR'dan chiqib, "Dynamic server usage" xatosi bilan
 * har so'rovda dinamik render bo'ladi (TTFB/SEO regressiyasi). Shuning uchun
 * no-store FAQAT shu klientda — uni faqat buyurtma o'qish endpointlari ishlatadi.
 */
export const supabaseAdminFresh = new Proxy({} as SupabaseClient, {
    get(_target, prop) {
        const client = getSupabaseAdmin(true);
        const val = (client as any)[prop];
        return typeof val === 'function' ? val.bind(client) : val;
    }
});
