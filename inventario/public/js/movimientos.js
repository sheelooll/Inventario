import { movimientos as movApi, categorias as catApi, productos as prodApi } from './api.js';
import { toast, abrirModal, cerrarModal, fmtFecha, fmtNum, tipoBadge } from './ui.js';

let _datos = [];
let _categorias = [];
let _productos  = [];

export function iniciarMovimientos() {
  cargarCategorias();
  filtrar();

  document.getElementById('btn-filtrar-movimientos').addEventListener('click', filtrar);
  document.getElementById('btn-exportar-movimientos').addEventListener('click', exportar);
  document.getElementById('btn-ingreso-caja').addEventListener('click', abrirModalIngresoCaja);
  document.addEventListener('refresh:movimientos', filtrar);

  // Fechas por defecto: mes actual
  const now = new Date();
  const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('mov-desde').value = `${y}-${m}-01`;
  const fin = new Date(y, now.getMonth() + 1, 0).getDate();
  document.getElementById('mov-hasta').value = `${y}-${m}-${String(fin).padStart(2, '0')}`;
}

async function cargarCategorias() {
  _categorias = await catApi.listar().catch(() => []);
  const sel = document.getElementById('mov-categoria');
  sel.innerHTML = '<option value="">Todas las categorías</option>';
  _categorias.forEach(c => {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre; sel.appendChild(o);
  });
}

async function filtrar() {
  const params = {};
  const desde = document.getElementById('mov-desde').value;
  const hasta = document.getElementById('mov-hasta').value;
  const tipo  = document.getElementById('mov-tipo').value;
  const cat   = document.getElementById('mov-categoria').value;

  if (desde) params.desde = desde;
  if (hasta) params.hasta = hasta;
  if (tipo)  params.tipo  = tipo;
  if (cat)   params.categoria_id = cat;

  try {
    _datos = await movApi.listar(params);
    renderTabla();
  } catch (e) {
    toast('Error al cargar movimientos: ' + e.message, 'error');
  }
}

function renderTabla() {
  const tbody = document.getElementById('tbody-movimientos');
  if (!_datos.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Sin movimientos para los filtros seleccionados</td></tr>';
    return;
  }
  tbody.innerHTML = _datos.map(m => {
    const signo = m.tipo === 'salida' ? '-' : (m.tipo === 'ajuste' ? '=' : '+');
    const color = m.tipo === 'salida' ? 'color:var(--color-danger)' :
                  m.tipo === 'ajuste' ? 'color:var(--color-info)'  : 'color:var(--color-success)';
    return `
      <tr>
        <td style="white-space:nowrap">${fmtFecha(m.fecha)}</td>
        <td>${esc(m.producto_nombre)}</td>
        <td>${esc(m.categoria_nombre)}</td>
        <td>${tipoBadge(m.tipo)}</td>
        <td class="text-right" style="${color}"><strong>${signo}${fmtNum(m.cantidad)}</strong></td>
        <td class="text-right">${fmtNum(m.stock_resultante)}</td>
        <td>${esc(m.usuario_nombre)}</td>
        <td>${esc(m.motivo || '—')}</td>
      </tr>
    `;
  }).join('');
}

// ===== Modal ingreso masivo =====
async function abrirModalIngresoCaja() {
  _productos = await prodApi.listar().catch(() => []);

  const opcs = _productos.map(p =>
    `<option value="${p.id}">${esc(p.nombre)} (stock: ${p.cantidad})</option>`
  ).join('');

  abrirModal(`
    <div class="modal-header">
      <h3>📥 Ingreso Masivo</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>

    <div class="form-group">
      <label>Motivo (opcional)</label>
      <input type="text" id="modal-ingreso-motivo" placeholder="Ej: Compra mensual, donación...">
    </div>

    <div id="modal-ingreso-lineas" style="display:flex;flex-direction:column;gap:.6rem;margin-bottom:.75rem"></div>

    <button id="modal-btn-agregar-linea" class="btn btn-secondary btn-sm">+ Agregar producto</button>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--color-border)">
      <span id="modal-ingreso-total" style="font-size:.9rem;color:var(--color-text-muted)"></span>
      <div style="display:flex;gap:.5rem">
        <button class="btn btn-secondary modal-close">Cancelar</button>
        <button id="modal-btn-confirmar-ingreso" class="btn btn-primary">✓ Confirmar Ingreso</button>
      </div>
    </div>
  `, { size: 'lg' });

  const lineas = [];

  function agregarLineaModal() {
    const idx = lineas.length;
    lineas.push({ producto_id: '', cantidad: 0, codigo_lote: '', vencimiento_lote: '', ubicacion: '', numero_compra: '' });

    const div = document.createElement('div');
    div.style.cssText = 'display:grid;grid-template-columns:1.5fr 80px 100px 100px 100px 100px auto;gap:.4rem;align-items:end';
    div.innerHTML = `
      <div class="form-group" style="margin:0">
        <label style="font-size:.78rem">Producto</label>
        <select data-field="producto_id" style="font-size:.82rem">
          <option value="">Seleccione...</option>${opcs}
        </select>
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:.78rem">Cantidad</label>
        <input type="number" data-field="cantidad" value="" min="1" style="font-size:.82rem">
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:.78rem">Lote</label>
        <input type="text" data-field="codigo_lote" placeholder="Opcional" style="font-size:.82rem">
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:.78rem">Vencimiento</label>
        <input type="date" data-field="vencimiento_lote" style="font-size:.82rem">
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:.78rem">Ubicación</label>
        <input type="text" data-field="ubicacion" placeholder="Opcional" style="font-size:.82rem">
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:.78rem">N° compra</label>
        <input type="text" data-field="numero_compra" placeholder="Opcional" style="font-size:.82rem">
      </div>
      <div style="padding-bottom:.45rem">
        <button type="button" class="btn btn-danger btn-sm" data-remove>✕</button>
      </div>
    `;

    ['producto_id','cantidad','codigo_lote','vencimiento_lote','ubicacion','numero_compra'].forEach(field => {
      div.querySelector(`[data-field="${field}"]`).addEventListener('change', e => {
        lineas[idx][field] = e.target.value;
        if (field === 'cantidad') actualizarTotalGeneral(lineas);
      });
      div.querySelector(`[data-field="${field}"]`).addEventListener('input', e => {
        lineas[idx][field] = e.target.value;
        if (field === 'cantidad') actualizarTotalGeneral(lineas);
      });
    });

    div.querySelector('[data-remove]').addEventListener('click', () => {
      div.remove(); lineas.splice(idx, 1, null); actualizarTotalGeneral(lineas);
    });

    document.getElementById('modal-ingreso-lineas').appendChild(div);
  }

  function actualizarTotalGeneral(lineas) {
    const total = lineas.reduce((s, l) => s + (l ? Number(l.cantidad) || 0 : 0), 0);
    document.getElementById('modal-ingreso-total').textContent =
      total > 0 ? `Total: ${fmtNum(total)} unidades` : '';
  }

  agregarLineaModal();
  document.getElementById('modal-btn-agregar-linea').addEventListener('click', agregarLineaModal);

  document.getElementById('modal-btn-confirmar-ingreso').addEventListener('click', async () => {
    const motivo  = document.getElementById('modal-ingreso-motivo').value.trim();
    const validas = lineas.filter(l => l && l.producto_id && Number(l.cantidad) > 0);

    if (!validas.length) { toast('Agrega al menos un producto con cantidad válida', 'warning'); return; }

    const btn = document.getElementById('modal-btn-confirmar-ingreso');
    btn.disabled = true; btn.textContent = 'Procesando...';

    try {
      const res = await movApi.batch({ lineas: validas, motivo });
      const n = res.resultados?.length || 0;
      toast(`Ingreso registrado: ${n} producto${n !== 1 ? 's' : ''} actualizados`);
      cerrarModal();
      filtrar();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
      btn.disabled = false; btn.textContent = '✓ Confirmar Ingreso';
    }
  });
}

async function exportar() {
  const { exportarMovimientosExcel } = await import('./excel.js');
  exportarMovimientosExcel(_datos);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
