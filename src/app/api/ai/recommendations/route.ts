import { NextRequest, NextResponse } from "next/server";
import { getAiRecommendations, logAiActivity } from "@/lib/ai";
import { checkRateLimit } from "@/lib/rate-limiter";
import { verifyJwt } from "@/lib/jwt-utils";
import { getUserJwtSecret } from "@/lib/secrets";

export async function POST(req: NextRequest) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";

    try {
        if (!await checkRateLimit(ip, 10, 60)) {
            return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
        }

        const body = await req.json();
        const { action, userInterests, allProducts, userPhone, logData } = body;

        // Verify User for security
        const userToken = req.cookies.get('user_token')?.value;
        const JWT_SECRET = getUserJwtSecret();
        const payload = userToken ? await verifyJwt(userToken, JWT_SECRET) : null;

        if (!payload || (userPhone && payload.sub !== userPhone)) {
             // For public recs we might allow without token, but for logging we definitely want it
             // Let's allow recommendations but restrict logging to authenticated users
        }

        if (action === "get_recommendations") {
            const recommendations = await getAiRecommendations(userInterests, allProducts, userPhone);
            return NextResponse.json({ success: true, recommendations });
        }

        if (action === "log_activity") {
            if (!payload) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            await logAiActivity(logData);
            return NextResponse.json({ success: true });
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });

    } catch (error: any) {
        console.error("AI Recommendations API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
