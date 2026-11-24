// Genera el PDF del permiso en el navegador (jsPDF). Mismo diseño que el original de ReportLab.
import { fmtDate, fmtDateTime } from './util.js';

let logoCache;
async function cargarLogo() {
  if (logoCache !== undefined) return logoCache;
  try {
    const blob = await (await fetch('logo_ferrara.png')).blob();
    logoCache = await new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(blob); });
  } catch { logoCache = null; } // sin logo el PDF se genera igual
  return logoCache;
}

export async function generarPDF(u, jsPDFLib = window.jspdf.jsPDF, logo) {
  const doc = new jsPDFLib({ unit: 'in', format: 'letter' });
  const W = 8.5, pt = n => n / 72, ahora = new Date();
  logo ??= await cargarLogo();
  if (logo) doc.addImage(logo, 'PNG', W - 2, 0.5, 1.5, 1.5 * 289 / 474);

  doc.setFont('helvetica', 'bold').setFontSize(20).text('PERMISO DE USO DE CELULAR', W / 2, 1, { align: 'center' });
  doc.setLineWidth(pt(2)).line(1, 1.3, W - 1, 1.3);

  const ymd = `${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}`;
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(`Fecha de emisión: ${fmtDateTime(ahora).slice(0, 16)}`, 1, 1.6);
  doc.text(`No. de permiso: P-${u.id}-${ymd}`, 1, 1.8);

  doc.setFont('helvetica', 'bold').setFontSize(14).text('DATOS DEL TITULAR:', 1, 2.3);
  let y = 2.7;
  const campos = [
    ['Nombre:', u.nombre], ['Número de empleado:', u.id], ['Área:', u.area || 'N/A'],
    ['Supervisor:', u.supervisor || 'N/A'], ['Tipo de uso:', u.tipo_uso || 'N/A'], ['Válido hasta:', fmtDate(u.fecha_vigencia)]
  ];
  for (const [label, valor] of campos) {
    doc.setFont('helvetica', 'bold').setFontSize(11).text(label, 1, y);
    doc.setFont('helvetica', 'normal');
    const lineas = doc.splitTextToSize(String(valor), 4.3);
    doc.text(lineas, 3.2, y);
    y += 0.3 + (lineas.length - 1) * 0.2;
  }

  doc.setFont('helvetica', 'bold').setFontSize(14).text('AUTORIZACIÓN:', 1, y + 0.3);
  y += 0.8;
  doc.setFont('helvetica', 'normal').setFontSize(11);
  for (const l of [
    'Se autoriza al titular mencionado el uso de dispositivo celular dentro',
    'de las instalaciones, sujeto a las políticas y normativas vigentes de la',
    'organización. Este permiso es personal e intransferible.', '',
    'El titular se compromete a:',
    '• Usar el dispositivo de manera responsable',
    '• No compartir información confidencial',
    '• Cumplir con las normas de seguridad establecidas'
  ]) { doc.text(l, 1, y); y += 0.25; }

  doc.setFont('helvetica', 'italic').setFontSize(9);
  doc.text('Este documento es válido únicamente con la información registrada en el sistema', W / 2, 10, { align: 'center' });
  doc.text('Para verificación, contacte al departamento administrativo', W / 2, 10.3, { align: 'center' });
  doc.setLineWidth(pt(1)).line(1, 10.5, W - 1, 10.5);
  return doc;
}

export async function descargarPDF(u) {
  (await generarPDF(u)).save(`permiso_celular_${u.id}.pdf`);
}
