'use client';

import { runAfterFirstInteraction, injectScript } from '@/lib/third-party-gate';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '1593828215426388';

function MetaPixelTracker({ pixelId }: { pixelId: string }) {
  const pathname = usePathname();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    if (typeof window !== 'undefined' && (window as any).fbq) {
      try {
        (window as any).fbq('track', 'PageView');
      } catch (err) {
        /* ignore */
      }
    }
  }, [pathname, pixelId]);

  return null;
}

export default function MetaPixel({ pixelId }: { pixelId?: string }) {
  const id = pixelId || META_PIXEL_ID;

  useEffect(() => {
    const w = window as any;
    if (w.fbq) return;
    // fbq navbati (Meta rasmiy snippet'idagi stub) — darhol; init/PageView/hodisalar navbatda kutadi
    const n: any = (w.fbq = function (...args: any[]) {
      n.callMethod ? n.callMethod.apply(n, args) : n.queue.push(args);
    });
    if (!w._fbq) w._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    n('init', id);
    n('track', 'PageView');
    // fbevents.js (+ konfiguratsiya ~510 ms long task) — birinchi harakat yoki load + 6 s (src/lib/third-party-gate.ts)
    return runAfterFirstInteraction(() => injectScript('https://connect.facebook.net/en_US/fbevents.js'));
  }, [id]);

  return (
    <>
      {/* Xom HTML: React <img> uchun <link rel="preload"> qo'shib, JS'li foydalanuvchilarda ham so'rov yuborardi */}
      <noscript dangerouslySetInnerHTML={{ __html: `<img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${id}&ev=PageView&noscript=1" alt="" />` }} />
      <MetaPixelTracker pixelId={id} />
    </>
  );
}

// E-commerce Event Helpers for Meta Pixel
export function trackMetaPixelEvent(eventName: string, params?: Record<string, any>) {
  if (typeof window !== 'undefined' && (window as any).fbq) {
    try {
      (window as any).fbq('track', eventName, params || {});
    } catch {
      /* ignore */
    }
  }
}
