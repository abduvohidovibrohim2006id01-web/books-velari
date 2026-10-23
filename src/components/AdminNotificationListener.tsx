"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export function AdminNotificationListener() {
    const [lastLoadTime] = useState(Date.now());

    useEffect(() => {
        if (typeof window === "undefined") return;

        // Ask for permission if not granted
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const sub = supabase.channel('orders_notifications')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
                const orderData = payload.new;
                const orderTime = new Date(orderData.created_at).getTime();

                // Only notify for completely new orders exactly AFTER admin loaded the page
                if (orderTime > lastLoadTime) {
                    if (Notification.permission === 'granted') {
                        new Notification('Yangi buyurtma! 🛍️', {
                            body: `Telefon: ${orderData.user_phone || "Noma'lum"}\nSumma: ${orderData.total?.toLocaleString() || 0} so'm`,
                            icon: '/icons/icon-192x192.png',
                        });
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(sub);
        };
    }, [lastLoadTime]);

    return null;
}
