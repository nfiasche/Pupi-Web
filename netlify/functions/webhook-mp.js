// Recibe el aviso de Mercado Pago cuando un pago cambia de estado, y si está
// aprobado, marca el turno correspondiente como pagado.
//
// Nunca confiamos en los datos que vienen en el aviso en sí — siempre le
// volvemos a preguntar a Mercado Pago los datos reales del pago antes de dar
// nada por bueno. Así lo recomienda la propia documentación de Mercado Pago,
// justamente para que nadie pueda mandar un aviso falso.
//
// Escrita con el formato clásico de Netlify Functions (exports.handler),
// el más compatible con despliegues manuales (zip / drag-and-drop) sin build.

const SB_URL = "https://mhppnqiqxywpcinkrimj.supabase.co";
const SB_KEY = "sb_publishable_-l5IP_tfrI29dkgxtbx3vA_mB_HYkld";

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    let paymentId = params["data.id"] || params.id;

    if (!paymentId && event.body) {
      try {
        const body = JSON.parse(event.body);
        paymentId = (body && body.data && body.data.id) || (body && body.id) || null;
      } catch (_) {}
    }

    if (!paymentId) {
      return { statusCode: 200, body: "sin id de pago" };
    }

    const MP_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!MP_TOKEN) {
      console.error("Falta configurar MP_ACCESS_TOKEN en las variables de entorno de Netlify");
      return { statusCode: 200, body: "falta configuración" };
    }

    const pagoRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_TOKEN}` },
    });
    if (!pagoRes.ok) {
      console.error("No pudimos consultar el pago", paymentId, pagoRes.status);
      return { statusCode: 200, body: "no encontrado" };
    }
    const pago = await pagoRes.json();

    if (pago.status !== "approved") {
      return { statusCode: 200, body: `estado: ${pago.status}` };
    }

    const turnoId = pago.external_reference;
    const monto = pago.transaction_amount;
    if (!turnoId) {
      console.error("Pago aprobado sin external_reference:", paymentId);
      return { statusCode: 200, body: "sin referencia al turno" };
    }

    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/marcar_turno_pagado_mp`, {
      method: "POST",
      headers: {
        apikey: SB_KEY,
        Authorization: `Bearer ${SB_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_turno_id: turnoId,
        p_payment_id: String(paymentId),
        p_monto: monto,
      }),
    });

    if (!rpcRes.ok) {
      console.error("Error al marcar el turno como pagado:", await rpcRes.text());
      return { statusCode: 200, body: "error al procesar" };
    }

    console.log(`Turno ${turnoId} marcado como pagado (pago ${paymentId}, $${monto})`);
    return { statusCode: 200, body: "ok" };
  } catch (err) {
    console.error("Error inesperado en webhook-mp:", err);
    return { statusCode: 200, body: "error" };
  }
};
