/* ════════════════════════════════════════════════════════════════
   PUPI TURNERO — Código compartido entre las landings
   ────────────────────────────────────────────────────────────────
   Estas funciones son idénticas en index.html y vertice-landing.html.
   Vivían duplicadas: si se arreglaba un bug en una, la otra quedaba
   con el error. Ahora hay UN SOLO lugar donde tocarlas.

   IMPORTANTE: este archivo usa variables globales que cada página
   declara por su cuenta (sb, disponibilidadSemana, MS, DIA_KEY,
   reglasReserva, blockedDays, blockedRanges, bloqueosMesCargado,
   calmes). Por eso se carga ANTES del script de cada página.
   ════════════════════════════════════════════════════════════════ */

/* ── Utilidades ── */
function rdy(fn){if(window.supabase&&typeof window.supabase.createClient==='function')fn();else setTimeout(()=>rdy(fn),80);}

function fmt(n){return'$ '+Number(n).toLocaleString('es-AR');}

function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function deb(fn,ms){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}

function chMo(d){MS.m+=d;if(MS.m<0){MS.m=11;MS.y--;}if(MS.m>11){MS.m=0;MS.y++;}renderCal();}


/* ── Lógica de horarios y disponibilidad ── */
function horaEnRango(hora,inicio,fin){
  return hora>=inicio.slice(0,5)&&hora<fin.slice(0,5);
}

// Suma minutos a una hora "HH:MM" y devuelve el resultado en el mismo formato
function sumarMinutos(horaStr,minutos){
  const[h,m]=horaStr.split(':').map(Number);
  const total=h*60+m+minutos;
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

// Superposición real de 2 intervalos [inicio1,fin1) y [inicio2,fin2) — no alcanza
// con mirar si el inicio de uno cae dentro del otro, hay que comparar los 2 rangos
function seSuperponen(inicio1,fin1,inicio2,fin2){
  return inicio1<fin2.slice(0,5)&&inicio2.slice(0,5)<fin1;
}

function slotsDelDia(fecha){
  const dw=new Date(fecha+'T00:00:00').getDay();
  const rangos=(disponibilidadSemana&&disponibilidadSemana[DIA_KEY[dw]])||[];
  // La duración real del servicio que se está por reservar — el último horario
  // ofrecido tiene que dejar lugar para la sesión completa antes del cierre,
  // no solo "empezar antes de que cierre".
  const duracion=(MS&&MS.svc&&MS.svc.duracion_min)||60;
  const slots=[];
  rangos.forEach(r=>{
    let[h,m]=r.inicio.split(':').map(Number);
    const[hf,mf]=r.fin.split(':').map(Number);
    const finMin=hf*60+mf;
    while(h*60+m+duracion<=finMin){
      slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
      m+=60;if(m>=60){m-=60;h++;}
    }
  });
  return slots;
}

function actualizarLinksWhatsApp(numero){
  document.querySelectorAll('a[href*="wa.me/"]').forEach(a=>{
    a.href=a.href.replace(/wa\.me\/\d+/, 'wa.me/'+numero);
  });
}

/* Botón flotante de WhatsApp: ícono real de WhatsApp (dorado, no verde de marca),
   aparece recién después de scrollear un poco para no competir con el hero.
   En desktop (con hover real) arranca colapsado en un círculo y se expande con
   texto + verde al pasar el mouse. En mobile queda siempre expandido con texto.
   El link queda con "wa.me/" así que actualizarLinksWhatsApp() lo actualiza
   automáticamente si Pupi cambia el número desde el panel. */
const WA_ICON_SVG='<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.85.5 3.61 1.44 5.16L2 22l5.06-1.55c1.5.82 3.19 1.25 4.98 1.25h.01c5.46 0 9.9-4.45 9.9-9.91 0-2.65-1.03-5.14-2.9-7.01A9.847 9.847 0 0 0 12.04 2zm5.53 14.13c-.24.68-1.19 1.25-1.94 1.4-.52.11-1.19.19-3.46-.74-2.9-1.2-4.77-4.14-4.92-4.34-.14-.2-1.18-1.57-1.18-3 0-1.42.75-2.13 1.02-2.42.27-.29.58-.36.78-.36.2 0 .39 0 .56.01.18.01.42-.07.66.5.24.58.83 2 .9 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.17-.29.37-.42.5-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.93 1.94 1.22 2.22 1.36.28.14.44.12.6-.07.16-.19.68-.79.87-1.06.18-.28.36-.23.6-.14.24.09 1.53.72 1.79.85.26.13.44.19.5.3.07.11.07.63-.17 1.31z"/></svg>';

function initWhatsAppFlotante(numero,mensaje,texto){
  const a=document.createElement('a');
  a.id='waFlotante';
  a.className='wa-flotante';
  a.target='_blank';
  a.rel='noopener';
  a.setAttribute('aria-label','Escribir por WhatsApp');
  a.href=`https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;
  a.innerHTML=`<span class="wa-flotante-icon">${WA_ICON_SVG}</span><span class="wa-flotante-txt">${esc(texto||'Hablar con Pupi')}</span>`;
  document.body.appendChild(a);
  const actualizarVisibilidad=()=>a.classList.toggle('visible',window.scrollY>400);
  window.addEventListener('scroll',deb(actualizarVisibilidad,50));
  actualizarVisibilidad();
}

async function cargarDisponibilidad(){
  if(disponibilidadSemana||!sb)return;
  try{
    const{data}=await sb.rpc('obtener_config_publica');
    disponibilidadSemana=(data&&data.disponibilidad)||{};
    if(data){
      reglasReserva={min_horas:data.reserva_min_horas??24,max_dias:data.reserva_max_dias??60};
      if(data.whatsapp)actualizarLinksWhatsApp(data.whatsapp);
    }
  }catch(err){
    console.error('Error al cargar disponibilidad',err);
    // Si falla la conexión (ej. abriendo el archivo local), no bloqueamos todo el calendario:
    // usamos un horario por defecto razonable como resguardo (lunes a viernes, martes cerrado).
    const R=[{inicio:'09:00',fin:'18:00'}];
    disponibilidadSemana={lunes:R,martes:null,miercoles:R,jueves:R,viernes:R,sabado:null,domingo:null};
  }
}

async function fetchBloqueos(y,m){
  const key=`${y}-${m}`;
  if(bloqueosMesCargado===key)return; // ya cargado, evita re-consultar
  bloqueosMesCargado=key;
  blockedDays=new Set();blockedRanges=[];
  if(!sb)return;
  const first=`${y}-${String(m+1).padStart(2,'0')}-01`;
  const lastDay=new Date(y,m+1,0).getDate();
  const last=`${y}-${String(m+1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  try{
    const{data}=await sb.from('bloqueos').select('fecha,hora_inicio,hora_fin').gte('fecha',first).lte('fecha',last);
    (data||[]).forEach(b=>{
      if(!b.hora_inicio)blockedDays.add(b.fecha);
      else blockedRanges.push(b);
    });
  }catch(err){console.error('Error al cargar bloqueos',err);}
}

// Turnos ya ocupados en todo el mes (para saber qué días ya no tienen ningún
// horario libre, sin tener que consultar día por día).
async function fetchTurnosMes(y,m){
  const key=`${y}-${m}`;
  if(turnosMesCargado===key)return;
  turnosMesCargado=key;
  turnosMes={};
  if(!sb)return;
  try{
    const{data,error}=await sb.rpc('horarios_ocupados_en_mes',{p_anio:y,p_mes:m+1});
    if(error)throw error;
    (data||[]).forEach(row=>{
      (turnosMes[row.fecha]=turnosMes[row.fecha]||[]).push(row);
    });
  }catch(err){console.error('Error al cargar turnos del mes',err);}
}

// ¿Queda al menos un horario libre ese día, para el servicio actual? Repite
// la misma lógica de superposición que usa selF(), pero sin tener que
// esperar a que la persona haga click para descubrir que no hay nada.
function diaTieneHorarioLibre(fecha){
  const slots=slotsDelDia(fecha);
  if(!slots.length)return false;
  const duracion=(MS&&MS.svc&&MS.svc.duracion_min)||60;
  const ocupados=turnosMes[fecha]||[];
  const bloqueosDia=blockedRanges.filter(r=>r.fecha===fecha);
  return slots.some(t=>{
    const finSlot=sumarMinutos(t,duracion);
    if(ocupados.some(row=>seSuperponen(t,finSlot,row.hora_inicio,row.hora_fin)))return false;
    if(bloqueosDia.some(r=>seSuperponen(t,finSlot,r.hora_inicio,r.hora_fin)))return false;
    return true;
  });
}


/* ── Calendario y selección ── */
async function renderCal(intentos){
  intentos=intentos||0;
  const{m,y,fecha}=MS;
  await cargarDisponibilidad();
  await fetchBloqueos(y,m);
  await fetchTurnosMes(y,m);
  const first=new Date(y,m,1);const sd=(first.getDay()+6)%7;
  const dim=new Date(y,m+1,0).getDate();const today=new Date();today.setHours(0,0,0,0);
  const minFecha=new Date(Date.now()+reglasReserva.min_horas*3600000);minFecha.setHours(0,0,0,0);
  const maxFecha=new Date(today.getTime()+reglasReserva.max_dias*86400000);
  let c=DOW.map(d=>`<div class="cal-dow2">${d}</div>`).join('');
  for(let i=0;i<sd;i++)c+=`<div class="cday2 e"></div>`;
  let hayDiaLibre=false;
  for(let d2=1;d2<=dim;d2++){
    const o=new Date(y,m,d2);const dw=o.getDay();
    const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d2).padStart(2,'0')}`;
    const diaKey=DIA_KEY[dw];
    const diaCerrado=!disponibilidadSemana||!Array.isArray(disponibilidadSemana[diaKey])||!disponibilidadSemana[diaKey].length;
    const sinHorarioLibre=!diaCerrado&&!(o<minFecha||o>maxFecha)&&!blockedDays.has(ds)&&!diaTieneHorarioLibre(ds);
    if(o<minFecha||o>maxFecha||diaCerrado||blockedDays.has(ds)||sinHorarioLibre)c+=`<div class="cday2 d">${d2}</div>`;
    else{hayDiaLibre=true;c+=`<div class="cday2 a${fecha===ds?' s':''}" onclick="selF('${ds}')">${d2}</div>`;}
  }
  // Si ningún día de este mes tiene un horario libre, salta solo al próximo
  // mes que sí tenga — hasta 12 meses hacia adelante, para no colgarse si
  // por algún motivo no hay disponibilidad cargada en ningún lado.
  if(!hayDiaLibre&&intentos<12){
    MS.m++;if(MS.m>11){MS.m=0;MS.y++;}
    return renderCal(intentos+1);
  }
  document.getElementById('m-calmes').textContent=`${MES[MS.m]} ${MS.y}`;
  document.getElementById('m-cal').innerHTML=c;
}

async function selF(f){
  MS.fecha=f;MS.hora=null;renderCal();
  document.getElementById('m-cont2').disabled=true;
  const hcol=document.getElementById('m-hcol');
  hcol.innerHTML=`<div class="h-hint">Buscando horarios disponibles&hellip;</div>`;
  const duracion=(MS&&MS.svc&&MS.svc.duracion_min)||60;
  let turnosDelDia=[];
  if(sb){
    try{
      const{data,error}=await sb.rpc('horarios_ocupados_en_fecha',{p_fecha:f});
      if(error)throw error;
      turnosDelDia=data||[];
    }catch(err){console.error('Error al consultar turnos',err);}
  }
  const rangosDelDia=blockedRanges.filter(b=>b.fecha===f);
  const slotsPosibles=slotsDelDia(f);
  const limiteMin=new Date(Date.now()+reglasReserva.min_horas*3600000);
  const disponibles=slotsPosibles.filter(t=>{
    const finSlot=sumarMinutos(t,duracion);
    // ¿Se superpone con algún turno ya confirmado/pendiente/pagado ese día?
    // (no alcanza con que no coincida el inicio: un turno de 90 min a las
    // 10:00 tiene que bloquear también las 10:30 y las 11:00)
    if(turnosDelDia.some(row=>seSuperponen(t,finSlot,row.hora_inicio,row.hora_fin)))return false;
    // ¿Se superpone con algún bloqueo manual (vacaciones, almuerzo, etc.)?
    if(rangosDelDia.some(r=>seSuperponen(t,finSlot,r.hora_inicio,r.hora_fin)))return false;
    const slotDate=new Date(f+'T'+t+':00');
    return slotDate>=limiteMin;
  });
  if(disponibles.length===0){
    hcol.innerHTML=`<div class="h-hint">No quedan horarios libres este d&iacute;a. Prob&aacute; con otra fecha.</div>`;
  } else {
    hcol.innerHTML=disponibles.map(t=>`<div class="hslot2" onclick="selH('${t}')">${t}</div>`).join('');
  }
}

function selH(h){
  MS.hora=h;
  document.querySelectorAll('.hslot2').forEach(el=>el.classList.toggle('s',el.textContent===h));
  document.getElementById('m-cont2').disabled=false;
}


/* ── Validaciones en vivo ── */
function validarNombreEnVivo(){
  const el=document.getElementById('m-nombre-i');
  el.classList.toggle('campo-error',el.value.trim().length>0&&el.value.trim().length<2);
}

/* Valida que un teléfono sea usable para WhatsApp.
   Un dato basura acá rompe toda la automatización de contacto después. */
function telefonoValido(tel){
  const d=(tel||'').replace(/\D/g,'');
  // Un celular argentino tiene entre 10 y 13 dígitos:
  //   1156191955 (10) · 91156191955 (11) · 5491156191955 (13)
  // Aceptamos desde 8 (fijos del interior) hasta 15 (con código de país)
  if(d.length<8||d.length>15)return false;
  // Rechazamos datos basura obvios: 00000000, 11111111, 12345678, 123456789...
  if(/^(\d)\1+$/.test(d))return false;                    // todos iguales
  if('0123456789012345'.includes(d))return false;         // secuencia ascendente
  if('9876543210987654'.includes(d))return false;         // secuencia descendente
  return true;
}

/* Normaliza un teléfono al formato internacional que necesita WhatsApp.
   Devuelve solo dígitos, listo para wa.me/ */
function telefonoParaWhatsapp(tel){
  let d=(tel||'').replace(/\D/g,'');
  if(!d)return '';
  // Ya tiene código de país
  if(d.startsWith('54'))return d;
  // Le sacamos el 0 inicial (formato local: 011...)
  if(d.startsWith('0'))d=d.slice(1);
  // Le sacamos el 15 si está al principio del número local
  if(d.startsWith('15'))d=d.slice(2);
  // Argentina + celular
  return '549'+d;
}

function validarTelEnVivo(){
  const el=document.getElementById('m-tel-i');
  const hayTexto=el.value.trim().length>0;
  el.classList.toggle('campo-error',hayTexto&&!telefonoValido(el.value));
}


/* ── Resumen de reserva ── */
function poblarP3(){
  const s=MS.svc;const[,mo,d]=MS.fecha.split('-');
  const pr=MS.tarifa!==null?MS.tarifa:s.precio;
  document.getElementById('m-resumen3').innerHTML=`
    <div><div class="p3-svc">${esc(s.nombre)}</div><div class="p3-det">${d} de ${MES[parseInt(mo)-1].toLowerCase()}, ${MS.hora} hs</div></div>
    <div class="p3-precio-r">${fmt(s.precio)}</div>`;
  document.getElementById('m-pv').textContent=fmt(pr);
}



/* ── Política de cancelaciones (editable por Pupi desde el panel) ── */
async function cargarPoliticaCancelacion(){
  const cont=document.getElementById('cancelPoliticaFull');
  if(!cont||!sb)return;
  try{
    const{data,error}=await sb.rpc('obtener_politica_cancelacion');
    if(error)throw error;
    cont.innerHTML='<p>'+esc(data||'').replace(/\n/g,'<br>')+'</p>';
  }catch(err){
    console.error(err);
    cont.innerHTML='<p>No pudimos cargar el texto completo. Escrib\u00ednos si ten\u00e9s dudas sobre cancelaciones.</p>';
  }
}

function togglePoliticaCancel(btn){
  const box=document.getElementById('cancelPoliticaFull');
  if(!box)return;
  const abierta=box.style.display!=='none';
  box.style.display=abierta?'none':'block';
  btn.textContent=abierta?'Ver pol\u00edtica completa':'Ocultar';
  btn.setAttribute('aria-expanded',String(!abierta));
}
