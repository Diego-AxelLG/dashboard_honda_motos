import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: "class",
    content: [
        "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
        "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
        "./node_modules/@tremor/react/dist/**/*.{js,mjs}",
    ],
    safelist: [
        // Tremor constructs color classes dynamically at runtime
        {
            pattern:
                /^(bg|text|fill|stroke|border|ring|decoration)-(blue|cyan|indigo|violet|fuchsia|rose|amber|emerald|teal|lime|orange|sky|slate|gray|zinc|neutral|stone|red|yellow|green|purple|pink)-(50|100|200|300|400|500|600|700|800|900|950)$/,
            variants: ["dark"],
        },
    ],
    theme: {
        extend: {
            // ----------------------------------------------------------
            // Semantic color tokens — mapped from CSS variables in
            // globals.css.  Usage examples:
            //
            //   bg-surface-main    bg-surface-card    bg-surface-sidebar
            //   text-content       text-content-secondary
            //   border-border      bg-brand           text-brand-accent
            //   text-success       bg-danger           border-warning
            // ----------------------------------------------------------
            colors: {
                // Brand
                brand: {
                    DEFAULT: "var(--brand-primary)",
                    secondary: "var(--brand-secondary)",
                    accent: "var(--brand-accent)",
                },

                // Surfaces / backgrounds
                surface: {
                    main: "var(--bg-main)",
                    card: "var(--bg-card)",
                    "card-hover": "var(--bg-card-hover)",
                    sidebar: "var(--bg-sidebar)",
                    skeleton: "var(--bg-skeleton)",
                },

                // Text
                content: {
                    DEFAULT: "var(--text-primary)",
                    secondary: "var(--text-secondary)",
                    muted: "var(--text-muted)",
                },

                // Borders
                border: "var(--border-color)",

                // Status
                success: "var(--success)",
                warning: "var(--warning)",
                danger: "var(--danger)",

                // Tremor v3 dark-theme tokens (axis labels, grid lines, backgrounds).
                // Required at build time — keep as literal hex values.
                tremor: {
                    brand: {
                        faint: "#0B1229",
                        muted: "#172554",
                        subtle: "#1e40af",
                        DEFAULT: "#3b82f6",
                        emphasis: "#60a5fa",
                        inverted: "#030712",
                    },
                    background: {
                        muted: "#131A2B",
                        subtle: "#1f2937",
                        DEFAULT: "#111827",
                        emphasis: "#d1d5db",
                    },
                    border: { DEFAULT: "#1f2937" },
                    ring: { DEFAULT: "#1f2937" },
                    content: {
                        subtle: "#4b5563",
                        DEFAULT: "#6b7280",
                        emphasis: "#e5e7eb",
                        strong: "#f9fafb",
                        inverted: "#000000",
                    },
                },
                "dark-tremor": {
                    brand: {
                        faint: "#0B1229",
                        muted: "#172554",
                        subtle: "#1e40af",
                        DEFAULT: "#3b82f6",
                        emphasis: "#60a5fa",
                        inverted: "#030712",
                    },
                    background: {
                        muted: "#131A2B",
                        subtle: "#1f2937",
                        DEFAULT: "#111827",
                        emphasis: "#d1d5db",
                    },
                    border: { DEFAULT: "#1f2937" },
                    ring: { DEFAULT: "#1f2937" },
                    content: {
                        subtle: "#4b5563",
                        DEFAULT: "#868e96",
                        emphasis: "#e5e7eb",
                        strong: "#f9fafb",
                        inverted: "#000000",
                    },
                },
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
            },
        },
    },
    plugins: [],
};

export default config;
