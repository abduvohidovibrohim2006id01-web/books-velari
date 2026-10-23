import { supabaseAdmin } from "@/lib/supabase-admin";
import { Metadata } from "next";
import { cache } from "react";
import { mapBlog, mapProduct } from "@/lib/mappers";
import { translations } from "@/lib/translations";
import Link from "next/link";
import { ChevronLeft, Calendar, Clock, Eye, Share2 } from "lucide-react";
import { notFound } from "next/navigation";
import LinkedProducts from "./LinkedProducts";
import { PUBLIC_PRODUCT_COLUMNS } from "@/lib/public-product";

const getBlogData = cache(async (slug: string) => {
    const { data } = await supabaseAdmin
        .from("blogs")
        .select("*")
        .eq("slug", slug)
        .eq("is_deleted", false)
        .single();
    
    return data ? mapBlog(data) : null;
});

export const revalidate = 86400; // 24 soat Edge Cache

export async function generateMetadata({ params: { lang, slug } }: { params: { lang: string, slug: string } }): Promise<Metadata> {
    const blog = await getBlogData(slug);
    if (!blog) notFound();

    const title = lang === 'uz' ? blog.title_uz : blog.title_ru;
    const description = (lang === 'uz' ? blog.excerpt_uz || blog.content_uz : blog.excerpt_ru || blog.content_ru).substring(0, 160);
    const baseUrl = "https://velari.uz";

    return {
        title,
        description,
        openGraph: {
            title,
            description,
            url: `${baseUrl}/${lang}/blog/${slug}`,
            images: [{ url: blog.image || "/og-image.png" }],
            type: 'article',
            locale: lang === 'ru' ? 'ru_RU' : 'uz_UZ',
        },
        alternates: {
            canonical: `${baseUrl}/${lang}/blog/${slug}`,
            languages: {
                'uz-UZ': `${baseUrl}/uz/blog/${slug}`,
                'ru-RU': `${baseUrl}/ru/blog/${slug}`,
                'x-default': `${baseUrl}/uz/blog/${slug}`,
            },
        },
    };
}

export default async function BlogPostPage({ params: { lang, slug } }: { params: { lang: string, slug: string } }) {
    const t = translations[lang as 'uz' | 'ru'];

    // 1. Fetch Blog
    const { data: blogData } = await supabaseAdmin
        .from("blogs")
        .select("*")
        .eq("slug", slug)
        .eq("is_deleted", false)
        .single();

    if (!blogData) notFound();
    const blog = mapBlog(blogData);
    const baseUrl = "https://velari.uz";
    const title = lang === 'uz' ? blog.title_uz : blog.title_ru;
    const description = lang === 'uz'
        ? (blog.excerpt_uz || blog.content_uz)
        : (blog.excerpt_ru || blog.content_ru);
    const image = blog.image?.startsWith('http') ? blog.image : `${baseUrl}${blog.image || '/og-image.png'}`;
    const articleUrl = `${baseUrl}/${lang}/blog/${slug}`;
    const blogJsonLd = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "mainEntityOfPage": { "@type": "WebPage", "@id": articleUrl },
        "headline": title,
        "description": description.substring(0, 160),
        "image": [image],
        "datePublished": blog.created_at,
        "dateModified": blog.updated_at || blog.created_at,
        "author": { "@type": "Organization", "name": "Velari Insights" },
        "publisher": { "@type": "Organization", "name": "Velari" },
    };

    // 2. Fetch Linked Products
    let linkedProducts: any[] = [];
    if (blog.linkedProductIds && blog.linkedProductIds.length > 0) {
        const { data: pData } = await supabaseAdmin
            .from("products")
            .select(PUBLIC_PRODUCT_COLUMNS)
            .in("id", blog.linkedProductIds)
            .eq("is_deleted", false);
        
        if (pData) linkedProducts = pData.map(mapProduct);
    }

    // 3. Increment Views (Simple update)
    await supabaseAdmin.from("blogs").update({ views: (blog.views || 0) + 1 }).eq("id", blog.id);

    return (
        <main className="min-h-screen pb-32" style={{ background: "#FAFAF6" }}>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(blogJsonLd) }}
            />

            {/* 1. Header Navigation */}
            <div className="fixed top-20 md:top-24 left-0 right-0 z-50 pointer-events-none">
                <div className="max-w-4xl mx-auto px-4">
                    <Link
                        href={`/${lang}/blog`}
                        className="pointer-events-auto inline-flex items-center gap-2 bg-white/90 backdrop-blur-xl border border-[rgba(15,20,16,0.08)] px-4 py-2 rounded-full text-xs font-semibold text-[#111612] hover:bg-white active:scale-95 transition-transform duration-150 shadow-sm"
                    >
                        <ChevronLeft size={16} /> {t.blog.backToList}
                    </Link>
                </div>
            </div>

            {/* 2. Hero Image Section */}
            <div className="w-full h-[55vh] md:h-[70vh] relative pt-20">
                <div className="absolute inset-0 bg-black/40 z-10" />
                <img
                    src={blog.image || '/images/blog-placeholder.jpg'}
                    alt={lang === 'uz' ? blog.title_uz : blog.title_ru}
                    className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent z-20" />

                <div className="absolute bottom-12 md:bottom-16 left-0 right-0 z-30 px-6">
                    <div className="max-w-4xl mx-auto">
                        <span className="inline-block bg-[#2D6E3E] text-white px-3.5 py-1.5 rounded-full text-xs font-semibold mb-4 shadow-sm">
                            {blog.category || 'Insights'}
                        </span>
                        <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight mb-4 drop-shadow-sm">
                            {lang === 'uz' ? blog.title_uz : blog.title_ru}
                        </h1>

                        <div className="flex flex-wrap items-center gap-4 md:gap-6 text-white/80 text-xs font-medium">
                            <div className="flex items-center gap-1.5"><Calendar size={14} className="text-emerald-400" /> {new Date(blog.created_at).toLocaleDateString()}</div>
                            <span>•</span>
                            <div className="flex items-center gap-1.5"><Clock size={14} className="text-emerald-400" /> {blog.readTime} {t.blog.readTime}</div>
                            <span>•</span>
                            <div className="flex items-center gap-1.5"><Eye size={14} className="text-emerald-400" /> {blog.views} {t.blog.views}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. Content Section */}
            <div className="max-w-3xl mx-auto px-6 pt-12 md:pt-16">
                <article className="prose prose-lg max-w-none">
                    <div className="text-[#111612]/90 leading-relaxed font-normal text-base md:text-lg whitespace-pre-wrap">
                        {lang === 'uz' ? blog.content_uz : blog.content_ru}
                    </div>
                </article>

                <div className="mt-14 pt-8 border-t border-[rgba(15,20,16,0.08)] flex items-center justify-between">
                    <button className="flex items-center gap-2 text-[rgba(15,20,16,0.6)] font-semibold text-xs hover:text-[#111612] transition-colors group">
                        <Share2 size={15} className="group-hover:rotate-12 transition-transform duration-200" /> {lang === 'uz' ? 'Maqolani ulashing' : 'Поделиться статьей'}
                    </button>
                    <div className="text-[rgba(15,20,16,0.4)] font-medium text-xs tracking-wider uppercase">VELARI INSIGHTS</div>
                </div>
            </div>

            {/* 4. Linked Products Section (Client Side) */}
            <LinkedProducts products={linkedProducts} lang={lang as any} />

        </main>
    );
}
