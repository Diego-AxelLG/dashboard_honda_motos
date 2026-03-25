/**
 * Axios HTTP client — base layer for consuming the FastAPI backend.
 *
 * Base URL controlled by NEXT_PUBLIC_API_URL env var.
 * In dev mode, next.config.js proxies /api/* to the backend.
 */

import axios from "axios";

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL ?? "",
    timeout: 15_000,
    headers: {
        "Content-Type": "application/json",
    },
});

// ---------------------------------------------------------------------------
// Silent retry interceptor — network errors & 5xx
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

api.interceptors.response.use(
    response => response,
    async error => {
        const config = error.config;

        // Only retry on network errors or 5xx, never on 4xx
        const shouldRetry = !error.response || error.response.status >= 500;
        if (!shouldRetry) return Promise.reject(error);

        config._retryCount = config._retryCount || 0;
        if (config._retryCount >= MAX_RETRIES) return Promise.reject(error);

        config._retryCount += 1;
        await sleep(RETRY_DELAY_MS);
        return api(config);
    }
);

// ---------------------------------------------------------------------------
// Export instance — add project-specific service functions below
// ---------------------------------------------------------------------------

export default api;

// Example:
// export async function getKPIs(params: { anio_mes: string; mui?: number }) {
//     const { data } = await api.get("/api/v1/kpis/monthly", { params });
//     return data;
// }
