"""
============================================================================
Módulo de Utilidades para el ETL
============================================================================
Centraliza la conexión a base de datos, logging y funciones auxiliares.

Conexiones soportadas:
  - postgres  → PG_USER, PG_PASSWORD, PG_HOST, PG_PORT, PG_DATABASE
  - mysql     → MYSQL_USER, MYSQL_PASSWORD, MYSQL_HOST, MYSQL_DATABASE
  - metrics   → METRICS_USER, METRICS_PASSWORD, METRICS_HOST, METRICS_DATABASE

Todas las variables se leen del .env en la raíz del proyecto.
============================================================================
"""
import os
import re
import logging
import threading
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError
from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Logger
# ---------------------------------------------------------------------------

def setup_logger(name='etl_logger', log_file='logs/etl.log', level=logging.INFO):
    """Configura y devuelve un logger con salida a archivo y consola."""
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    logger = logging.getLogger(name)
    logger.setLevel(level)

    if not logger.handlers:
        # Archivo
        fh = logging.FileHandler(log_file)
        fh.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
        logger.addHandler(fh)

        # Consola
        ch = logging.StreamHandler()
        ch.setFormatter(logging.Formatter('%(levelname)s - %(message)s'))
        logger.addHandler(ch)

    return logger

# ---------------------------------------------------------------------------
# Database Connector (Singleton per db_type)
# ---------------------------------------------------------------------------

class DatabaseConnector:
    """
    Singleton que gestiona engines de SQLAlchemy.
    Un engine por db_type, creación lazy, thread-safe.
    """
    _instances = {}
    _lock = threading.Lock()

    def __new__(cls, db_type):
        with cls._lock:
            if db_type not in cls._instances:
                cls._instances[db_type] = super(DatabaseConnector, cls).__new__(cls)
                cls._instances[db_type]._engine = None
                cls._instances[db_type]._db_type = db_type
        return cls._instances[db_type]

    def get_engine(self):
        """Crea y devuelve el engine de SQLAlchemy (lazy)."""
        if self._engine is None:
            try:
                dsn = self._get_dsn()
                self._engine = create_engine(dsn)
                with self._engine.connect() as conn:
                    pass  # Validar que la conexión funciona
            except SQLAlchemyError as e:
                logger = setup_logger()
                logger.error(f"Error al conectar con {self._db_type}: {e}")
                raise
        return self._engine

    def _get_dsn(self):
        """Construye el DSN a partir de variables de entorno."""
        if self._db_type == 'postgres':
            return (f"postgresql+psycopg2://{os.getenv('PG_USER')}:{os.getenv('PG_PASSWORD')}"
                    f"@{os.getenv('PG_HOST')}:{os.getenv('PG_PORT')}/{os.getenv('PG_DATABASE')}")
        elif self._db_type == 'mysql':
            return (f"mysql+mysqlconnector://{os.getenv('MYSQL_USER')}:{os.getenv('MYSQL_PASSWORD')}"
                    f"@{os.getenv('MYSQL_HOST')}/{os.getenv('MYSQL_DATABASE')}?charset=utf8mb4")
        elif self._db_type == 'metrics':
            return (f"mysql+mysqlconnector://{os.getenv('METRICS_USER')}:{os.getenv('METRICS_PASSWORD')}"
                    f"@{os.getenv('METRICS_HOST')}/{os.getenv('METRICS_DATABASE')}?charset=utf8mb4")
        elif self._db_type == 'hmcrm':
            return (f"mysql+mysqlconnector://{os.getenv('HMCRM_USER')}:{os.getenv('HMCRM_PASSWORD')}"
                    f"@{os.getenv('HMCRM_HOST')}/{os.getenv('HMCRM_DATABASE')}?charset=utf8mb4")
        elif self._db_type == 'sicofi':
            return (f"mysql+mysqlconnector://{os.getenv('SICOFI_USER')}:{os.getenv('SICOFI_PASSWORD')}"
                    f"@{os.getenv('SICOFI_HOST')}/{os.getenv('SICOFI_DATABASE')}?charset=utf8mb4")
        else:
            raise ValueError(f"Tipo de base de datos no soportado: '{self._db_type}'. "
                             "Usar 'postgres', 'mysql', 'metrics', 'hmcrm' o 'sicofi'.")

    def dispose(self):
        """Cierra todas las conexiones del pool."""
        if self._engine:
            self._engine.dispose()
            self._engine = None

# ---------------------------------------------------------------------------
# SQL helpers
# ---------------------------------------------------------------------------

def read_sql_file(filepath: str) -> str:
    """Lee el contenido de un archivo .sql y lo devuelve como string."""
    with open(filepath, 'r', encoding='utf-8') as f:
        return f.read()


def validate_param(key: str, value) -> str:
    """
    Valida y sanitiza un parámetro antes de inyectarlo en SQL.
    Previene SQL injection validando tipos y formatos esperados.

    Agregar nuevos parámetros conocidos según el proyecto:
      - Fechas: formato YYYY-MM-DD
      - Listas numéricas: solo dígitos separados por comas
      - Años: 4 dígitos
    """
    if key in ('fecha_inicio', 'fecha_hoy', 'fecha_corte'):
        if not re.match(r'^\d{4}-\d{2}-\d{2}$', str(value)):
            raise ValueError(f"Parámetro '{key}' no tiene formato YYYY-MM-DD: {value}")
        return str(value)

    elif key in ('agencias_permitidas', 'muis'):
        if not all(part.strip().isdigit() for part in str(value).split(',')):
            raise ValueError(f"Parámetro '{key}' contiene valores no numéricos: {value}")
        return str(value)

    elif key.startswith('ano_'):
        if not (str(value).isdigit() and len(str(value)) == 4):
            raise ValueError(f"Parámetro '{key}' no es un año válido: {value}")
        return str(value)

    else:
        # Parámetro desconocido: rechazar caracteres peligrosos
        dangerous = [';', '--', '/*', '*/', 'DROP', 'DELETE', 'INSERT', 'UPDATE', 'UNION']
        val_upper = str(value).upper()
        for d in dangerous:
            if d in val_upper:
                raise ValueError(f"Parámetro '{key}' contiene caracteres no permitidos: {d}")
        return str(value)


def inject_params(query: str, params: dict) -> str:
    """
    Reemplaza placeholders {{ key }} en la query con valores validados.

    Ejemplo:
        sql = "SELECT * FROM t WHERE fecha >= '{{ fecha_inicio }}'"
        inject_params(sql, {"fecha_inicio": "2024-01-01"})
    """
    for key, value in params.items():
        validated = validate_param(key, value)
        query = query.replace(f"{{{{ {key} }}}}", validated)
    return query
