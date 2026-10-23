import type { ReactNode } from 'react';

/**
 * Root layout.tsx — Next.js App Router i18n arxitekturasi uchun minimal ildiz layout.
 * Bu fayl root not-found.tsx ni qo'llab-quvvatlash uchun kerak.
 * Haqiqiy sahifa layout'i: src/app/[lang]/layout.tsx
 */
export default function RootLayout({ children }: { children: ReactNode }) {
    return children;
}

