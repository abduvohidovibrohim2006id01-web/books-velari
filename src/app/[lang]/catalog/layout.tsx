import { Metadata } from 'next';

export const metadata: Metadata = {
    // Satr emas, shablon: aks holda catalog/[slug] sarlavhalariga "| Velari" qo'shilmaydi
    title: { default: 'Katalog | Velari', template: '%s | Velari' },
    description: 'Barcha mahsulotlar turkumi: smartfonlar, gadjetlar va aksessuarlar. Velari do\'konida eng yaxshi tanlov va hamyonbop narxlar.',
    keywords: ['katalog', 'smartfonlar', 'gadjetlar', 'aksessuarlar', 'Velari katalog', 'Toshkent elektronika'],
    openGraph: {
        title: 'Katalog | Velari',
        description: 'Barcha mahsulotlar turkumi: smartfonlar, gadjetlar va aksessuarlar.',
    }
};

export default function CatalogLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
