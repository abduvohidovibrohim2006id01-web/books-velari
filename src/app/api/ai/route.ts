import { NextRequest, NextResponse } from "next/server";
import { verifyJwt } from "@/lib/jwt-utils";
import { checkRateLimit } from "@/lib/rate-limiter";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getAdminSecret } from "@/lib/secrets";

const GROQ_API_KEYS = [
    process.env.GROQ_API_KEY_1 || "",
    process.env.GROQ_API_KEY_2 || ""
].filter(key => key !== "");

let currentKeyIndex = 0;

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    
    try {
        // 0. SECURITY & RATE LIMITING
        if (!await checkRateLimit(ip, 5, 60)) return NextResponse.json({ error: "Rate limit" }, { status: 429 });

        const adminToken = req.cookies.get('admin_token')?.value;
        const ADMIN_SECRET = getAdminSecret();
        const payload = adminToken ? await verifyJwt(adminToken, ADMIN_SECRET) : null;
        if (!payload || payload.role !== 'admin') {
            return NextResponse.json({ error: "Unauthorized (Admin only)" }, { status: 401 });
        }

        if (GROQ_API_KEYS.length === 0) {
            return NextResponse.json({ error: "AI configuration missing" }, { status: 503 });
        }

        const body = await req.json();
        const { messages: rawMessages, model = "openai/gpt-oss-120b", action, context } = body;

        let finalModel = model;
        let finalMessages = rawMessages;
        let responseFormat: any = undefined;
        let visualDescription = "";

        // Vision AI Logic
        if (action === 'generate_from_image') {
            const imageUrl = context?.image || context?.imageUrl || (context?.images && context.images[0]);
            if (!imageUrl) return NextResponse.json({ error: "Rasm topilmadi" }, { status: 400 });

            // 🛡 SSRF PROTECTION: No internal IPs or localhost
            if (imageUrl.includes("localhost") || imageUrl.includes("127.0.0.1") || imageUrl.includes("192.168.") || imageUrl.includes("10.0.")) {
                return NextResponse.json({ error: "Invalid image URL" }, { status: 400 });
            }

            try {
                // Step 1: Vision analysis
                const imgResponse = await fetch(imageUrl);
                if (!imgResponse.ok) throw new Error("Could not fetch image");
                
                const arrayBuffer = await imgResponse.arrayBuffer();
                const base64Image = Buffer.from(arrayBuffer).toString('base64');
                const contentType = imgResponse.headers.get('content-type') || 'image/jpeg';
                
                if (!contentType.startsWith('image/')) throw new Error("Invalid content type");

                const visionApiKey = GROQ_API_KEYS[currentKeyIndex];
                const visionResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${visionApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'qwen/qwen3.6-27b',
                        messages: [
                            {
                                role: 'user',
                                content: [
                                    { type: 'text', text: "Ushbu rasmdagi mahsulotni professional darajada tahlil qiling. Brend, model, rang va asosiy xususiyatlarini aniqlang." },
                                    { type: 'image_url', image_url: { url: `data:${contentType};base64,${base64Image}` } }
                                ]
                            }
                        ],
                        temperature: 0.2,
                    }),
                });

                const visionData = await visionResponse.json();
                visualDescription = visionData.choices?.[0]?.message?.content || "";
                if (!visualDescription) throw new Error("Vision AI failed to analyze");

                // Step 2: SEO-optimallashtirilgan content generation
                finalModel = "openai/gpt-oss-120b";
                finalMessages = [
                    {
                        role: 'system',
                        content: `Siz O'zbekiston elektron tijorat (Velari) uchun SEO va marketing mutaxassisisiz.
Vazifangiz: mahsulot tahlilidan Google'da yuqori o'rin oladigan, sotuvni oshiradigan kontent yaratish.
SEO qoidalari:
- name: brend + model + asosiy xususiyat + mahsulot turi (60 belgigacha, kalit so'zlarga boy). Masalan: "VGR V-385 Professional Soch Olish Mashinkasi LED Displey".
- description: 400-600 belgi, tabiiy matnda kalit so'zlar: mahsulot turi, brend, asosiy 3-4 xususiyat, "O'zbekistonda", afzalliklar. Ortiqcha takror yo'q.
- short: 1 jumlalik jozibali tavsif.
- keywords: 8-12 ta qidiruv kalit so'zi (uz va ru aralash, bozor so'rovlari: "narxi", "sotib olish", brend nomi, model, mahsulot turi).
- meta_description: 150-160 belgi, Google snippet uchun.
JAVOB QAT'IY TOZA JSON.`
                    },
                    {
                        role: 'user',
                        content: `Mahsulot rasmidan tahlil: ${visualDescription}

Quyidagi JSON strukturada qaytar:
{
  "name_uz": "...", "name_ru": "...",
  "description_uz": "...", "description_ru": "...",
  "short_uz": "...", "short_ru": "...",
  "keywords_uz": ["..."], "keywords_ru": ["..."],
  "meta_description_uz": "...", "meta_description_ru": "...",
  "brand": "...", "category_guess": "..."
}`
                    }
                ];
                responseFormat = { type: 'json_object' };

            } catch (err: any) {
                console.error("Vision Step Error:", err);
                return NextResponse.json({ error: "Vision analysis failed: " + err.message }, { status: 500 });
            }
        }

        // Copywriting / Text Refinement AI Logic
        if (action === 'refine_text') {
            const text = context?.text || '';
            const mode = context?.mode || 'enhance';
            const lang = context?.lang || 'uz';
            const productName = context?.productName || '';

            let instruction = "Ushbu mahsulot tavsifini yanada jozibali, xaridorni qiziqtiradigan professional marketing matniga aylantiring.";
            if (mode === 'bullets') {
                instruction = "Ushbu tavsifni xaridor o'qishiga juda qulay qilib asosiy afzalliklar va xususiyatlar punktlariga (bullet-points) ajratib bering.";
            } else if (mode === 'fix_grammar') {
                instruction = "Ushbu matnning barcha grammatik, imlo va tinish belgilaridagi xatolarini to'g'rilang.";
            }

            finalModel = "openai/gpt-oss-120b";
            finalMessages = [
                {
                    role: 'system',
                    content: `Siz professional elektron tijorat (Velari) kopirayterisiz. Til: ${lang === 'ru' ? 'Rus tili' : 'O\'zbek tili'}. FAQAT tayyor natija matnini qaytaring. Ortiqcha kirish yoki tushuntirish yozmang.`
                },
                {
                    role: 'user',
                    content: `Mahsulot: ${productName}\nVazifa: ${instruction}\nAsl matn:\n${text}`
                }
            ];
        }

        const maxRetries = GROQ_API_KEYS.length;
        let attempts = 0;

        while (attempts < maxRetries) {
            const apiKey = GROQ_API_KEYS[currentKeyIndex];
            try {
                const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${apiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: finalModel,
                        messages: finalMessages,
                        temperature: 0.7,
                        max_tokens: 4000,
                        response_format: responseFormat
                    })
                });

                if (response.status === 429) {
                    currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
                    throw new Error("Rate limit exceeded");
                }

                if (!response.ok) {
                    const errorJson = await response.json().catch(() => ({}));
                    throw new Error(errorJson.error?.message || "Groq API error");
                }

                const data = await response.json();
                const content = data.choices[0].message.content;
                const parsed = responseFormat?.type === 'json_object'
                    ? JSON.parse(content.replace(/```json|```/g, '').trim())
                    : content;

                // Log to ai_logs table in Supabase
                try {
                    await supabaseAdmin.from("ai_logs").insert([{
                        id: crypto.randomUUID(),
                        user_phone: "ADMIN",
                        input: { action: action || "general_completion", context: context || null },
                        output: [typeof parsed === "object" ? JSON.stringify(parsed) : String(parsed)],
                        model: finalModel,
                        action: action === "generate_from_image" ? "admin_product_seo_generation" : (action || "admin_ai_completion"),
                        status: "completed"
                    }]);
                } catch (logErr) {
                    console.error("Failed to insert ai_log:", logErr);
                }

                // `content` (eski mijozlar) va `result` (admin) — ikkalasini qaytaramiz
                return NextResponse.json({
                    content: parsed,
                    result: parsed,
                    visualDescription
                });

            } catch (error: any) {
                currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;
                attempts++;
                if (attempts >= maxRetries) throw error;
            }
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
    }
}
