'use client';

import { runAfterFirstInteraction, injectScript } from '@/lib/third-party-gate';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

function GAPageTracker({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const firstRender = useRef(true);

  useEffect(() => {
    // Google Analytics will automatically track the initial page view,
    // so we skip the first render to avoid double tracking.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const search = typeof window !== 'undefined' ? window.location.search : '';
    const url = pathname + search;
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('config', gaId, {
        page_path: url,
      });
    }
  }, [pathname, gaId]);

  return null;
}

export default function GoogleAnalytics({ gaId }: { gaId?: string }) {
  const id = gaId || process.env.NEXT_PUBLIC_GA_ID || 'G-26H8F7XC2T';

  useEffect(() => {
    const w = window as any;
    if (w.gtag) return;
    // gtag navbati — darhol (dataLayer); config va hodisalar navbatda kutadi
    w.dataLayer = w.dataLayer || [];
    w.gtag = function () { w.dataLayer.push(arguments); };
    w.gtag('js', new Date());
    w.gtag('config', id, { page_path: window.location.pathname });
    // gtag.js (~180 ms long task) — birinchi harakat yoki load + 6 s (src/lib/third-party-gate.ts)
    return runAfterFirstInteraction(() => injectScript(`https://www.googletagmanager.com/gtag/js?id=${id}`));
  }, [id]);

  return <GAPageTracker gaId={id} />;
}
