// Lógica de datos (equivale a database.py). Colecciones de Firestore:
// usuarios, solicitudes, administradores, usuarios_eliminados, usuario_audits, bloqueos, config
import * as F from './firebase.js';
import { toDate, addDays, addMonths, endOfDay, toInputDate, nuevoId } from './util.js';

const { db } = F;
const R = (col, id) => F.doc(db, col, id);
const TS = () => F.serverTimestamp();
const ts = d => F.Timestamp.fromDate(d);
const todos = async (col, ...cond) =>
  (await F.getDocs(cond.length ? F.query(F.collection(db, col), ...cond) : F.collection(db, col)))
    .docs.map(d => ({ id: d.id, ...d.data() }));

// ---------- Lecturas ----------
export const getUsuario = async id => { const s = await F.getDoc(R('usuarios', id)); return s.exists() ? { id: s.id, ...s.data() } : null; };
export const getUsuarios = () => todos('usuarios');
export const getSolicitudes = () => todos('solicitudes');
export const getSolicitudesPendientes = () => todos('solicitudes', F.where('estado', '==', 'pendiente'));
export const getEliminados = () => todos('usuarios_eliminados');
export const getAdmins = () => todos('administradores');
export const getAuditoria = id => todos('usuario_audits', F.where('usuario_id', '==', id));

// Reemplaza tiene_solicitud_reciente: un documento "bloqueo" por empleado (se crea al
// enviar una solicitud pendiente/rechazada) evita exponer la lista completa de solicitudes.
export async function tieneSolicitudReciente(id, dias = 30) {
  const s = await F.getDoc(R('bloqueos', id));
  return s.exists() && toDate(s.data().fecha) >= addDays(new Date(), -dias);
}

// ---------- Flujo público (empleado sin sesión) ----------
export const marcarExpirado = id => F.updateDoc(R('usuarios', id),
  { permiso_aprobado: false, estado: 'expirado', last_modified: TS(), modified_by: 'sistema (expiración automática)' });
export const normalizarEstado = id => F.updateDoc(R('usuarios', id),
  { estado: 'activo', last_modified: TS(), modified_by: 'sistema (normalización de estado)' });

export const RECHAZO_TEXTO = 'La solicitud de permiso de celular ha sido denegada, por favor revise este tema con su supervisor y consulte las políticas internas de la compañía.';

// Evalúa la encuesta y registra el resultado. Devuelve { tipo: 'rechazada'|'pendiente'|'aprobada', id, vigencia }
export async function enviarSolicitud(f) {
  const ahora = new Date();
  const id = nuevoId('SOL', ahora);
  const resumen = `Encuesta: 1=${f.q1}` + (f.q1 === 'No' ? `, 2=${f.q2}, 3=${f.q3}, 4=${f.q4}, 5=${f.q5}` : '');
  const encuestaOk = f.q1 === 'Si' || (f.q2 === 'No' && f.q3 === 'Si' && f.q4 === 'Si' && f.q5 === 'Si');
  const vigencia = endOfDay(addMonths(ahora, 2));
  const base = {
    numero_empleado: f.id, nombre: f.nombre, area: f.area, supervisor: f.supervisor, tipo_uso: f.tipo_uso,
    descripcion: `${f.descripcion}\n\n${resumen}`, fecha_solicitud: TS(), tipo_solicitud: 'nueva'
  };
  const b = F.writeBatch(db);
  let tipo;
  if (!encuestaOk) {
    tipo = 'rechazada';
    b.set(R('solicitudes', id), { ...base, estado: 'rechazada', fecha_proceso: TS(), procesado_por: 'sistema', comentarios: 'Rechazo automático por respuestas de la encuesta' });
    b.set(R('bloqueos', f.id), { fecha: TS(), solicitud_id: id });
  } else if (f.tipo_uso === 'Personal') {
    tipo = 'pendiente'; // requiere aprobación manual; vigencia máxima 2 meses
    b.set(R('solicitudes', id), { ...base, estado: 'pendiente', fecha_vigencia_solicitada: ts(vigencia) });
    b.set(R('bloqueos', f.id), { fecha: TS(), solicitud_id: id });
  } else {
    tipo = 'aprobada'; // encuesta correcta + uso de trabajo: aprobación automática
    b.set(R('usuarios', f.id), {
      nombre: f.nombre, area: f.area, supervisor: f.supervisor, tipo_uso: f.tipo_uso, descripcion: f.descripcion,
      permiso_aprobado: true, estado: 'activo', fecha_registro: TS(), fecha_aprobacion: TS(),
      fecha_vigencia: ts(vigencia), aprobado_por: 'sistema (encuesta aprobada)', renovacion_pendiente: false
    });
    b.set(R('solicitudes', id), { ...base, estado: 'aprobada', fecha_proceso: TS(), procesado_por: 'sistema', comentarios: 'Aprobación automática por encuesta correcta (vigencia 2 meses)' });
  }
  await b.commit();
  return { tipo, id, vigencia };
}

export async function solicitarRenovacion(u) {
  const ahora = new Date(), id = nuevoId('REN', ahora), nueva = endOfDay(addMonths(ahora, 2));
  const b = F.writeBatch(db);
  b.set(R('solicitudes', id), {
    numero_empleado: u.id, nombre: u.nombre, area: u.area || '', supervisor: u.supervisor || '', tipo_uso: u.tipo_uso || 'Personal',
    descripcion: `Solicitud de renovación de permiso. Nueva vigencia solicitada: ${nueva.toLocaleDateString('es-MX')}`,
    estado: 'pendiente', fecha_solicitud: TS(), tipo_solicitud: 'renovacion', fecha_vigencia_solicitada: ts(nueva)
  });
  b.update(R('usuarios', u.id), { renovacion_pendiente: true });
  await b.commit();
  return id;
}

// ---------- Administración: usuarios y solicitudes ----------
export async function registrarUsuario(d, admin) {
  if (await getUsuario(d.id)) return { ok: false, msg: 'Ya existe un usuario con este número de empleado' };
  await F.setDoc(R('usuarios', d.id), {
    nombre: d.nombre, area: d.area, supervisor: d.supervisor, tipo_uso: d.tipo_uso,
    permiso_aprobado: d.aprobar, estado: 'activo', fecha_registro: TS(),
    fecha_aprobacion: d.aprobar ? TS() : null, fecha_vigencia: d.aprobar ? ts(endOfDay(d.vigencia)) : null,
    aprobado_por: d.aprobar ? admin : null, renovacion_pendiente: false
  });
  return { ok: true };
}

export async function aprobarSolicitudNueva(s, fecha, admin) {
  if (await getUsuario(s.numero_empleado)) return { ok: false, msg: 'Ya existe un usuario con este número de empleado' };
  const b = F.writeBatch(db);
  b.set(R('usuarios', s.numero_empleado), {
    nombre: s.nombre, area: s.area, supervisor: s.supervisor, tipo_uso: s.tipo_uso, descripcion: s.descripcion,
    permiso_aprobado: true, estado: 'activo', fecha_registro: TS(), fecha_aprobacion: TS(),
    fecha_vigencia: ts(endOfDay(fecha)), aprobado_por: admin, renovacion_pendiente: false
  });
  b.update(R('solicitudes', s.id), { estado: 'aprobada', procesado_por: admin, fecha_proceso: TS() });
  b.delete(R('bloqueos', s.numero_empleado));
  await b.commit();
  return { ok: true };
}

export async function rechazarSolicitud(s, admin) {
  const b = F.writeBatch(db);
  b.update(R('solicitudes', s.id), { estado: 'rechazada', procesado_por: admin, fecha_proceso: TS() });
  if (s.tipo_solicitud === 'renovacion') b.update(R('usuarios', s.numero_empleado), { renovacion_pendiente: false });
  await b.commit();
}

export async function aprobarRenovacion(s, admin) {
  const u = await getUsuario(s.numero_empleado);
  if (!u) return { ok: false, msg: 'Usuario no encontrado en el sistema' };
  const nueva = toDate(s.fecha_vigencia_solicitada) || endOfDay(addMonths(new Date(), 2));
  const r = await actualizarUsuarioCompleto(u.id,
    { fecha_vigencia: nueva, permiso_aprobado: true, estado: 'activo' }, admin,
    { campos: { renovacion_pendiente: false },
      ops: b => b.update(R('solicitudes', s.id), { estado: 'aprobada', procesado_por: admin, fecha_proceso: TS() }) });
  return { ...r, nueva };
}

export const aprobarUsuarioPendiente = (id, fecha, admin) => F.updateDoc(R('usuarios', id), {
  permiso_aprobado: true, estado: 'activo', fecha_aprobacion: TS(), fecha_vigencia: ts(endOfDay(fecha)), aprobado_por: admin
});
export const denegarUsuario = id => F.updateDoc(R('usuarios', id), { permiso_aprobado: false, estado: 'denegado' });
export const eliminarUsuario = id => F.deleteDoc(R('usuarios', id));

// Aprobación excepcional de una solicitud rechazada automáticamente por el sistema.
export async function aprobarRechazoSistema(s, fecha, admin) {
  if (s.estado !== 'rechazada' || (s.procesado_por || '').toLowerCase() !== 'sistema')
    return { ok: false, msg: 'La solicitud ya no está disponible para aprobación excepcional' };
  const b = F.writeBatch(db);
  const datos = { nombre: s.nombre, area: s.area, supervisor: s.supervisor, tipo_uso: s.tipo_uso, descripcion: s.descripcion,
    permiso_aprobado: true, estado: 'activo', fecha_aprobacion: TS(), fecha_vigencia: ts(endOfDay(fecha)), aprobado_por: admin };
  if (await getUsuario(s.numero_empleado)) b.update(R('usuarios', s.numero_empleado), { ...datos, last_modified: TS(), modified_by: admin });
  else b.set(R('usuarios', s.numero_empleado), { ...datos, fecha_registro: TS(), renovacion_pendiente: false });
  b.update(R('solicitudes', s.id), {
    estado: 'aprobada', fecha_proceso: TS(), procesado_por: admin,
    comentarios: `${s.comentarios || ''}\nAprobación manual excepcional de rechazo automático por ${admin}`.trim()
  });
  b.delete(R('bloqueos', s.numero_empleado));
  await b.commit();
  return { ok: true };
}

const EDITABLES = ['nombre', 'area', 'supervisor', 'tipo_uso', 'estado', 'permiso_aprobado', 'fecha_vigencia', 'descripcion'];
const norm = (k, v) => v == null || v === '' ? 'NULL' : k === 'fecha_vigencia' ? toInputDate(toDate(v)) : String(v);

// Edita un usuario y registra cada campo modificado en usuario_audits (todo en un lote atómico).
export async function actualizarUsuarioCompleto(id, nuevos, editor, { campos = {}, ops } = {}) {
  const u = await getUsuario(id);
  if (!u) return { ok: false, msg: 'Usuario no encontrado' };
  const b = F.writeBatch(db), cambiados = [], patch = { ...campos };
  for (const k of EDITABLES) {
    if (!(k in nuevos)) continue;
    const ant = norm(k, u[k]), nue = norm(k, nuevos[k]);
    if (ant === nue) continue;
    cambiados.push(k);
    b.set(F.doc(F.collection(db, 'usuario_audits')), { usuario_id: id, campo: k, valor_anterior: ant, valor_nuevo: nue, editado_por: editor, editado_en: TS() });
    patch[k] = k === 'fecha_vigencia' && nuevos[k] ? ts(nuevos[k]) : nuevos[k];
  }
  if (cambiados.length) {
    patch.last_modified = TS(); patch.modified_by = editor;
    if (cambiados.includes('permiso_aprobado')) {
      Object.assign(patch, nuevos.permiso_aprobado
        ? { aprobado_por: editor, fecha_aprobacion: TS() } : { aprobado_por: null, fecha_aprobacion: null });
    }
  }
  if (Object.keys(patch).length) b.update(R('usuarios', id), patch);
  ops?.(b);
  await b.commit();
  return { ok: true, msg: cambiados.length ? `Usuario actualizado. Campos modificados: ${cambiados.join(', ')}` : 'No se realizaron cambios' };
}

// Elimina usuarios vencidos hace más de N días sin renovación pendiente y los archiva.
export async function eliminarVencidos(dias = 30) {
  const limite = addDays(new Date(), -dias);
  const [us, pend] = await Promise.all([getUsuarios(), getSolicitudesPendientes()]);
  const conRenovacion = new Set(pend.filter(s => s.tipo_solicitud === 'renovacion').map(s => s.numero_empleado));
  const vencidos = us.filter(u => u.fecha_vigencia && toDate(u.fecha_vigencia) < limite && !conRenovacion.has(u.id));
  for (let i = 0; i < vencidos.length; i += 200) {
    const b = F.writeBatch(db);
    for (const u of vencidos.slice(i, i + 200)) {
      b.set(F.doc(F.collection(db, 'usuarios_eliminados')), {
        usuario_id: u.id, nombre: u.nombre, area: u.area || null, supervisor: u.supervisor || null, tipo_uso: u.tipo_uso || null,
        fecha_registro_original: u.fecha_registro || null, fecha_vigencia: u.fecha_vigencia,
        motivo_eliminacion: `Permiso vencido hace más de ${dias} días sin renovación`, fecha_eliminacion: TS(), eliminado_por: 'sistema'
      });
      b.delete(R('usuarios', u.id));
    }
    await b.commit();
  }
  return vencidos.map(u => ({ id: u.id, nombre: u.nombre, fecha_vigencia: u.fecha_vigencia }));
}

// ---------- Administradores (Firebase Auth + documento con el rol) ----------
// Firebase Auth exige un correo; el administrador solo ve "usuario" y se le asigna uno interno ficticio.
const DOMINIO = 'permisos.local';
export const USUARIO_OK = /^[a-z0-9._-]{3,30}$/;
export const normUsuario = u => String(u || '').trim().toLowerCase();
const aEmail = u => `${normUsuario(u)}@${DOMINIO}`;
export async function cargarPerfil(user) {
  const s = await F.getDoc(R('administradores', user.uid));
  if (!s.exists() || s.data().activo !== true) return null;
  F.updateDoc(R('administradores', user.uid), { ultimo_acceso: TS() }).catch(() => {});
  return { uid: user.uid, ...s.data() };
}
export async function iniciarSesionAdmin(usuario, password) {
  const cred = await F.signInWithEmailAndPassword(F.auth, aEmail(usuario), password);
  return cargarPerfil(cred.user);
}
export const cerrarSesion = () => F.signOut(F.auth);
export async function instalacionPendiente() { return !(await F.getDoc(R('config', 'setup'))).exists(); }

export async function crearSuperadminInicial({ usuario, password, nombre }) {
  usuario = normUsuario(usuario);
  const cred = await F.createUserWithEmailAndPassword(F.auth, aEmail(usuario), password);
  try {
    const b = F.writeBatch(db);
    b.set(R('administradores', cred.user.uid), { usuario, nombre, email: aEmail(usuario), rol: 'superadmin', activo: true, fecha_creacion: TS(), creado_por: 'instalación', ultimo_acceso: TS() });
    b.set(R('config', 'setup'), { uid: cred.user.uid, fecha: TS() });
    await b.commit();
  } catch (e) { await F.deleteUser(cred.user).catch(() => {}); throw e; }
  return cargarPerfil(cred.user);
}

export async function crearAdmin({ usuario, password, nombre, rol }, creadoPor) {
  usuario = normUsuario(usuario);
  const sec = F.authSecundaria();
  const cred = await F.createUserWithEmailAndPassword(sec, aEmail(usuario), password);
  try {
    await F.setDoc(R('administradores', cred.user.uid), { usuario, nombre, email: aEmail(usuario), rol, activo: true, fecha_creacion: TS(), creado_por: creadoPor });
  } catch (e) { await F.deleteUser(cred.user).catch(() => {}); throw e; }
  finally { await F.signOut(sec).catch(() => {}); }
}
export const setAdminActivo = (uid, activo) => F.updateDoc(R('administradores', uid), { activo });
// Cambia la contraseña de la sesión actual (pide la actual para confirmar).
export async function cambiarMiPassword(actual, nueva) {
  const u = F.auth.currentUser;
  await F.reauthenticateWithCredential(u, F.EmailAuthProvider.credential(u.email, actual));
  await F.updatePassword(u, nueva);
}
