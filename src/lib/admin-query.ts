/**
 * Admin sahifalari uchun o'qish so'rovlari — brauzerdagi anon kalit o'rniga server orqali.
 *
 * `adminFrom("products").select(...).eq(...).or(...).range(...)` — supabase-js so'rov
 * quruvchisi bilan bir xil ko'rinish. Zanjir yozib olinadi va /api/admin/query ga yuboriladi;
 * server admin tokenini tekshirib, uni service role bilan qayta bajaradi (RLS/ustun huquqlari
 * cheklangan bo'lsa ham admin ichki maydonlarni ko'radi). Faqat O'QISH (select).
 */

type Step = { m: string; a: unknown[] };

export interface AdminQueryResult<T = any[]> {
    data: T | null;
    error: { message: string; code?: string; details?: string; hint?: string } | null;
    count: number | null;
}

export class AdminQuery<T = any[]> implements PromiseLike<AdminQueryResult<T>> {
    private steps: Step[] = [];
    private signal?: AbortSignal;

    constructor(private table: string) {}

    private add(m: string, a: unknown[]): this {
        this.steps.push({ m, a });
        return this;
    }

    select(columns?: string, options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) { return this.add('select', options ? [columns ?? '*', options] : [columns ?? '*']); }
    eq(column: string, value: unknown) { return this.add('eq', [column, value]); }
    neq(column: string, value: unknown) { return this.add('neq', [column, value]); }
    gt(column: string, value: unknown) { return this.add('gt', [column, value]); }
    gte(column: string, value: unknown) { return this.add('gte', [column, value]); }
    lt(column: string, value: unknown) { return this.add('lt', [column, value]); }
    lte(column: string, value: unknown) { return this.add('lte', [column, value]); }
    like(column: string, pattern: string) { return this.add('like', [column, pattern]); }
    ilike(column: string, pattern: string) { return this.add('ilike', [column, pattern]); }
    is(column: string, value: unknown) { return this.add('is', [column, value]); }
    in(column: string, values: readonly unknown[]) { return this.add('in', [column, values]); }
    contains(column: string, value: unknown) { return this.add('contains', [column, value]); }
    not(column: string, operator: string, value: unknown) { return this.add('not', [column, operator, value]); }
    or(filters: string, options?: { foreignTable?: string; referencedTable?: string }) { return this.add('or', options ? [filters, options] : [filters]); }
    filter(column: string, operator: string, value: unknown) { return this.add('filter', [column, operator, value]); }
    match(query: Record<string, unknown>) { return this.add('match', [query]); }
    order(column: string, options?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) { return this.add('order', options ? [column, options] : [column]); }
    range(from: number, to: number) { return this.add('range', [from, to]); }
    limit(count: number) { return this.add('limit', [count]); }
    // single/maybeSingle — natija massiv emas, bitta qator
    single(): AdminQuery<any> { return this.add('single', []) as unknown as AdminQuery<any>; }
    maybeSingle(): AdminQuery<any> { return this.add('maybeSingle', []) as unknown as AdminQuery<any>; }
    /** Eskirgan so'rovni bekor qilish (supabase-js abortSignal kabi). Bekor qilinsa error.code = 'ABORTED'. */
    abortSignal(signal: AbortSignal): this { this.signal = signal; return this; }

    then<R1 = AdminQueryResult<T>, R2 = never>(
        onfulfilled?: ((value: AdminQueryResult<T>) => R1 | PromiseLike<R1>) | null,
        onrejected?: ((reason: any) => R2 | PromiseLike<R2>) | null,
    ): PromiseLike<R1 | R2> {
        return this.execute().then(onfulfilled, onrejected);
    }

    private async execute(): Promise<AdminQueryResult<T>> {
        try {
            const res = await fetch('/api/admin/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ table: this.table, steps: this.steps }),
                signal: this.signal,
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok && !json.error) {
                return { data: null, error: { message: `HTTP ${res.status}` }, count: null };
            }
            return { data: json.data ?? null, error: json.error ?? null, count: json.count ?? null };
        } catch (e: any) {
            if (e?.name === 'AbortError') return { data: null, error: { message: 'aborted', code: 'ABORTED' }, count: null };
            return { data: null, error: { message: e?.message || 'Network error' }, count: null };
        }
    }
}

export function adminFrom<T = any[]>(table: string): AdminQuery<T> {
    return new AdminQuery<T>(table);
}
