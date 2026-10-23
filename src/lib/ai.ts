import { supabaseAdmin } from "./supabase-admin";
import type { Product } from "@/types";

/**
 * AI Recommendation logic
 * Based on user history and product tags
 */
export async function getAiRecommendations(userInterests: any, allProducts: Product[], userPhone: string = "Unknown") {
    // 1. Check if we have relatively fresh cached recommendations (less than 12h old)
    try {
        const { data: interests, error } = await supabaseAdmin
            .from("user_interests")
            .select("*")
            .eq("id", userPhone)
            .single();
        
        if (interests && !error) {
            const lastUpdate = interests.ai_recommendations_updated_at ? new Date(interests.ai_recommendations_updated_at) : null;
            const now = new Date();

            if (interests.ai_recommendations && Array.isArray(interests.ai_recommendations) && lastUpdate && (now.getTime() - lastUpdate.getTime() < 12 * 60 * 60 * 1000)) {
                const existingIds = allProducts.map(p => p.id);
                const validatedIds = interests.ai_recommendations.filter((id: string) => existingIds.includes(id));
                
                if (validatedIds.length >= 3) {
                    return validatedIds;
                }
            }
        }
    } catch (e) {
        console.error("Cache check failed", e);
    }

    // 2. If no cache or cache old, fetch from Groq
    // Note: Since this is server-side now, we need to call the actual Groq API or the existing /api/ai logic
    // For simplicity, we'll keep calling the /api/ai or move that logic here.
    // However, to keep it clean, we'll assume this function is called on the server where we have API keys.
    
    const GROQ_API_KEY = process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY_2;
    if (!GROQ_API_KEY) return [];

    const catWeights = (userInterests.categories as Record<string, number>) || {};
    const topCategories = Object.entries(catWeights)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([cat]) => cat);

    // Foydalanuvchi e'tibor bergan mahsulotlar (eng kuchli signal)
    const attentionIds: string[] = Array.isArray(userInterests.attention_products) ? userInterests.attention_products : [];
    const attentionProducts = allProducts
        .filter(p => attentionIds.includes(p.id))
        .slice(0, 10)
        .map(p => ({ name: p.name, category: p.category, price: p.price }));

    // Nomzod mahsulotlar — boyroq kontekst (narx, brend, reyting, sotuv)
    const candidates = allProducts
        .filter(p => topCategories.includes(p.category) || (p.tag && topCategories.includes(p.tag)))
        .filter(p => !attentionIds.includes(p.id)) // ko'rilganlarni takrorlamaslik
        .slice(0, 50)
        .map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            price: p.price,
            brand: (p as any).brand || (p.name || "").split(" ")[0],
            rating: p.rating || 0,
            sales: p.sales || 0,
            discount: p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0,
        }));

    if (candidates.length === 0) return [];

    const systemPrompt = `Sen Velari onlayn do'konining shaxsiy tavsiya AI'sisan (Amazon/Wildberries darajasida).
Vazifang: mijoz xulqini tahlil qilib, u SOTIB OLISHI EHTIMOLI ENG YUQORI bo'lgan mahsulotlarni tanlash.
Qoidalar:
1. Mijoz e'tibor bergan mahsulotlarga O'XSHASH yoki ularni TO'LDIRUVCHI mahsulotlarni afzal ko'r.
2. Faqat 1 kategoriyaga tiqilib qolma — qiziqishlar bo'yicha XILMA-XIL tanla (2-4 kategoriya).
3. Reyting yuqori, sotuvi ko'p va chegirmali mahsulotlarni biroz ustun qo'y.
4. Faqat berilgan ro'yxatdagi haqiqiy ID'larni qaytar.
JAVOB QAT'IY JSON: {"recommendations": ["id1","id2",...,"id8"]}`;

    const userPrompt = `Mijoz qiziqishlari (kategoriya: og'irlik): ${JSON.stringify(catWeights)}
Mijoz yaqinda e'tibor bergan mahsulotlar: ${JSON.stringify(attentionProducts)}
Tanlash uchun nomzod mahsulotlar: ${JSON.stringify(candidates)}

Eng mos 8 ta mahsulot ID'sini tanla.`;

    try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                temperature: 0.5,
                response_format: { type: "json_object" }
            })
        });

        if (!groqResponse.ok) throw new Error("Groq API error");
        const data = await groqResponse.json();
        const content = data.choices[0].message.content;

        let parsed: any = {};
        try { parsed = JSON.parse(content); } catch {
            const m = content.match(/\[[\s\S]*\]/);
            parsed = { recommendations: m ? JSON.parse(m[0]) : [] };
        }
        let recommendedIds: string[] = Array.isArray(parsed.recommendations) ? parsed.recommendations : (Array.isArray(parsed) ? parsed : []);

        // 3. Filter to ensure IDs still exist in 'allProducts'
        const existingIds = new Set(allProducts.map(p => p.id));
        recommendedIds = recommendedIds.filter((id: string) => existingIds.has(id));

        // 4. Save to Cache in Supabase (Background)
        if (recommendedIds.length > 0) {
            await supabaseAdmin.from("user_interests").upsert({
                id: userPhone,
                user_phone: userPhone,
                ai_recommendations: recommendedIds,
                ai_recommendations_updated_at: new Date().toISOString()
            });
        }

        await supabaseAdmin.from("ai_logs").insert([{
            id: crypto.randomUUID(),
            user_phone: userPhone,
            input: userInterests,
            output: recommendedIds,
            model: "openai/gpt-oss-120b",
            action: "personalized_recommendation_refreshed"
        }]);

        return recommendedIds;
    } catch (e) {
        console.error("AI Recommendation error:", e);
        return [];
    }
}

export async function logAiActivity(data: {
    userPhone: string;
    action: string;
    input: any;
    output: any;
    model?: string;
}) {
    try {
        await supabaseAdmin.from("ai_logs").insert([{
            id: crypto.randomUUID(),
            user_phone: data.userPhone,
            input: data.input,
            output: data.output,
            action: data.action,
            model: data.model || "openai/gpt-oss-120b"
        }]);
    } catch (e) {
        console.error("AI Logging error:", e);
    }
}
