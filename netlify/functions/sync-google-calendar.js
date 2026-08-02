// La base de datos llama a esta función sola (vía un trigger) cada vez que
// un turno se crea, cambia o se cancela — desde cualquier lado: reserva
// pública, panel, webhook de Mercado Pago, vencimiento automático. No hace
// falta tocar ningún otro punto del código para que esto funcione.
//
// Si Pupi todavía no conectó su Google Calendar, esta función no hace nada
// (responde 200 igual, para no generar errores en el trigger que la llama).

const SB_URL = "https://mhppnqiqxywpcinkrimj.supabase.co";
const TIMEZONE = "America/Argentina/Buenos_Aires";

// Solo estos estados representan un turno real que Pupi va a dar — el resto
// (pendiente) todavía puede caerse solo, no vale la pena mostrarlo.
const ESTADOS_QUE_VAN_AL_CALENDARIO = ["confirmado", "señado", "pagado"];

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

async function obtenerAccessTokenValido() {
  const filas = await sbRpc("obtener_tokens_google");
  const tokens = filas && filas[0];
  if (!tokens || !tokens.refresh_token) return null; // Todavía no conectó nada

  const yaVencido = !tokens.expira_en || new Date(tokens.expira_en).getTime() < Date.now() + 60000;
  if (!yaVencido) {
    return { accessToken: tokens.access_token, calendarId: tokens.calendar_id || "primary" };
  }

  // El token de acceso venció (dura ~1 hora) — lo renovamos con el de
  // renovación, que no vence. Esto es automático, Pupi no hace nada.
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
  return { accessToken: refreshData.access_token, calendarId: tokens.calendar_id || "primary" };
}

function armarEvento(payload) {
  const modalidadTxt = payload.modalidad === "online" ? "Online" : payload.modalidad === "presencial" ? "Presencial" : "";
  const descripcionPartes = [];
  if (payload.paciente_email) descripcionPartes.push(`Mail: ${payload.paciente_email}`);
  if (modalidadTxt) descripcionPartes.push(`Modalidad: ${modalidadTxt}`);

  return {
    summary: `${payload.servicio_nombre} \u2014 ${payload.paciente_nombre}`,
    description: descripcionPartes.join("\n") || undefined,
    location: modalidadTxt === "Online" ? "Online" : undefined,
    start: { dateTime: `${payload.fecha}T${payload.hora_inicio}`, timeZone: TIMEZONE },
    end: { dateTime: `${payload.fecha}T${payload.hora_fin}`, timeZone: TIMEZONE },
  };
}

async function llamarGoogle(metodo, url, accessToken, body) {
  const res = await fetch(url, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

exports.handler = async (event) => {
  try {
    const payload = JSON.parse(event.body || "{}");
    const { operacion, turno_id, estado, google_event_id } = payload;

    const auth = await obtenerAccessTokenValido();
    if (!auth) {
      // No conectado todavía — no es un error, simplemente no hay nada que sincronizar.
      return { statusCode: 200, body: JSON.stringify({ ok: true, motivo: "no_conectado" }) };
    }

    const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.calendarId)}/events`;

    const debeEstarEnCalendario = operacion !== "DELETE" && ESTADOS_QUE_VAN_AL_CALENDARIO.includes(estado);

    if (!debeEstarEnCalendario) {
      // Se canceló, se borró, o nunca pasó de pendiente — si ya había un
      // evento creado, lo sacamos del calendario.
      if (google_event_id) {
        const res = await llamarGoogle("DELETE", `${base}/${google_event_id}`, auth.accessToken);
        if (!res.ok && res.status !== 404 && res.status !== 410) {
          console.error("No pudimos borrar el evento de Google:", await res.text());
        }
      }
      return { statusCode: 200, body: JSON.stringify({ ok: true, accion: "sin_evento" }) };
    }

    const eventoBody = armarEvento(payload);

    if (google_event_id) {
      // Ya existe: lo actualizamos en vez de crear uno nuevo.
      const res = await llamarGoogle("PATCH", `${base}/${google_event_id}`, auth.accessToken, eventoBody);
      if (res.ok) {
        return { statusCode: 200, body: JSON.stringify({ ok: true, accion: "actualizado" }) };
      }
      // Si el evento ya no existe del lado de Google (lo borraron a mano),
      // lo recreamos en vez de fallar.
      if (res.status !== 404 && res.status !== 410) {
        console.error("No pudimos actualizar el evento de Google:", await res.text());
        return { statusCode: 200, body: JSON.stringify({ ok: false, accion: "error_update" }) };
      }
    }

    const creado = await llamarGoogle("POST", base, auth.accessToken, eventoBody);
    const creadoData = await creado.json();
    if (!creado.ok || !creadoData.id) {
      console.error("No pudimos crear el evento en Google:", creadoData);
      return { statusCode: 200, body: JSON.stringify({ ok: false, accion: "error_create" }) };
    }

    await sbRpc("guardar_google_event_id", { p_turno_id: turno_id, p_google_event_id: creadoData.id });
    return { statusCode: 200, body: JSON.stringify({ ok: true, accion: "creado" }) };
  } catch (err) {
    console.error("Error inesperado en sync-google-calendar:", err);
    // Siempre 200: esto lo llama un trigger de la base, no queremos que un
    // error acá bloquee ni reintente nada del lado de la base de datos.
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(err) }) };
  }
};
