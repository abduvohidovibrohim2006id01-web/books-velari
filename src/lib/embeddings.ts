/**
 * Velari semantik qidiruv — so'rov embedding'i.
 * Model: Google gemini-embedding-001 (768 o'lcham) — products.embedding bilan bir xil fazo
 * (mahsulot vektorlari scripts/embed-products.mjs da RETRIEVAL_DOCUMENT bilan yoziladi).
 *
 * Nega API: lokal model (Xenova) Vercel'da har sovuq startda ~120 MB yuklab olardi va
 * 1.2 s timeout'ga sig'masdi; sinov to'plamida ham sifat pastroq (scripts/embed-model-compare.mjs).
 * Kesh: xotira (lambda ichida) → search_query_embeddings jadvali → API.
 */
import { supabaseAdmin } from "@/lib/supabase-admin";

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIM = 768;

const memCache = new Map<string, string>();
const MAX_MEM = 1000;

function geminiKeys(): string[] {
    return Array.from(new Set(
        [process.env.GEMINI_API_KEY_1, process.env.GEMINI_API_KEY_2, process.env.GEMINI_API_KEY]
            .filter((k): k is string => !!k && !!k.trim())
            .map(k => k.trim()),
    ));
}

function remember(q: string, v: string) {
    if (memCache.size >= MAX_MEM) {
        const first = memCache.keys().next().value;
        if (first) memCache.delete(first);
    }
    memCache.set(q, v);
}

async function fetchEmbedding(text: string, timeoutMs: number): Promise<number[] | null> {
    for (const key of geminiKeys()) {
        try {
            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                    body: JSON.stringify({
                        content: { parts: [{ text }] },
                        taskType: "RETRIEVAL_QUERY",
                        outputDimensionality: EMBEDDING_DIM,
                    }),
                    signal: AbortSignal.timeout(timeoutMs),
                },
            );
            if (!res.ok) continue; // 429/5xx — keyingi kalit
            const data = await res.json();
            const values: unknown = data?.embedding?.values;
            if (Array.isArray(values) && values.length === EMBEDDING_DIM) {
                // Kosinus masofa uchun normallashtiramiz (768 o'lchamda API normallashtirmaydi)
                const nums = values as number[];
                const n = Math.sqrt(nums.reduce((s, x) => s + x * x, 0)) || 1;
                return nums.map(x => x / n);
            }
        } catch {
            // timeout / tarmoq — keyingi kalit
        }
    }
    return null;
}

/**
 * So'rov uchun pgvector literal ('[0.1,-0.2,...]') qaytaradi yoki null (kalit yo'q, timeout, xato).
 * null bo'lsa qidiruv matnli rejimda davom etadi.
 */
export async function getQueryEmbedding(rawQuery: string, timeoutMs = 2500): Promise<string | null> {
    const q = (rawQuery || "").trim().toLowerCase();
    if (q.length < 2) return null;

    const hit = memCache.get(q);
    if (hit) return hit;

    const { data: cached } = await supabaseAdmin
        .from("search_query_embeddings")
        .select("embedding")
        .eq("query", q)
        .eq("model", EMBEDDING_MODEL)
        .maybeSingle();
    if (cached?.embedding) {
        const v = typeof cached.embedding === "string" ? cached.embedding : JSON.stringify(cached.embedding);
        remember(q, v);
        // hits/last_used — javobni kutmasdan
        supabaseAdmin.rpc("touch_search_query_embedding", { p_query: q, p_model: EMBEDDING_MODEL }).then(() => {}, () => {});
        return v;
    }

    const vec = await fetchEmbedding(q, timeoutMs);
    if (!vec) return null;
    const literal = `[${vec.join(",")}]`;
    remember(q, literal);
    supabaseAdmin
        .from("search_query_embeddings")
        .upsert({ query: q, model: EMBEDDING_MODEL, embedding: literal }, { onConflict: "query,model" })
        .then(() => {}, () => {});
    return literal;
}
