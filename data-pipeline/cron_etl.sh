#!/usr/bin/env bash
# =============================================================================
# cron_etl.sh — Script maestro para ejecucion programada de ETLs
#
# Uso:
#   ./data-pipeline/cron_etl.sh <modo>
#
# Ejemplo con dos modos (agregar/renombrar segun el proyecto):
#   ./data-pipeline/cron_etl.sh main       ETL principal + refresh vistas
#   ./data-pipeline/cron_etl.sh secondary  ETL secundario + refresh vistas
#
# Crontab ejemplo (staggered para no sobrecargar fuentes):
#   0  * * * *  /ruta/proyecto/data-pipeline/cron_etl.sh main
#   30 * * * *  /ruta/proyecto/data-pipeline/cron_etl.sh secondary
#
# Requiere: flock, .venv/bin/python3 en la raiz del proyecto
# =============================================================================
set -euo pipefail

# --- Rutas -------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PYTHON="$PROJECT_ROOT/.venv/bin/python3"
LOG_DIR="$SCRIPT_DIR/logs"
LOCK_DIR="/tmp"

# --- Validaciones iniciales --------------------------------------------------
if [[ $# -lt 1 ]]; then
    echo "Uso: $0 <modo>"
    echo "Modos disponibles: main, secondary"
    exit 1
fi

MODE="$1"

if [[ ! -x "$PYTHON" ]]; then
    echo "Error: No se encontro Python en $PYTHON"
    exit 1
fi

# --- Crear directorio de logs si no existe -----------------------------------
mkdir -p "$LOG_DIR"

# --- Cargar variables de entorno ---------------------------------------------
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
    set +a
fi

# --- Logging -----------------------------------------------------------------
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
LOG_FILE="$LOG_DIR/etl_${MODE}_$(date '+%Y%m%d_%H%M%S').log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# --- Ejecucion con flock (previene concurrencia) -----------------------------
LOCK_FILE="$LOCK_DIR/etl_${MODE}.lock"
exec 200>"$LOCK_FILE"

if ! flock -n 200; then
    log "SKIP: Otra instancia de '$MODE' ya esta corriendo (lock: $LOCK_FILE)"
    exit 0
fi

# --- Funciones de ETL --------------------------------------------------------
# TEMPLATE: Adaptar estos pasos al pipeline del proyecto.
# Cada paso ejecuta un script Python y registra exito/fallo en el log.

run_main() {
    local start_time=$SECONDS

    log "=== INICIO ETL main ==="

    log "Paso 1/2: etl_principal.py"
    if ! "$PYTHON" "$PROJECT_ROOT/data-pipeline/etl/scripts/etl_principal.py" >> "$LOG_FILE" 2>&1; then
        log "ERROR: etl_principal.py fallo (exit code: $?)"
        log "Intentando refresh de vistas de todas formas..."
        run_refresh
        return 1
    fi
    log "OK: etl_principal.py completado"

    log "Paso 2/2: refresh_vistas.py"
    run_refresh

    local duration=$(( SECONDS - start_time ))
    log "=== FIN ETL main — Duracion: ${duration}s ==="
}

run_secondary() {
    local start_time=$SECONDS

    log "=== INICIO ETL secondary ==="

    log "Paso 1/2: etl_secundario.py"
    if ! "$PYTHON" "$PROJECT_ROOT/data-pipeline/etl/scripts/etl_secundario.py" >> "$LOG_FILE" 2>&1; then
        log "ERROR: etl_secundario.py fallo (exit code: $?)"
        run_refresh
        return 1
    fi
    log "OK: etl_secundario.py completado"

    log "Paso 2/2: refresh_vistas.py"
    run_refresh

    local duration=$(( SECONDS - start_time ))
    log "=== FIN ETL secondary — Duracion: ${duration}s ==="
}

run_refresh() {
    if ! "$PYTHON" "$PROJECT_ROOT/data-pipeline/refresh_vistas.py" >> "$LOG_FILE" 2>&1; then
        log "WARN: refresh_vistas.py fallo (exit code: $?)"
    else
        log "OK: refresh_vistas.py completado"
    fi
}

# --- Limpieza de logs antiguos (>30 dias) ------------------------------------
cleanup_old_logs() {
    find "$LOG_DIR" -name "etl_${MODE}_*.log" -mtime +30 -delete 2>/dev/null || true
}

# --- Main --------------------------------------------------------------------
log "Inicio proceso cron_etl.sh modo=$MODE pid=$$"

cd "$PROJECT_ROOT"
export PYTHONPATH="$PROJECT_ROOT"

case "$MODE" in
    main)
        run_main
        ;;
    secondary)
        run_secondary
        ;;
    *)
        log "ERROR: Modo '$MODE' no reconocido."
        exit 1
        ;;
esac

EXIT_CODE=$?
cleanup_old_logs
log "Exit code: $EXIT_CODE"
exit $EXIT_CODE
