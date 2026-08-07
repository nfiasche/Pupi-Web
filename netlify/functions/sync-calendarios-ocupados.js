// Corrida programada cada 1 hora (ver netlify.toml) — trae la lista de
// calendarios de Pupi y los horarios ocupados de los que ya tiene tildados.
//
// OJO: Netlify no deja invocar una función programada (con "schedule" en
// netlify.toml) directo por URL — cualquier llamado externo a este mismo
// endpoint devuelve 403 sin llegar siquiera a correr este código, por
// diseño de la plataforma. Por eso el botón "Sincronizar ahora" del panel
// llama a sync-calendarios-ahora.js (sin schedule, libre de invocar), que
// comparte la misma lógica real desde lib/syncCalendariosCore.js.

const { realizarSyncCalendarios } = require("./lib/syncCalendariosCore");

exports.handler = async () => {
  const resultado = await realizarSyncCalendarios();
  return { statusCode: 200, body: JSON.stringify(resultado) };
};
