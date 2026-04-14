/**
 * Axios HTTP client + typed service functions for Honda Motos API.
 */

import axios from "axios";

const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL ?? "",
    timeout: 15_000,
    headers: { "Content-Type": "application/json" },
});

// Silent retry on 5xx / network errors
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 3_000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

api.interceptors.response.use(
    response => response,
    async error => {
        const config = error.config;
        const shouldRetry = !error.response || error.response.status >= 500;
        if (!shouldRetry) return Promise.reject(error);
        config._retryCount = config._retryCount || 0;
        if (config._retryCount >= MAX_RETRIES) return Promise.reject(error);
        config._retryCount += 1;
        await sleep(RETRY_DELAY_MS);
        return api(config);
    }
);

export default api;

// ---------------------------------------------------------------------------
// Typed API functions
// ---------------------------------------------------------------------------

type Params = { anio_mes?: string; mui?: number };

// Ventas
export const getVentasResumen = (p?: Params) =>
    api.get("/api/v1/ventas/resumen", { params: p }).then(r => r.data);
export const getVentasTendencia = (p?: Params) =>
    api.get("/api/v1/ventas/tendencia", { params: p }).then(r => r.data);
export const getVentasPorModelo = (p?: Params) =>
    api.get("/api/v1/ventas/por-modelo", { params: p }).then(r => r.data);
export const getVentasFlujos = (p?: Params) =>
    api.get("/api/v1/ventas/flujos", { params: p }).then(r => r.data);
export const getVentasDetalle = (p?: Params) =>
    api.get("/api/v1/ventas/detalle", { params: p }).then(r => r.data);
export const getVentasCumplimientoPacing = (p?: Params) =>
    api.get("/api/v1/ventas/cumplimiento-pacing", { params: p }).then(r => r.data);

// Postventa
export const getPostventaSummary = (p?: Params) =>
    api.get("/api/v1/postventa/summary", { params: p }).then(r => r.data);
export const getPostventaTrend = (p?: Params) =>
    api.get("/api/v1/postventa/trend", { params: p }).then(r => r.data);
export const getPostventaOtsTendencia = (p?: Params) =>
    api.get("/api/v1/postventa/ots-tendencia", { params: p }).then(r => r.data);
export const getOsAbiertas = (p?: { mui?: number }) =>
    api.get("/api/v1/postventa/os-abiertas", { params: p }).then(r => r.data);
export const getOsAbiertasDetalle = (p?: { mui?: number }) =>
    api.get("/api/v1/postventa/os-abiertas/detalle", { params: p }).then(r => r.data);
export const getRefacciones = (p?: { mui?: number }) =>
    api.get("/api/v1/postventa/refacciones", { params: p }).then(r => r.data);
export const getUio = (p?: { mui?: number }) =>
    api.get("/api/v1/postventa/uio", { params: p }).then(r => r.data);

// Financiero
export const getFinancials = (p?: Params) =>
    api.get("/api/v1/financiero/financials", { params: p }).then(r => r.data);

// Inventario
export const getInventarioAging = (p?: { mui?: number }) =>
    api.get("/api/v1/inventario/aging", { params: p }).then(r => r.data);
export const getInventarioResumenStock = (p?: { mui?: number }) =>
    api.get("/api/v1/inventario/resumen-stock", { params: p }).then(r => r.data);
export const getInventarioDetalle = (p?: { mui?: number }) =>
    api.get("/api/v1/inventario/detalle", { params: p }).then(r => r.data);
export const getInventarioApartados = (p?: { mui?: number }) =>
    api.get("/api/v1/inventario/apartados", { params: p }).then(r => r.data);

// Cinco Alas
export const getCincoAlasCatalogo = () =>
    api.get("/api/v1/cinco-alas/catalogo").then(r => r.data);
export const getCincoAlasEvaluaciones = () =>
    api.get("/api/v1/cinco-alas/evaluaciones").then(r => r.data);
export const getCincoAlasEvaluacion = (anio: number, trimestre: number) =>
    api.get("/api/v1/cinco-alas/evaluacion", { params: { anio, trimestre } }).then(r => r.data);
export const postCincoAlasEvaluacion = (payload: unknown) =>
    api.post("/api/v1/cinco-alas/evaluacion", payload).then(r => r.data);
export const getCincoAlasPrecalculo = (anio: number, trimestre: number) =>
    api.get("/api/v1/cinco-alas/precalculo", { params: { anio, trimestre } }).then(r => r.data);
export const getCincoAlasResumenActual = () =>
    api.get("/api/v1/cinco-alas/resumen-actual").then(r => r.data);
