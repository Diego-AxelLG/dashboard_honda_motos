# Checklist: Onboarding de Nuevo Cliente

## Dia 0 — Setup
- [ ] Clonar boilerplate a nuevo repo: `git clone ... nombre-cliente/`
- [ ] Configurar .env con credenciales del cliente
- [ ] Crear base de datos PostgreSQL
- [ ] Ejecutar DDL base
- [ ] Cambiar colores en globals.css
- [ ] Subir logo del cliente a frontend/public/
- [ ] Cambiar CLIENT_NAME en constants

## Dia 1-2 — Conexion de Datos
- [ ] Obtener acceso read-only a BD del cliente
- [ ] Mapear tablas del sistema origen → dimensiones/hechos
- [ ] Escribir SQL de extraccion (basado en templates)
- [ ] Primer ETL exitoso (datos en PostgreSQL)
- [ ] Validar datos con el cliente

## Dia 3-4 — Primer Tablero
- [ ] Configurar endpoints con KPIs del cliente
- [ ] Adaptar pagina de Resumen
- [ ] Conectar filtros (sucursales, fechas)
- [ ] Demo al cliente → feedback

## Dia 5+ — Tableros Adicionales
- [ ] Por cada tablero nuevo: SQL → endpoint → pagina
- [ ] Seguir patron Grid + Detail Panel
- [ ] UAT con usuarios finales

## Pre-entrega
- [ ] Capacitacion grabada (15 min)
- [ ] Deploy a servidor del cliente o VPS
- [ ] Configurar cron para ETL
- [ ] Documentar contrasenas en vault seguro
- [ ] Primera factura de mantenimiento
