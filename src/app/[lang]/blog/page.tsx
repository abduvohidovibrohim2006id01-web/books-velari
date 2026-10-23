import { supabaseAdmin } from "@/lib/supabase-admin";
import { mapBlog } from "@/lib/mappers";
import { translations } from "@/lib/translations";
import Link from "next/link";
import { Calendar, Clock, Eye, ArrowRight, Sparkles } from "lucide-react";
import { Metadata } from "next";

export const revalidate = 86400; // 24 soat Edge Cache (Vercel CPU tejamkorligi)

export async function generateMetadata({ params: { lang } }: any): Promise<Metadata> {
    const t = translations[lang as 'uz' | 'ru'];
    const baseUrl = 'https://velari.uz';
    
    return {
        // t.blog.title = "Velari Insights" — shablon qo'shilsa "Velari" ikki marta chiqadi
        title: { absolute: `${t.blog.title} — ${t.blog.subtitle}` },
        description: t.blog.subtitle,
        alternates: {
            canonical: `${baseUrl}/${lang}/blog`,
            languages: {
                'uz-UZ': `${baseUrl}/uz/blog`,
                'ru-RU': `${baseUrl}/ru/blog`,
                'x-default': `${baseUrl}/uz/blog`,
            },
        },
    };
}

export default async function BlogPage({ params: { lang } }: any) {
    const t = translations[lang as 'uz' | 'ru'];

    const { data: blogsData } = await supabaseAdmin
        .from("blogs")
        .select("*")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

    const blogs = (blogsData || []).map(mapBlog);

    return (
        <main className="min-h-screen bg-[#FAFAF6] pt-28 md:pt-36 pb-24 px-4 md:px-8">
            <div className="max-w-7xl mx-auto">
                
                {/* Hero Section */}
                <div className="mb-14 md:mb-20 text-center relative max-w-2xl mx-auto">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50/80 border border-emerald-500/15 text-emerald-800 text-[11px] font-semibold tracking-wide mb-4 backdrop-blur-md">
                        <Sparkles size={13} className="text-[#2D6E3E]" />
                        <span>Velari Insights</span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-[#111612] mb-3">
                        {t.blog.title}
                    </h1>
                    <p className="text-sm md:text-base font-normal text-[rgba(15,20,16,0.62)] leading-relaxed">
                        {t.blog.subtitle}
                    </p>
                </div>

                {blogs.length === 0 ? (
                    <div className="bg-white/90 backdrop-blur-xl rounded-[28px] border border-[rgba(15,20,16,0.06)] shadow-xs p-12 text-center flex flex-col items-center justify-center gap-4 max-w-md mx-auto">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-500/10 flex items-center justify-center text-[#2D6E3E]">
                            <Sparkles size={28} />
                        </div>
                        <p className="text-[#111612] text-base font-semibold">{t.blog.noPosts}</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {blogs.map((blog) => (
                            <Link 
                                key={blog.id} 
                                href={`/${lang}/blog/${blog.slug}`}
                                className="group flex flex-col bg-white/90 backdrop-blur-md rounded-[28px] overflow-hidden border border-[rgba(15,20,16,0.06)] shadow-xs hover:border-[#2D6E3E]/30 hover:shadow-md transition-transform duration-200 hover:-translate-y-1 will-change-transform"
                            >
                                <div className="aspect-[16/10] overflow-hidden relative bg-[#EAF3EC]">
                                    {blog.image ? (
                                        <img 
                                            src={blog.image} 
                                            alt={lang === 'uz' ? blog.title_uz : blog.title_ru}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[#2D6E3E]/40">
                                            <Sparkles size={48} />
                                        </div>
                                    )}
                                    <div className="absolute top-4 left-4">
                                        <span className="bg-white/90 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-semibold text-[#111612] border border-[rgba(15,20,16,0.08)] shadow-xs">
                                            {blog.category || 'Insights'}
                                        </span>
                                    </div>
                                </div>

                                <div className="p-6 md:p-8 flex flex-col flex-1">
                                    <div className="flex items-center gap-4 text-xs font-medium text-[rgba(15,20,16,0.5)] mb-3">
                                        <div className="flex items-center gap-1.5">
                                            <Calendar size={13} className="text-[#2D6E3E]" />
                                            <span>{new Date(blog.created_at).toLocaleDateString()}</span>
                                        </div>
                                        <span>•</span>
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={13} className="text-[#2D6E3E]" />
                                            <span>{blog.readTime} {t.blog.readTime}</span>
                                        </div>
                                    </div>

                                    <h2 className="text-lg md:text-xl font-bold tracking-tight text-[#111612] leading-snug mb-2.5 group-hover:text-[#2D6E3E] transition-colors duration-200">
                                        {lang === 'uz' ? blog.title_uz : blog.title_ru}
                                    </h2>

                                    <p className="text-sm text-[rgba(15,20,16,0.62)] font-normal line-clamp-2 mb-6 leading-relaxed flex-1">
                                        {lang === 'uz' ? blog.excerpt_uz : blog.excerpt_ru}
                                    </p>

                                    <div className="flex items-center justify-between pt-4 border-t border-[rgba(15,20,16,0.06)] mt-auto">
                                        <span className="text-[#2D6E3E] font-semibold text-xs inline-flex items-center gap-1.5 group-hover:gap-2.5 transition-[gap] duration-200">
                                            {t.blog.readMore} <ArrowRight size={14} />
                                        </span>
                                        <div className="flex items-center gap-1.5 text-xs text-[rgba(15,20,16,0.4)] font-medium">
                                            <Eye size={13} />
                                            <span>{blog.views}</span>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}
