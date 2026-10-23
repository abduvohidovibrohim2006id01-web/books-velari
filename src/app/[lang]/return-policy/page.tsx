import { Metadata } from "next";
import Link from "next/link";
import {
    RotateCcw, ShieldCheck, Banknote, Phone, MapPin, Send,
    AlertTriangle, CheckCircle2, Truck, ChevronLeft, FileText, Clock,
} from "lucide-react";
import { getShopSettingsServer } from "@/lib/shop-settings.server";
import { formatTelegramLink, formatPhoneLink } from "@/lib/shop-settings";

type Lang = "uz" | "ru";

const CONTENT: Record<Lang, any> = {
    ru: {
        badge: "Velari Market",
        title: "Условия возврата и обмена",
        intro: "Мы стремимся обеспечить максимальный комфорт и прозрачность при покупках в интернет-магазине Velari Market. Все процедуры возврата и обмена осуществляются строго в соответствии с Законом Республики Узбекистан «О защите прав потребителей» и Правилами розничной торговли.",
        addressLabel: "Адрес для возврата",
        address: "г. Ташкент, Сергелийский район, ул. М. Замахшари, 4-й проезд, 17А",
        contactTitle: "Контакты для оформления возврата",
        contactSubtitle: "Для инициации процесса возврата или обмена свяжитесь с нашей службой поддержки",
        telegramLabel: "Telegram-поддержка (админ)",
        phoneLabel: "Телефон / Call-центр",
        back: "Назад",
        sections: [
            {
                icon: "return",
                tag: "Без брака",
                title: "Возврат товара надлежащего качества",
                body: "Если товар не подошёл вам по форме, габаритам, фасону, расцветке или размеру, вы имеете право обменять его или вернуть в течение 14 календарных дней со дня покупки (не считая дня покупки).",
                listTitle: "Условия возврата:",
                list: [
                    "Товар не был в употреблении, полностью сохранён его товарный вид.",
                    "Сохранены все потребительские свойства, пломбы, фабричные ярлыки и защитные плёнки.",
                    "Наличие документов, подтверждающих покупку (электронный чек, квитанция или подтверждение заказа в личном кабинете).",
                ],
                note: "Согласно законодательству РУз, предметы личной гигиены (например, триммеры для волос, бритвы) надлежащего качества после вскрытия упаковки и использования возврату и обмену не подлежат. Возврат часов и электронных гаджетов возможен только при полном сохранении товарного вида и заводских пломб.",
                delivery: "Расходы на доставку при возврате товара надлежащего качества оплачивает покупатель.",
                deliveryBy: "buyer",
            },
            {
                icon: "shield",
                tag: "Заводской брак",
                title: "Возврат товара ненадлежащего качества",
                body: "Если вы обнаружили производственный брак, дефект или несоответствие заявленным характеристикам в течение гарантийного срока (или в течение 6 месяцев, если срок не установлен):",
                listTitle: "Ваши права:",
                list: [
                    "Бесплатное устранение недостатков.",
                    "Замена на аналогичный товар.",
                    "Полный возврат уплаченной суммы.",
                ],
                delivery: "Все транспортные расходы и услуги курьерской доставки берёт на себя Velari Market.",
                deliveryBy: "seller",
            },
            {
                icon: "money",
                tag: "1–7 рабочих дней",
                title: "Сроки и способ возврата денежных средств",
                body: "После получения товара на наш склад и проверки его состояния денежные средства возвращаются покупателю в течение от 1 до 7 рабочих дней.",
                list: [
                    "Способ возврата соответствует способу оплаты.",
                    "Если заказ оплачен онлайн (Payme / Click / Uzum) — средства возвращаются на ту же карту, с которой была произведена оплата.",
                ],
            },
        ],
    },
    uz: {
        badge: "Velari Market",
        title: "Qaytarish va almashtirish shartlari",
        intro: "Biz Velari Market internet-do'konida xaridlar qulay va shaffof bo'lishini ta'minlashga intilamiz. Tovarlarni qaytarish va almashtirishning barcha jarayonlari O'zbekiston Respublikasining «Iste'molchilarning huquqlarini himoya qilish to'g'risida»gi Qonuniga muvofiq amalga oshiriladi.",
        addressLabel: "Qaytarish manzili",
        address: "Toshkent shahri, Sergeli tumani, M. Zamaxshariy 4-tor ko'chasi, 17A",
        contactTitle: "Qaytarish uchun aloqa",
        contactSubtitle: "Qaytarish jarayonini boshlash uchun qo'llab-quvvatlash xizmatimizga murojaat qiling",
        telegramLabel: "Telegram qo'llab-quvvatlash (admin)",
        phoneLabel: "Telefon / Call-markaz",
        back: "Orqaga",
        sections: [
            {
                icon: "return",
                tag: "Nuqsonsiz",
                title: "Sifatli tovarni qaytarish",
                body: "Agar sotib olingan tovar o'lchami, rangi yoki modeli bo'yicha sizga mos kelmasa, xarid qilingan kundan boshlab 14 kalendar kuni ichida uni almashtirish yoki qaytarish huquqiga egasiz.",
                listTitle: "Qaytarish shartlari:",
                list: [
                    "Tovar ishlatilmagan va uning tovar ko'rinishi to'liq saqlangan bo'lishi kerak.",
                    "Barcha iste'mol xususiyatlari, plombalari, zavod yorliqlari va himoya plyonkalari joyida bo'lishi shart.",
                    "Xaridni tasdiqlovchi hujjat (elektron chek, kvitansiya yoki shaxsiy kabinetdagi buyurtma tarixi) mavjudligi.",
                ],
                note: "O'zbekiston qonunchiligiga ko'ra, shaxsiy gigiyena buyumlari (masalan, soch va soqol trimmerlari, taroqlar) qadoqlari ochilib ishlatilganidan keyin, agar nuqson bo'lmasa, qaytarib olinmaydi va almashtirilmaydi. Soat va gadjetlarni qaytarish faqat tovar ko'rinishi va zavod plombalari buzilmagan holatda qabul qilinadi.",
                delivery: "Sifatli tovar shunchaki yoqmagani uchun qaytarilganda, kuryerlik va transport xarajatlari xaridor tomonidan qoplanadi.",
                deliveryBy: "buyer",
            },
            {
                icon: "shield",
                tag: "Zavod braki",
                title: "Nuqsonli (brak) tovarni qaytarish",
                body: "Agar kafolat muddati davomida (yoki kafolat belgilanmagan bo'lsa, 6 oy ichida) tovarda zavod braki yoki nuqson aniqlansa:",
                listTitle: "Sizning huquqlaringiz:",
                list: [
                    "Tovarni bepul ta'mirlatish.",
                    "Xuddi shunday sifatli modelga almashtirish.",
                    "To'langan pulni to'liq qaytarib olish.",
                ],
                delivery: "Brak tovarlarni qaytarish yoki almashtirish bilan bog'liq barcha kuryerlik xarajatlari Velari Market tomonidan to'lanadi.",
                deliveryBy: "seller",
            },
            {
                icon: "money",
                tag: "1–7 ish kuni",
                title: "Pulni qaytarish muddati va usuli",
                body: "Tovar omborimizga qaytib kelib, tekshirilgandan so'ng, pul mablag'lari 1 dan 7 ish kuni ichida xaridorga qaytariladi.",
                list: [
                    "Pul xaridor qaysi usulda to'lagan bo'lsa, o'sha usulda qaytariladi.",
                    "Karta orqali onlayn to'langan bo'lsa (Payme / Click / Uzum) — o'sha plastik kartaga qayta o'tkaziladi.",
                ],
            },
        ],
    },
};

const ICONS: Record<string, any> = { return: RotateCcw, shield: ShieldCheck, money: Banknote };

export async function generateMetadata({ params }: { params: { lang: string } }): Promise<Metadata> {
    const lang = (params.lang === "ru" ? "ru" : "uz") as Lang;
    const baseUrl = "https://velari.uz";
    const title = lang === "ru"
        ? "Условия возврата и обмена товаров"
        : "Tovarlarni qaytarish va almashtirish shartlari";
    const description = lang === "ru"
        ? "Официальная политика возврата Velari Market: возврат в течение 14 дней, заводской брак, сроки возврата денег 1–7 дней. Согласно Закону РУз о защите прав потребителей."
        : "Velari Market rasmiy qaytarish siyosati: 14 kun ichida qaytarish, zavod braki, pulni 1–7 ish kunida qaytarish. O'zbekiston iste'molchi huquqlari qonuniga muvofiq.";

    return {
        title,
        description,
        openGraph: { title: `${title} | Velari`, description, url: `${baseUrl}/${lang}/return-policy`, siteName: "Velari", type: "website", locale: lang === "ru" ? "ru_RU" : "uz_UZ" },
        alternates: {
            canonical: `${baseUrl}/${lang}/return-policy`,
            languages: {
                "uz-UZ": `${baseUrl}/uz/return-policy`,
                "ru-RU": `${baseUrl}/ru/return-policy`,
                "x-default": `${baseUrl}/uz/return-policy`,
            },
        },
        robots: { index: true, follow: true },
    };
}

export default async function ReturnPolicyPage({ params }: { params: { lang: string } }) {
    const lang = (params.lang === "ru" ? "ru" : "uz") as Lang;
    const c = CONTENT[lang];
    const settings = await getShopSettingsServer();

    const supportTelegram = settings.telegram_admin || "@VELARI_UZ_ADMIN";
    const supportTelegramUrl = formatTelegramLink(settings.telegram_admin);
    const supportPhone = settings.phone || "+998 95 082 11 88";
    const supportPhoneLink = formatPhoneLink(settings.phone);
    const returnAddress = (lang === "ru"
        ? (settings.address_ru || settings.address_uz)
        : (settings.address_uz || settings.address_ru)) || c.address;
    const workingHours = lang === "ru"
        ? (settings.working_hours_ru || settings.working_hours_uz)
        : (settings.working_hours_uz || settings.working_hours_ru);

    return (
        <div className="bg-[#FAFAF6] min-h-screen pb-24 px-4 md:px-6">
            <div className="max-w-3xl mx-auto pt-8 md:pt-12">
                {/* Back */}
                <Link href={`/${lang}`} className="inline-flex items-center gap-2 text-gray-400 font-black uppercase tracking-widest text-[10px] mb-6 hover:text-black transition-colors">
                    <ChevronLeft size={16} /> {c.back}
                </Link>

                {/* Hero */}
                <div className="rounded-[32px] p-8 md:p-12 text-white relative overflow-hidden mb-8 border border-white/20 shadow-lg shadow-[#2D6E3E]/20" style={{ background: "linear-gradient(135deg, #2D6E3E 0%, #1F5A30 100%)" }}>
                    <div className="absolute -bottom-12 -right-12 opacity-10">
                        <RotateCcw size={200} />
                    </div>
                    <div className="relative">
                        <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-full mb-5 border border-white/20">
                            <FileText size={14} />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">{c.badge}</span>
                        </div>
                        <h1 className="text-2xl md:text-4xl font-bold tracking-tight mb-3 leading-tight">{c.title}</h1>
                        <p className="text-sm md:text-base text-white/85 leading-relaxed font-normal max-w-2xl">{c.intro}</p>
                    </div>
                </div>

                {/* Sections */}
                <div className="space-y-4">
                    {c.sections.map((s: any, i: number) => {
                        const Icon = ICONS[s.icon] || RotateCcw;
                        return (
                            <section key={i} className="bg-white/90 backdrop-blur-md rounded-[28px] p-6 md:p-8 border border-[rgba(15,20,16,0.06)] shadow-xs">
                                <div className="flex items-start gap-4 mb-4">
                                    <div className="shrink-0 w-12 h-12 bg-[#EAF3EC] text-[#2D6E3E] rounded-2xl flex items-center justify-center shadow-xs">
                                        <Icon size={22} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2D6E3E] bg-[#EAF3EC] px-2.5 py-0.5 rounded-full">{s.tag}</span>
                                            <span className="text-xs font-semibold text-[#9AA29C]">0{i + 1}</span>
                                        </div>
                                        <h2 className="text-base md:text-lg font-bold tracking-tight leading-tight text-[#111612]">{s.title}</h2>
                                    </div>
                                </div>

                                <p className="text-sm text-[#737D75] leading-relaxed font-normal mb-4">{s.body}</p>

                                {s.listTitle && (
                                    <p className="text-xs font-semibold text-[#111612] uppercase tracking-wider mb-2.5">{s.listTitle}</p>
                                )}
                                <ul className="space-y-2 mb-4">
                                    {s.list.map((item: string, j: number) => (
                                        <li key={j} className="flex items-start gap-2.5">
                                            <CheckCircle2 className="text-[#2D6E3E] shrink-0 mt-0.5" size={16} />
                                            <span className="text-sm text-[#111612] leading-relaxed">{item}</span>
                                        </li>
                                    ))}
                                </ul>

                                {s.note && (
                                    <div className="flex items-start gap-2.5 bg-amber-50/80 border border-amber-200/60 rounded-2xl p-3.5 mb-4">
                                        <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={17} />
                                        <p className="text-xs text-amber-900 leading-relaxed font-medium">{s.note}</p>
                                    </div>
                                )}

                                {s.delivery && (
                                    <div className={`flex items-center gap-3 rounded-2xl p-3.5 ${s.deliveryBy === "seller" ? "bg-[#EAF3EC]" : "bg-[#F5F7F5]"}`}>
                                        <Truck className={s.deliveryBy === "seller" ? "text-[#2D6E3E] shrink-0" : "text-[#737D75] shrink-0"} size={17} />
                                        <p className={`text-xs leading-relaxed font-semibold ${s.deliveryBy === "seller" ? "text-[#2D6E3E]" : "text-[#737D75]"}`}>{s.delivery}</p>
                                    </div>
                                )}
                            </section>
                        );
                    })}
                </div>

                {/* Contacts */}
                <section className="bg-gradient-to-br from-[#111612] to-[#1E2620] text-white rounded-[32px] p-6 md:p-8 mt-6 shadow-xl border border-white/10">
                    <div className="flex items-center gap-2 mb-2">
                        <Phone size={17} className="text-[#4CAF71]" />
                        <h2 className="text-lg font-bold tracking-tight text-white">{c.contactTitle}</h2>
                    </div>
                    <p className="text-xs text-gray-400 font-medium mb-7 max-w-lg">{c.contactSubtitle}</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <a href={supportTelegramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-2xl p-5 transition-colors group">
                            <div className="w-11 h-11 bg-[#229ED9] rounded-2xl flex items-center justify-center shrink-0">
                                <Send size={20} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{c.telegramLabel}</p>
                                <p className="text-sm font-black truncate group-hover:text-[#4CAF71] transition-colors">{supportTelegram}</p>
                            </div>
                        </a>

                        <a href={supportPhoneLink} className="flex items-center gap-4 bg-white/5 hover:bg-white/10 rounded-2xl p-5 transition-colors group">
                            <div className="w-11 h-11 bg-[#2D6E3E] rounded-2xl flex items-center justify-center shrink-0">
                                <Phone size={20} className="text-white" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{c.phoneLabel}</p>
                                <p className="text-sm font-black truncate group-hover:text-[#4CAF71] transition-colors">{supportPhone}</p>
                            </div>
                        </a>
                    </div>

                    <div className="flex items-start gap-4 bg-white/5 rounded-2xl p-5 mt-3">
                        <div className="w-11 h-11 bg-white/10 rounded-2xl flex items-center justify-center shrink-0">
                            <MapPin size={20} className="text-[#4CAF71]" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-[9px] font-black uppercase tracking-widest text-gray-500">{c.addressLabel}</p>
                            <p className="text-sm font-bold leading-snug">{returnAddress}</p>
                        </div>
                    </div>

                    {workingHours && (
                        <div className="flex items-center gap-3 bg-white/5 rounded-2xl p-4 mt-3">
                            <Clock size={18} className="text-[#4CAF71] shrink-0" />
                            <p className="text-xs text-gray-300 font-medium leading-relaxed">
                                <span className="font-bold text-white">{lang === "ru" ? "Режим работы:" : "Ish vaqti:"}</span> {workingHours}
                            </p>
                        </div>
                    )}
                </section>

                {/* Legal footer */}
                <div className="flex items-center justify-center gap-2 text-gray-300 text-[10px] font-black uppercase tracking-[0.2em] mt-8">
                    <ShieldCheck size={14} />
                    <span>{lang === "ru" ? "Защита прав потребителей РУз" : "O'zbekiston iste'molchi huquqlari himoyasi"}</span>
                </div>
            </div>
        </div>
    );
}
