import { Redis } from "@upstash/redis";

/**
 * Rate Limiter for Edge/Serverless
 * Uses Upstash Redis for global persistent limiting.
 * Falls back to in-memory Map if Redis is not configured.
 */

const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Checks if a request from a specific IP should be allowed.
 * @param ip Client IP address
 * @param limit Max requests allowed
 * @param windowSeconds Time window in seconds
 * @param scope Optional bucket name so different endpoints don't starve each other.
 *              Without it, all callers share one global per-IP bucket — which means a
 *              read endpoint can silently 429 just because the client hit unrelated
 *              endpoints first. Pass a unique scope per endpoint to isolate limits.
 * @returns boolean True if allowed, False if limited
 */
export async function checkRateLimit(ip: string, limit: number, windowSeconds: number, scope: string = "global"): Promise<boolean> {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const id = `${scope}:${ip}`;

    // 🛡️ REDIS IMPLEMENTATION (Persistent & Global)
    if (redis) {
        try {
            const key = `ratelimit:${id}`;
            const current: number | null = await redis.get(key);

            if (current !== null && current >= limit) {
                return false;
            }

            const multi = redis.multi();
            multi.incr(key);
            if (current === null) {
                multi.expire(key, windowSeconds);
            }
            await multi.exec();

            return true;
        } catch (e) {
            console.error("Redis Rate Limit Error (Falling back to memory):", e);
        }
    }

    // 🛡️ IN-MEMORY FALLBACK (Resets on cold start)
    if (rateLimitMap.size > 2000) {
        Array.from(rateLimitMap.entries()).forEach(([key, value]) => {
            if (now > value.resetTime) rateLimitMap.delete(key);
        });
    }

    if (!rateLimitMap.has(id)) {
        rateLimitMap.set(id, { count: 1, resetTime: now + windowMs });
        return true;
    }

    const data = rateLimitMap.get(id)!;
    if (now > data.resetTime) {
        data.count = 1;
        data.resetTime = now + windowMs;
        return true;
    }

    if (data.count >= limit) return false;

    data.count++;
    return true;
}
