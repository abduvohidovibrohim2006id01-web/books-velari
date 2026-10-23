import Link from 'next/link';

export const metadata = {
    title: { absolute: "404 - Sahifa topilmadi | Velari" },
    robots: {
        index: false,
        follow: false,
    },
};

export default function NotFound() {
    return (
        <div className="min-h-[75vh] flex flex-col items-center justify-center text-center px-4 py-16 bg-[#FAFAF6]">
            <div className="bg-white/90 backdrop-blur-xl rounded-[32px] border border-[rgba(15,20,16,0.08)] shadow-xs p-8 md:p-12 max-w-md w-full text-center flex flex-col items-center">
                <span className="text-6xl md:text-7xl font-extrabold text-[#111612] tracking-tight mb-2">404</span>
                <h2 className="text-xl font-bold text-[#2D6E3E] mb-2">Sahifa topilmadi</h2>
                <p className="text-[rgba(15,20,16,0.62)] max-w-sm mb-8 text-sm leading-relaxed">
                    Kechirasiz, siz qidirayotgan sahifa yoki mahsulot mavjud emas yoxud ko&apos;chirilgan.
                </p>
                <Link 
                    href="/uz"
                    className="bg-[#2D6E3E] hover:bg-[#235831] text-white px-6 py-3 rounded-full font-semibold text-sm active:scale-95 transition-transform duration-150 will-change-transform shadow-sm"
                >
                    Bosh sahifaga qaytish
                </Link>
            </div>
        </div>
    );
}
