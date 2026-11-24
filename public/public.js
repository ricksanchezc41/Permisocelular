// Vista del empleado: consultar permiso, solicitar uno nuevo (encuesta), descargar PDF y renovar.
import * as D from './data.js';
import { descargarPDF } from './pdf.js';
import { $, esc, alerta, fmtDate, toDate, startOfDay, diasEntre, conBoton, acciones, formularios, cambios } from './util.js';

const ID_OK = /^[A-Za-z0-9_-]{1,30}$/;
let usuarioActual = null;
const salida = () => $('#resultado');

export function renderPublic(root) {
  usuarioActual = null;
  root.innerHTML = `
  <section class="publico">
    <div class="intro">
      <h1>Permiso de uso de celular</h1>
      <p>Escribe tu número de empleado para ver el estado de tu permiso, descargarlo o solicitar uno nuevo.</p>
    </div>
    <form class="consulta" data-form="consulta" novalidate>
      <label for="empleado">Número de empleado</label>
      <div class="fila-id">
        <input id="empleado" name="empleado" autocomplete="off" placeholder="Ej: 12345678" maxlength="30" required>
        <button class="btn primario" type="submit">Verificar</button>
      </div>
      <p class="ayuda">Solo letras y números, sin puntos ni espacios.</p>
    </form>
    <div id="resultado" aria-live="polite"></div>
  </section>`;
  $('#empleado').focus();
}

formularios.consulta = async (form) => {
  const id = String(new FormData(form).get('empleado') || '').trim();
  if (!ID_OK.test(id)) { salida().innerHTML = alerta('error', 'Ingresa un número de empleado válido (solo letras, números, guion o guion bajo).'); return; }
  await conBoton(form.querySelector('button'), 'Buscando…', () => consultar(id));
};

async function consultar(id) {
  const out = salida();
  try {
    let u = await D.getUsuario(id);
    if (!u) { out.innerHTML = await vistaNoRegistrado(id); return; }
    const hoy = startOfDay(new Date()), vig = toDate(u.fecha_vigencia);
    const vencido = !!vig && startOfDay(vig) < hoy;
    try {
      if (vencido && (u.permiso_aprobado || u.estado !== 'expirado')) {
        await D.marcarExpirado(u.id); u = { ...u, permiso_aprobado: false, estado: 'expirado' };
      } else if (!vencido && u.estado === 'expirado' && u.permiso_aprobado) {
        await D.normalizarEstado(u.id); u = { ...u, estado: 'activo' };
      }
    } catch (e) { console.warn(e); if (vencido) u = { ...u, permiso_aprobado: false, estado: 'expirado' }; }
    usuarioActual = u;
    out.innerHTML = vistaUsuario(u, vencido);
  } catch (e) {
    console.error(e);
    out.innerHTML = alerta('error', 'No se pudo consultar la información. Revisa tu conexión e inténtalo de nuevo.');
  }
}

const datos = u => `
  <dl class="datos">
    <div><dt>Nombre</dt><dd>${esc(u.nombre)}</dd></div>
    <div><dt>Número de empleado</dt><dd>${esc(u.id)}</dd></div>
    <div><dt>Área</dt><dd>${esc(u.area || 'N/A')}</dd></div>
    <div><dt>Supervisor</dt><dd>${esc(u.supervisor || 'N/A')}</dd></div>
    <div><dt>Tipo de uso</dt><dd>${esc(u.tipo_uso || 'N/A')}</dd></div>
    <div><dt>Estado</dt><dd>${esc(u.estado || 'activo')}</dd></div>
  </dl>`;

function seccionRenovacion(u) {
  const cuerpo = u.renovacion_pendiente
    ? alerta('aviso', 'Ya tienes una solicitud de renovación pendiente de aprobación.')
    : `${alerta('info', 'Puedes solicitar la renovación de tu permiso. La nueva vigencia será de 2 meses a partir de hoy.')}
       <button class="btn secundario" data-action="renovar">Solicitar renovación</button>`;
  return `<section class="bloque"><h2>Renovar permiso</h2>${cuerpo}</section>`;
}

function vistaUsuario(u, vencido) {
  if (vencido || u.estado === 'expirado') {
    return `<section class="bloque">${datos(u)}
      ${alerta('error', `Tu permiso de celular venció el ${fmtDate(u.fecha_vigencia)}.`, 'Permiso expirado.')}
      ${alerta('aviso', 'Ya no puedes descargar el documento PDF. Para seguir usando tu celular debes solicitar una renovación. Los permisos vencidos hace más de 30 días sin renovación pendiente se eliminan automáticamente del sistema.')}
    </section>${seccionRenovacion(u)}`;
  }
  if (u.permiso_aprobado) {
    const dias = u.fecha_vigencia ? diasEntre(toDate(u.fecha_vigencia), new Date()) : null;
    const vigencia = dias == null ? '' : `<div class="vigencia ${dias > 30 ? 'ok' : 'aviso'}">
        <span>Válido hasta <strong>${fmtDate(u.fecha_vigencia)}</strong></span>
        <span class="chip ${dias > 30 ? 'ok' : 'aviso'}">${dias === 0 ? 'Vence hoy' : `${dias} ${dias === 1 ? 'día restante' : 'días restantes'}`}</span>
      </div>`;
    return `<article class="permiso">
        <header><img src="logo_ferrara.png" alt="Ferrara Candy Company"><div><h2>Permiso de uso de celular</h2><p>Permiso aprobado</p></div></header>
        ${datos(u)}${vigencia}
        <button class="btn primario ancho" data-action="pdf">Descargar permiso en PDF</button>
      </article>${seccionRenovacion(u)}`;
  }
  const denegado = u.estado === 'denegado';
  return `<section class="bloque">${datos(u)}${denegado
    ? alerta('error', 'Tu permiso fue denegado. Si tienes dudas, contacta al departamento de calidad.')
    : alerta('aviso', 'Tu permiso está pendiente de aprobación por un administrador. Vuelve a verificar tu número más tarde para ver si ya fue aprobado.')}</section>`;
}

async function vistaNoRegistrado(id) {
  const intro = alerta('info', 'Ese número de empleado no está registrado en el sistema.');
  if (await D.tieneSolicitudReciente(id))
    return `${intro}${alerta('aviso', 'Usted ya ha enviado una solicitud para aprobación de celular, en caso de no haber sido autorizada aun contacte al departamento de calidad.')}`;
  const si_no = (n, texto, extra = '') => `
    <fieldset class="pregunta" ${extra}><legend>${n}. ${texto}</legend>
      <label class="opcion"><input type="radio" name="q${n}" value="Si"${n === 1 ? ' data-change="q1"' : ''}> Sí</label>
      <label class="opcion"><input type="radio" name="q${n}" value="No"${n === 1 ? ' data-change="q1"' : ''}> No</label>
    </fieldset>`;
  return `${intro}
  <form class="bloque" data-form="solicitud" data-id="${esc(id)}">
    <h2>Solicitar permiso</h2>
    <p class="ayuda">Completa tus datos y la encuesta. Todos los campos son obligatorios.</p>
    <div class="rejilla">
      <label class="campo">Nombre<input name="nombre" required maxlength="120" placeholder="Ej: Juan Pérez García"></label>
      <label class="campo">Número de empleado<input value="${esc(id)}" disabled></label>
      <label class="campo">Área<input name="area" required maxlength="80" placeholder="Ej: Tecnología"></label>
      <label class="campo">Supervisor<input name="supervisor" required maxlength="120" placeholder="Ej: María González"></label>
      <label class="campo">Tipo de uso<select name="tipo_uso"><option>Personal</option><option>Trabajo</option></select></label>
    </div>
    <label class="campo">Descripción de uso
      <textarea name="descripcion" required maxlength="1500" rows="3" placeholder="Describa brevemente el uso que le dará al celular"></textarea>
    </label>
    <h3>Encuesta obligatoria</h3>
    ${si_no(1, '¿Usted forma parte de una compañía externa a Ferrara Linares?')}
    <div id="preguntas-extra" hidden>
      <p class="ayuda">Las siguientes preguntas son obligatorias.</p>
      ${si_no(2, '¿El uso del equipo de celular puede ser sustituido por el uso de tableta o computadora proporcionado por la compañía?')}
      ${si_no(3, '¿Ha revisado con su supervisor si usted en realidad requiere el uso de teléfono celular para sus funciones?')}
      ${si_no(4, '¿El uso que dará al equipo de celular implica actividades de urgencia para la compañía o temas importantes que no puedan ser revisados de manera presencial o haciendo uso de la tableta o computadora proporcionados por la compañía?')}
      ${si_no(5, 'Bajo el entendimiento de que el uso de celular no autorizado por su supervisor implica acciones disciplinarias (suspensión de 3 días) y de que el uso de celular no debe cubrir o sustituir actividades que debe realizar su supervisor, ¿acepta las condiciones e implicaciones del uso de celular de acuerdo con las políticas y el reglamento internos de trabajo?')}
    </div>
    <div id="msg-form" aria-live="polite"></div>
    <button class="btn primario ancho" type="submit">Enviar solicitud</button>
  </form>`;
}

cambios.q1 = (el) => {
  const form = el.closest('form');
  form.querySelector('#preguntas-extra').hidden = form.elements.q1.value !== 'No';
};

formularios.solicitud = async (form) => {
  const fd = new FormData(form), g = k => (fd.get(k) ?? '').toString().trim();
  const msg = t => { form.querySelector('#msg-form').innerHTML = alerta('error', t); };
  const f = { id: form.dataset.id, nombre: g('nombre'), area: g('area'), supervisor: g('supervisor'), tipo_uso: g('tipo_uso'),
    descripcion: g('descripcion'), q1: g('q1'), q2: g('q2'), q3: g('q3'), q4: g('q4'), q5: g('q5') };
  if (!(f.nombre && f.area && f.supervisor && f.descripcion)) return msg('Por favor completa todos los campos obligatorios.');
  if (!f.q1) return msg('Por favor responde la pregunta 1 de la encuesta.');
  if (f.q1 === 'No' && !(f.q2 && f.q3 && f.q4 && f.q5)) return msg('Por favor responde todas las preguntas de la encuesta (2 a 5).');
  await conBoton(form.querySelector('[type=submit]'), 'Enviando…', async () => {
    try {
      if (await D.tieneSolicitudReciente(f.id)) return msg('Usted ya ha enviado una solicitud para aprobación de celular, en caso de no haber sido autorizada aun contacte al departamento de calidad.');
      const r = await D.enviarSolicitud(f);
      const nueva = `<button class="btn secundario" data-action="nuevaConsulta">Consultar otro número</button>`;
      if (r.tipo === 'rechazada') {
        salida().innerHTML = alerta('error', `${esc(D.RECHAZO_TEXTO)}<br><br>La solicitud pudo haber sido rechazada por los siguientes motivos:<ol><li>No rellenó el formulario adecuadamente</li><li>Sus funciones no requieren el uso de teléfono celular</li><li>Usted tiene antecedente de mal uso de equipos móviles</li></ol>`) + nueva;
      } else if (r.tipo === 'pendiente') {
        salida().innerHTML = alerta('ok', `ID de solicitud: <strong>${esc(r.id)}</strong>. Un administrador la revisará; vuelve a verificar tu número más tarde para conocer el resultado.`, 'Solicitud enviada.') + nueva;
      } else {
        salida().innerHTML = alerta('ok', `Válido hasta el ${fmtDate(r.vigencia)}.`, 'Permiso otorgado automáticamente.') +
          `<button class="btn primario" data-action="verPermiso" data-id="${esc(f.id)}">Ver y descargar mi permiso</button>`;
      }
    } catch (e) {
      console.error(e); msg('No se pudo enviar la solicitud. Revisa tu conexión e inténtalo de nuevo.');
    }
  });
};

acciones.nuevaConsulta = () => { const i = $('#empleado'); i.value = ''; salida().innerHTML = ''; i.focus(); };
acciones.verPermiso = (el) => conBoton(el, 'Cargando…', () => consultar(el.dataset.id));
acciones.pdf = (el) => conBoton(el, 'Generando PDF…', async () => {
  try { await descargarPDF(usuarioActual); }
  catch (e) { console.error(e); salida().insertAdjacentHTML('afterbegin', alerta('error', 'No se pudo generar el PDF. Contacta al administrador.')); }
});
acciones.renovar = (el) => conBoton(el, 'Enviando…', async () => {
  try {
    const id = await D.solicitarRenovacion(usuarioActual);
    usuarioActual = { ...usuarioActual, renovacion_pendiente: true };
    el.closest('.bloque').innerHTML = `<h2>Renovar permiso</h2>${alerta('ok', `ID: <strong>${esc(id)}</strong>. Un administrador revisará tu solicitud.`, 'Solicitud de renovación enviada.')}`;
  } catch (e) { console.error(e); el.insertAdjacentHTML('beforebegin', alerta('error', 'No se pudo enviar la renovación. Inténtalo de nuevo.')); }
});
