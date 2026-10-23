/**
 * VideoPreWarmer & Haptic Engine for Reels
 * Direct native HTTP streaming with zero blob truncation.
 */

class VideoPreWarmerService {
    private prewarmedSet = new Set<string>();

    constructor() {
        if (typeof window !== "undefined" && "caches" in window) {
            // Clear any broken 1.2MB partial cache from before
            caches.delete("ig-reels-flashcache-v1").catch(() => {});
        }
    }

    /**
     * Always returns direct video URL for native GPU-accelerated Range streaming
     */
    public getVideoSrc(url: string): string {
        return url || "";
    }

    /**
     * Prewarm video HTTP connection without allocating OS hardware decoders
     */
    public prewarmVideo(url: string): void {
        if (!url || typeof window === "undefined" || this.prewarmedSet.has(url)) {
            return;
        }
        if (!url.startsWith("http")) return;

        this.prewarmedSet.add(url);

        try {
            // Warm up connection & TCP/TLS handshake with a tiny 1KB Range request
            // ZERO hardware decoders consumed!
            fetch(url, {
                method: "GET",
                headers: { Range: "bytes=0-1024" },
                mode: "cors",
                cache: "default",
            }).catch(() => {});
        } catch {}
    }

    /**
     * Prewarm next video in background
     */
    public prewarmUpcoming(urls: string[], activeIndex: number) {
        if (!urls || urls.length === 0) return;

        const next1 = urls[activeIndex + 1];
        if (next1) this.prewarmVideo(next1);

        const next2 = urls[activeIndex + 2];
        if (next2) setTimeout(() => this.prewarmVideo(next2), 400);
    }

    /**
     * Taktil haptic feedback
     */
    public triggerHaptic(type: "light" | "medium" | "double" | "selection" = "light") {
        if (typeof window === "undefined" || !("vibrate" in navigator)) return;
        try {
            if (type === "selection") {
                navigator.vibrate(5);
            } else if (type === "light") {
                navigator.vibrate(8);
            } else if (type === "medium") {
                navigator.vibrate(15);
            } else if (type === "double") {
                navigator.vibrate([10, 40, 15]);
            }
        } catch {}
    }
}

export const videoPreWarmer = new VideoPreWarmerService();
