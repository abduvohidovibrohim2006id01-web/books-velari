/**
 * Uchinchi tomon skriptlarini (FB Pixel, GA) birinchi ekrandan keyin yuklash (TASK P4/P5).
 *
 * O'lchov (scripts/perf/measure.mjs --mobile --trace): lazyOnload bilan ham fbevents.js + konfiguratsiyasi ~510 ms,
 * gtag.js ~180 ms long task berardi — mobil TBT'ning yarmidan ko'pi. Endi skript birinchi foydalanuvchi harakatida
 * (bosish, klaviatura, teginish, scroll) yoki `load` dan `delayMs` keyin (qaysi biri oldin) qo'shiladi.
 * Hodisalar yo'qolmaydi: fbq / gtag navbati (stub) darhol yaratiladi, skript yuklangach navbatni o'zi yuboradi.
 */
export function runAfterFirstInteraction(cb: () => void, delayMs = 20000): () => void {
    if (typeof window === "undefined") return () => {};
    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const run = () => {
        if (done) return;
        done = true;
        events.forEach(e => window.removeEventListener(e, run));
        window.removeEventListener("load", arm);
        if (timer) clearTimeout(timer);
        cb();
    };
    const arm = () => { timer = setTimeout(run, delayMs); };
    events.forEach(e => window.addEventListener(e, run, { once: true, passive: true }));
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
        done = true;
        events.forEach(e => window.removeEventListener(e, run));
        window.removeEventListener("load", arm);
        if (timer) clearTimeout(timer);
    };
}

/** Tashqi skriptni bir marta qo'shadi. */
export function injectScript(src: string): void {
    if (Array.from(document.scripts).some(s => s.src === src)) return;
    const s = document.createElement("script");
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
}
