/** @type {import('next').NextConfig} */
const nextConfig = {
    // Static export para Cloudflare Pages → genera frontend/out/
    // En prod, el frontend llama directo a NEXT_PUBLIC_API_URL (definido en CF env vars).
    output: "export",
    images: { unoptimized: true },

    // Solo aplica a `next dev`: proxy local al backend en :8001.
    // En `next build` (NODE_ENV=production) rewrites se ignora por el static export.
    async rewrites() {
        if (process.env.NODE_ENV === "production") return [];
        return [
            {
                source: "/api/:path*",
                destination: "http://127.0.0.1:8001/api/:path*",
            },
        ];
    },
};

module.exports = nextConfig;
