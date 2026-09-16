-- AUDITORÍA DE SEGURIDAD FASE 1 — FUNCIONES SECURITY DEFINER
-- 16/9/2026 — Cierre de funciones de alto riesgo

-- ============================================================
-- ALTO RIESGO: Acceso a tokens, modificación de pagos
-- ============================================================

-- 1. OBTENER_TOKENS_GOOGLE (exponía refresh token en texto plano)
REVOKE ALL ON FUNCTION obtener_tokens_google() FROM anon;
REVOKE ALL ON FUNCTION obtener_tokens_google() FROM authenticated;
GRANT EXECUTE ON FUNCTION obtener_tokens_google() TO service_role;

-- 2. GUARDAR_TOKENS_GOOGLE (guarda tokens)
REVOKE ALL ON FUNCTION guardar_tokens_google(varchar,varchar,timestamp) FROM anon;
REVOKE ALL ON FUNCTION guardar_tokens_google(varchar,varchar,timestamp) FROM authenticated;
GRANT EXECUTE ON FUNCTION guardar_tokens_google(varchar,varchar,timestamp) TO service_role;

-- 3. ACTUALIZAR_ACCESS_TOKEN_GOOGLE (modifica token)
REVOKE ALL ON FUNCTION actualizar_access_token_google(varchar,timestamp) FROM anon;
REVOKE ALL ON FUNCTION actualizar_access_token_google(varchar,timestamp) FROM authenticated;
GRANT EXECUTE ON FUNCTION actualizar_access_token_google(varchar,timestamp) TO service_role;

-- 4. DESCONECTAR_GOOGLE_CALENDAR (modifica configuración del usuario)
REVOKE ALL ON FUNCTION desconectar_google_calendar() FROM anon;
REVOKE ALL ON FUNCTION desconectar_google_calendar() FROM authenticated;
GRANT EXECUTE ON FUNCTION desconectar_google_calendar() TO service_role;

-- 5. MARCAR_TURNO_PAGADO_MP (CRÍTICA: permitía marcar pagos sin verificar)
REVOKE ALL ON FUNCTION marcar_turno_pagado_mp(uuid,numeric) FROM anon;
REVOKE ALL ON FUNCTION marcar_turno_pagado_mp(uuid,numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION marcar_turno_pagado_mp(uuid,numeric) TO service_role;

-- 6. LIBERAR_TURNO_PENDIENTE (modifica turno)
REVOKE ALL ON FUNCTION liberar_turno_pendiente(uuid) FROM anon;
REVOKE ALL ON FUNCTION liberar_turno_pendiente(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION liberar_turno_pendiente(uuid) TO service_role;

-- 7. COBRAR_SALDO_TURNO (modifica estado de pago)
REVOKE ALL ON FUNCTION cobrar_saldo_turno(uuid,numeric) FROM anon;
REVOKE ALL ON FUNCTION cobrar_saldo_turno(uuid,numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION cobrar_saldo_turno(uuid,numeric) TO service_role;

-- 8. VENCER_TURNOS_PENDIENTES (modifica múltiples turnos)
REVOKE ALL ON FUNCTION vencer_turnos_pendientes() FROM anon;
REVOKE ALL ON FUNCTION vencer_turnos_pendientes() FROM authenticated;
GRANT EXECUTE ON FUNCTION vencer_turnos_pendientes() TO service_role;

-- 9. MARCAR_TURNO_ESPERANDO_PAGO (modifica estado)
REVOKE ALL ON FUNCTION marcar_turno_esperando_pago(uuid) FROM anon;
REVOKE ALL ON FUNCTION marcar_turno_esperando_pago(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION marcar_turno_esperando_pago(uuid) TO service_role;

-- 10. FN_GUARDAR_HISTORIAL_DISPONIBILIDAD (audit trail)
REVOKE ALL ON FUNCTION fn_guardar_historial_disponibilidad() FROM anon;
REVOKE ALL ON FUNCTION fn_guardar_historial_disponibilidad() FROM authenticated;
GRANT EXECUTE ON FUNCTION fn_guardar_historial_disponibilidad() TO service_role;

-- 11. REEMPLAZAR_HORARIOS_OCUPADOS_GOOGLE (modifica disponibilidad)
REVOKE ALL ON FUNCTION reemplazar_horarios_ocupados_google(uuid,text[]) FROM anon;
REVOKE ALL ON FUNCTION reemplazar_horarios_ocupados_google(uuid,text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION reemplazar_horarios_ocupados_google(uuid,text[]) TO service_role;

-- 12. LIMPIAR_CALENDARIOS_FANTASMA (modifica configuración)
REVOKE ALL ON FUNCTION limpiar_calendarios_fantasma() FROM anon;
REVOKE ALL ON FUNCTION limpiar_calendarios_fantasma() FROM authenticated;
GRANT EXECUTE ON FUNCTION limpiar_calendarios_fantasma() TO service_role;

-- ============================================================
-- MEDIO RIESGO: Deberían ser solo para service_role o admin
-- ============================================================

-- Usuarios normales NO deberían poder:
-- - crear pacientes (obtener_o_crear_paciente)
-- - guardar calendarios (guardar_tilde_calendario_google, upsert_calendario_google)
-- - guardar event IDs (guardar_google_event_id)

REVOKE ALL ON FUNCTION obtener_o_crear_paciente(varchar,varchar,varchar) FROM anon;
REVOKE ALL ON FUNCTION obtener_o_crear_paciente(varchar,varchar,varchar) FROM authenticated;
GRANT EXECUTE ON FUNCTION obtener_o_crear_paciente(varchar,varchar,varchar) TO service_role;

REVOKE ALL ON FUNCTION guardar_tilde_calendario_google(uuid,text) FROM anon;
REVOKE ALL ON FUNCTION guardar_tilde_calendario_google(uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION guardar_tilde_calendario_google(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION upsert_calendario_google(text,text) FROM anon;
REVOKE ALL ON FUNCTION upsert_calendario_google(text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION upsert_calendario_google(text,text) TO service_role;

REVOKE ALL ON FUNCTION guardar_google_event_id(uuid,text) FROM anon;
REVOKE ALL ON FUNCTION guardar_google_event_id(uuid,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION guardar_google_event_id(uuid,text) TO service_role;

-- ============================================================
-- FUNCIONES QUE PUEDEN QUEDAR PÚBLICAS (verificadas OK)
-- ============================================================

-- Estas devuelven datos públicos o información de disponibilidad:
-- - obtener_config_publica() → OK, es pública
-- - obtener_politica_cancelacion() → OK, es pública
-- - horarios_ocupados_en_fecha() → OK, es disponibilidad pública
-- - horarios_ocupados_en_mes() → OK, es disponibilidad pública
-- - obtener_disponibilidad_base() → OK, es disponibilidad pública
-- - buscar_paciente_por_telefono() → OK, es búsqueda filtrada por quien reserva
-- - anotarse_lista_espera() → OK, es acción pública con RLS

-- ============================================================
-- PENDIENTE FASE 2 (revisar caso a caso)
-- ============================================================
-- - buscar_pacientes() → debe ser admin-only
-- - buscar_datos_paciente() → debe ser admin-only
-- - salud_pacientes() → debe ser admin-only
-- - patrones_pacientes() → debe ser admin-only
-- - obtener_eventos_turno() → revisar RLS
-- - turnos_precio_anomalo() → debe ser admin-only
-- - paquete_activo_de_paciente() → revisar RLS
-- - google_calendar_conectado() → revisar contexto
-- - obtener_calendarios_a_sincronizar() → revisar RLS
-- - registrar_error_sync_google() → revisar RLS
-- - notificar_cambio_turno_google() → revisar RLS
-- - es_admin_panel() → revisar si hace GRANT internamente
-- - tiene_permiso() → revisar si es seguro públicamente
-- - generar_gastos_recurrentes() → admin-only
-- - generar_ingresos_recurrentes() → admin-only

