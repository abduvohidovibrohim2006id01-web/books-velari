import type { Product, Category, Banner, Blog } from "@/types";

export const mapProduct = (p: any): Product => {
    // Destructure snake_case fields out so they don't duplicate with camelCase
    const {
        is_deleted, created_at, category_id, brand_id, old_price,
        stock_details, video_url, review_count, avg_rating, is_original,
        group_id, color_name, ...rest
    } = p;

    return {
        ...rest,
        isDeleted: is_deleted,
        createdAt: created_at,
        category: category_id,
        brand: brand_id,
        oldPrice: old_price,
        stockDetails: stock_details,
        videoUrl: video_url,
        reviewCount: review_count,
        rating: avg_rating ?? p.rating ?? 0,
        isOriginal: is_original,
        groupId: group_id,
        colorName: color_name,
        model: p.model
    };
};

export const mapCategory = (c: any): Category => ({
    ...c,
    isDeleted: c.is_deleted,
    parentId: c.parent_id,
    image_meta: c.image_meta || undefined,
});

export const mapBanner = (b: any): Banner => ({
    id: b.id,
    html_uz: b.html_uz,
    html_ru: b.html_ru,
    title_uz: b.title_uz,
    title_ru: b.title_ru,
    tabName_uz: b.tab_name_uz,
    tabName_ru: b.tab_name_ru,
    order: b.order_index,
});

export const mapUser = (u: any) => ({
    ...u,
    isAdmin: u.is_admin,
    ipAddress: u.ip_address,
    lastLogin: u.last_login,
    createdAt: u.created_at
});

export const mapComment = (c: any) => ({
    ...c,
    productId: c.product_id,
    userId: c.user_id,
    parentId: c.parent_id,
    isAdmin: c.is_admin,
    timestamp: c.created_at,
    isEdited: c.is_edited
});

export const mapOrder = (o: any) => ({
    ...o,
    userPhone: o.user_phone,
    createdAt: o.created_at,
});

export const mapMessage = (m: any) => ({
    ...m,
    chatId: m.chat_id,
    senderId: m.sender_id,
    senderType: m.sender_type,
    timestamp: m.created_at
});

export const mapBlog = (b: any): Blog => ({
    ...b,
    linkedProductIds: b.linked_product_ids,
    readTime: b.read_time,
    isDeleted: b.is_deleted,
    createdAt: b.created_at || b.createdAt,
    updatedAt: b.updated_at || b.updatedAt
});
