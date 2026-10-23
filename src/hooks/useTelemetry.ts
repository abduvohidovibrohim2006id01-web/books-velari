"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

interface TelemetryOptions {
    productId?: string;
    categoryId?: string;
    metadata?: Record<string, any>;
}

export function useTelemetry(options?: TelemetryOptions) {
    const pathname = usePathname();
    const entryTime = useRef<number>(Date.now());
    const sentDwell = useRef<boolean>(false);

    useEffect(() => {
        // Reset timers on mount/route change
        entryTime.current = Date.now();
        sentDwell.current = false;

        // 1. Log PRODUCT_VIEW immediately if we are on a product page
        if (options?.productId) {
            fetch('/api/analytics/telemetry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventType: 'PRODUCT_VIEW',
                    productId: options.productId,
                    categoryId: options.categoryId,
                    metadata: {
                        ...options.metadata,
                        url: pathname,
                        agent: navigator.userAgent
                    }
                })
            }).catch(() => {}); // silent fail to not interrupt UX
        }

        // 2. Setup Dwell Time tracking (triggers when leaving, closing, or after 10s intervals)
        const handleUnmountOrLeave = () => {
             if (sentDwell.current || !options?.productId) return;
             
             const timeSpentSeconds = Math.floor((Date.now() - entryTime.current) / 1000);
             
             // Only log dwell time if they spent more than 3 seconds (meaningful interest)
             if (timeSpentSeconds >= 3) {
                 // Use navigator.sendBeacon for reliable sending when closing tabs
                 const payload = JSON.stringify({
                     eventType: 'DWELL_TIME',
                     productId: options.productId,
                     eventValue: timeSpentSeconds,
                     metadata: options.metadata || {}
                 });

                 // sendBeacon is safer than fetch during unmount
                 if (navigator.sendBeacon) {
                     navigator.sendBeacon('/api/analytics/telemetry', new Blob([payload], { type: 'application/json' }));
                 } else {
                     fetch('/api/analytics/telemetry', { method: 'POST', body: payload, keepalive: true }).catch(()=>{});
                 }
                 sentDwell.current = true;
             }
        };

        // Track when tab is closed or hidden
        const handleVisibilityChange = () => {
             if (document.visibilityState === 'hidden') handleUnmountOrLeave();
        };

        window.addEventListener('beforeunload', handleUnmountOrLeave);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            handleUnmountOrLeave();
            window.removeEventListener('beforeunload', handleUnmountOrLeave);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [pathname, options?.productId, options?.categoryId]); // Re-run if these change
}
