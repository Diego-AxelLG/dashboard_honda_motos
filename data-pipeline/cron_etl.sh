#!/usr/bin/env bash
# =============================================================================
# cron_etl.sh — Orquestador cron para Honda Motos ETLs
#
# Uso:
#   ./data-pipeline/cron_etl.sh main       Ventas + Inventario + Refresh MVs
#   ./data-pipeline/cron_etl.sh secondary  Postventa + Financiero + OS + Refacc + UIO
#
# Crontab:
#   0  * * * *  /ruta/proyecto/data-pipeline/cron_etl.sh main
#   30 * * * *  /ruta/proyecto/data-pipeline/cron_etl.sh secondary
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON="$PROJECT_ROOT/venv/bin/python3"
LOG_DIR="$SCRIPT_DIR/logs"
LOCK_DIR="/tmp"

if [[ $# -lt 1 ]]; then
    echo "Uso: $0 <main|secondary>"
    exit 1
fi

MODE="$1"

if [[ ! -x "$PYTHON" ]]; then
    echo "Error: No se encontro Python en $PYTHON"
    exit 1
fi

mkdir -p "$LOG_DIR"

# .env se carga via python-dotenv dentro de cada script ETL (no source,
# porque los passwords pueden tener caracteres especiales como *))

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="$LOG_DIR/etl_${MODE}_$(date '+%Y%m%d_%H%M%S').log"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"; }

LOCK_FILE="$LOCK_DIR/etl_${MODE}.lock"
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
    log "SKIP: Otra instancia de '$MODE' ya corriendo"
    exit 0
fi

run_etl() {
    local label="$1" script="$2"
    log "  -> $label"
    if ! PYTHONPATH="$PROJECT_ROOT/data-pipeline" "$PYTHON" "$PROJECT_ROOT/$script" >> "$LOG_FILE" 2>&1; then
        log "  ERROR: $label fallo (exit $?)"
        return 1
    fi
    log "  OK: $label"
}

run_refresh() {
    PYTHONPATH="$PROJECT_ROOT/data-pipeline" "$PYTHON" "$PROJECT_ROOT/data-pipeline/refresh_vistas.py" >> "$LOG_FILE" 2>&1 || log "WARN: refresh_vistas fallo"
}

run_main() {
    log "=== INICIO main ==="
    run_etl "Ventas"       "data-pipeline/etl/scripts/etl_ventas.py"
    run_etl "Plan Ventas"  "data-pipeline/etl/scripts/etl_plan_ventas.py"
    run_etl "Flujos Piso"  "data-pipeline/etl/scripts/etl_flujos_piso.py"
    run_etl "Inventario"   "data-pipeline/etl/scripts/etl_inventario.py"
    run_refresh
    log "=== FIN main ==="
}

run_secondary() {
    log "=== INICIO secondary ==="
    run_etl "Postventa+Financiero" "data-pipeline/etl/scripts/etl_postventa_financiero.py"
    run_etl "OS Abierta"           "data-pipeline/etl/scripts/etl_os_abierta.py"
    run_etl "Inv Refacciones"      "data-pipeline/etl/scripts/etl_inv_refacciones.py"
    run_etl "UIO"                  "data-pipeline/etl/scripts/etl_uio.py"
    run_refresh
    log "=== FIN secondary ==="
}

log "Inicio cron_etl.sh modo=$MODE pid=$$"
cd "$PROJECT_ROOT"

case "$MODE" in
    main)      run_main ;;
    secondary) run_secondary ;;
    *)         log "ERROR: Modo '$MODE' no reconocido"; exit 1 ;;
esac

EXIT_CODE=$?
find "$LOG_DIR" -name "etl_${MODE}_*.log" -mtime +30 -delete 2>/dev/null || true
log "Exit code: $EXIT_CODE"
exit $EXIT_CODE
