import withPWAInit from "@ducanh2912/next-pwa";
import { withSentryConfig } from "@sentry/nextjs";

const withPWA = withPWAInit({
    dest: "public",
    cacheOnFrontEndNav: false,
    aggressiveFrontEndNavCaching: false,
    reloadOnOnline: false,
    swMinify: true,
    disable: process.env.NODE_ENV === "development",
    workboxOptions: {
        disableDevLogs: true,
        skipWaiting: true,
        clientsClaim: true,
        importScripts: ["/push-handler.js"],
        runtimeCaching: [
            {
                urlPattern: /\/api\/ai.*/i,
                handler: 'NetworkOnly',
            },
            {
                urlPattern: /https:\/\/.*\.googleapis\.com\/.*$/i,
                handler: 'NetworkOnly',
            },
            {
                urlPattern: /^https:\/\/storage\.yandexcloud\.net\/.*\.(?:png|jpg|jpeg|webp|avif|gif|svg)$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'yandex-images',
                    expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
                    cacheableResponse: { statuses: [0, 200] },
                },
            },
            {
                // Video fayllar HECH QACHON Service Worker cache'dan o'tmasligi kerak!
                // Sabab: Brauzer video uchun Range request (206 Partial Content) yuboradi,
                // lekin Cache API 206 javobni qo'llab-quvvatlamaydi va xatolik beradi:
                // "Failed to execute 'put' on 'Cache': Partial response (status code 206) is unsupported"
                urlPattern: /^https:\/\/storage\.yandexcloud\.net\/.*\.mp4$/i,
                handler: 'NetworkOnly',
            },
            {
                urlPattern: /^\/_next\/image\?.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'next-images',
                    expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 30 },
                    cacheableResponse: { statuses: [0, 200] },
                },
            },
        ]
    },
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    compress: true,
    typescript: {
        // Tekshiruv npm run typecheck'da — build'dan oldin, alohida jarayonda ("build" skriptiga qarang).
        // Next ichidagi ikkinchi tekshiruv o'chiq: xotirani ikki marta yemasin.
        ignoreBuildErrors: true,
    },
    eslint: {
        ignoreDuringBuilds: true,
    },
    experimental: {
        serverComponentsExternalPackages: ['sharp', 'web-push', 'onnxruntime-node', '@xenova/transformers'],
    },
    images: {
        unoptimized: true,
        formats: ['image/webp'],
        minimumCacheTTL: 31536000,
        deviceSizes: [640, 828, 1080],
        imageSizes: [64, 128, 256, 384],
        remotePatterns: [
            { protocol: 'https', hostname: 'images.unsplash.com' },
            { protocol: 'https', hostname: 'storage.yandexcloud.net' },
            { protocol: 'https', hostname: '**.yandexcloud.net' },
            { protocol: 'https', hostname: '**.googleapis.com' },
            { protocol: 'https', hostname: '**.wb.ru' },
            { protocol: 'https', hostname: 'images.uzum.uz' },
            { protocol: 'https', hostname: '**.supabase.co' },
            { protocol: 'https', hostname: 'cdn-icons-png.flaticon.com' },
        ],
    },
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.externals.push('sharp', 'onnxruntime-node', '@xenova/transformers');
        }
        return config;
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Frame-Options',
                        value: 'SAMEORIGIN',
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin',
                    },
                    {
                        key: 'Permissions-Policy',
                        value: 'camera=(), microphone=(), geolocation=(self)',
                    },
                ],
            },
        ];
    }
};

export default withSentryConfig(
    withPWA(nextConfig),
    {
        silent: true,
        org: "velari",
        project: "velari-market",
    },
    {
        widenClientFileUpload: true,
        transpileClientSDK: true,
        hideSourceMaps: true,
        disableLogger: true,
    }
);
