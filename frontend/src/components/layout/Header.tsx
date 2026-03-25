"use client";

import { CLIENT_NAME } from "@/lib/constants";
import ThemeToggle from "@/components/layout/ThemeToggle";

interface HeaderProps {
    onMenuOpen: () => void;
}

export default function Header({ onMenuOpen }: HeaderProps) {
    return (
        <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-[var(--border-color)] bg-[var(--bg-sidebar)] px-4 md:hidden">
            <button
                onClick={onMenuOpen}
                className="rounded-md p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)] hover:text-[var(--text-primary)]"
                aria-label="Abrir menu"
            >
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-6 w-6"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                    />
                </svg>
            </button>
            <span className="text-sm font-semibold text-[var(--text-primary)]">
                {CLIENT_NAME}
            </span>
            <div className="ml-auto">
                <ThemeToggle />
            </div>
        </header>
    );
}
