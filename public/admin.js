// Panel administrativo (equivale a mostrar_panel_admin y sus pestañas).
import * as D from './data.js';
import {
  $, esc, alerta, toast, conBoton, descargarCSV, sello, fmtDate, fmtDateTime, toDate, toInputDate, fromInputDate,
  addDays, startOfDay, diasEntre, acciones, formularios, cambios
} from './util.js';

const ROL = { superadmin: 'Superadministrador', admin: 'Administrador' };
const TABS = {
  superadmin: [['registrar', 'Registrar usuario'], ['aprobar', 'Aprobar permisos'], ['historial', 'Historial'], ['usuarios', 'Usuarios registrados'], ['stats', 'Estadísticas'], ['admins', 'Administradores']],
  admin: [['aprobar', 'Aprobar permisos'], ['historial', 'Historial'], ['stats', 'Estadísticas']]
};
for (const r in TABS) TABS[r].push(['cuenta', 'Mi contraseña']);
const ESTADO_SOL = { pendiente: ['aviso', 'Pendiente'], aprobada: ['ok', 'Aprobada'], rechazada: ['error', 'Rechazada'] };
const chipEstado = e => { const [c, t] = ESTADO_SOL[e] || ['neutro', e]; return `<span class="chip ${c}">${t}</span>`; };
const hoyInput = () => toInputDate(new Date());

let perfil, tab, pendientesN = null, limpiezaHecha = false, editandoId = null;
let cache = {};
let filtros = { estado: 'Todas', desde: '', q: '' }, limiteHist = 50, filtroUsr = 'Todos';
const VISTAS = {};

export function reiniciarAdmin() { limpiezaHecha = false; tab = null; editandoId = null; pendientesN = null; cache = {}; }
const tabsDe = () => TABS[perfil.rol] || TABS.admin;

export async function renderAdmin(root, p) {
  perfil = p;
  if (!tab || !tabsDe().some(t => t[0] === tab)) tab = tabsDe()[0][0];
  root.innerHTML = `<h1 class="solo-lector">Panel administrativo</h1>
    <div class="panel"><nav class="lateral" id="nav-admin" aria-label="Secciones"></nav>
    <section class="contenido"><div id="aviso-limpieza"></div><div id="admin-contenido"></div></section></div>`;
  pintarNav();
  if (!limpiezaHecha) {
    limpiezaHecha = true;
    try {
      const el = await D.eliminarVencidos(30);
      if (el.length) $('#aviso-limpieza').innerHTML = alerta('aviso', `<details><summary>Ver usuarios eliminados</summary><ul>${el.map(u => `<li><strong>${esc(u.nombre)}</strong> (ID ${esc(u.id)}) · venció el ${fmtDate(u.fecha_vigencia)}</li>`).join('')}</ul></details>`, `Se eliminaron ${el.length} usuario(s) con permisos vencidos hace más de 30 días sin renovación pendiente.`);
    } catch (e) { console.warn('Limpieza automática:', e); }
  }
  await cargarTab();
}

function pintarNav() {
  const nav = $('#nav-admin'); if (!nav) return;
  nav.innerHTML = tabsDe().map(([k, t]) =>
    `<button data-action="tab" data-tab="${k}" ${k === tab ? 'aria-current="page"' : ''}>${t}${k === 'aprobar' && pendientesN ? `<span class="badge">${pendientesN}</span>` : ''}</button>`).join('');
}
async function cargarTab() {
  const el = $('#admin-contenido'); if (!el) return;
  el.innerHTML = '<p class="cargando">Cargando…</p>';
  try { el.innerHTML = await VISTAS[tab](); }
  catch (e) { console.error(e); el.innerHTML = alerta('error', `No se pudo cargar la información. ${esc(e.message || '')}`); }
  pintarNav();
}
acciones.tab = (el) => { tab = el.dataset.tab; editandoId = null; cargarTab(); };

const metrica = (t, v) => `<div class="metrica"><strong>${v}</strong><span>${t}</span></div>`;
const campoFecha = (name, valor, min, max) => `<input type="date" name="${name}" value="${valor}" ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''} required>`;
const filaDato = (k, v) => `<div><dt>${k}</dt><dd>${v}</dd></div>`;
const barras = (items) => {
  const max = Math.max(1, ...items.map(i => i.v));
  return `<div class="barras">${items.map(i => `<div class="barra"><span>${esc(i.k)}</span><div class="pista"><i style="width:${(i.v / max) * 100}%"></i></div><b>${i.v}</b></div>`).join('')}</div>`;
};
const vistaMin = u => { const d = toDate(u.fecha_vigencia); if (!d) return ['neutro', 'Sin fecha']; const n = diasEntre(d, new Date()); return n > 30 ? ['ok', 'Vigente'] : n >= 0 ? ['aviso', 'Por vencer'] : ['error', 'Vencido']; };

// =============== Registrar usuario ===============
VISTAS.registrar = async () => `<h2>Registrar usuario</h2>
  <form class="bloque" data-form="registrar">
    <div class="rejilla">
      <label class="campo">Nombre<input name="nombre" required maxlength="120"></label>
      <label class="campo">Número de empleado<input name="id" required maxlength="30" pattern="[A-Za-z0-9_\\-]+" title="Solo letras, números, guion o guion bajo"></label>
      <label class="campo">Área<input name="area" required maxlength="80"></label>
      <label class="campo">Supervisor<input name="supervisor" required maxlength="120"></label>
      <label class="campo">Tipo de uso<select name="tipo_uso"><option>Personal</option><option>Trabajo</option></select></label>
    </div>
    <label class="check"><input type="checkbox" name="aprobar" checked data-change="toggleAprobar"> Aprobar el permiso de inmediato</label>
    <label class="campo" id="bloque-vigencia">Válido hasta ${campoFecha('vigencia', toInputDate(addDays(new Date(), 365)), hoyInput())}</label>
    <button class="btn primario" type="submit">Registrar usuario</button>
  </form>`;
cambios.toggleAprobar = el => { $('#bloque-vigencia').hidden = !el.checked; $('#bloque-vigencia input').required = el.checked; };
formularios.registrar = async (form) => {
  const fd = new FormData(form), g = k => (fd.get(k) || '').toString().trim(), aprobar = form.elements.aprobar.checked;
  const d = { id: g('id'), nombre: g('nombre'), area: g('area'), supervisor: g('supervisor'), tipo_uso: g('tipo_uso'), aprobar, vigencia: aprobar ? fromInputDate(g('vigencia')) : null };
  await conBoton(form.querySelector('[type=submit]'), 'Guardando…', async () => {
    try {
      const r = await D.registrarUsuario(d, perfil.nombre);
      if (!r.ok) return toast(r.msg, 'error');
      toast(`Usuario ${d.nombre} registrado${aprobar ? ' y permiso aprobado' : ''}`); form.reset();
    } catch (e) { console.error(e); toast('No se pudo registrar el usuario', 'error'); }
  });
};

// =============== Aprobar permisos ===============
VISTAS.aprobar = async () => {
  const [pend, usuarios] = await Promise.all([D.getSolicitudesPendientes(), D.getUsuarios()]);
  const porFecha = (a, b) => (toDate(a.fecha_solicitud) || 0) - (toDate(b.fecha_solicitud) || 0);
  const nuevas = pend.filter(s => (s.tipo_solicitud || 'nueva') === 'nueva').sort(porFecha);
  const renov = pend.filter(s => s.tipo_solicitud === 'renovacion').sort(porFecha);
  const usrPend = usuarios.filter(u => !u.permiso_aprobado && !['expirado', 'denegado'].includes(u.estado));
  cache.pend = pend; cache.usuarios = usuarios;
  pendientesN = pend.length + usrPend.length;
  const hoy = new Date();

  const cardRenov = s => `<details class="exp"><summary><strong>Renovación: ${esc(s.nombre)}</strong><span>ID ${esc(s.numero_empleado)}</span></summary>
      <dl class="datos">${filaDato('Nombre', esc(s.nombre))}${filaDato('Número de empleado', esc(s.numero_empleado))}${filaDato('Área', esc(s.area))}${filaDato('Supervisor', esc(s.supervisor))}
      ${filaDato('Fecha de solicitud', fmtDateTime(s.fecha_solicitud))}${filaDato('Nueva vigencia solicitada', fmtDate(s.fecha_vigencia_solicitada))}</dl>
      <p class="nota">${esc(s.descripcion)}</p>
      <div class="acciones"><button class="btn primario" data-action="aprobarRen" data-id="${esc(s.id)}">Aprobar renovación</button>
      <button class="btn secundario" data-action="rechazarSol" data-id="${esc(s.id)}">Rechazar</button></div></details>`;

  const cardNueva = s => {
    let def = s.fecha_vigencia_solicitada ? toDate(s.fecha_vigencia_solicitada) : addDays(hoy, 60), max = '';
    if (s.fecha_vigencia_solicitada) { if (startOfDay(def) < startOfDay(hoy)) def = hoy; max = toInputDate(def); }
    return `<details class="exp"><summary><strong>${esc(s.nombre)}</strong><span>ID ${esc(s.numero_empleado)} · ${esc(s.tipo_uso)}</span></summary>
      <dl class="datos">${filaDato('Nombre', esc(s.nombre))}${filaDato('Número de empleado', esc(s.numero_empleado))}${filaDato('Área', esc(s.area))}${filaDato('Supervisor', esc(s.supervisor))}
      ${filaDato('Tipo de uso', esc(s.tipo_uso))}${filaDato('Fecha de solicitud', fmtDateTime(s.fecha_solicitud))}</dl>
      <p class="nota">${esc(s.descripcion)}</p>
      ${max ? '<p class="ayuda">Vigencia máxima permitida: 2 meses desde la fecha de solicitud.</p>' : ''}
      <label class="campo corto">Válido hasta ${campoFecha('vigencia', toInputDate(def), hoyInput(), max)}</label>
      <div class="acciones"><button class="btn primario" data-action="aprobarSol" data-id="${esc(s.id)}">Aprobar</button>
      <button class="btn secundario" data-action="rechazarSol" data-id="${esc(s.id)}">Rechazar</button></div></details>`;
  };

  const cardUsr = u => `<details class="exp"><summary><strong>${esc(u.nombre)}</strong><span>ID ${esc(u.id)}</span></summary>
      <dl class="datos">${filaDato('Área', esc(u.area || 'N/A'))}${filaDato('Supervisor', esc(u.supervisor || 'N/A'))}${filaDato('Tipo de uso', esc(u.tipo_uso || 'N/A'))}${filaDato('Registro', fmtDateTime(u.fecha_registro))}</dl>
      <label class="campo corto">Válido hasta ${campoFecha('vigencia', toInputDate(addDays(hoy, 365)), hoyInput())}</label>
      <div class="acciones"><button class="btn primario" data-action="aprobarUsr" data-id="${esc(u.id)}">Aprobar</button>
      <button class="btn secundario" data-action="denegarUsr" data-id="${esc(u.id)}">Denegar</button></div></details>`;

  return `<h2>Aprobar o denegar permisos</h2>
    <div class="metricas">${metrica('Solicitudes nuevas', nuevas.length)}${metrica('Renovaciones', renov.length)}${metrica('Usuarios pendientes', usrPend.length)}</div>
    ${!pend.length && !usrPend.length ? alerta('ok', 'No hay solicitudes ni permisos pendientes de aprobación.') : ''}
    ${renov.length ? `<h3>Solicitudes de renovación</h3>${renov.map(cardRenov).join('')}` : ''}
    ${nuevas.length ? `<h3>Solicitudes nuevas</h3>${nuevas.map(cardNueva).join('')}` : ''}
    ${usrPend.length ? `<h3>Usuarios registrados pendientes de aprobación</h3>${usrPend.map(cardUsr).join('')}` : ''}`;
};
const solPorId = id => cache.pend.find(s => s.id === id);
const fechaDe = el => el.closest('details').querySelector('input[type=date]');
const tras = (msg, tipo) => { toast(msg, tipo); return cargarTab(); };

acciones.aprobarSol = (el) => conBoton(el, 'Aprobando…', async () => {
  const inp = fechaDe(el), s = solPorId(el.dataset.id);
  if (!inp.value) return toast('Selecciona la fecha de vigencia', 'error');
  if (inp.max && inp.value > inp.max) return toast('La fecha supera la vigencia máxima permitida', 'error');
  try {
    const r = await D.aprobarSolicitudNueva(s, fromInputDate(inp.value), perfil.nombre);
    r.ok ? await tras(`Solicitud aprobada · válido hasta ${fmtDate(fromInputDate(inp.value))}`) : toast(r.msg, 'error');
  } catch (e) { console.error(e); toast('No se pudo aprobar la solicitud', 'error'); }
});
acciones.rechazarSol = (el) => conBoton(el, 'Rechazando…', async () => {
  try { await D.rechazarSolicitud(solPorId(el.dataset.id), perfil.nombre); await tras('Solicitud rechazada', 'aviso'); }
  catch (e) { console.error(e); toast('No se pudo rechazar la solicitud', 'error'); }
});
acciones.aprobarRen = (el) => conBoton(el, 'Aprobando…', async () => {
  try {
    const r = await D.aprobarRenovacion(solPorId(el.dataset.id), perfil.nombre);
    r.ok ? await tras(`Renovación aprobada · nueva vigencia hasta ${fmtDate(r.nueva)}`) : toast(r.msg, 'error');
  } catch (e) { console.error(e); toast('No se pudo aprobar la renovación', 'error'); }
});
acciones.aprobarUsr = (el) => conBoton(el, 'Aprobando…', async () => {
  const inp = fechaDe(el); if (!inp.value) return toast('Selecciona la fecha de vigencia', 'error');
  try { await D.aprobarUsuarioPendiente(el.dataset.id, fromInputDate(inp.value), perfil.nombre); await tras('Permiso aprobado'); }
  catch (e) { console.error(e); toast('No se pudo aprobar el permiso', 'error'); }
});
acciones.denegarUsr = (el) => conBoton(el, 'Denegando…', async () => {
  try { await D.denegarUsuario(el.dataset.id); await tras('Permiso denegado', 'aviso'); }
  catch (e) { console.error(e); toast('No se pudo denegar el permiso', 'error'); }
});

// =============== Historial ===============
function filasHistorial() {
  const q = filtros.q.toLowerCase(), desde = filtros.desde ? fromInputDate(filtros.desde) : null;
  return cache.solicitudes
    .filter(s => filtros.estado === 'Todas' || s.estado === filtros.estado.toLowerCase())
    .filter(s => !desde || (toDate(s.fecha_solicitud) && startOfDay(toDate(s.fecha_solicitud)) >= desde))
    .filter(s => !q || [s.nombre, s.numero_empleado, s.id].some(v => String(v).toLowerCase().includes(q)))
    .sort((a, b) => (toDate(b.fecha_solicitud) || 0) - (toDate(a.fecha_solicitud) || 0));
}
function listaHistorial() {
  const filas = filasHistorial();
  if (!filas.length) return alerta('aviso', 'No se encontraron solicitudes con los filtros aplicados.');
  const hoy = startOfDay(new Date());
  return `<p class="ayuda">Mostrando ${Math.min(filas.length, limiteHist)} de ${filas.length} solicitudes.</p>
  <div class="tabla-exp"><div class="cab"><span>Fecha</span><span>Nombre</span><span>Empleado</span><span>Área</span><span>Estado</span></div>
  ${filas.slice(0, limiteHist).map(s => {
    const rechSis = s.estado === 'rechazada' && (s.procesado_por || '').toLowerCase() === 'sistema';
    const limite = addDays(startOfDay(toDate(s.fecha_solicitud) || new Date()), 60);
    return `<details class="exp fila"><summary><span>${fmtDateTime(s.fecha_solicitud)}</span><strong>${esc(s.nombre)}</strong><span>${esc(s.numero_empleado)}</span><span>${esc(s.area)}</span>${chipEstado(s.estado)}</summary>
      <dl class="datos">${filaDato('ID solicitud', esc(s.id))}${filaDato('Tipo', esc(s.tipo_solicitud || 'nueva'))}${filaDato('Supervisor', esc(s.supervisor))}${filaDato('Tipo de uso', esc(s.tipo_uso))}
      ${filaDato('Procesada', fmtDateTime(s.fecha_proceso))}${filaDato('Procesada por', esc(s.procesado_por || '-'))}</dl>
      <p class="nota">${esc(s.descripcion)}</p>
      ${s.comentarios ? `<p class="ayuda">${esc(s.comentarios)}</p>` : ''}
      ${rechSis ? (limite >= hoy ? `<div class="bloque interno">${alerta('aviso', 'Esta solicitud fue rechazada automáticamente. Un administrador puede aprobarla de forma excepcional.')}
        <label class="campo corto">Válido hasta ${campoFecha('vigencia', toInputDate(limite), hoyInput(), toInputDate(limite))}</label>
        <button class="btn primario" data-action="aprobarExcepcion" data-id="${esc(s.id)}">Aprobar de forma excepcional</button></div>`
        : alerta('error', 'Esta solicitud superó el periodo máximo de vigencia (60 días). El empleado debe enviar una nueva solicitud.')) : ''}
      </details>`; }).join('')}</div>
  ${filas.length > limiteHist ? '<button class="btn secundario" data-action="masHist">Mostrar más</button>' : ''}`;
}
VISTAS.historial = async () => {
  const [sol, elim] = await Promise.all([D.getSolicitudes(), D.getEliminados()]);
  cache.solicitudes = sol; cache.eliminados = elim; limiteHist = 50;
  const c = e => sol.filter(s => s.estado === e).length;
  const opt = v => `<option ${filtros.estado === v ? 'selected' : ''}>${v}</option>`;
  elim.sort((a, b) => (toDate(b.fecha_eliminacion) || 0) - (toDate(a.fecha_eliminacion) || 0));
  return `<h2>Historial de solicitudes</h2>
  <div class="metricas">${metrica('Total', sol.length)}${metrica('Pendientes', c('pendiente'))}${metrica('Aprobadas', c('aprobada'))}${metrica('Rechazadas', c('rechazada'))}</div>
  <div class="filtros">
    <label class="campo">Estado<select data-change="filtroHist" name="estado">${['Todas', 'Pendiente', 'Aprobada', 'Rechazada'].map(opt).join('')}</select></label>
    <label class="campo">Desde<input type="date" name="desde" value="${filtros.desde}" data-change="filtroHist"></label>
    <label class="campo">Buscar<input type="search" name="q" value="${esc(filtros.q)}" placeholder="Nombre, número o ID" data-change="filtroHist"></label>
    <button class="btn secundario" data-action="csvHist">Exportar CSV</button>
  </div>
  <div id="hist-lista">${listaHistorial()}</div>
  <h2 class="separado">Usuarios eliminados automáticamente</h2>
  ${elim.length ? `<div class="acciones"><p class="ayuda">${elim.length} usuario(s) eliminados del sistema.</p><button class="btn secundario" data-action="csvElim">Exportar CSV</button></div>
  <div class="tabla-wrap"><table><thead><tr><th>ID</th><th>Nombre</th><th>Área</th><th>Vigencia vencida</th><th>Motivo</th><th>Eliminado</th></tr></thead><tbody>
  ${elim.map(u => `<tr><td>${esc(u.usuario_id)}</td><td>${esc(u.nombre)}</td><td>${esc(u.area || 'N/A')}</td><td>${fmtDate(u.fecha_vigencia)}</td><td>${esc(u.motivo_eliminacion)}</td><td>${fmtDateTime(u.fecha_eliminacion)}</td></tr>`).join('')}</tbody></table></div>`
    : alerta('ok', 'No hay usuarios eliminados del sistema.')}`;
};
cambios.filtroHist = (el) => {
  filtros[el.name] = el.value; limiteHist = 50;
  const l = $('#hist-lista'); if (l) l.innerHTML = listaHistorial();
};
acciones.masHist = () => { limiteHist += 50; $('#hist-lista').innerHTML = listaHistorial(); };
acciones.csvHist = () => descargarCSV(`historial_solicitudes_${sello()}.csv`, filasHistorial().map(s => ({
  'ID Solicitud': s.id, 'Fecha Solicitud': fmtDateTime(s.fecha_solicitud), Nombre: s.nombre, 'Número de empleado': s.numero_empleado,
  'Área': s.area, Supervisor: s.supervisor, 'Tipo de uso': s.tipo_uso, Estado: s.estado, Procesado: fmtDateTime(s.fecha_proceso),
  'Procesado Por': s.procesado_por || '-', 'Descripción': s.descripcion })));
acciones.csvElim = () => descargarCSV(`usuarios_eliminados_${sello()}.csv`, cache.eliminados.map(u => ({
  'ID Usuario': u.usuario_id, Nombre: u.nombre, 'Área': u.area || 'N/A', Supervisor: u.supervisor || 'N/A',
  'Fecha Registro Original': fmtDate(u.fecha_registro_original), 'Vigencia Vencida': fmtDate(u.fecha_vigencia),
  Motivo: u.motivo_eliminacion, 'Fecha Eliminación': fmtDateTime(u.fecha_eliminacion), 'Eliminado Por': u.eliminado_por })));
acciones.aprobarExcepcion = (el) => conBoton(el, 'Aprobando…', async () => {
  const inp = el.closest('.bloque').querySelector('input[type=date]'), s = cache.solicitudes.find(x => x.id === el.dataset.id);
  if (!inp.value || inp.value > inp.max) return toast('La fecha supera la vigencia máxima permitida', 'error');
  try {
    const r = await D.aprobarRechazoSistema(s, fromInputDate(inp.value), perfil.nombre);
    r.ok ? await tras(`Solicitud aprobada de forma excepcional hasta ${fmtDate(fromInputDate(inp.value))}`) : toast(r.msg, 'error');
  } catch (e) { console.error(e); toast('No se pudo aprobar la solicitud', 'error'); }
});

// =============== Usuarios registrados ===============
function filasUsuarios() {
  return cache.usuarios.filter(u => filtroUsr === 'Todos' || (filtroUsr === 'Aprobado') === !!u.permiso_aprobado)
    .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
}
function tablaUsuarios() {
  const us = filasUsuarios();
  if (!us.length) return alerta('info', 'No hay usuarios con ese filtro.');
  return `<div class="tabla-wrap"><table><thead><tr><th>Empleado</th><th>Nombre</th><th>Área</th><th>Supervisor</th><th>Uso</th><th>Permiso</th><th>Válido hasta</th><th>Vigencia</th><th></th></tr></thead><tbody>
  ${us.map(u => { const [c, t] = vistaMin(u); return `<tr><td>${esc(u.id)}</td><td>${esc(u.nombre)}</td><td>${esc(u.area || 'N/A')}</td><td>${esc(u.supervisor || 'N/A')}</td><td>${esc(u.tipo_uso || 'N/A')}</td>
    <td>${u.permiso_aprobado ? '<span class="chip ok">Aprobado</span>' : '<span class="chip aviso">Pendiente</span>'}</td><td>${fmtDate(u.fecha_vigencia)}</td><td><span class="chip ${c}">${t}</span></td>
    <td><button class="btn chico secundario" data-action="editarUsr" data-id="${esc(u.id)}">Editar</button></td></tr>`; }).join('')}</tbody></table></div>`;
}
async function formEdicion() {
  const u = cache.usuarios.find(x => x.id === editandoId); if (!u) return '';
  const audit = (await D.getAuditoria(u.id).catch(() => [])).sort((a, b) => (toDate(b.editado_en) || 0) - (toDate(a.editado_en) || 0)).slice(0, 8);
  const vig = u.fecha_vigencia ? toDate(u.fecha_vigencia) : addDays(new Date(), 365);
  const est = ['activo', 'inactivo', 'expirado', 'denegado'].map(e => `<option ${u.estado === e ? 'selected' : ''}>${e}</option>`).join('');
  return `<form class="bloque destacado" id="edicion" data-form="editarUsr" data-id="${esc(u.id)}">
    <h3>Editando a ${esc(u.nombre)} (ID ${esc(u.id)})</h3>
    <div class="rejilla">
      <label class="campo">Nombre<input name="nombre" required maxlength="120" value="${esc(u.nombre)}"></label>
      <label class="campo">Área<input name="area" maxlength="80" value="${esc(u.area || '')}"></label>
      <label class="campo">Supervisor<input name="supervisor" maxlength="120" value="${esc(u.supervisor || '')}"></label>
      <label class="campo">Tipo de uso<select name="tipo_uso"><option ${u.tipo_uso === 'Personal' ? 'selected' : ''}>Personal</option><option ${u.tipo_uso === 'Trabajo' ? 'selected' : ''}>Trabajo</option></select></label>
      <label class="campo">Estado<select name="estado">${est}</select></label>
      <label class="campo">Válido hasta ${campoFecha('vigencia', toInputDate(startOfDay(vig) < startOfDay(new Date()) ? new Date() : vig), hoyInput())}</label>
    </div>
    <label class="check"><input type="checkbox" name="aprobado" ${u.permiso_aprobado ? 'checked' : ''}> Permiso aprobado</label>
    <label class="campo">Descripción<textarea name="descripcion" rows="2" maxlength="1500">${esc(u.descripcion || '')}</textarea></label>
    <div class="acciones">
      <button class="btn primario" type="submit">Guardar cambios</button>
      <button class="btn secundario" type="button" data-action="renovarUsr" data-id="${esc(u.id)}" title="Extiende la vigencia 2 meses desde hoy y reactiva el permiso">Renovar 2 meses</button>
      <button class="btn fantasma" type="button" data-action="cancelarEdicion">Cancelar</button>
      <button class="btn peligro" type="button" data-action="eliminarUsr" data-id="${esc(u.id)}">Eliminar usuario</button>
    </div>
    ${audit.length ? `<details class="exp"><summary>Últimos cambios</summary><ul class="lista-audit">${audit.map(a => `<li>${fmtDateTime(a.editado_en)} · <strong>${esc(a.campo)}</strong>: ${esc(a.valor_anterior)} → ${esc(a.valor_nuevo)} <em>(${esc(a.editado_por)})</em></li>`).join('')}</ul></details>` : ''}
  </form>`;
}
VISTAS.usuarios = async () => {
  cache.usuarios = await D.getUsuarios();
  const ed = editandoId ? await formEdicion() : '';
  const opt = v => `<option ${filtroUsr === v ? 'selected' : ''}>${v}</option>`;
  return `<h2>Usuarios registrados</h2>${ed}
    <div class="filtros"><label class="campo">Permiso<select data-change="filtroUsr">${['Todos', 'Aprobado', 'Pendiente'].map(opt).join('')}</select></label>
    <button class="btn secundario" data-action="csvUsr">Exportar CSV</button></div>
    <p class="ayuda">${cache.usuarios.length} usuarios en total.</p><div id="usr-tabla">${tablaUsuarios()}</div>`;
};
cambios.filtroUsr = el => { filtroUsr = el.value; $('#usr-tabla').innerHTML = tablaUsuarios(); };
acciones.csvUsr = () => descargarCSV(`usuarios_registrados_${sello()}.csv`, filasUsuarios().map(u => ({
  'Número de empleado': u.id, Nombre: u.nombre, 'Área': u.area || 'N/A', Supervisor: u.supervisor || 'N/A', 'Tipo de uso': u.tipo_uso || 'N/A',
  'Estado Permiso': u.permiso_aprobado ? 'Aprobado' : 'Pendiente', 'Válido hasta': fmtDate(u.fecha_vigencia), Vigencia: vistaMin(u)[1], 'Fecha Registro': fmtDateTime(u.fecha_registro) })));
acciones.editarUsr = async (el) => { editandoId = el.dataset.id; await cargarTab(); $('#edicion')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
acciones.cancelarEdicion = () => { editandoId = null; cargarTab(); };
formularios.editarUsr = async (form) => {
  const fd = new FormData(form), g = k => (fd.get(k) || '').toString().trim();
  await conBoton(form.querySelector('[type=submit]'), 'Guardando…', async () => {
    try {
      const r = await D.actualizarUsuarioCompleto(form.dataset.id, {
        nombre: g('nombre'), area: g('area'), supervisor: g('supervisor'), tipo_uso: g('tipo_uso'), estado: g('estado'),
        permiso_aprobado: form.elements.aprobado.checked, fecha_vigencia: fromInputDate(g('vigencia')), descripcion: g('descripcion')
      }, perfil.nombre);
      if (r.ok) { editandoId = null; await tras(r.msg); } else toast(r.msg, 'error');
    } catch (e) { console.error(e); toast('No se pudo guardar', 'error'); }
  });
};
acciones.renovarUsr = (el) => conBoton(el, 'Renovando…', async () => {
  const nueva = new Date(); nueva.setMonth(nueva.getMonth() + 2);
  try {
    const r = await D.actualizarUsuarioCompleto(el.dataset.id, { fecha_vigencia: nueva, permiso_aprobado: true, estado: 'activo' }, perfil.nombre);
    r.ok ? (editandoId = null, await tras(`Vigencia renovada hasta ${fmtDate(nueva)}`)) : toast(r.msg, 'error');
  } catch (e) { console.error(e); toast('No se pudo renovar', 'error'); }
});
acciones.eliminarUsr = (el) => {
  if (!confirm(`¿Eliminar definitivamente al usuario ${el.dataset.id}? Esta acción no se puede deshacer.`)) return;
  return conBoton(el, 'Eliminando…', async () => {
    try { await D.eliminarUsuario(el.dataset.id); editandoId = null; await tras('Usuario eliminado'); }
    catch (e) { console.error(e); toast('No se pudo eliminar', 'error'); }
  });
};

// =============== Estadísticas ===============
VISTAS.stats = async () => {
  const [us, sol] = await Promise.all([D.getUsuarios(), D.getSolicitudes()]);
  const c = e => sol.filter(s => s.estado === e).length;
  const aprob = us.filter(u => u.permiso_aprobado).length, pendU = us.length - aprob;
  const tasa = sol.length ? (c('aprobada') / sol.length) * 100 : 0;
  const areas = {}; us.forEach(u => { const a = u.area || 'Sin área'; areas[a] = (areas[a] || 0) + 1; });
  const areasOrd = Object.entries(areas).sort((a, b) => b[1] - a[1]);
  cache.stats = { 'Total Usuarios': us.length, 'Permisos Aprobados': aprob, 'Usuarios Pendientes': pendU, 'Total Solicitudes': sol.length,
    'Solicitudes Pendientes': c('pendiente'), 'Solicitudes Aprobadas': c('aprobada'), 'Solicitudes Rechazadas': c('rechazada'), 'Tasa de Aprobación': `${tasa.toFixed(1)}%` };
  if (!us.length && !sol.length) return `<h2>Estadísticas</h2>${alerta('info', 'Aún no hay datos para mostrar estadísticas.')}`;
  const recU = [...us].sort((a, b) => (toDate(b.fecha_registro) || 0) - (toDate(a.fecha_registro) || 0)).slice(0, 10);
  const recS = sol.filter(s => s.estado !== 'pendiente').sort((a, b) => (toDate(b.fecha_proceso) || 0) - (toDate(a.fecha_proceso) || 0)).slice(0, 10);
  return `<h2>Estadísticas</h2>
  <div class="metricas">${metrica('Usuarios', us.length)}${metrica('Permisos aprobados', aprob)}${metrica('Usuarios pendientes', pendU)}${metrica('Solicitudes', sol.length)}${metrica('Tasa de aprobación', tasa.toFixed(1) + '%')}${metrica('Áreas', Object.keys(areas).length)}</div>
  <div class="dos-col">
    <section class="bloque"><h3>Permisos de usuarios</h3>${barras([{ k: 'Aprobados', v: aprob }, { k: 'Pendientes', v: pendU }])}</section>
    <section class="bloque"><h3>Estado de solicitudes</h3>${barras([{ k: 'Pendientes', v: c('pendiente') }, { k: 'Aprobadas', v: c('aprobada') }, { k: 'Rechazadas', v: c('rechazada') }])}</section>
  </div>
  <section class="bloque"><h3>Usuarios por área</h3>${barras(areasOrd.slice(0, 12).map(([k, v]) => ({ k, v })))}</section>
  <div class="acciones"><button class="btn secundario" data-action="csvStats">Exportar estadísticas</button></div>
  <div class="dos-col">
    <section><h3>Últimos usuarios registrados</h3><div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Nombre</th><th>Área</th><th>Permiso</th></tr></thead><tbody>
      ${recU.map(u => `<tr><td>${fmtDateTime(u.fecha_registro)}</td><td>${esc(u.nombre)}</td><td>${esc(u.area || 'N/A')}</td><td>${u.permiso_aprobado ? 'Aprobado' : 'Pendiente'}</td></tr>`).join('')}</tbody></table></div></section>
    <section><h3>Últimas solicitudes procesadas</h3>${recS.length ? `<div class="tabla-wrap"><table><thead><tr><th>Fecha</th><th>Nombre</th><th>Estado</th><th>Por</th></tr></thead><tbody>
      ${recS.map(s => `<tr><td>${fmtDateTime(s.fecha_proceso)}</td><td>${esc(s.nombre)}</td><td>${chipEstado(s.estado)}</td><td>${esc(s.procesado_por || 'N/A')}</td></tr>`).join('')}</tbody></table></div>` : alerta('info', 'Aún no hay solicitudes procesadas.')}</section>
  </div>`;
};
acciones.csvStats = () => descargarCSV(`estadisticas_sistema_${sello()}.csv`, [cache.stats]);

// =============== Gestión de administradores ===============
VISTAS.admins = async () => {
  if (perfil.rol !== 'superadmin') return alerta('error', 'No tienes permisos para acceder a esta sección.');
  const admins = cache.admins = (await D.getAdmins()).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
  const otros = admins.filter(a => a.id !== perfil.uid);
  const opts = otros.map(a => `<option value="${esc(a.id)}">${esc(a.nombre)} (${esc(a.usuario)})</option>`).join('');
  return `<h2>Administradores</h2>
  <form class="bloque" data-form="nuevoAdmin"><h3>Crear administrador</h3>
    <div class="rejilla">
      <label class="campo">Nombre completo<input name="nombre" required maxlength="120"></label>
      <label class="campo">Usuario<input name="usuario" required pattern="[A-Za-z0-9._\-]{3,30}" minlength="3" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" title="3 a 30 caracteres: letras, números, punto, guion o guion bajo"></label>
      <label class="campo">Contraseña<input type="password" name="password" required minlength="6" autocomplete="new-password"></label>
      <label class="campo">Confirmar contraseña<input type="password" name="password2" required minlength="6" autocomplete="new-password"></label>
      <label class="campo">Rol<select name="rol"><option value="admin">Administrador</option><option value="superadmin">Superadministrador</option></select></label>
    </div>
    <button class="btn primario" type="submit">Crear administrador</button>
  </form>
  <div class="acciones"><p class="ayuda">${admins.length} administradores.</p><button class="btn secundario" data-action="csvAdmins">Exportar CSV</button></div>
  <div class="tabla-wrap"><table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Creación</th><th>Creado por</th></tr></thead><tbody>
  ${admins.map(a => `<tr><td>${esc(a.nombre)}</td><td>${esc(a.usuario)}</td><td>${ROL[a.rol] || esc(a.rol)}</td><td>${a.activo ? '<span class="chip ok">Activo</span>' : '<span class="chip error">Inactivo</span>'}</td><td>${fmtDateTime(a.fecha_creacion)}</td><td>${esc(a.creado_por || 'Sistema')}</td></tr>`).join('')}</tbody></table></div>
  ${otros.length ? `<div class="dos-col">
    <form class="bloque" data-form="toggleAdmin"><h3>Activar o desactivar</h3><label class="campo">Administrador<select name="uid">${opts}</select></label><button class="btn secundario" type="submit">Cambiar estado</button></form>
    <div class="bloque"><h3>¿Olvidó su contraseña?</h3><p class="ayuda">Desactívalo y crea una cuenta nueva con otro usuario. Para reutilizar el mismo usuario, elimina primero su cuenta en Firebase → Authentication.</p></div>
  </div>` : ''}
  <div class="dos-col roles"><div class="bloque"><h3>Superadministrador</h3><p>Acceso completo: registrar y editar usuarios, aprobar solicitudes, ver historial y estadísticas, y gestionar administradores.</p></div>
  <div class="bloque"><h3>Administrador</h3><p>Aprobar o rechazar solicitudes, ver historial y estadísticas. No registra usuarios ni gestiona administradores.</p></div></div>`;
};
const ERR_AUTH = { 'auth/email-already-in-use': 'Ese usuario ya existe.', 'auth/invalid-email': 'El usuario no es válido.', 'auth/invalid-credential': 'La contraseña actual es incorrecta.', 'auth/wrong-password': 'La contraseña actual es incorrecta.', 'auth/requires-recent-login': 'Vuelve a iniciar sesión e inténtalo de nuevo.', 'auth/weak-password': 'La contraseña es demasiado débil (mínimo 6 caracteres).' };
formularios.nuevoAdmin = async (form) => {
  const fd = new FormData(form), g = k => (fd.get(k) || '').toString();
  if (g('password') !== g('password2')) return toast('Las contraseñas no coinciden', 'error');
  if (!D.USUARIO_OK.test(D.normUsuario(g('usuario')))) return toast('Usuario no válido: 3 a 30 caracteres (letras, números, . _ -)', 'error');
  await conBoton(form.querySelector('[type=submit]'), 'Creando…', async () => {
    try {
      await D.crearAdmin({ usuario: g('usuario'), password: g('password'), nombre: g('nombre').trim(), rol: g('rol') }, perfil.nombre);
      await tras(`Administrador ${g('nombre').trim()} creado`);
    } catch (e) { console.error(e); toast(ERR_AUTH[e.code] || 'No se pudo crear el administrador', 'error'); }
  });
};
formularios.toggleAdmin = async (form) => {
  const a = cache.admins.find(x => x.id === new FormData(form).get('uid')); if (!a) return;
  try { await D.setAdminActivo(a.id, !a.activo); await tras(`${a.nombre} ${a.activo ? 'desactivado' : 'activado'}`); }
  catch (e) { console.error(e); toast('No se pudo cambiar el estado', 'error'); }
};
// =============== Mi contraseña ===============
VISTAS.cuenta = async () => `<h2>Mi contraseña</h2>
  <form class="bloque" data-form="cambiarPass" style="max-width:420px">
    <p class="ayuda">Sesión de <strong>${esc(perfil.usuario || perfil.nombre)}</strong>.</p>
    <label class="campo">Contraseña actual<input type="password" name="actual" required autocomplete="current-password"></label>
    <label class="campo">Contraseña nueva<input type="password" name="nueva" required minlength="6" autocomplete="new-password"></label>
    <label class="campo">Confirmar contraseña nueva<input type="password" name="nueva2" required minlength="6" autocomplete="new-password"></label>
    <button class="btn primario" type="submit">Cambiar contraseña</button>
  </form>`;
formularios.cambiarPass = async (form) => {
  const fd = new FormData(form), g = k => (fd.get(k) || '').toString();
  if (g('nueva') !== g('nueva2')) return toast('Las contraseñas nuevas no coinciden', 'error');
  await conBoton(form.querySelector('[type=submit]'), 'Guardando…', async () => {
    try { await D.cambiarMiPassword(g('actual'), g('nueva')); form.reset(); toast('Contraseña actualizada'); }
    catch (e) { console.error(e); toast(ERR_AUTH[e.code] || 'No se pudo cambiar la contraseña', 'error'); }
  });
};
acciones.csvAdmins = () => descargarCSV(`administradores_${sello()}.csv`, cache.admins.map(a => ({
  Nombre: a.nombre, Usuario: a.usuario, Rol: ROL[a.rol] || a.rol, Estado: a.activo ? 'Activo' : 'Inactivo', 'Fecha Creación': fmtDateTime(a.fecha_creacion), 'Creado Por': a.creado_por || 'Sistema' })));
