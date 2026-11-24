// Utilidades puras (sin Firebase): formato, fechas, CSV, alertas y registro de eventos.
export const acciones = {};     // clicks:   data-action="nombre"
export const formularios = {};  // submits:  data-form="nombre"
export const cambios = {};      // input/change: data-change="nombre"

export const $ = (s, r = document) => r.querySelector(s);
export const esc = v => String(v ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const p2 = n => String(n).padStart(2, '0');
export const toDate = v => !v ? null : v instanceof Date ? v : typeof v.toDate === 'function' ? v.toDate() : new Date(v);
export const fmtDate = v => { const d = toDate(v); return d ? `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}` : 'N/A'; };
export const fmtDateTime = v => { const d = toDate(v); return d ? `${fmtDate(d)} ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` : '-'; };
export const toInputDate = d => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const fromInputDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const endOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
export const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
// Suma meses recortando el día (31 ene + 1 mes = 28 feb), igual que relativedelta.
export const addMonths = (d, n) => {
  const r = new Date(d), dia = r.getDate();
  r.setDate(1); r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(dia, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
};
export const diasEntre = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 864e5);

// ID legible y único: SOL-20261123153000-A7K
export function nuevoId(prefijo, d = new Date()) {
  const t = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  return `${prefijo}-${t}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
}

const ICONOS = { info: 'i', ok: '✓', aviso: '!', error: '✕' };
export const alerta = (tipo, html, titulo = '') =>
  `<div class="alerta ${tipo}" role="${tipo === 'error' ? 'alert' : 'status'}"><span class="alerta-ico" aria-hidden="true">${ICONOS[tipo]}</span><div>${titulo ? `<strong>${titulo}</strong> ` : ''}${html}</div></div>`;

export function toast(msg, tipo = 'ok') {
  const t = document.createElement('div');
  t.className = `toast ${tipo}`; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), 4500);
}

// Deshabilita un botón mientras corre una operación asíncrona.
export async function conBoton(btn, texto, fn) {
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = texto; }
  try { return await fn(); }
  finally { if (btn?.isConnected) { btn.disabled = false; btn.textContent = orig; } }
}

export function descargar(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// CSV con BOM (Excel abre bien los acentos) y protección contra inyección de fórmulas.
export function descargarCSV(nombre, filas) {
  if (!filas.length) return;
  const cols = Object.keys(filas[0]);
  const celda = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && isNaN(Number(s))) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.map(celda).join(','), ...filas.map(f => cols.map(c => celda(f[c])).join(','))].join('\r\n');
  descargar(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), nombre);
}
export const sello = () => { const d = new Date(); return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`; };
