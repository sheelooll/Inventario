import { examenes as examApi } from './api.js';
import { toast, abrirModal, cerrarModal, confirmar } from './ui.js';

let _examenes = [];
const _carro  = new Map(); // examenId -> cantidad
let _logoDataURL  = null;  // cache del logo para el PDF
let _descuentoPct = 0;     // porcentaje de descuento activo (0 = sin descuento)

export function iniciarCotizaciones() {
  cargar();
  document.getElementById('btn-nuevo-examen').addEventListener('click', () => abrirFormExamen(null));
  document.getElementById('cot-buscar').addEventListener('input', renderCatalogo);
  document.getElementById('btn-descargar-pdf').addEventListener('click', generarPDF);
  document.getElementById('btn-limpiar-cot').addEventListener('click', limpiarCarro);

  const chk = document.getElementById('chk-tarjeta-vecino');
  const pctRow = document.getElementById('tv-pct-row');
  const inpPct = document.getElementById('inp-desc-pct');

  chk.addEventListener('change', () => {
    pctRow.classList.toggle('hidden', !chk.checked);
    _descuentoPct = chk.checked ? (Number(inpPct.value) || 0) : 0;
    renderCarro();
  });
  inpPct.addEventListener('input', () => {
    if (!chk.checked) return;
    _descuentoPct = Number(inpPct.value) || 0;
    renderCarro();
  });

  document.addEventListener('refresh:cotizaciones', cargar);
}

async function cargar() {
  try {
    await examApi.sincronizarCatalogo();  // carga/actualiza el catálogo PRECIOS 2026
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
  const cont      = document.getElementById('cot-items');
  const resumenEl = document.getElementById('cot-resumen-desc');

  if (!_carro.size) {
    cont.innerHTML = '<p class="text-muted" style="text-align:center;padding:1.5rem 0;font-size:.85rem">Agrega exámenes desde el catálogo</p>';
    resumenEl.classList.add('hidden');
    document.getElementById('cot-total').textContent = fmtCLP(0);
    return;
  }

  const hayDesc = _descuentoPct > 0;
  let total     = 0;
  let totalDesc = 0;
  const filas = [];

  for (const [id, cantidad] of _carro) {
    const ex = _examenes.find(e => e.id === id);
    if (!ex) continue;
    const precioNormal  = ex.precio || 0;
    const precioConDesc = hayDesc ? Math.round(precioNormal * (1 - _descuentoPct / 100)) : precioNormal;
    const subtotal      = precioConDesc * cantidad;
    total     += precioNormal  * cantidad;
    totalDesc += precioConDesc * cantidad;
    filas.push(`
      <div class="cot-item">
        <div class="cot-item-info">
          <strong>${esc(ex.nombre)}</strong>
          <span class="text-muted" style="font-size:.75rem">${fmtCLP(precioConDesc)} c/u</span>
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

  const descuento  = hayDesc ? total - totalDesc : 0;
  const totalFinal = hayDesc ? totalDesc : total;

  if (hayDesc) {
    resumenEl.classList.remove('hidden');
    document.getElementById('cot-subtotal').textContent      = fmtCLP(total);
    document.getElementById('cot-descuento').textContent     = '-' + fmtCLP(descuento);
    document.getElementById('cot-descuento-label').textContent = `Descuento (${_descuentoPct}%)`;
  } else {
    resumenEl.classList.add('hidden');
  }

  document.getElementById('cot-total').textContent = fmtCLP(totalFinal);
}

function agregarAlCarro(id) {
  _carro.set(id, (_carro.get(id) || 0) + 1);
  renderCarro();
}

function limpiarCarro() {
  if (!_carro.size) return;
  _carro.clear();
  _descuentoPct = 0;
  const chk = document.getElementById('chk-tarjeta-vecino');
  if (chk) { chk.checked = false; document.getElementById('tv-pct-row').classList.add('hidden'); }
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
        <input type="number" id="ex-precio" name="precio" value="${ex?.precio ?? ''}" min="0" required placeholder="Ej: 6500">
      </div>
      <div class="form-group">
        <label>Precio con 10% de descuento (CLP)</label>
        <input type="number" id="ex-precio-desc" name="precio_desc" value="${ex?.precio_desc ?? ''}" min="0" placeholder="Se calcula automáticamente">
        <small class="text-muted" style="font-size:.72rem">Se autocompleta con el 10% menos; puedes ajustarlo manualmente.</small>
      </div>
      <div class="form-group">
        <label>Categoría / descripción</label>
        <input type="text" name="descripcion" value="${esc(ex?.descripcion||'')}" placeholder="Opcional">
      </div>
      <div id="form-examen-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">${ex ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>
  `, { size: 'sm' });

  // Autocompletar el precio con descuento (10% menos) mientras no se edite a mano
  const inpPrecio = document.getElementById('ex-precio');
  const inpDesc   = document.getElementById('ex-precio-desc');
  let descManual  = inpDesc.value !== '';
  inpDesc.addEventListener('input', () => { descManual = true; });
  inpPrecio.addEventListener('input', () => {
    if (descManual) return;
    const p = Number(inpPrecio.value);
    inpDesc.value = p > 0 ? Math.round(p * 0.9) : '';
  });

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
      try {
        _logoDataURL = {
          url:   canvas.toDataURL('image/png'),
          ratio: img.naturalWidth / img.naturalHeight, // ancho/alto real
        };
      } catch { _logoDataURL = null; }
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

  // Logo — se ajusta dentro de una caja manteniendo la proporción real (sin recortes)
  const logo = await cargarLogo();
  if (logo) {
    const maxW = 20, maxH = 24;            // caja disponible para el logo (mm)
    let w = maxW, h = w / logo.ratio;      // ajustar por ancho
    if (h > maxH) { h = maxH; w = h * logo.ratio; } // si excede, ajustar por alto
    doc.addImage(logo.url, 'PNG', 14, 12, w, h);
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
  const hayDesc = _descuentoPct > 0;
  let total     = 0;
  let totalDesc = 0;
  const body = [];
  for (const [id, cantidad] of _carro) {
    const ex = _examenes.find(e => e.id === id);
    if (!ex) continue;
    const precioNormal  = ex.precio || 0;
    const precioConDesc = hayDesc ? Math.round(precioNormal * (1 - _descuentoPct / 100)) : precioNormal;
    const subtotal      = precioConDesc * cantidad;
    total     += precioNormal  * cantidad;
    totalDesc += precioConDesc * cantidad;
    body.push([ex.nombre, String(cantidad), fmtCLP(precioConDesc), fmtCLP(subtotal)]);
  }

  const descuento  = hayDesc ? total - totalDesc : 0;
  const totalFinal = hayDesc ? totalDesc : total;

  const foot = hayDesc
    ? [
        ['', '', 'Total sin Tarjeta Vecino', fmtCLP(total)],
        ['', '', 'Descuento Tarjeta Vecino', '−' + fmtCLP(descuento)],
        ['', '', 'Total con Tarjeta Vecino', fmtCLP(totalFinal)],
      ]
    : [['', '', 'TOTAL', fmtCLP(totalFinal)]];

  doc.autoTable({
    startY: cursorY + 2,
    head: [['Examen', 'Cantidad', 'Precio unit.', 'Subtotal']],
    body,
    foot,
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
  return '$' + Math.round(Number(n || 0)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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
