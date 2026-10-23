/**
 * Matnli qidiruv qarorlari (TASK Q, 3-qism) — sof mantiq, tashqi import yo'q:
 * /api/search va scripts/search-tune.mjs bir xil qoidani ishlatadi.
 *
 *  1. Avval matn (smart_search_v2, AI'siz): kerakli guruhlar soni — minGroups().
 *  2. AI (so'rov embedding'i) — natija 0 BO'LSA yoki eng yaxshi natija ham so'zlarning hammasini
 *     qamramasa (max_coverage < guruhlar soni).
 *  3. Hali ham 0 bo'lsa, so'z 2+ bo'lsa va HAR so'z omborda kamida bitta mahsulotga mos kelsa —
 *     1 guruh bilan yumshatiladi (isFallback). Biror so'z umuman uchramasa ("oq kofta", kofta yo'q)
 *     yumshatish faqat boshqa so'z bo'yicha keraksiz tovar chiqarardi — 0 natija to'g'ri javob.
 */

/** Fuzzy (typo) chegarasi: word_similarity ≥ 0.4 (6 harfgacha so'zlarda SQL ichida +0.2). Sinov to'plamida tanlangan. */
export const FUZZY_THRESHOLD = 0.4;
/** Semantik (AI) moslik chegarasi — gemini-embedding-001, sinov to'plamida tanlangan. */
export const SEMANTIC_THRESHOLD = 0.66;

export type V2Item = { id: string; score: number; coverage: number; sem: number | null };
export type V2Result = {
    total: number;
    groups: number;
    max_coverage: number | null;
    group_hits: number[];
    facets: Record<string, number>;
    items: V2Item[];
};
export type V2Call = { need: number; embedding: string | null };

/** 1–2 so'z — hammasi; 3+ — kamida 2/3 qismi. */
export function minGroups(n: number): number {
    return n <= 2 ? n : Math.ceil((2 * n) / 3);
}

export async function runTextSearch(
    groupsCount: number,
    rpc: (c: V2Call) => Promise<V2Result>,
    getEmbedding: () => Promise<string | null>,
): Promise<{ result: V2Result; usedAI: boolean; isFallback: boolean }> {
    const need = minGroups(groupsCount);
    let result = await rpc({ need, embedding: null });
    let embedding: string | null = null;
    let usedAI = false;
    let isFallback = false;

    const weak = groupsCount > 0 && (result.total === 0 || (result.max_coverage ?? 0) < groupsCount);
    if (weak) {
        embedding = await getEmbedding().catch(() => null);
        if (embedding) {
            try {
                result = await rpc({ need, embedding });
                usedAI = true;
            } catch {
                // AI qismi ishlamasa (masalan vektor o'lchami mos emas) — matnli natija bilan davom etamiz
                embedding = null;
            }
        }
    }

    const everyWordExists = (result.group_hits || []).length === groupsCount && result.group_hits.every(n => n > 0);
    if (result.total === 0 && groupsCount > 1 && everyWordExists) {
        const relaxed = await rpc({ need: 1, embedding });
        if (relaxed.total > 0) {
            result = relaxed;
            isFallback = true;
        }
    }
    return { result, usedAI, isFallback };
}
