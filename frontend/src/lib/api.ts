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
export const getVentasPorAsesorModelo = (p?: Params) =>
    api.get("/api/v1/ventas/por-asesor-modelo", { params: p }).then(r => r.data);

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

// Postventa plan (CSV mensual)
export const getPostventaPlan = (p?: Params) =>
    api.get("/api/v1/postventa/plan", { params: p }).then(r => r.data);
export const getPostventaOperacionPacing = (p?: Params) =>
    api.get("/api/v1/postventa/operacion-pacing", { params: p }).then(r => r.data);

// Health / ETL freshness
export const getEtlLastRun = () =>
    api.get("/api/v1/health/etl").then(r => r.data);

// ---------------------------------------------------------------------------
// Cobranza (CxC + OS abiertas + compromisos)
// ---------------------------------------------------------------------------
export interface CompromisoActivo {
    id: number;
    comentario: string;
    fecha_compromiso: string;          // YYYY-MM-DD
    fecha_registro: string;            // ISO datetime
    estado: "activo" | "vencido" | "cumplido";
    dias_restantes: number | null;
}

export interface CompromisoHistorial extends CompromisoActivo {
    registrado_por: string | null;     // 'dashboard' | 'CRM'
}

export interface CXCSummaryRow {
    mui: number;
    sucursal: string;
    categoria: string;
    cantidad_cxc: number;
    saldo_total: number;
}

export interface CXCDetalleRow {
    mui: number;
    sucursal: string;
    movimiento: string;
    cliente: string | null;
    categoria: string | null;
    fecha_emision: string | null;
    dias_vencido: number | null;
    saldo_vencido: number | null;
    observaciones: string | null;
    compromiso_activo: CompromisoActivo | null;
    compromisos_vencidos: number;
}

export interface OSAbiertaSummaryRow {
    mui: number;
    sucursal: string;
    tipo_orden: string;
    cantidad_os: number;
}

export interface OSAbiertaDetalleRow {
    mui: number;
    sucursal: string;
    numero_ot: string;
    vin: string | null;
    tipo_orden: string;
    nombre_asesor: string | null;
    nombre_cliente: string | null;
    fecha_apertura: string | null;
    dias_abierta: number | null;
    monto_venta: number;
    situacion: string | null;
    taller: string | null;
    compromiso_activo: CompromisoActivo | null;
    compromisos_vencidos: number;
}

export const getCobranzaCxcSummary = (mui?: number) =>
    api.get<CXCSummaryRow[]>("/api/v1/cobranza/cxc", { params: { mui } }).then(r => r.data);

export const getCobranzaCxcDetalle = (mui: number) =>
    api.get<CXCDetalleRow[]>("/api/v1/cobranza/cxc/detalle", { params: { mui } }).then(r => r.data);

export const getCobranzaCxcHistorial = (movimiento: string, mui: number) =>
    api.get<CompromisoHistorial[]>("/api/v1/cobranza/cxc/compromisos", { params: { movimiento, mui } }).then(r => r.data);

export const createCobranzaCxcCompromiso = (
    movimiento: string, mui: number, comentario: string, dias_compromiso: 15 | 30 | 45 | 60
) =>
    api.post<CompromisoActivo>(
        "/api/v1/cobranza/cxc/compromisos",
        { comentario, dias_compromiso },
        { params: { movimiento, mui } }
    ).then(r => r.data);

export const updateCobranzaCxcCompromiso = (compromisoId: number, comentario: string) =>
    api.patch<CompromisoActivo>(`/api/v1/cobranza/cxc/compromisos/${compromisoId}`, { comentario }).then(r => r.data);

export const getCobranzaOsSummary = (mui?: number) =>
    api.get<OSAbiertaSummaryRow[]>("/api/v1/cobranza/os-abiertas", { params: { mui } }).then(r => r.data);

export const getCobranzaOsDetalle = (mui: number) =>
    api.get<OSAbiertaDetalleRow[]>("/api/v1/cobranza/os-abiertas/detalle", { params: { mui } }).then(r => r.data);

export const getCobranzaOsHistorial = (numero_ot: string, mui: number) =>
    api.get<CompromisoHistorial[]>("/api/v1/cobranza/os-abiertas/compromisos", { params: { numero_ot, mui } }).then(r => r.data);

export const createCobranzaOsCompromiso = (
    numero_ot: string, mui: number, comentario: string, dias_compromiso: 15 | 30 | 45 | 60
) =>
    api.post<CompromisoActivo>(
        "/api/v1/cobranza/os-abiertas/compromisos",
        { comentario, dias_compromiso },
        { params: { numero_ot, mui } }
    ).then(r => r.data);

export const updateCobranzaOsCompromiso = (compromisoId: number, comentario: string) =>
    api.patch<CompromisoActivo>(`/api/v1/cobranza/os-abiertas/compromisos/${compromisoId}`, { comentario }).then(r => r.data);
