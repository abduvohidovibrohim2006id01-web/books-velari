// Constants & API Keys
// NEXT_PUBLIC_ prefiksi bilan faqat client-da kerak bo'lgan kalitlar
export const YANDEX_MAPS_API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY || "";

// S3 konfiguratsiyasi endi server-side API route-da
// Endpoint faqat client-da yuklash uchun
export const S3_UPLOAD_ENDPOINT = "/api/upload";
