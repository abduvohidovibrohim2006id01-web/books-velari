import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const GROQ_API_KEYS = [
    process.env.GROQ_API_KEY_1 || "",
    process.env.GROQ_API_KEY_2 || ""
].filter(key => key !== "");

let currentKeyIndex = 0;

async function analyzeVisionImg(imageUrl: string, productName: string) {
    const apiKey = GROQ_API_KEYS[currentKeyIndex];
    currentKeyIndex = (currentKeyIndex + 1) % GROQ_API_KEYS.length;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'qwen/qwen3.6-27b',
                messages: [
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: `Ushbu mahsulot rasmi uchun Google Images'da yuqori o'rin oladigan SEO alt-text yozing.
Qoidalar: brend + model + mahsulot turi + rasmda ko'ringan asosiy xususiyat/rang. 100-125 belgi, kalit so'zlarga boy, tabiiy. "rasm/foto" so'zlarini ishlatma.
Mahsulot nomi: ${productName}
JAVOB FAQAT JSON: { "uz": "...", "ru": "..." }` },
                            { type: 'image_url', image_url: { url: imageUrl } }
                        ]
                    }
                ],
                temperature: 0.1,
                response_format: { type: "json_object" }
            }),
        });

        const data = await response.json();
        const content = data.choices[0]?.message?.content;
        return content ? JSON.parse(content) : null;
    } catch (err) {
        console.error("Vision AI Error for link:", imageUrl, err);
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const { productId } = await req.json();
        if (!productId) return NextResponse.json({ error: "Product ID required" }, { status: 400 });

        // 1. Fetch Product
        const { data: product, error } = await supabaseAdmin
            .from("products")
            .select("*")
            .eq("id", productId)
            .single();

        if (error || !product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

        const allImages = Array.from(new Set([
            product.image,
            ...(product.images || [])
        ])).filter(Boolean) as string[];

        const currentMeta = product.image_metadata || {};
        
        // 2. Find THE NEXT image to process
        const nextUrl = allImages.find(url => !currentMeta[url]);

        if (!nextUrl) {
            return NextResponse.json({ 
                success: true, 
                message: "No images left to analyze", 
                remaining: 0,
                total: allImages.length 
            });
        }

        console.log(`Analyzing single image for Vercel safety: ${nextUrl}`);
        
        // 3. Analyze ONE image
        const res = await analyzeVisionImg(nextUrl, product.name_uz || product.name);
        
        if (res) {
            const updatedMeta = {
                ...currentMeta,
                [nextUrl]: {
                    alt_uz: res.uz || res.alt_uz,
                    alt_ru: res.ru || res.alt_ru
                }
            };

            // 4. Update Product Metadata (alt-text SEO)
            await supabaseAdmin
                .from("products")
                .update({ image_metadata: updatedMeta })
                .eq("id", productId);

            // 5. Log Success
            await supabaseAdmin.from("ai_logs").insert([{
                id: crypto.randomUUID(),
                action: "vision_auto_analyze",
                model: "qwen/qwen3.6-27b",
                product_id: productId,
                image_url: nextUrl,
                status: "completed",
                output: [JSON.stringify(res)]
            }]);

            const remaining = allImages.filter(url => !updatedMeta[url]).length;

            return NextResponse.json({ 
                success: true, 
                processed: nextUrl, 
                remaining,
                total: allImages.length 
            });
        } else {
            // Log Failure
            await supabaseAdmin.from("ai_logs").insert([{
                id: crypto.randomUUID(),
                action: "vision_auto_analyze_failed",
                product_id: productId,
                model: "qwen/qwen3.6-27b",
                image_url: nextUrl,
                status: "failed",
                error_message: "AI analysis returned no valid JSON"
            }]);
            
            throw new Error("AI analysis failed");
        }

    } catch (error: any) {
        console.error("Auto Vision Worker failed slice:", error);
        return NextResponse.json({ error: "Internal server error: " + error.message }, { status: 500 });
    }
}
