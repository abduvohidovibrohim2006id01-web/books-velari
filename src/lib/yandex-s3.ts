import { S3_UPLOAD_ENDPOINT } from "./constants";

/**
 * Upload file to Yandex S3 via server-side API route
 * Maxfiy kalitlar endi serverda — client-da ko'rinmaydi
 */
export type UploadResult = { url: string; blurDataURL?: string; lowResUrl?: string; xs?: string; md?: string; lg?: string };

export async function uploadToYandexS3(file: File | Blob, fileName?: string): Promise<UploadResult> {
    const finalFileName = fileName || (file as File).name || `file_${Date.now()}`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", finalFileName);

    const response = await fetch(S3_UPLOAD_ENDPOINT, {
        method: "POST",
        body: formData
    });

    const rawText = await response.text();

    if (!response.ok) {
        let errorMsg = "Upload failed";
        try {
            const error = JSON.parse(rawText);
            errorMsg = error.error || errorMsg;
        } catch {
            errorMsg = rawText.slice(0, 100) || errorMsg;
        }
        throw new Error(errorMsg);
    }

    try {
        const data = JSON.parse(rawText);
        return { url: data.url, blurDataURL: data.blurDataURL, lowResUrl: data.lowResUrl, xs: data.xs, md: data.md, lg: data.lg };
    } catch {
        console.error("Non-JSON response from upload API:", rawText);
        throw new Error("Server returned invalid response. Please try again or check file size.");
    }
}

/**
 * Upload file/video to Yandex S3 via Admin API route (max 300 MB)
 */
export async function uploadAdminToYandexS3(file: File | Blob, fileName?: string): Promise<UploadResult> {
    const finalFileName = fileName || (file as File).name || `file_${Date.now()}`;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", finalFileName);

    const response = await fetch("/api/admin/upload", {
        method: "POST",
        body: formData
    });

    const rawText = await response.text();

    if (!response.ok) {
        let errorMsg = "Admin upload failed";
        try {
            const error = JSON.parse(rawText);
            errorMsg = error.error || errorMsg;
        } catch {
            errorMsg = response.status === 504 
                ? "Server timeout — fayl hajmi juda katta yoki server band." 
                : (rawText.slice(0, 100) || `Server xatosi (${response.status})`);
        }
        throw new Error(errorMsg);
    }

    try {
        const data = JSON.parse(rawText);
        return { url: data.url, blurDataURL: data.blurDataURL, lowResUrl: data.lowResUrl, xs: data.xs, md: data.md, lg: data.lg };
    } catch {
        console.error("Non-JSON response from admin upload API:", rawText);
        throw new Error("Server xatosi yoki fayl hajmi juda katta (Max: 300 MB).");
    }
}


/**
 * Downloads an image from an external URL and uploads it to Yandex S3.
 * Yandex S3 URL bo'lsa — originalini qayta yuklamaydi, faqat thumbnail generatsiya qiladi.
 */
export async function uploadFromUrlToYandexS3(externalUrl: string): Promise<UploadResult> {
    try {
        const isAlreadyOnS3 = externalUrl.includes("yandexcloud.net");

        const response = await fetch(externalUrl, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`External image fetch failed: ${response.statusText}`);

        const blob = await response.blob();
        const fileName = externalUrl.split('/').pop()?.split('?')[0] || 'image.jpg';

        if (isAlreadyOnS3) {
            const result = await uploadToYandexS3(blob, `thumb_${fileName}`);
            return { url: externalUrl, lowResUrl: result.lowResUrl, blurDataURL: result.blurDataURL, xs: result.xs, md: result.md, lg: result.lg };
        }

        return await uploadToYandexS3(blob, fileName);
    } catch (error) {
        console.error("Failed to proxy image to S3:", error);
        return { url: externalUrl };
    }
}

