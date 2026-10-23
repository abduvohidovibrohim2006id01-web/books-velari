import { supabaseAdmin } from "@/lib/supabase-admin";

interface LogParams {
    session_id?: string;
    user_phone?: string | null;
    name?: string;
    event_type: "login" | "logout" | "visit" | "register";
    ip_address?: string;
    city?: string;
    region?: string;
    country?: string;
    isp?: string;
    latitude?: number;
    longitude?: number;
    device_type?: string;
    screen_resolution?: string;
    device_memory?: number;
    cpu_cores?: number;
    current_path?: string;
}

/**
 * Foydalanuvchi harakatini visitor_logs jadvaliga yozish
 * Server-side (API route)lar ichidan chaqiriladi
 */
export async function writeVisitorLog(params: LogParams) {
    try {
        await supabaseAdmin.from("visitor_logs").insert({
            session_id: params.session_id || null,
            user_phone: params.user_phone || null,
            name: params.name || "Mehmon",
            event_type: params.event_type,
            ip_address: params.ip_address || null,
            city: params.city || null,
            region: params.region || null,
            country: params.country || null,
            isp: params.isp || null,
            latitude: params.latitude || null,
            longitude: params.longitude || null,
            device_type: params.device_type || null,
            screen_resolution: params.screen_resolution || null,
            device_memory: params.device_memory || null,
            cpu_cores: params.cpu_cores || null,
            current_path: params.current_path || null,
            created_at: new Date().toISOString(),
        });
    } catch (err) {
        // Log xatoligi saytni to'xtatmasin
        console.warn("[VisitorLog]", err);
    }
}

/**
 * IP bo'yicha geo ma'lumotlarni server-side'da olish
 */
export async function getGeoByIp(ip: string) {
    try {
        if (!ip || ip === "unknown" || ip.startsWith("::")) return {};
        const res = await fetch(`https://ipapi.co/${ip}/json/`, { 
            next: { revalidate: 86400 } // 24 soat cache
        });
        if (!res.ok) return {};
        const data = await res.json();
        return {
            city: data.city || null,
            region: data.region || null,
            country: data.country_name || null,
            isp: data.org || null,
            latitude: data.latitude || null,
            longitude: data.longitude || null,
        };
    } catch {
        return {};
    }
}
