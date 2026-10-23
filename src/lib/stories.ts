/**
 * Stories guruhlash — bosh sahifa (server) va StoriesRow (client zaxira so'rovi) uchun umumiy.
 * Aylana (80–100 px) uchun eng kichik variant (image_meta.lowResUrl 360x480 / xs 640) + blur;
 * story ochilganda — lg WEBP (image_meta.lg). Variantlar bo'lmasa asl rasm.
 */

export type StoryImageMeta = { blurDataURL?: string; lowResUrl?: string; xs?: string; md?: string; lg?: string } | null;

export interface StoryGroupShape<S> {
    key: string;
    coverImage: string;
    coverThumb: string;
    coverBlur?: string;
    coverIsVideo: boolean;
    title_uz: string;
    title_ru: string;
    slides: S[];
}

/** Story ochilganda ko'rsatiladigan rasm: lg WEBP, bo'lmasa asl. */
export function storySlideImage(s: { image?: string | null; image_meta?: StoryImageMeta }): string {
    return s.image_meta?.lg || s.image || "";
}

export function buildStoryGroups<S extends {
    id: string; image?: string | null; video?: string | null; image_meta?: StoryImageMeta;
    group_key?: string | null; group_title_uz?: string | null; group_title_ru?: string | null; title_uz: string; title_ru: string;
}>(data: S[]): StoryGroupShape<S>[] {
    if (!data || data.length === 0) return [];
    const order: string[] = [];
    const map = new Map<string, S[]>();
    data.forEach(s => {
        const key = s.group_key && s.group_key.trim() ? s.group_key.trim() : `__solo_${s.id}`;
        if (!map.has(key)) { map.set(key, []); order.push(key); }
        map.get(key)!.push(s);
    });
    return order.map(key => {
        const slides = map.get(key)!;
        const first = slides[0];
        const coverSlide = slides.find(x => x.image);
        const cover = coverSlide?.image || "";
        const meta = coverSlide?.image_meta || null;
        return {
            key,
            coverImage: cover,
            coverThumb: meta?.lowResUrl || meta?.xs || cover,
            coverBlur: meta?.blurDataURL || undefined,
            coverIsVideo: !cover && !!first.video,
            title_uz: first.group_title_uz?.trim() || first.title_uz,
            title_ru: first.group_title_ru?.trim() || first.title_ru,
            slides,
        };
    });
}
