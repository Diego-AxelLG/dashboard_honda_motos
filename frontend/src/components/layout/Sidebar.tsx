"use client";

import { usePathname } from "next/navigation";
import { CLIENT_NAME, CLIENT_TAGLINE } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Navigation items — edit this array to customize the sidebar
// ---------------------------------------------------------------------------

const NAV_ITEMS = [
    {
        href: "/",
        label: "Dashboard",
        icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
    },
    {
        href: "/ventas",
        label: "Ventas",
        icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    },
    {
        href: "/inventario",
        label: "Inventario",
        icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
    {
        href: "/reportes",
        label: "Reportes",
        icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SidebarProps {
    open: boolean;
    onClose: () => void;
}

export default function Sidebar({ open, onClose }: SidebarProps) {
    const pathname = usePathname();

    return (
        <aside
            className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] p-6 transition-transform duration-300 ease-in-out md:translate-x-0 ${
                open ? "translate-x-0" : "-translate-x-full"
            }`}
        >
            {/* Branding */}
            <div className="mb-10">
                <h1 className="text-xl font-bold tracking-tight text-[var(--text-primary)]">
                    {CLIENT_NAME}
                </h1>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                    {CLIENT_TAGLINE}
                </p>
            </div>

            {/* Navigation */}
            <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                    const active =
                        item.href === "/"
                            ? pathname === "/"
                            : pathname.startsWith(item.href);

                    return (
                        <a
                            key={item.href}
                            href={item.href}
                            onClick={onClose}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-card ${
                                active
                                    ? "bg-[var(--brand-secondary)]/20 font-medium text-[var(--brand-accent)]"
                                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                            }`}
                        >
                            <svg
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d={item.icon}
                                />
                            </svg>
                            {item.label}
                        </a>
                    );
                })}
            </nav>
        </aside>
    );
}
