"use client";

import { useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Product } from "@/types";

interface WatchedProductProps {
    product: Product;
    userPhone?: string | null;
    children: React.ReactNode;
}

export const WatchedProduct = ({ product, userPhone, children }: WatchedProductProps) => {
    const timersRef = useRef<NodeJS.Timeout[]>([]);
    const elementRef = useRef<HTMLDivElement>(null);
    const hasTrackedId = useRef<Set<number>>(new Set());

    useEffect(() => {
        if (!userPhone) return;

        const trackInterest = async (weight: number, stage: number) => {
            if (document.hidden || hasTrackedId.current.has(stage)) return;

            try {
                // Call Supabase RPC function
                const { error } = await supabase.rpc('track_product_view', {
                    p_user_phone: userPhone,
                    p_product_id: product.id,
                    p_category_id: product.category,
                    p_weight: weight
                });

                if (error) throw error;

                await fetch("/api/ai/recommendations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        action: "log_activity",
                        logData: {
                            userPhone,
                            action: `Interest Tracked (Stage ${stage})`,
                            input: { categories: { [product.category]: weight } },
                            output: [product.id]
                        }
                    })
                });

                hasTrackedId.current.add(stage);
            } catch (e) {
                console.error("Interest tracking failed:", e);
            }
        };

        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                timersRef.current.push(setTimeout(() => trackInterest(1, 1), 2000));
                timersRef.current.push(setTimeout(() => trackInterest(2, 2), 6000));
                timersRef.current.push(setTimeout(() => trackInterest(3, 3), 15000));
            } else {
                timersRef.current.forEach(clearTimeout);
                timersRef.current = [];
            }
        }, { threshold: 0.8 });

        if (elementRef.current) observer.observe(elementRef.current);

        return () => {
            timersRef.current.forEach(clearTimeout);
            observer.disconnect();
        };
    }, [product.id, userPhone, product.category]);

    return <div ref={elementRef} className="h-full">{children}</div>;
};
