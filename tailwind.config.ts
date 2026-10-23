import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                background: "var(--background)",
                foreground: "var(--foreground)",
                velari: {
                    green: '#2D6E3E',
                    'green-deep': '#1F5A30',
                    'green-tint': '#EAF3EC',
                },
                page: '#FAFAF6',
                card: '#FFFFFF',
                'text-primary': '#0F1410',
                'text-secondary': '#5A625C',
                'text-tertiary': '#9AA29C',
                danger: '#FF3B30',
                star: '#F6B100',
            },
            fontFamily: {
                sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', 'system-ui', 'sans-serif'],
            },
            borderRadius: {
                'velari-sm': '8px',
                'velari-md': '14px',
                'velari-card': '20px',
                'velari-sheet': '28px',
                'velari-btn': '27px',
            },
            boxShadow: {
                'velari-card': '0 4px 16px rgba(15,20,16,0.05)',
                'velari-elevated': '0 8px 24px rgba(15,20,16,0.08)',
                'velari-float': '0 8px 24px rgba(45,110,62,0.28)',
                'velari-modal': '0 16px 36px rgba(15,20,16,0.18)',
            },
            animation: {
                'velari-fade-in': 'velari-fade-in 240ms ease-out forwards',
                'velari-slide-in': 'velari-slide-in 320ms cubic-bezier(0.22,1,0.36,1) forwards',
                'velari-sheet-up': 'velari-sheet-up 380ms cubic-bezier(0.22,1,0.36,1) forwards',
                'velari-shimmer': 'velari-shimmer 1.6s infinite',
                'velari-badge-pop': 'velari-badge-pop 360ms cubic-bezier(0.34,1.56,0.64,1)',
                'velari-float': 'velari-float 3s ease-in-out infinite',
                'velari-pulse-soft': 'velari-pulse-soft 2s ease-in-out infinite',
                'velari-ring-out': 'velari-ring-out 1.5s ease-out infinite',
                'velari-pop-in': 'velari-pop-in 400ms cubic-bezier(0.34,1.56,0.64,1) forwards',
                'velari-shake': 'velari-shake 400ms cubic-bezier(0.22,1,0.36,1)',
                'lens-scan': 'lensScan 2s ease-in-out infinite alternate',
            },
            keyframes: {
                lensScan: {
                    '0%': { top: '4%', opacity: '0.3' },
                    '50%': { opacity: '1' },
                    '100%': { top: '94%', opacity: '0.3' },
                },
            },
        },
    },
    plugins: [],
};
export default config;
