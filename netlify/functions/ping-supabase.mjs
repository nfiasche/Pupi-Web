// Ping anti-pausa de Supabase
// El plan gratuito de Supabase pausa el proyecto tras ~7 días sin actividad.
// Esta función corre lunes y jueves al mediodía (UTC) y hace una consulta real
// (SELECT sobre servicios), que cuenta como actividad y evita la pausa.

const SB_URL = "https://mhppnqiqxywpcinkrimj.supabase.co";
const SB_KEY = "sb_publishable_-l5IP_tfrI29dkgxtbx3vA_mB_HYkld";

export default async () => {
  try {
    const res = await fetch(
      `${SB_URL}/rest/v1/servicios?select=id&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } }
    );
    const ok = res.ok;
    console.log(`Ping a Supabase: ${ok ? "OK" : "FALLO " + res.status}`);
    return new Response(ok ? "ok" : "error", { status: ok ? 200 : 500 });
  } catch (err) {
    console.error("Ping a Supabase falló:", err);
    return new Response("error", { status: 500 });
  }
};

export const config = {
  schedule: "0 12 * * 1,4"  // lunes y jueves, 12:00 UTC (9:00 en Argentina)
};
