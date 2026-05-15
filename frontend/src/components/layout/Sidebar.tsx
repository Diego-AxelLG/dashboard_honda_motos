"use client";

import { usePathname } from "next/navigation";
import { CLIENT_NAME, CLIENT_TAGLINE } from "@/lib/constants";

const NAV_ITEMS = [
    {
        href: "/",
        label: "Resumen",
        icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
    },
    {
        href: "/ventas",
        label: "Ventas",
        icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
    },
    {
        href: "/postventa",
        label: "Postventa",
        icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    },
    {
        href: "/inventario",
        label: "Inventario",
        icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    },
    {
        href: "/cinco-alas",
        label: "5 Alas",
        icon: "M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.724 5.305a1 1 0 00.95.69h5.58c.969 0 1.371 1.24.588 1.81l-4.515 3.28a1 1 0 00-.364 1.118l1.724 5.305c.3.922-.755 1.688-1.54 1.118l-4.515-3.28a1 1 0 00-1.176 0l-4.515 3.28c-.784.57-1.838-.196-1.539-1.118l1.724-5.305a1 1 0 00-.364-1.118L2.098 10.73c-.783-.57-.38-1.81.588-1.81h5.58a1 1 0 00.95-.69l1.724-5.305z",
    },
    {
        href: "/cobranza",
        label: "Cobranza",
        icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
    },
];

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
