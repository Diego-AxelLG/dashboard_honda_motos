"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "@/components/layout/Sidebar";
import Header from "@/components/layout/Header";
import ThemeToggle from "@/components/layout/ThemeToggle";

export default function LayoutShell({ children }: { children: React.ReactNode }) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();

    // Login page renders without the dashboard shell
    if (pathname === "/login") {
        return <>{children}</>;
    }

    return (
        <div className="flex min-h-screen">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/60 md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
            <Header onMenuOpen={() => setSidebarOpen(true)} />

            {/* Main content */}
            <main className="ml-0 flex-1 p-4 pt-16 md:ml-64 md:p-8 md:pt-8">
                <div className="mb-4 flex items-center justify-end">
                    <div className="hidden md:block">
                        <ThemeToggle />
                    </div>
                </div>
                {children}
            </main>
        </div>
    );
}
