import { categorias as catApi, ubicaciones as ubApi } from './api.js';
import { toast, abrirModal, cerrarModal, confirmar } from './ui.js';

let _categorias = [];
let _ubicaciones = [];

export function iniciarCategorias() {
  cargar();
  document.getElementById('btn-nueva-categoria').addEventListener('click', () => abrirForm(null));
  document.getElementById('btn-nueva-ubicacion').addEventListener('click', () => abrirFormUb(null));
  document.addEventListener('refresh:categorias', cargar);
}

async function cargar() {
  try {
    [_categorias, _ubicaciones] = await Promise.all([catApi.listar(), ubApi.listar()]);
    renderTabla();
    renderTablaUb();
  } catch (e) {
    toast('Error al cargar: ' + e.message, 'error');
  }
}

function renderTabla() {
  const tbody = document.getElementById('tbody-categorias');
  if (!_categorias.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No hay categorías creadas</td></tr>';
    return;
  }
  tbody.innerHTML = _categorias.map(c => `
    <tr>
      <td><strong>${esc(c.nombre)}</strong></td>
      <td>${esc(c.descripcion||'—')}</td>
      <td class="acciones">
        <button class="btn btn-secondary btn-sm" onclick="window._editCat('${c.id}')">Editar</button>
        <button class="btn btn-danger btn-sm"    onclick="window._delCat('${c.id}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function abrirForm(id) {
  const cat = id ? _categorias.find(c => c.id === id) : null;

  abrirModal(`
    <div class="modal-header">
      <h3>${cat ? 'Editar Categoría' : 'Nueva Categoría'}</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <form id="form-cat" novalidate>
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" name="nombre" value="${esc(cat?.nombre||'')}" required>
      </div>
      <div class="form-group">
        <label>Descripción</label>
        <input type="text" name="descripcion" value="${esc(cat?.descripcion||'')}">
      </div>
      <div id="form-cat-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">${cat ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>
  `, { size: 'sm' });

  document.getElementById('form-cat').addEventListener('submit', async e => {
    e.preventDefault();
    const data  = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('form-cat-error');
    errEl.classList.add('hidden');
    try {
      if (cat) { await catApi.editar(cat.id, data); toast('Categoría actualizada'); }
      else     { await catApi.crear(data);           toast('Categoría creada'); }
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== Ubicaciones =====
function renderTablaUb() {
  const tbody = document.getElementById('tbody-ubicaciones');
  if (!_ubicaciones.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="2">No hay ubicaciones creadas</td></tr>';
    return;
  }
  tbody.innerHTML = _ubicaciones.map(u => `
    <tr>
      <td><strong>${esc(u.nombre)}</strong></td>
      <td class="acciones">
        <button class="btn btn-secondary btn-sm" onclick="window._editUb('${u.id}')">Editar</button>
        <button class="btn btn-danger btn-sm"    onclick="window._delUb('${u.id}')">Eliminar</button>
      </td>
    </tr>
  `).join('');
}

function abrirFormUb(id) {
  const ub = id ? _ubicaciones.find(u => u.id === id) : null;
  abrirModal(`
    <div class="modal-header">
      <h3>${ub ? 'Editar Ubicación' : 'Nueva Ubicación'}</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <form id="form-ub" novalidate>
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" name="nombre" value="${esc(ub?.nombre||'')}" required placeholder="Ej: Bodega 2, Estante A">
      </div>
      <div id="form-ub-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">${ub ? 'Guardar' : 'Crear'}</button>
      </div>
    </form>
  `, { size: 'sm' });

  document.getElementById('form-ub').addEventListener('submit', async e => {
    e.preventDefault();
    const data  = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('form-ub-error');
    errEl.classList.add('hidden');
    try {
      if (ub) { await ubApi.editar(ub.id, data); toast('Ubicación actualizada'); }
      else     { await ubApi.crear(data);          toast('Ubicación creada'); }
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

window._editUb = (id) => abrirFormUb(id);
window._delUb  = async (id) => {
  const u  = _ubicaciones.find(u => u.id === id);
  const ok = await confirmar(`¿Eliminar la ubicación <strong>${esc(u?.nombre||id)}</strong>?`);
  if (!ok) return;
  try { await ubApi.eliminar(id); toast('Ubicación eliminada'); cargar(); }
  catch (e) { toast(e.message, 'error'); }
};

window._editCat = (id) => abrirForm(id);
window._delCat  = async (id) => {
  const c = _categorias.find(c => c.id === id);
  const ok = await confirmar(`¿Eliminar la categoría <strong>${esc(c?.nombre||id)}</strong>?`);
  if (!ok) return;
  try {
    await catApi.eliminar(id);
    toast('Categoría eliminada');
    cargar();
  } catch (e) {
    toast(e.message, 'error');
  }
};

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
