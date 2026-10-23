import { Suspense } from "react";
import WalletClient from "./WalletClient";

export const metadata = {
    title: "Mening hamyonim",
    description: "Hamyon balansi va keshbeklar tarixi",
};

export default function WalletPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#F2F3F5]">
                <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <WalletClient />
        </Suspense>
    );
}
