import Link from "next/link";

export const metadata = {
    title: { absolute: "404 - Sahifa topilmadi | Velari" },
    robots: {
        index: false,
        follow: false,
    },
};

export default function RootNotFound() {
    return (
        <html lang="uz">
            <body style={{ margin: 0, padding: 0, backgroundColor: "#fff" }}>
                <div style={{
                    minHeight: "100vh",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "system-ui, sans-serif",
                    textAlign: "center",
                    padding: "20px"
                }}>
                    <h1 style={{ fontSize: "72px", fontWeight: "900", margin: "0 0 16px", color: "#0F1410" }}>404</h1>
                    <h2 style={{ fontSize: "24px", fontWeight: "700", margin: "0 0 12px", color: "#2D6E3E" }}>Sahifa topilmadi</h2>
                    <p style={{ color: "#666", maxWidth: "400px", margin: "0 0 24px" }}>
                        Kechirasiz, siz qidirayotgan sahifa mavjud emas yoki o&apos;chirilgan.
                    </p>
                    <Link 
                        href="/uz"
                        style={{
                            backgroundColor: "#2D6E3E",
                            color: "#fff",
                            padding: "12px 28px",
                            borderRadius: "14px",
                            textDecoration: "none",
                            fontWeight: "bold",
                            fontSize: "14px"
                        }}
                    >
                        Bosh sahifaga qaytish
                    </Link>
                </div>
            </body>
        </html>
    );
}
