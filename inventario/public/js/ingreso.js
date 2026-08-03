import { productos as prodApi, movimientos as movApi } from './api.js';
import { toast, fmtNum } from './ui.js';

let _productos = [];
let _lineas    = [];

export function iniciarIngreso() {
  cargarProductos();
  agregarLinea();

  document.getElementById('btn-agregar-linea').addEventListener('click', agregarLinea);
  document.getElementById('btn-confirmar-ingreso').addEventListener('click', confirmarIngreso);
  document.addEventListener('refresh:ingreso', cargarProductos);
}

async function cargarProductos() {
  _productos = await prodApi.listar().catch(() => []);
}

function agregarLinea() {
  const idx = _lineas.length;
  _lineas.push({ producto_id: '', cajas: 1, unidades_por_caja: 1 });

  const opcs = _productos.map(p =>
    `<option value="${p.id}" data-upc="${p.unidades_por_caja}">${esc(p.nombre)} (stock: ${p.cantidad})</option>`
  ).join('');

  const div = document.createElement('div');
  div.className = 'ingreso-linea';
  div.dataset.idx = idx;
  div.innerHTML = `
    <div class="form-group" style="margin:0">
      <label>Producto</label>
      <select data-field="producto_id">
        <option value="">Seleccione...</option>${opcs}
      </select>
    </div>
    <div class="form-group" style="margin:0">
      <label>Cajas</label>
      <input type="number" data-field="cajas" value="1" min="1">
    </div>
    <div class="form-group" style="margin:0">
      <label>Unid. por caja</label>
      <input type="number" data-field="unidades_por_caja" value="1" min="1">
    </div>
    <div class="form-group" style="margin:0">
      <label>Total</label>
      <div class="total-linea" data-total>—</div>
    </div>
    <div style="display:flex;align-items:flex-end;padding-bottom:.45rem">
      <button type="button" class="btn btn-danger btn-sm" data-remove>✕</button>
    </div>
  `;

  div.querySelector('[data-field="producto_id"]').addEventListener('change', e => {
    const opt = e.target.selectedOptions[0];
    const upc = opt?.dataset.upc || 1;
    div.querySelector('[data-field="unidades_por_caja"]').value = upc;
    _lineas[idx].producto_id = e.target.value;
    _lineas[idx].unidades_por_caja = Number(upc);
    actualizarTotal(div, idx);
  });

  div.querySelector('[data-field="cajas"]').addEventListener('input', e => {
    _lineas[idx].cajas = Number(e.target.value) || 0;
    actualizarTotal(div, idx);
  });

  div.querySelector('[data-field="unidades_por_caja"]').addEventListener('input', e => {
    _lineas[idx].unidades_por_caja = Number(e.target.value) || 0;
    actualizarTotal(div, idx);
  });

  div.querySelector('[data-remove]').addEventListener('click', () => {
    div.remove();
    _lineas.splice(idx, 1, null);
    actualizarTotalGeneral();
  });

  document.getElementById('ingreso-lineas').appendChild(div);
}

function actualizarTotal(div, idx) {
  const l = _lineas[idx];
  const total = (l.cajas || 0) * (l.unidades_por_caja || 0);
  div.querySelector('[data-total]').textContent = total > 0 ? `${fmtNum(total)} unid.` : '—';
  actualizarTotalGeneral();
}

function actualizarTotalGeneral() {
  const total = _lineas.reduce((s, l) => s + (l ? (l.cajas || 0) * (l.unidades_por_caja || 0) : 0), 0);
  document.getElementById('ingreso-total').textContent =
    total > 0 ? `Total general: ${fmtNum(total)} unidades` : '';
}

async function confirmarIngreso() {
  const motivo = document.getElementById('ingreso-motivo').value.trim();
  const lineasValidas = _lineas.filter(l => l && l.producto_id && l.cajas > 0 && l.unidades_por_caja > 0);

  if (!lineasValidas.length) {
    toast('Agrega al menos un producto con cantidad válida', 'warning');
    return;
  }

  const btn = document.getElementById('btn-confirmar-ingreso');
  btn.disabled = true;
  btn.textContent = 'Procesando...';

  try {
    const res = await movApi.batch({ lineas: lineasValidas, motivo });
    const n = res.resultados?.length || 0;
    toast(`Ingreso registrado: ${n} producto${n !== 1 ? 's' : ''} actualizados`);

    // Resetear formulario
    _lineas = [];
    document.getElementById('ingreso-lineas').innerHTML = '';
    document.getElementById('ingreso-motivo').value = '';
    document.getElementById('ingreso-total').textContent = '';
    agregarLinea();

    // Recargar productos con stock actualizado
    cargarProductos();
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✓ Confirmar Ingreso';
  }
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
