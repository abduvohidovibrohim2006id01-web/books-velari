/**
 * Yandex Metrika markazlashgan helper.
 * Hisoblagich init YandexMetrika.tsx komponentida (tag.js + ecommerce:"dataLayer").
 * Bu yerda: SPA pageview, goal (reachGoal) va e-commerce dataLayer yordamchilari.
 *
 * Hammasi window.ym mavjudligini tekshiradi — SSR/agar bloklangan bo'lsa jim o'tadi.
 */

export const YM_ID: number = Number(process.env.NEXT_PUBLIC_YM_ID || 107383008);
export const YM_CURRENCY = 'UZS';

type Params = Record<string, any>;

function callYm(...args: any[]) {
    if (typeof window === 'undefined') return;
    const ym = (window as any).ym;
    if (typeof ym === 'function') {
        try { ym(YM_ID, ...args); } catch { /* jim */ }
    }
}

function callGtag(...args: any[]) {
    if (typeof window === 'undefined') return;
    const gtag = (window as any).gtag;
    if (typeof gtag === 'function') {
        try { gtag(...args); } catch { /* jim */ }
    }
}

function callFbq(...args: any[]) {
    if (typeof window === 'undefined') return;
    const fbq = (window as any).fbq;
    if (typeof fbq === 'function') {
        try { fbq(...args); } catch { /* jim */ }
    }
}

/** SPA sahifa ko'rinishi (route o'zgarganda). */
export function ymHit(url?: string, options?: Params) {
    const href = url || (typeof window !== 'undefined' ? window.location.href : '');
    if (!href) return;
    callYm('hit', href, { title: typeof document !== 'undefined' ? document.title : undefined, ...options });
}

/** Maqsad (konversiya): savatga qo'shish, buyurtma, to'lov va h.k. */
export function ymGoal(goal: string, params?: Params) {
    callYm('reachGoal', goal, params);
    // Google Analytics goal tracking
    callGtag('event', goal, params);
    callFbq('trackCustom', goal, params);
}

// ── E-commerce (dataLayer) ─────────────────────────────────────────────
export interface EcomProduct {
    id: string | number;
    name: string;
    price?: number;
    category?: string;
    brand?: string;
    variant?: string;
    quantity?: number;
}

function pushEcom(action: string, payload: Params) {
    if (typeof window === 'undefined') return;
    const w = window as any;
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ ecommerce: { currencyCode: YM_CURRENCY, [action]: payload } });
}

export function ymViewProduct(product: EcomProduct) {
    pushEcom('detail', { products: [product] });
    
    // GA4 view_item event
    callGtag('event', 'view_item', {
        currency: YM_CURRENCY,
        value: product.price,
        items: [{
            item_id: String(product.id),
            item_name: product.name,
            price: product.price,
            item_category: product.category,
            item_brand: product.brand,
            item_variant: product.variant,
            quantity: product.quantity || 1
        }]
    });

    // Meta Pixel ViewContent event
    callFbq('track', 'ViewContent', {
        content_name: product.name,
        content_ids: [String(product.id)],
        content_type: 'product',
        value: product.price || 0,
        currency: YM_CURRENCY
    });
}

export function ymAddToCart(product: EcomProduct) {
    pushEcom('add', { products: [{ ...product, quantity: product.quantity || 1 }] });

    // GA4 add_to_cart event
    callGtag('event', 'add_to_cart', {
        currency: YM_CURRENCY,
        value: (product.price || 0) * (product.quantity || 1),
        items: [{
            item_id: String(product.id),
            item_name: product.name,
            price: product.price,
            item_category: product.category,
            item_brand: product.brand,
            item_variant: product.variant,
            quantity: product.quantity || 1
        }]
    });

    // Meta Pixel AddToCart event
    callFbq('track', 'AddToCart', {
        content_name: product.name,
        content_ids: [String(product.id)],
        content_type: 'product',
        value: (product.price || 0) * (product.quantity || 1),
        currency: YM_CURRENCY
    });
}

export function ymRemoveFromCart(product: EcomProduct) {
    pushEcom('remove', { products: [{ ...product, quantity: product.quantity || 1 }] });

    // GA4 remove_from_cart event
    callGtag('event', 'remove_from_cart', {
        currency: YM_CURRENCY,
        value: (product.price || 0) * (product.quantity || 1),
        items: [{
            item_id: String(product.id),
            item_name: product.name,
            price: product.price,
            item_category: product.category,
            item_brand: product.brand,
            item_variant: product.variant,
            quantity: product.quantity || 1
        }]
    });
}

export function ymPurchase(products: EcomProduct[], order: { id: string; revenue: number }) {
    pushEcom('purchase', { actionField: { id: order.id, revenue: order.revenue }, products });

    // GA4 purchase event
    callGtag('event', 'purchase', {
        transaction_id: order.id,
        value: order.revenue,
        currency: YM_CURRENCY,
        items: products.map(product => ({
            item_id: String(product.id),
            item_name: product.name,
            price: product.price,
            item_category: product.category,
            item_brand: product.brand,
            item_variant: product.variant,
            quantity: product.quantity || 1
        }))
    });

    // Meta Pixel Purchase event
    callFbq('track', 'Purchase', {
        value: order.revenue,
        currency: YM_CURRENCY,
        content_ids: products.map(p => String(p.id)),
        content_type: 'product'
    });
}

