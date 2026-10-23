import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase-admin";

export async function GET(req: Request) {
    // Determine CRON security (Verified via headers from Vercel)
    // Service role bilan ishlaydi — CRON_SECRET majburiy (yo'q bo'lsa hech kim ishga tushira olmaydi)
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret) {
        return NextResponse.json({ error: "Server configuration error: CRON_SECRET is not set" }, { status: 500 });
    }
    const authHeader = req.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        console.log("Starting CRON: Processing User Affinity Profiles...");

        // 1. Fetch raw telemetry logs from the past 7 days 
        // (we only process recent data to reflect current interest shifts)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const { data: logs, error: logsError } = await supabase
            .from('user_telemetry_logs')
            .select('user_identifier, event_type, category_id, event_metadata, created_at')
            .gte('created_at', sevenDaysAgo.toISOString());

        if (logsError) throw logsError;
        if (!logs || logs.length === 0) {
            return NextResponse.json({ message: "No new logs to process" });
        }

        // 2. Aggregate logs per user
        const userAggregations: Record<string, any> = {};

        logs.forEach(log => {
            if (!log.user_identifier || log.user_identifier === 'anonymous_session') return; // Skip bots/empty

            if (!userAggregations[log.user_identifier]) {
                userAggregations[log.user_identifier] = {
                    prices: [],
                    categories: {},
                    nightEvents: 0,
                    totalEvents: 0,
                    discountClicks: 0
                };
            }

            const agg = userAggregations[log.user_identifier];
            agg.totalEvents += 1;

            // Track Categories
            if (log.category_id) {
                agg.categories[log.category_id] = (agg.categories[log.category_id] || 0) + 1;
            }

            // Track Prices & Discounts from metadata
            const metadata = log.event_metadata as any;
            if (metadata && metadata.price) {
                // If the user is looking at a specific price
                agg.prices.push(Number(metadata.price));
                
                // Usually discount hunters click items with an old_price
                if (metadata.oldPrice && metadata.oldPrice > metadata.price) {
                    agg.discountClicks += 1;
                }
            }

            // Track Night Owl status
            const hour = new Date(log.created_at).getHours();
            if (hour >= 23 || hour <= 4) { // 11 PM to 4 AM
                agg.nightEvents += 1;
            }
        });

        // 3. Compute Final Affinity Profiles
        const upsertPayloads = Object.keys(userAggregations).map(userId => {
            const agg = userAggregations[userId];
            
            // Calculate Avg Price
            let avgPrice = 0;
            let segment = "medium";
            if (agg.prices.length > 0) {
                avgPrice = agg.prices.reduce((a: number, b: number) => a + b, 0) / agg.prices.length;
                if (avgPrice > 5000000) segment = "premium"; // >5M UZS is premium
                else if (avgPrice < 500000) segment = "budget"; // <500k UZS is budget
            }

            // Calculate Flags
            const nightOwl = agg.totalEvents > 0 && (agg.nightEvents / agg.totalEvents) > 0.4; // 40% of activity late night
            const discountSeeker = agg.prices.length > 0 && (agg.discountClicks / agg.prices.length) > 0.5;

            return {
                user_identifier: userId,
                avg_price_affinity: avgPrice,
                price_segment: segment,
                top_categories: agg.categories,
                night_owl: nightOwl,
                discount_seeker: discountSeeker,
                last_computed_at: new Date().toISOString()
            };
        });

        // 4. Batch Upsert to Database
        if (upsertPayloads.length > 0) {
            const { error: upsertError } = await supabase
                .from('user_affinity_profiles')
                .upsert(upsertPayloads);

            if (upsertError) throw upsertError;
        }

        return NextResponse.json({ 
            success: true, 
            profilesUpdated: upsertPayloads.length 
        });

    } catch (e: any) {
        console.error("Affinity Cron Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
