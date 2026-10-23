/**
 * Velari Unified Stock Calculation
 * 
 * Stock is calculated consistently across:
 * - Search API (/api/search)
 * - Catalog (/catalog)
 * - Home (/ & ProductCard)
 * - Checkout & Order Processing (/api/orders)
 * 
 * Rules:
 * 1. If stock_details / stockDetails is provided as a non-empty object (warehouse map),
 *    the real stock is the sum of positive quantities across all warehouses.
 * 2. If stock_details is not present or empty, fallback to product.stock.
 * 3. Never consider a product in-stock if real stock <= 0.
 */

export function getProductRealStock(p: {
    stock?: number | null;
    stock_details?: Record<string, number | string> | null;
    stockDetails?: Record<string, number | string> | null;
}): number {
    if (!p) return 0;
    const details = p.stockDetails || p.stock_details;
    if (details && typeof details === 'object' && !Array.isArray(details)) {
        const keys = Object.keys(details);
        if (keys.length > 0) {
            return keys.reduce((total, key) => {
                const val = Number(details[key]);
                return total + (!isNaN(val) && val > 0 ? val : 0);
            }, 0);
        }
    }
    const fallback = Number(p.stock);
    return !isNaN(fallback) && fallback > 0 ? fallback : 0;
}

export function isProductInStock(p: {
    stock?: number | null;
    stock_details?: Record<string, number | string> | null;
    stockDetails?: Record<string, number | string> | null;
}): boolean {
    return getProductRealStock(p) > 0;
}
