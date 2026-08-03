import { reportes as repApi, categorias as catApi } from './api.js';
import { toast, fmtNum, estadoBadge, nombreMes } from './ui.js';

let _reporte = null;

export function iniciarReportes() {
  poblarFiltros();
  cargarCategorias();

  document.getElementById('btn-generar-reporte').addEventListener('click', generar);
  document.getElementById('btn-exportar-reporte').addEventListener('click', exportar);
  document.addEventListener('refresh:reportes', () => {});
}

function poblarFiltros() {
  const now = new Date();
  const selMes  = document.getElementById('rep-mes');
  const selAnio = document.getElementById('rep-anio');

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  meses.forEach((m, i) => {
    const o = document.createElement('option');
    o.value = i + 1; o.textContent = m;
    if (i + 1 === now.getMonth() + 1) o.selected = true;
    selMes.appendChild(o);
  });

  for (let y = now.getFullYear(); y >= 2020; y--) {
    const o = document.createElement('option');
    o.value = y; o.textContent = y;
    if (y === now.getFullYear()) o.selected = true;
    selAnio.appendChild(o);
  }
}

async function cargarCategorias() {
  const cats = await catApi.listar().catch(() => []);
  const sel  = document.getElementById('rep-categoria');
  sel.innerHTML = '<option value="">Todas las categorías</option>';
  cats.forEach(c => {
    const o = document.createElement('option'); o.value = c.id; o.textContent = c.nombre; sel.appendChild(o);
  });
}

async function generar() {
  const mes = document.getElementById('rep-mes').value;
  const anio = document.getElementById('rep-anio').value;
  const cat  = document.getElementById('rep-categoria').value;

  const btn = document.getElementById('btn-generar-reporte');
  btn.disabled = true; btn.textContent = 'Generando...';

  try {
    _reporte = await repApi.mensual({ mes, anio, ...(cat ? { categoria_id: cat } : {}) });
    renderResumen(_reporte);
    renderTabla(_reporte);
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Generar';
  }
}

function renderResumen(rep) {
  const t = rep.totales;
  document.getElementById('reporte-resumen').innerHTML = `
    <div class="reporte-resumen-grid" style="margin-bottom:1rem">
      <div class="resumen-card rc-success">
        <div class="rc-value">${fmtNum(t.entradas)}</div>
        <div class="rc-label">Total entradas</div>
      </div>
      <div class="resumen-card rc-danger">
        <div class="rc-value">${fmtNum(t.salidas)}</div>
        <div class="rc-label">Total salidas</div>
      </div>
      <div class="resumen-card rc-danger">
        <div class="rc-value">${t.criticos}</div>
        <div class="rc-label">En crítico al cierre</div>
      </div>
      <div class="resumen-card rc-warning">
        <div class="rc-value">${t.bajos}</div>
        <div class="rc-label">En bajo al cierre</div>
      </div>
      <div class="resumen-card rc-info">
        <div class="rc-value">${t.vencidos + t.por_vencer}</div>
        <div class="rc-label">Vencidos / Por vencer</div>
      </div>
    </div>
    <p class="text-muted" style="margin-bottom:.5rem">
      Reporte de <strong>${nombreMes(rep.mes)} ${rep.anio}</strong> — ${rep.productos.length} producto(s)
    </p>
  `;
}

function renderTabla(rep) {
  const tbody = document.getElementById('tbody-reporte');
  if (!rep.productos.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">Sin datos para el período seleccionado</td></tr>';
    return;
  }
  tbody.innerHTML = rep.productos.map(p => `
    <tr>
      <td>${esc(p.nombre)}</td>
      <td>${esc(p.categoria_nombre)}</td>
      <td class="text-right">${fmtNum(p.stock_inicial)}</td>
      <td class="text-right" style="color:var(--color-success)">${fmtNum(p.entradas)}</td>
      <td class="text-right" style="color:var(--color-danger)">${fmtNum(p.salidas)}</td>
      <td class="text-right">${p.ajustes || 0}</td>
      <td class="text-right"><strong>${fmtNum(p.stock_final)}</strong></td>
      <td>${estadoBadge(p.estado, p.vencido, p.por_vencer)}</td>
    </tr>
  `).join('');
}

async function exportar() {
  if (!_reporte) { toast('Primero genera el reporte', 'warning'); return; }
  const { exportarReporteExcel } = await import('./excel.js');
  exportarReporteExcel(_reporte);
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
