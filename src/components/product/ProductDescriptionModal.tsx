"use client";

import { Image as ImageIcon } from "lucide-react";
import Sheet from "@/components/velari/Sheet";
import { getOptimizedImageUrl } from "@/lib/imageVariants";

interface ProductDescriptionModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: any;
    language: "uz" | "ru";
}

export const ProductDescriptionModal = ({
    isOpen,
    onClose,
    product,
    language
}: ProductDescriptionModalProps) => {
    if (!product) return null;

    const allImages = product?.images && product.images.length > 0 ? product.images : [product?.image || ""];
    const allMedia = [
        ...allImages.map((img: string) => ({ type: 'image' as const, url: img })),
        ...(product?.videoUrl ? [{ type: 'video' as const, url: product.videoUrl }] : [])
    ];

    const title = language === 'uz' ? 'Mahsulot haqida' : 'О товаре';

    return (
        <Sheet
            open={isOpen}
            onClose={onClose}
            height="88dvh"
            title={title}
        >
            <div className="px-5 md:px-8 pb-10 space-y-8">
                {/* Product Name */}
                <div className="border-b border-gray-100/80 pb-4">
                    <span className="text-[11px] font-medium text-[#737D75] uppercase tracking-wider block mb-1">
                        {product.brand || (language === 'uz' ? 'Mahsulot' : 'Товар')}
                    </span>
                    <h2 className="text-lg md:text-xl font-semibold text-[#111612] tracking-tight leading-snug">
                        {product[`name_${language}`] || product.name}
                    </h2>
                </div>

                {/* Description Text */}
                <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#737D75] uppercase tracking-wider">
                        {language === 'uz' ? "Batafsil tavsif" : "Подробное описание"}
                    </h3>
                    <div className="text-[#111612] text-[15px] leading-relaxed font-normal bg-[#F7F8F4] p-5 md:p-6 rounded-[22px] border border-black/5">
                        {(() => {
                            const desc = product[`description_${language}`] || product.description || '';
                            const hasHtml = /<[a-z][\s\S]*>/i.test(desc);
                            if (hasHtml) {
                                return <div dangerouslySetInnerHTML={{ __html: desc }} className="prose max-w-none text-[#111612] font-normal" />;
                            }
                            return (
                                <div className="space-y-3">
                                    {desc.split('\n').map((line: string, i: number) => (
                                        <p key={i}>{line}</p>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Media Gallery Section */}
                {allMedia.length > 0 && (
                    <div className="space-y-4 pt-2">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-[#EAF3EC] text-[#2D6E3E] rounded-xl">
                                <ImageIcon size={18} />
                            </div>
                            <h3 className="text-sm font-semibold text-[#737D75] uppercase tracking-wider">
                                {language === 'uz' ? "Mahsulot fotolavhalari" : "Галерея изображений"}
                            </h3>
                        </div>
                        <div className="space-y-4">
                            {allMedia.map((m, i) => (
                                <div key={i} className="rounded-[24px] overflow-hidden bg-[#F7F8F4] border border-black/5 flex items-center justify-center p-3">
                                    {m.type === 'video' ? (
                                        <video src={m.url} controls className="w-full max-h-[500px] object-contain rounded-xl" />
                                    ) : (
                                        <img
                                            src={getOptimizedImageUrl(product?.image_metadata, m.url, 'md')}
                                            alt={`Gallery-${i}`}
                                            className="w-full max-h-[600px] object-contain rounded-xl"
                                            loading="lazy"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Sheet>
    );
};
