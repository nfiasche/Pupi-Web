// Crea una preferencia de pago en Mercado Pago para la seña de un turno.
// El navegador manda solo el id del turno; el precio SIEMPRE se busca acá,
// en la base — nunca se confía en un monto que venga del cliente (alguien
// podría abrir las herramientas del navegador y mandar cualquier número).
//
// Escrita con el formato clásico de Netlify Functions (exports.handler),
// el más compatible con despliegues manuales (zip / drag-and-drop) sin build.

const SB_URL = "https://yjzurrjofrxrrejvlmmo.supabase.co";
const SB_KEY = "sb_publishable__cJMItvCjv2OO_VvVoOgWg_ZOmGPfIj";
const SEÑA_PORCENTAJE = 0.5; // 50% — fácil de cambiar si Pupi decide otro número

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
    }

    const body = JSON.parse(event.body || "{}");

    // "Despertar" la función antes de que haga falta de verdad: cuando el
    // cliente termina de escribir el mail (mucho antes de tocar "Pagar"),
    // el navegador manda esto en silencio. No toca la base ni Mercado Pago
    // — solo hace que Netlify tenga el contenedor ya listo ("caliente")
    // para cuando llegue el pedido real, en vez de arrancarlo de cero recién
    // en ese momento.
    if (body.warmup) {
      return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    }

    const { turno_id, tipo_pago } = body;
    if (!turno_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el turno" }) };
    }
    const esPagoCompleto = tipo_pago === "completo";

    const resTurno = await fetch(
      `${SB_URL}/rest/v1/rpc/obtener_turno_para_pago`,
      {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_turno_id: turno_id }),
      }
    );
    if (!resTurno.ok) {
      console.error("Error al buscar el turno:", await resTurno.text());
      return { statusCode: 500, body: JSON.stringify({ error: "No pudimos buscar el turno" }) };
    }
    const turnos = await resTurno.json();
    const turno = turnos[0];
    if (!turno) {
      return { statusCode: 404, body: JSON.stringify({ error: "No encontramos ese turno" }) };
    }
    if (turno.estado === "cancelado") {
      return { statusCode: 400, body: JSON.stringify({ error: "Ese turno está cancelado" }) };
    }
    if (turno.estado === "pagado") {
      return { statusCode: 400, body: JSON.stringify({ error: "Ese turno ya está pagado" }) };
    }

    // Si el paciente tiene tarifa especial para este servicio, ese es el
    // precio real a usar como base — nunca el de lista. Esta consulta se
    // hace acá, del lado del servidor, con la misma función que usa la web
    // para mostrar el descuento en pantalla — así el monto que se cobra de
    // verdad siempre coincide con lo que el paciente vio antes de pagar.
    let precioBase = Number(turno.precio_original || 0);
    if (turno.paciente_email && turno.servicio_id) {
      try {
        const resTarifa = await fetch(`${SB_URL}/rest/v1/rpc/obtener_tarifa_especial`, {
          method: "POST",
          headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ p_email: turno.paciente_email, p_servicio_id: turno.servicio_id }),
        });
        if (resTarifa.ok) {
          const tarifaEspecial = await resTarifa.json();
          // Solo la usamos si es un descuento real (nunca para cobrar de más
          // si por algún motivo diera un número mayor al de lista).
          if (tarifaEspecial !== null && tarifaEspecial !== undefined && Number(tarifaEspecial) < precioBase) {
            precioBase = Number(tarifaEspecial);
          }
        } else {
          console.error("No pudimos consultar la tarifa especial:", await resTarifa.text());
        }
      } catch (errTarifa) {
        console.error("Error al consultar la tarifa especial:", errTarifa);
      }
    }

    const precioLista = precioBase;
    const monto = esPagoCompleto ? precioLista : Math.round(precioLista * SEÑA_PORCENTAJE);
    if (monto <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "No pudimos calcular el monto a pagar" }) };
    }

    // Le damos 30 minutos para volver y pagar — pasado ese plazo, el horario
    // se libera solo (lo hace horarios_ocupados_en_fecha en cada consulta,
    // no hace falta ningún proceso corriendo en segundo plano). Esto no
    // depende de nada de lo que sigue (armar el link de pago), así que lo
    // disparamos ahora y seguimos de largo — se espera recién al final, en
    // paralelo con la llamada a Mercado Pago, en vez de en fila antes de
    // arrancarla. Si falla no cortamos el pago por eso, solo queda en el log.
    const vencePromise = fetch(`${SB_URL}/rest/v1/rpc/marcar_turno_esperando_pago`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_turno_id: turno_id, p_minutos: 30 }),
    })
      .then((r) => { if (!r.ok) return r.text().then((t) => console.error("No pudimos marcar el vencimiento del turno:", t)); })
      .catch((errVence) => console.error("Error al marcar el vencimiento del turno:", errVence));

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) {
      console.error("Falta configurar MP_ACCESS_TOKEN en las variables de entorno de Netlify");
      return { statusCode: 500, body: JSON.stringify({ error: "El pago online no está disponible en este momento" }) };
    }

    const origen = `https://${event.headers.host}`;
    const referer = event.headers.referer || event.headers.referrer;
    let paginaOrigen = "/";
    if (referer) {
      try { paginaOrigen = new URL(referer).pathname || "/"; } catch (_) {}
    }
    const nombreServicio = turno.nombre_servicio || "Sesión";

    const [prefRes] = await Promise.all([
      fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${MP_TOKEN}`,
        },
        body: JSON.stringify({
          items: [
            {
              title: `${esPagoCompleto ? "Pago completo" : "Seña"} — ${nombreServicio}`,
              quantity: 1,
              unit_price: monto,
              currency_id: "ARS",
            },
          ],
          external_reference: turno_id,
          back_urls: {
            success: `${origen}${paginaOrigen}?pago=exitoso`,
            pending: `${origen}${paginaOrigen}?pago=pendiente`,
            failure: `${origen}${paginaOrigen}?pago=fallido`,
          },
          auto_return: "approved",
          notification_url: `${origen}/.netlify/functions/webhook-mp`,
        }),
      }),
      vencePromise,
    ]);

    if (!prefRes.ok) {
      console.error("Error de Mercado Pago al crear la preferencia:", await prefRes.text());
      return { statusCode: 502, body: JSON.stringify({ error: "No pudimos generar el link de pago" }) };
    }

    const pref = await prefRes.json();
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_point: pref.init_point, monto }),
    };
  } catch (err) {
    console.error("Error inesperado en crear-preferencia-mp:", err);
    return { statusCode: 500, body: JSON.stringify({ error: "Hubo un problema. Intentá de nuevo." }) };
  }
};
