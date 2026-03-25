/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        if (process.env.NODE_ENV === "production") return [];
        return [
            {
                source: "/api/:path*",
                destination: "http://127.0.0.1:8000/api/:path*",
            },
        ];
    },
};

module.exports = nextConfig;
