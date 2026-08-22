import { examenes as examApi } from './api.js';
import { toast, abrirModal, cerrarModal, confirmar } from './ui.js';

let _examenes = [];
const _carro  = new Map(); // examenId -> cantidad
let _logoDataURL = null;    // cache del logo para el PDF

export function iniciarCotizaciones() {
  cargar();
  document.getElementById('btn-nuevo-examen').addEventListener('click', () => abrirFormExamen(null));
  document.getElementById('cot-buscar').addEventListener('input', renderCatalogo);
  document.getElementById('btn-descargar-pdf').addEventListener('click', generarPDF);
  document.getElementById('btn-limpiar-cot').addEventListener('click', limpiarCarro);
  document.addEventListener('refresh:cotizaciones', cargar);
}

async function cargar() {
  try {
    await examApi.sembrarEjemplos();      // crea ejemplos solo la primera vez
    _examenes = await examApi.listar();
    renderCatalogo();
    renderCarro();
  } catch (e) {
    toast('Error al cargar exámenes: ' + e.message, 'error');
  }
}

// ===== Catálogo =====
function renderCatalogo() {
  const buscar = (document.getElementById('cot-buscar')?.value || '').toLowerCase();
  const lista  = _examenes.filter(e => !buscar || e.nombre.toLowerCase().includes(buscar));
  const tbody  = document.getElementById('tbody-examenes');

  if (!lista.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No hay exámenes que mostrar</td></tr>';
    return;
  }

  tbody.innerHTML = lista.map(e => `
    <tr>
      <td>
        <strong>${esc(e.nombre)}</strong>
        ${e.descripcion ? `<br><span class="text-muted" style="font-size:.75rem">${esc(e.descripcion)}</span>` : ''}
      </td>
      <td class="text-right">${fmtCLP(e.precio)}</td>
      <td class="acciones">
        <button class="btn btn-sq btn-success" title="Agregar a cotización" onclick="window._cotAdd('${e.id}')">+</button>
        <button class="btn btn-sq btn-edit btn-secondary" title="Editar examen" onclick="window._cotEdit('${e.id}')">✎</button>
        <button class="btn btn-sq btn-trash" title="Eliminar examen" onclick="window._cotDelExamen('${e.id}')">🗑</button>
      </td>
    </tr>
  `).join('');
}

// ===== Carro / cotización =====
function renderCarro() {
  const cont = document.getElementById('cot-items');
  if (!_carro.size) {
    cont.innerHTML = '<p class="text-muted" style="text-align:center;padding:1.5rem 0;font-size:.85rem">Agrega exámenes desde el catálogo</p>';
    document.getElementById('cot-total').textContent = fmtCLP(0);
    return;
  }

  let total = 0;
  const filas = [];
  for (const [id, cantidad] of _carro) {
    const ex = _examenes.find(e => e.id === id);
    if (!ex) continue;
    const subtotal = (ex.precio || 0) * cantidad;
    total += subtotal;
    filas.push(`
      <div class="cot-item">
        <div class="cot-item-info">
          <strong>${esc(ex.nombre)}</strong>
          <span class="text-muted" style="font-size:.75rem">${fmtCLP(ex.precio)} c/u</span>
        </div>
        <div class="cot-item-qty">
          <button class="btn btn-sq btn-secondary" onclick="window._cotDec('${id}')">−</button>
          <span class="cot-item-cant">${cantidad}</span>
          <button class="btn btn-sq btn-secondary" onclick="window._cotInc('${id}')">+</button>
        </div>
        <div class="cot-item-sub">${fmtCLP(subtotal)}</div>
        <button class="btn btn-sq btn-trash" title="Quitar" onclick="window._cotQuitar('${id}')">🗑</button>
      </div>
    `);
  }

  cont.innerHTML = filas.join('');
  document.getElementById('cot-total').textContent = fmtCLP(total);
}

function agregarAlCarro(id) {
  _carro.set(id, (_carro.get(id) || 0) + 1);
  renderCarro();
}

function limpiarCarro() {
  if (!_carro.size) return;
  _carro.clear();
  document.getElementById('cot-cliente').value = '';
  renderCarro();
}

// ===== Formulario de examen (crear / editar) =====
function abrirFormExamen(id) {
  const ex = id ? _examenes.find(e => e.id === id) : null;

  abrirModal(`
    <div class="modal-header">
      <h3>${ex ? 'Editar examen' : 'Nuevo examen'}</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <form id="form-examen" novalidate>
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" name="nombre" value="${esc(ex?.nombre||'')}" required placeholder="Ej: Hemograma completo">
      </div>
      <div class="form-group">
        <label>Precio (CLP) *</label>
        <input type="number" name="precio" value="${ex?.precio ?? ''}" min="0" required placeholder="Ej: 6500">
      </div>
      <div class="form-group">
        <label>Descripción</label>
        <input type="text" name="descripcion" value="${esc(ex?.descripcion||'')}" placeholder="Opcional">
      </div>
      <div id="form-examen-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">${ex ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>
  `, { size: 'sm' });

  document.getElementById('form-examen').addEventListener('submit', async e => {
    e.preventDefault();
    const data  = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('form-examen-error');
    errEl.classList.add('hidden');
    try {
      if (ex) { await examApi.editar(ex.id, data); toast('Examen actualizado'); }
      else    { await examApi.crear(data);          toast('Examen creado'); }
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== Generación de PDF =====
async function cargarLogo() {
  if (_logoDataURL) return _logoDataURL;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      try { _logoDataURL = canvas.toDataURL('image/png'); } catch { _logoDataURL = null; }
      resolve(_logoDataURL);
    };
    img.onerror = () => resolve(null);
    img.src = 'img/laboratorio.png';
  });
}

async function generarPDF() {
  if (!_carro.size) { toast('Agrega al menos un examen a la cotización', 'warning'); return; }
  if (!window.jspdf?.jsPDF) { toast('No se pudo cargar el generador de PDF', 'error'); return; }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // Logo
  const logo = await cargarLogo();
  if (logo) {
    // 211x300 px → mantener proporción, ancho 18mm
    const w = 18, h = w * (300 / 211);
    doc.addImage(logo, 'PNG', 14, 12, w, h);
  }

  // Encabezado
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 64, 175);
  doc.text('Laboratorio Inventory', 40, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(80, 80, 80);
  doc.text('Cotización de exámenes', 40, 27);

  // Datos de la cotización (derecha)
  const ahora   = new Date();
  const nroCot  = 'COT-' + ahora.getTime().toString().slice(-6);
  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  doc.text(`N° ${nroCot}`, pageW - 14, 18, { align: 'right' });
  doc.text(`Fecha: ${ahora.toLocaleDateString('es-CL')}`, pageW - 14, 23, { align: 'right' });

  const cliente = document.getElementById('cot-cliente').value.trim();
  let cursorY = 42;
  if (cliente) {
    doc.setFontSize(10);
    doc.setTextColor(30, 30, 30);
    doc.text(`Cliente: ${cliente}`, 14, cursorY);
    cursorY += 6;
  }

  // Tabla de exámenes
  let total = 0;
  const body = [];
  for (const [id, cantidad] of _carro) {
    const ex = _examenes.find(e => e.id === id);
    if (!ex) continue;
    const subtotal = (ex.precio || 0) * cantidad;
    total += subtotal;
    body.push([ex.nombre, String(cantidad), fmtCLP(ex.precio), fmtCLP(subtotal)]);
  }

  doc.autoTable({
    startY: cursorY + 2,
    head: [['Examen', 'Cantidad', 'Precio unit.', 'Subtotal']],
    body,
    foot: [['', '', 'TOTAL', fmtCLP(total)]],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
    footStyles: { fillColor: [239, 246, 255], textColor: [30, 64, 175], fontStyle: 'bold' },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  // Nota al pie
  const finY = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text('Cotización referencial válida por 30 días. Los precios pueden variar sin previo aviso.', 14, finY);

  const fecha = ahora.toISOString().slice(0, 10);
  doc.save(`cotizacion_${fecha}.pdf`);
  toast('PDF generado');
}

// ===== Helpers =====
function fmtCLP(n) {
  return '$' + Number(n || 0).toLocaleString('es-CL');
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== Globales para onclick =====
window._cotAdd       = (id) => agregarAlCarro(id);
window._cotInc       = (id) => { _carro.set(id, (_carro.get(id) || 0) + 1); renderCarro(); };
window._cotDec       = (id) => {
  const n = (_carro.get(id) || 0) - 1;
  if (n <= 0) _carro.delete(id); else _carro.set(id, n);
  renderCarro();
};
window._cotQuitar    = (id) => { _carro.delete(id); renderCarro(); };
window._cotEdit      = (id) => abrirFormExamen(id);
window._cotDelExamen = async (id) => {
  const ex = _examenes.find(e => e.id === id);
  const ok = await confirmar(`¿Eliminar el examen <strong>${esc(ex?.nombre||id)}</strong> del catálogo?`);
  if (!ok) return;
  try {
    await examApi.eliminar(id);
    _carro.delete(id);
    toast('Examen eliminado');
    cargar();
  } catch (e) { toast('Error: ' + e.message, 'error'); }
};
