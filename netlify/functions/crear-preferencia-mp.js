// Crea una preferencia de pago en Mercado Pago para la seña de un turno.
// El navegador manda solo el id del turno; el precio SIEMPRE se busca acá,
// en la base — nunca se confía en un monto que venga del cliente (alguien
// podría abrir las herramientas del navegador y mandar cualquier número).
//
// Escrita con el formato clásico de Netlify Functions (exports.handler),
// el más compatible con despliegues manuales (zip / drag-and-drop) sin build.

const SB_URL = "https://mhppnqiqxywpcinkrimj.supabase.co";
const SB_KEY = "sb_publishable_-l5IP_tfrI29dkgxtbx3vA_mB_HYkld";
const SEÑA_PORCENTAJE = 0.5; // 50% — fácil de cambiar si Pupi decide otro número

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ error: "Método no permitido" }) };
    }

    const { turno_id, tipo_pago } = JSON.parse(event.body || "{}");
    if (!turno_id) {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta el turno" }) };
    }
    const esPagoCompleto = tipo_pago === "completo";

    const resTurno = await fetch(
      `${SB_URL}/rest/v1/turnos?id=eq.${turno_id}&select=id,estado,precio_original,servicios(nombre)`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
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

    const precioLista = Number(turno.precio_original || 0);
    const monto = esPagoCompleto ? precioLista : Math.round(precioLista * SEÑA_PORCENTAJE);
    if (monto <= 0) {
      return { statusCode: 400, body: JSON.stringify({ error: "No pudimos calcular el monto a pagar" }) };
    }

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
    const nombreServicio = (turno.servicios && turno.servicios.nombre) || "Sesión";

    const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
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
    });

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
