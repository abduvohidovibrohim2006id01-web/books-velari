import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { i18n } from '@/lib/i18n-config';
import { match as matchLocale } from '@formatjs/intl-localematcher';
import Negotiator from 'negotiator';

/**
 * Secure JWT Verification for Edge
 */
import { verifyJwt } from '@/lib/jwt-utils';

/**
 * Locale detection
 */
function getLocale(request: NextRequest): string | undefined {
    const negotiatorHeaders: Record<string, string> = {};
    request.headers.forEach((value, key) => (negotiatorHeaders[key] = value));

    const locales: string[] = i18n.locales as any;
    let languages = new Negotiator({ headers: negotiatorHeaders }).languages();

    try {
        return matchLocale(languages, locales, i18n.defaultLocale);
    } catch (e) {
        return i18n.defaultLocale;
    }
}

const STATIC_FILE_RE = /\.(png|jpe?g|webp|avif|svg|ico|gif|txt|xml|js|css|map|json|woff2?|mp4|mp3|webmanifest|html)$/i;

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // 1. Bypass static & public files — faqat haqiqiy fayl kengaytmalari.
    // Artikulida nuqta bor mahsulot slug'i (/products/nom--AB.12) middleware'dan o'tadi.
    if (STATIC_FILE_RE.test(pathname) && !pathname.includes('/api/')) {
        return NextResponse.next();
    }

    // 2. Locale Redirection
    const pathnameIsMissingLocale = i18n.locales.every(
        (locale) => !pathname.startsWith(`/${locale}/`) && pathname !== `/${locale}`
    );

    if (pathnameIsMissingLocale && !pathname.startsWith('/api/')) {
        const locale = getLocale(request);
        const url = new URL(`/${locale}${pathname === '/' ? '' : pathname}`, request.url);
        url.search = request.nextUrl.search;
        // 307 + Vary: til brauzer tiliga (Accept-Language) qarab tanlanadi — natija foydalanuvchiga bog'liq,
        // shuning uchun doimiy (308) emas va keshlar tilni hisobga olsin. Slug redirect'lari (sahifalarda) 308.
        const res = NextResponse.redirect(url, 307);
        res.headers.set('Vary', 'Accept-Language');
        return res;
    }

    // 3. Admin Protection
    let localePart: string = i18n.defaultLocale;
    for (const locale of i18n.locales) {
        if (pathname.startsWith(`/${locale}/`)) {
            localePart = locale;
            break;
        }
    }

    const pathWithoutLocale = pathname.replace(`/${localePart}`, '');
    const privateRoutes = [
        '/login',
        '/account',
        '/cart',
        '/wishlist',
        '/messages',
        '/checkout',
        '/orders',
        '/wallet',
        '/payment',
        '/order-success',
        '/auth',
        '/ref',
        '/admin',
    ];
    const isPrivateRoute = privateRoutes.some(
        (route) => pathWithoutLocale === route || pathWithoutLocale.startsWith(`${route}/`)
    );

    const applyRobotsPolicy = (response: NextResponse) => {
        if (isPrivateRoute) {
            response.headers.set('X-Robots-Tag', 'noindex, nofollow');
        }
        return response;
    };

    // 3. Admin Protection (Pages & API)
    // /api/admin/bot Telegram Webhook orqali chaqiriladi va o'zining chatId tekshiruviga ega
    if ((pathWithoutLocale.startsWith('/admin') || pathname.startsWith('/api/admin')) && pathname !== '/api/admin/bot') {
        const ADMIN_SECRET = process.env.ADMIN_SECRET?.trim();
        const headerSecret = request.headers.get('x-admin-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');

        // Xizmatlararo (Service-to-Service) to'g'ri ADMIN_SECRET orqali chaqiruvlar
        const isSecretAuthorized = Boolean(ADMIN_SECRET && headerSecret && headerSecret === ADMIN_SECRET);

        const adminToken = request.cookies.get('admin_token')?.value;
        const payload = adminToken && ADMIN_SECRET ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
        const isAdmin = isSecretAuthorized || Boolean(payload && payload.role === 'admin');

        if (!isAdmin) {
            // IF it's an API request, return 401
            if (pathname.startsWith('/api/')) {
                return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
            }
            
            // If it's a page request, redirect to login
            const loginUrl = new URL(`/${localePart}/login`, request.url);
            loginUrl.searchParams.set('redirect', pathname);
            return applyRobotsPolicy(NextResponse.redirect(loginUrl));
        }

        return applyRobotsPolicy(NextResponse.next());
    }

    return applyRobotsPolicy(NextResponse.next());
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|icons|images|manifest.json|robots.txt|sitemap.xml|image-sitemap.xml|yandex_).*)',
    ],
};
