import { NextResponse } from "next/server";
import { runFullSystemDiagnostic, sendDiagnosticReportToTelegram } from "@/lib/health-checker";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Max 60 seconds for serverless diagnostic

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const sendTg = url.searchParams.get("telegram") !== "false"; // Default true for cron

        // Vercel Cron yoki Admin himoyasi
        const authHeader = req.headers.get("authorization");
        const secretParam = url.searchParams.get("secret");
        const userAgent = req.headers.get("user-agent") || "";
        const isVercelCron = userAgent.includes("vercel-cron");
        const cronSecret = process.env.CRON_SECRET;
        const adminSecret = process.env.ADMIN_SECRET;

        const isCronAuthorized = cronSecret ? authHeader === `Bearer ${cronSecret}` : false;
        const isAdminAuthorized = adminSecret ? secretParam === adminSecret : false;

        // Vercel Cron, to'g'ri CRON_SECRET, ADMIN_SECRET yoki secretsiz muhitda ruxsat
        const isAuthorized = isVercelCron || isCronAuthorized || isAdminAuthorized || (!cronSecret && !adminSecret);

        if (!isAuthorized) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const report = await runFullSystemDiagnostic();

        let tgSent = false;
        if (sendTg) {
            tgSent = await sendDiagnosticReportToTelegram();
        }

        return NextResponse.json({
            success: true,
            healthScore: report.healthScore,
            totalTests: report.total,
            passed: report.passed,
            warnings: report.warnings,
            failed: report.failed,
            totalDurationMs: report.durationMs,
            telegramSent: tgSent,
            timestamp: report.timestamp,
            results: report.results
        });
    } catch (e: any) {
        console.error("Health Check API Error:", e);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: Request) {
    return GET(req);
}
