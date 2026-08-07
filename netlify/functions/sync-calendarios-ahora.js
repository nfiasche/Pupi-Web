// Endpoint para el botón "Sincronizar ahora" del panel — a propósito
// separado de sync-calendarios-ocupados.js (esa es la programada, y
// Netlify bloquea con 403 cualquier llamado directo a una función con
// "schedule"). Esta no tiene schedule, así que se puede invocar libre.
// Comparte la misma lógica real desde lib/syncCalendariosCore.js.

const { realizarSyncCalendarios } = require("./lib/syncCalendariosCore");

exports.handler = async () => {
  const resultado = await realizarSyncCalendarios();
  return { statusCode: 200, body: JSON.stringify(resultado) };
};
