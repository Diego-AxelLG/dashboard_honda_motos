import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import LayoutShell from "@/components/layout/LayoutShell";
import { CLIENT_NAME } from "@/lib/constants";

export const metadata: Metadata = {
    title: `${CLIENT_NAME} — Dashboard`,
    description: "Dashboard corporativo de KPIs",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body className="min-h-screen bg-[var(--bg-main)] text-[var(--text-primary)] antialiased">
                <ThemeProvider attribute="class" defaultTheme="light">
                    <LayoutShell>{children}</LayoutShell>
                </ThemeProvider>
            </body>
        </html>
    );
}
