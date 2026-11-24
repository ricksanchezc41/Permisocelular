// Arranque: cabecera, navegación, sesión de administrador y registro de eventos.
import { configurado, auth, onAuthStateChanged } from './firebase.js';
import * as D from './data.js';
import { renderPublic } from './public.js';
import { renderAdmin, reiniciarAdmin } from './admin.js';
import { $, esc, alerta, conBoton, acciones, formularios, cambios } from './util.js';

const main = $('#app');
let perfil = null, vista = location.hash === '#admin' ? 'admin' : 'solicitar', instalando = false;

function cabecera() {
  const nav = perfil
    ? `<span class="sesion"><strong>${esc(perfil.nombre)}</strong><em>${perfil.rol === 'superadmin' ? 'Superadministrador' : 'Administrador'}</em></span><button class="btn secundario chico" data-action="salir">Cerrar sesión</button>`
    : `<button data-action="vista" data-vista="solicitar" ${vista === 'solicitar' ? 'aria-current="page"' : ''}>Solicitar permiso</button>
       <button data-action="vista" data-vista="admin" ${vista === 'admin' ? 'aria-current="page"' : ''}>Acceso administrativo</button>`;
  $('#cabecera').innerHTML = `<div class="cab-in"><a class="marca" href="./"><img src="logo_ferrara.png" alt="Ferrara Candy Company"><span>Permisos de celular<small>Ferrara Linares</small></span></a><nav class="nav-sup">${nav}</nav></div>`;
}

function render() {
  cabecera();
  if (!configurado) {
    main.innerHTML = `<section class="publico">${alerta('error', 'Abre <code>public/firebase-config.js</code> y pega la configuración de tu proyecto de Firebase. Los pasos están en el README.', 'Falta configurar Firebase.')}</section>`;
    return;
  }
  if (perfil) return renderAdmin(main, perfil);
  if (vista === 'admin') return renderLogin();
  renderPublic(main);
}

const ERR = {
  'auth/invalid-credential': 'Usuario o contraseña incorrectos.', 'auth/wrong-password': 'Usuario o contraseña incorrectos.',
  'auth/user-not-found': 'Usuario o contraseña incorrectos.', 'auth/invalid-email': 'El usuario no es válido.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  'auth/email-already-in-use': 'Ese usuario ya existe.', 'auth/weak-password': 'La contraseña es demasiado débil (mínimo 6 caracteres).',
  'permission-denied': 'Firestore rechazó la operación. ¿Ya publicaste firestore.rules?'
};
const msgError = e => ERR[e.code] || 'No se pudo completar la operación. Inténtalo de nuevo.';

async function renderLogin() {
  main.innerHTML = '<p class="cargando">Cargando…</p>';
  let primera = false;
  try { primera = await D.instalacionPendiente(); } catch (e) { console.warn(e); }
  main.innerHTML = `<section class="publico estrecho">
    <div class="intro"><h1>${primera ? 'Primera configuración' : 'Acceso administrativo'}</h1>
    <p>${primera ? 'Aún no existe ningún administrador. Crea la cuenta de superadministrador ahora mismo: cualquier persona que abra esta página antes podría hacerlo.' : 'Esta área es solo para personal autorizado.'}</p></div>
    <form class="bloque" data-form="${primera ? 'instalar' : 'login'}">
      ${primera ? '<label class="campo">Nombre completo<input name="nombre" required maxlength="120"></label>' : ''}
      <label class="campo">Usuario<input name="usuario" required autocomplete="username" autocapitalize="none" spellcheck="false" ${primera ? 'pattern="[A-Za-z0-9._\\-]{3,30}" minlength="3" maxlength="30" title="3 a 30 caracteres: letras, números, punto, guion o guion bajo"' : ''}></label>
      <label class="campo">Contraseña<input type="password" name="password" required minlength="${primera ? 6 : 1}" autocomplete="${primera ? 'new-password' : 'current-password'}"></label>
      <div id="msg-login" aria-live="polite"></div>
      <button class="btn primario ancho" type="submit">${primera ? 'Crear superadministrador' : 'Ingresar'}</button>
    </form></section>`;
}

formularios.login = (form) => conBoton(form.querySelector('[type=submit]'), 'Ingresando…', async () => {
  const fd = new FormData(form);
  instalando = true; // evita que onAuthStateChanged compita con este flujo
  try {
    const p = await D.iniciarSesionAdmin(String(fd.get('usuario')), String(fd.get('password')));
    if (!p) { await D.cerrarSesion(); $('#msg-login').innerHTML = alerta('error', 'Tu cuenta no tiene acceso o está inactiva.'); return; }
    perfil = p; render();
  } catch (e) { console.error(e); $('#msg-login').innerHTML = alerta('error', msgError(e)); }
  finally { instalando = false; }
});

formularios.instalar = (form) => conBoton(form.querySelector('[type=submit]'), 'Creando…', async () => {
  const fd = new FormData(form);
  if (!D.USUARIO_OK.test(D.normUsuario(fd.get('usuario')))) { $('#msg-login').innerHTML = alerta('error', 'El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.'); return; }
  instalando = true;
  try {
    perfil = await D.crearSuperadminInicial({ usuario: String(fd.get('usuario')), password: String(fd.get('password')), nombre: String(fd.get('nombre')).trim() });
    render();
  } catch (e) { console.error(e); $('#msg-login').innerHTML = alerta('error', msgError(e)); }
  finally { instalando = false; }
});

acciones.vista = (el) => { vista = el.dataset.vista; history.replaceState(null, '', vista === 'admin' ? '#admin' : location.pathname); render(); };
acciones.salir = async () => { await D.cerrarSesion(); };

if (configurado) {
  onAuthStateChanged(auth, async (user) => {
    if (instalando) return;
    if (user && !perfil) {
      try { perfil = await D.cargarPerfil(user); } catch (e) { console.warn(e); }
      if (!perfil) { await D.cerrarSesion(); return; }
      vista = 'admin';
    } else if (user && perfil) { return; }
    else if (!user && perfil) { perfil = null; reiniciarAdmin(); vista = 'solicitar'; history.replaceState(null, '', location.pathname); }
    render();
  });
}

// Registro central de eventos (los módulos registran sus handlers en util.js)
document.addEventListener('click', e => { const el = e.target.closest('[data-action]'); if (el && acciones[el.dataset.action]) acciones[el.dataset.action](el, e); });
document.addEventListener('submit', e => { const f = e.target.closest('form[data-form]'); if (f && formularios[f.dataset.form]) { e.preventDefault(); formularios[f.dataset.form](f, e); } });
['input', 'change'].forEach(t => document.addEventListener(t, e => { const el = e.target.closest('[data-change]'); if (el && cambios[el.dataset.change]) cambios[el.dataset.change](el, e); }));

render();
