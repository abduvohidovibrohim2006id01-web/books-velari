"use client";

import React, { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary — Runtime xatolarni ushlab, foydalanuvchiga chiroyli xabar ko'rsatadi
 * Bu React class component bo'lishi shart (hooks bilan ErrorBoundary qilib bo'lmaydi)
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-20 h-20 bg-red-50 rounded-[32px] flex items-center justify-center mb-6">
                        <span className="text-3xl">⚠️</span>
                    </div>
                    <h2 className="text-xl font-black tracking-tighter mb-2">
                        Xatolik yuz berdi
                    </h2>
                    <p className="text-gray-400 text-sm font-medium mb-6 max-w-sm">
                        Kutilmagan xatolik yuz berdi. Iltimos sahifani qayta yuklang yoki keyinroq urinib ko&apos;ring.
                    </p>
                    <button
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                            window.location.reload();
                        }}
                        className="velari-green-btn px-8 py-4 rounded-full font-black text-xs uppercase tracking-widest active:scale-95 transition-transform duration-150 will-change-transform"
                    >
                        Qayta yuklash
                    </button>
                    {process.env.NODE_ENV === "development" && this.state.error && (
                        <details className="mt-8 text-left max-w-lg w-full">
                            <summary className="text-xs font-bold text-gray-400 cursor-pointer uppercase tracking-widest">
                                Xato tafsilotlari
                            </summary>
                            <pre className="mt-2 p-4 bg-gray-50 rounded-2xl text-xs text-red-600 overflow-auto max-h-40">
                                {this.state.error.message}
                                {"\n"}
                                {this.state.error.stack}
                            </pre>
                        </details>
                    )}
                </div>
            );
        }

        return this.props.children;
    }
}
