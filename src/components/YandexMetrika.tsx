'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { ymHit } from '@/lib/metrika';

// SPA pageview: route o'zgarganda 'hit'.
function MetrikaPageTracker() {
  const pathname = usePathname();
  const firstRender = useRef(true);

  useEffect(() => {
    // Birinchi yuklanishni init o'zi sanaydi — ikki marta sanamaslik uchun o'tkazamiz.
    if (firstRender.current) { firstRender.current = false; return; }
    ymHit();
  }, [pathname]);

  return null;
}

/**
 * Yandex Metrika — birinchi yuklanishni qotirmaydigan holda (TASK P1).
 *
 * O'lchov (scripts/perf/measure.mjs, headless Chrome, keshsiz): init paytida tag.js dagi `Zz` funksiyasi
 * `new RTCPeerConnection()` yaratadi (lokal IP'ni WebRTC orqali aniqlash, "pp" parametri; iOS/Safari'da
 * o'tkaziladi) — bu asosiy oqimni ~2 s bloklardi. init opsiyalari (clickmap, trackLinks,
 * accurateTrackBounce, ecommerce) ning hech biri sabab emas (A/B: har birini o'chirganda ham 1.7–2.2 s).
 * Sayt WebRTC ishlatmaydi — shuning uchun tag.js yuklanishidan oldin WebRTC konstruktori yashiriladi:
 * eng uzun qotish 2.2 s → ~0.1 s. Ko'rishlar, maqsadlar va e-commerce odatdagidek yoziladi.
 *
 * `ym` navbati darhol yaratiladi (init va SPA hit'lar yo'qolmaydi, 1-sahifa ko'rishi sanaladi),
 * tag.js esa brauzer bo'shaganda (requestIdleCallback, zaxira 3.5 s) yoki birinchi foydalanuvchi
 * harakatida — qaysi biri oldin bo'lsa — yuklanadi.
 */
export default function YandexMetrika({ ymid }: { ymid?: string }) {
  const id = ymid || process.env.NEXT_PUBLIC_YM_ID || '107383008';

  useEffect(() => {
    const w = window as any;
    if (w.__velariYmLoader) return;
    w.__velariYmLoader = true;

    // 1) ym navbati (stub) + init — darhol, arzon
    w.ym = w.ym || function (...args: any[]) { (w.ym.a = w.ym.a || []).push(args); };
    w.ym.l = 1 * (new Date() as any);
    w.dataLayer = w.dataLayer || [];
    w.ym(Number(id), 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
      ecommerce: 'dataLayer',
    });

    // 2) tag.js — bo'sh paytda yoki birinchi harakatda
    const events = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    let done = false;
    const load = () => {
      if (done) return;
      done = true;
      events.forEach(e => window.removeEventListener(e, load));
      try {
        // WebRTC orqali lokal IP aniqlash (2 s bloklash) — o'chiriladi; sayt WebRTC ishlatmaydi
        w.RTCPeerConnection = undefined;
        w.webkitRTCPeerConnection = undefined;
        w.mozRTCPeerConnection = undefined;
      } catch { /* jim */ }
      const src = 'https://mc.yandex.ru/metrika/tag.js';
      if (Array.from(document.scripts).some(s => s.src === src)) return;
      const s = document.createElement('script');
      s.async = true;
      s.src = src;
      document.head.appendChild(s);
    };
    events.forEach(e => window.addEventListener(e, load, { once: true, passive: true }));
    let idleId: number | null = null;
    let timerId: NodeJS.Timeout | null = null;
    if (typeof w.requestIdleCallback === 'function') {
      idleId = w.requestIdleCallback(load, { timeout: 15000 });
    } else {
      timerId = setTimeout(load, 15000);
    }

    return () => {
      done = true;
      events.forEach(e => window.removeEventListener(e, load));
      if (idleId !== null && typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(idleId);
      if (timerId !== null) clearTimeout(timerId);
    };
  }, [id]);

  return (
    <>
      <MetrikaPageTracker />
      {/* Xom HTML: React <img> uchun <link rel="preload"> qo'shib, JS'li foydalanuvchilarda ham so'rov yuborardi */}
      <noscript dangerouslySetInnerHTML={{ __html: `<div><img src="https://mc.yandex.ru/watch/${id}" style="position:absolute;left:-9999px" alt="" /></div>` }} />
    </>
  );
}
