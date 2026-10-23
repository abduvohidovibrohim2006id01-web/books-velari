/**
 * Shared TypeScript interfaces for the entire application
 * Barcha sahifalarda va komponentlarda shu typlar ishlatiladi
 */

export interface Product {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    price: number;
    oldPrice?: number;
    image: string;
    imageUrl?: string; // backward compat
    images?: string[];
    category: string;
    category_uz?: string;
    category_ru?: string;
    description?: string;
    description_uz?: string;
    description_ru?: string;
    rating?: number;
    reviewCount?: number;
    sales: number;
    tag?: string;
    tags?: string[];
    features?: string[];
    isDeleted?: boolean;
    express_delivery?: boolean;
    isOriginal?: boolean;
    stockDetails?: Record<string, number>;
    stock?: number;
    groupId?: string;
    colorName?: string;
    sku?: string;
    article?: string;
    videoUrl?: string;
    model?: string;
    brand_id?: string;
    image_metadata?: Record<string, { alt_uz?: string; alt_ru?: string; blurDataURL?: string; lowResUrl?: string; xs?: string; md?: string; lg?: string }>;
    created_at?: string;
    ai_persona?: {
        personas?: string[];
        use_cases?: string[];
        moods?: string[];
        complements?: string[];
        value_props?: string[];
        occasions?: string[];
        search_terms?: string[];
        one_liner_uz?: string;
        one_liner_ru?: string;
    } | string | null;
    initialGroupProducts?: Product[];
}

export interface CartItem extends Product {
    quantity: number;
    selectedColor?: string;
    selectedSize?: string;
}

export interface Category {
    image_meta?: { xs?: string; md?: string; lg?: string; lowResUrl?: string; blurDataURL?: string };
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    parentId?: string;
    icon?: string;
    blurDataURL?: string;
    order?: number;
}

export interface Banner {
    id: string;
    html_uz?: string;
    html_ru?: string;
    title_uz?: string;
    title_ru?: string;
    tabName_uz?: string;
    tabName_ru?: string;
    order?: number;
}

export interface User {
    id?: string;
    phone: string;
    name?: string;
    username?: string;
    isAdmin?: boolean;
}

export interface Order {
    id: string;
    userPhone: string;
    items: OrderItem[];
    total: number;
    address?: string;
    coords?: [number, number];
    status: string;
    created_at?: string;
}

export interface OrderItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
}

export interface BannerSettings {
    desktopHeight: number;
    borderRadius: number;
}

export interface Toast {
    message: string;
    type: 'success' | 'error' | 'info';
}

export interface Reel {
    id: string;
    videoUrl: string;
    thumbnailUrl?: string; // Optional cover image
    productId?: string; // Link to a product
    productName?: string;
    productPrice?: number;
    description?: string;
    likes?: number;
    views?: number;
    likesCount?: number;
    commentCount?: number;
    name?: string;
    name_uz?: string;
    name_ru?: string;
    price?: number;
    oldPrice?: number;
    image?: string;
    images?: string[];
    stockDetails?: any;
    stock?: number;
    colorName?: string;
    model?: string;
    groupId?: string;
    article?: string;
    category?: string;
    image_metadata?: any;
    rawImage?: string;
}

export type Language = "uz" | "ru";

export interface Comment {
    id: string;
    product_id?: string;
    reel_id?: string;
    user_phone: string;
    user_name?: string;
    text: string;
    rating?: number;
    parent_id?: string;
    replies?: Comment[];
    created_at: string;
}

export interface SearchResult {
    id: string;
    name: string;
    name_uz?: string;
    name_ru?: string;
    image: string;
    images?: string[];
    price: number;
    category?: string;
    category_uz?: string;
    category_ru?: string;
    [key: string]: any; // Keep permissive for dynamic translation access item[`name_${language}`]
}

/**
 * Helper function to get localized product name
 */
export function getLocalizedName(item: Product | CartItem, language: Language): string {
    return (language === 'uz' ? item.name_uz : item.name_ru) || item.name;
}

/**
 * Helper function to get product image URL (handles both 'image' and 'imageUrl' fields)
 */
export function getProductImage(item: Product | CartItem): string {
    return item.image || item.imageUrl || '';
}

/**
 * Calculate total stock from stockDetails
 */
export function getTotalStock(product: Product): number {
    if (!product.stockDetails) return product.stock ?? 0;
    return Object.values(product.stockDetails).reduce((sum, val) => sum + (Number(val) || 0), 0);
}

export interface Blog {
    id: string;
    slug: string;
    title_uz: string;
    title_ru: string;
    excerpt_uz?: string;
    excerpt_ru?: string;
    content_uz: string;
    content_ru: string;
    image?: string;
    blurDataURL?: string;
    category?: string;
    readTime?: number;
    views?: number;
    linkedProductIds?: string[];
    is_deleted?: boolean;
    created_at: string;
    updated_at: string;
}

// Search tizimi uchun tiplar
export interface SearchFacets {
    categories: Record<string, number>;
    tags: Record<string, number>;
    // Kategoriya ID -> {uz, ru} nomlari (facet chipida ID o'rniga nom ko'rsatish uchun)
    categoryNames?: Record<string, { uz: string; ru: string }>;
}

// Promo kod uchun tip
export interface PromoData {
    code: string;
    discount: number;
    type: 'percentage' | 'fixed';
    minAmount?: number;
}

// Media element tipi (product gallery)
export interface MediaItemType {
    url: string;
    type: 'image' | 'video';
    lowResUrl?: string;
}


