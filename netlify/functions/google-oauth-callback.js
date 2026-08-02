// Google redirige acá después de que Pupi autoriza el acceso a su
// calendario. Esta función intercambia el código que manda Google por los
// tokens reales, y los guarda — no expone nada de esto al navegador, todo
// pasa server-side.

const SB_URL = "https://mhppnqiqxywpcinkrimj.supabase.co";
const REDIRECT_URI = "https://pupilarroude.netlify.app/.netlify/functions/google-oauth-callback";
const PANEL_URL = "https://pupilarroude.netlify.app/admin.html";

exports.handler = async (event) => {
  const code = event.queryStringParameters && event.queryStringParameters.code;
  const errorParam = event.queryStringParameters && event.queryStringParameters.error;

  if (errorParam) {
    // Pupi canceló la autorización, o algo falló del lado de Google.
    return {
      statusCode: 302,
      headers: { Location: `${PANEL_URL}?google=error&motivo=${encodeURIComponent(errorParam)}` },
      body: "",
    };
  }

  if (!code) {
    return { statusCode: 400, body: "Falta el código de autorización." };
  }

  try {
    const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const SB_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!CLIENT_ID || !CLIENT_SECRET || !SB_SERVICE_KEY) {
      console.error("Faltan GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SUPABASE_SERVICE_ROLE_KEY en las variables de entorno");
      return {
        statusCode: 302,
        headers: { Location: `${PANEL_URL}?google=error&motivo=config` },
        body: "",
      };
    }

    // Intercambiamos el código por los tokens reales.
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("Error al intercambiar el código con Google:", tokenData);
      return {
        statusCode: 302,
        headers: { Location: `${PANEL_URL}?google=error&motivo=token` },
        body: "",
      };
    }

    if (!tokenData.refresh_token) {
      // Pasa si Pupi ya había autorizado antes y Google no volvió a mandar
      // el refresh_token (solo lo manda la primera vez, o si se fuerza
      // prompt=consent — que ya pedimos en la URL de autorización).
      console.error("Google no devolvió refresh_token", tokenData);
      return {
        statusCode: 302,
        headers: { Location: `${PANEL_URL}?google=error&motivo=sin_refresh` },
        body: "",
      };
    }

    const expiraEn = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();

    const rpcRes = await fetch(`${SB_URL}/rest/v1/rpc/guardar_tokens_google`, {
      method: "POST",
      headers: {
        apikey: SB_SERVICE_KEY,
        Authorization: `Bearer ${SB_SERVICE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_access_token: tokenData.access_token,
        p_refresh_token: tokenData.refresh_token,
        p_expira_en: expiraEn,
      }),
    });

    if (!rpcRes.ok) {
      console.error("No pudimos guardar los tokens en Supabase:", await rpcRes.text());
      return {
        statusCode: 302,
        headers: { Location: `${PANEL_URL}?google=error&motivo=guardado` },
        body: "",
      };
    }

    return {
      statusCode: 302,
      headers: { Location: `${PANEL_URL}?google=conectado` },
      body: "",
    };
  } catch (err) {
    console.error("Error inesperado en google-oauth-callback:", err);
    return {
      statusCode: 302,
      headers: { Location: `${PANEL_URL}?google=error&motivo=inesperado` },
      body: "",
    };
  }
};
