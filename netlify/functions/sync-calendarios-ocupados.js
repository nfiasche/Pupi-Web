// Trae la lista de calendarios de Pupi (para que elija cuáles bloquean en
// el panel) y los horarios ocupados de los que ya tiene tildados.
// Corre sola cada 1 hora (ver netlify.toml) y también se puede disparar a
// mano con el botón "Sincronizar ahora" del panel — mismo endpoint.

const SB_URL = "https://yjzurrjofrxrrejvlmmo.supabase.co";
const DIAS_A_FUTURO = 60; // mismo horizonte que reglas_reserva.max_dias por default

async function sbRpc(nombre, params) {
  const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${nombre}`, {
    method: "POST",
    headers: {
      apikey: SB_SERVICE_KEY,
      Authorization: `Bearer ${SB_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params || {}),
  });
  if (!res.ok) {
    const texto = await res.text();
    throw new Error(`RPC ${nombre} fall\u00f3: ${texto}`);
  }
  const texto = await res.text();
  return texto ? JSON.parse(texto) : null;
}

// Mismo mecanismo que sync-google-calendar.js — copiado a propósito en vez
// de compartido, para no arriesgar romper la función que ya funciona.
async function obtenerAccessTokenValido() {
  const filas = await sbRpc("obtener_tokens_google");
  const tokens = filas && filas[0];
  if (!tokens || !tokens.refresh_token) return null;

  const yaVencido = !tokens.expira_en || new Date(tokens.expira_en).getTime() < Date.now() + 60000;
  if (!yaVencido) return { accessToken: tokens.access_token };

  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const refreshData = await refreshRes.json();
  if (!refreshRes.ok || !refreshData.access_token) {
    console.error("No pudimos renovar el token de Google:", refreshData);
    return null;
  }
  const nuevaExpira = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();
  await sbRpc("actualizar_access_token_google", {
    p_access_token: refreshData.access_token,
    p_expira_en: nuevaExpira,
  });
  return { accessToken: refreshData.access_token };
}

// Trae TODOS los calendarios de Pupi (propios y suscriptos) y actualiza la
// lista del panel — sin pisar el tilde de los que ya existían. Además saca
// de la lista los que ya no existen en Google (borrados o desuscriptos).
async function sincronizarListaCalendarios(accessToken) {
  const res = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const texto = await res.text();
    console.error("No pudimos traer la lista de calendarios:", texto);
    await sbRpc("registrar_error_sync_google", { p_error: `calendarList: ${texto}`.slice(0, 500) }).catch(() => {});
    return; // no tocamos la lista guardada si esto falla
  }
  const data = await res.json();
  const idsVigentes = [];
  for (const cal of data.items || []) {
    idsVigentes.push(cal.id);
    await sbRpc("upsert_calendario_google", {
      p_calendar_id: cal.id,
      p_nombre: cal.summary || cal.id,
      p_es_propio: cal.accessRole === "owner",
    });
  }
  await sbRpc("limpiar_calendarios_fantasma", { p_calendar_ids_vigentes: idsVigentes });
}

// Google devuelve los horarios en UTC — hay que pasarlos a hora de Buenos
// Aires (UTC-3 fijo, Argentina no tiene horario de verano) antes de
// guardarlos, si no todo queda corrido 3 horas.
const OFFSET_ARG_MS = 3 * 60 * 60 * 1000;

function aHoraArgentina(iso) {
  return new Date(new Date(iso).getTime() - OFFSET_ARG_MS);
}

// Parte un intervalo ocupado (que puede cruzar la medianoche o durar varios
// días) en filas de un solo día cada una — es como las guarda la tabla.
function partirPorDia(inicioISO, finISO, calendarId) {
  const filas = [];
  let cursor = aHoraArgentina(inicioISO);
  const fin = aHoraArgentina(finISO);
  while (cursor < fin) {
    const finDelDia = new Date(cursor);
    finDelDia.setUTCHours(23, 59, 59, 999);
    const corte = finDelDia < fin ? finDelDia : fin;
    const fecha = cursor.toISOString().slice(0, 10);
    const horaInicio = cursor.toISOString().slice(11, 19);
    const horaFin = corte.toISOString().slice(11, 19);
    if (horaInicio !== horaFin) {
      filas.push({ fecha, hora_inicio: horaInicio, hora_fin: horaFin, calendar_id: calendarId });
    }
    cursor = new Date(finDelDia.getTime() + 1000);
  }
  return filas;
}

async function traerHorariosOcupados(accessToken, calendarIds) {
  if (!calendarIds.length) return [];
  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + DIAS_A_FUTURO * 24 * 60 * 60 * 1000);

  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      timeMin: ahora.toISOString(),
      timeMax: hasta.toISOString(),
      items: calendarIds.map((id) => ({ id })),
    }),
  });
  if (!res.ok) {
    const texto = await res.text();
    console.error("No pudimos consultar freeBusy:", texto);
    await sbRpc("registrar_error_sync_google", { p_error: `freeBusy: ${texto}`.slice(0, 500) }).catch(() => {});
    return [];
  }
  const data = await res.json();
  const filas = [];
  for (const calendarId of Object.keys(data.calendars || {})) {
    const ocupado = data.calendars[calendarId].busy || [];
    for (const intervalo of ocupado) {
      filas.push(...partirPorDia(intervalo.start, intervalo.end, calendarId));
    }
  }
  return filas;
}

exports.handler = async () => {
  try {
    const auth = await obtenerAccessTokenValido();
    if (!auth) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, motivo: "no_conectado" }) };
    }

    await sincronizarListaCalendarios(auth.accessToken);

    const calendariosFilas = await sbRpc("obtener_calendarios_a_sincronizar");
    const calendarIds = (calendariosFilas || []).map((f) => f.calendar_id);

    const filas = await traerHorariosOcupados(auth.accessToken, calendarIds);
    await sbRpc("reemplazar_horarios_ocupados_google", { p_filas: filas });

    return { statusCode: 200, body: JSON.stringify({ ok: true, calendarios: calendarIds.length, horarios: filas.length }) };
  } catch (err) {
    console.error("Error inesperado en sync-calendarios-ocupados:", err);
    await sbRpc("registrar_error_sync_google", { p_error: String(err).slice(0, 500) }).catch(() => {});
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
