// El botón "Conectar Google Calendar" del panel apunta acá en vez de armar
// la URL de autorización de Google directamente en el HTML — así el
// Client ID vive solo en las variables de entorno, ni siquiera hace falta
// escribirlo en el código.

const REDIRECT_URI = "https://pupilarroude.netlify.app/.netlify/functions/google-oauth-callback";

exports.handler = async () => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID) {
    return { statusCode: 500, body: "Falta configurar GOOGLE_CLIENT_ID en Netlify." };
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
  });

  return {
    statusCode: 302,
    headers: { Location: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` },
    body: "",
  };
};
