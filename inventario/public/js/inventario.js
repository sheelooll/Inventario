import { productos as prodApi, categorias as catApi, movimientos as movApi, lotes as lotesApi, ubicaciones as ubApi } from './api.js';
import { toast, abrirModal, cerrarModal, confirmar, estadoBadge, fmtFechaSolo, fmtNum } from './ui.js';

let _productos  = [];
let _categorias = [];
let _ubicaciones = [];

export function iniciarInventario() {
  cargarCategoriasFiltro();
  cargar();

  document.getElementById('btn-nuevo-producto').addEventListener('click', () => abrirFormProducto(null));
  document.getElementById('btn-importar-excel').addEventListener('click', abrirModalImportarExcel);
  document.getElementById('filtro-buscar').addEventListener('input', renderTabla);
  document.getElementById('filtro-estado').addEventListener('change', renderTabla);
  document.getElementById('filtro-categoria').addEventListener('change', renderTabla);
  document.getElementById('btn-exportar-inventario').addEventListener('click', exportarInventario);
  document.addEventListener('refresh:inventario', cargar);
}

async function cargar() {
  try {
    [_productos, _categorias, _ubicaciones] = await Promise.all([prodApi.listar(), catApi.listar(), ubApi.listar()]);
    renderAlertas();
    renderTabla();
    actualizarFiltroCategoria();
  } catch (e) {
    toast('Error al cargar inventario: ' + e.message, 'error');
  }
}

function actualizarFiltroCategoria() {
  const sel = document.getElementById('filtro-categoria');
  const val = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>';
  _categorias.forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.nombre;
    if (c.id == val) o.selected = true;
    sel.appendChild(o);
  });
}

async function cargarCategoriasFiltro() {
  _categorias = await catApi.listar().catch(() => []);
  actualizarFiltroCategoria();
}

function renderAlertas() {
  const criticos   = _productos.filter(p => p.estado === 'critico').length;
  const bajos      = _productos.filter(p => p.estado === 'bajo').length;
  const alertaVenc = _productos.filter(p => p.por_vencer || p.vencido).length;
  const el = document.getElementById('inventario-alertas');
  const chips = [];
  if (criticos)   chips.push(`<div class="alerta-chip critico">🔴 ${criticos} en crítico</div>`);
  if (bajos)      chips.push(`<div class="alerta-chip bajo">🟡 ${bajos} en bajo</div>`);
  if (alertaVenc) chips.push(`<div class="alerta-chip vencer">🔵 ${alertaVenc} vencido/por vencer</div>`);
  el.innerHTML = chips.join('');
}

function filtrados() {
  const buscar = document.getElementById('filtro-buscar').value.toLowerCase();
  const estado = document.getElementById('filtro-estado').value;
  const catId  = document.getElementById('filtro-categoria').value;
  return _productos.filter(p => {
    if (buscar && !p.nombre.toLowerCase().includes(buscar)) return false;
    if (catId  && p.categoria_id != catId) return false;
    if (estado) {
      if (estado === 'vencido'    && !p.vencido)    return false;
      if (estado === 'por_vencer' && !p.por_vencer) return false;
      if (['critico','bajo','aceptable'].includes(estado) && p.estado !== estado) return false;
    }
    return true;
  });
}

function estadoCalc(cantidad, umbral_critico, umbral_bajo) {
  if (cantidad <= umbral_critico) return 'critico';
  if (cantidad <= umbral_bajo)    return 'bajo';
  return 'aceptable';
}

function renderTabla() {
  const tbody = document.getElementById('tbody-inventario');
  const lista = filtrados();
  if (!lista.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="8">No hay productos que mostrar</td></tr>';
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const en30  = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const rows  = [];

  for (const p of lista) {
    const lotesArr = (p.lotes && p.lotes.length > 0) ? p.lotes : [null];
    const totalLotes = lotesArr.length;

    lotesArr.forEach((lote, idx) => {
      const esFirst = idx === 0;
      const esLast  = idx === totalLotes - 1;

      const cantLote  = lote ? lote.cantidad  : p.cantidad;
      const vencLote  = lote ? lote.vencimiento : p.vencimiento;
      const codLote   = lote ? (lote.codigo_lote || null) : null;
      const loteId    = lote ? lote.id : null;

      const estadoLote  = estadoCalc(cantLote, p.umbral_critico, p.umbral_bajo);
      const vencido     = !!(vencLote && vencLote < today);
      const por_vencer  = !!(vencLote && vencLote >= today && vencLote <= en30);

      const thumb = esFirst
        ? (p.foto
            ? `<img src="${p.foto}" class="prod-thumb prod-thumb-click" alt="${esc(p.nombre)}" loading="lazy" onclick="window._verFoto('${p.foto}','${esc(p.nombre)}')">`
            : `<div class="prod-thumb-placeholder" title="Sin foto">📷</div>`)
        : '';

      const ubicNombre   = lote?.ubicacion_nombre || null;
      const numCompra    = lote?.numero_compra    || null;

      let nombreCell;
      if (esFirst) {
        nombreCell = `<strong>${esc(p.nombre)}</strong>`;
        if (codLote) nombreCell += `<br><span class="lote-badge">Lote: ${esc(codLote)}</span>`;
        else if (totalLotes === 1) nombreCell += `<br><span class="text-muted" style="font-size:.72rem">Sin código de lote</span>`;
      } else {
        nombreCell = `<span style="padding-left:.75rem;color:var(--color-text-muted)">↳</span> <span class="lote-badge">${codLote ? esc(codLote) : '(sin código)'}</span>`;
      }
      if (numCompra) nombreCell += ` <span style="font-size:.72rem;color:var(--color-text-muted)">OC: ${esc(numCompra)}</span>`;

      const loteArg = loteId ? `'${loteId}'` : 'null';
      const accionesBotones = `
        <button class="btn btn-sq btn-success" title="Sumar stock" onclick="window._addStock('${p.id}',${loteArg})">+</button>
        <button class="btn btn-sq btn-danger"  title="Restar stock" onclick="window._subStock('${p.id}',${loteArg})">−</button>
        <button class="btn btn-sq btn-edit btn-secondary" title="Editar producto y lote" onclick="window._editItem('${p.id}',${loteArg})">✎ Editar</button>
        ${esFirst
          ? `<button class="btn btn-sq btn-wide btn-secondary" title="Agregar lote" onclick="window._addLote('${p.id}')">＋ Lote</button>
             <button class="btn btn-sq btn-trash" title="Eliminar producto" onclick="window._delProducto('${p.id}')">🗑</button>`
          : `<button class="btn btn-sq btn-trash" title="Eliminar lote" onclick="window._delLote('${loteId}','${p.id}')">🗑</button>`}
      `;

      rows.push(`
        <tr class="${esFirst ? 'prod-first-lot' : 'prod-extra-lot'}${esLast ? ' prod-last-lot' : ''}">
          <td>${thumb}</td>
          <td>${nombreCell}</td>
          <td>${esFirst ? esc(p.categoria_nombre) : ''}</td>
          <td class="text-right">${fmtNum(cantLote)}</td>
          <td>${estadoBadge(estadoLote, vencido, por_vencer)}</td>
          <td>${fmtFechaSolo(vencLote)}</td>
          <td>${ubicNombre ? `<span class="lote-badge">${esc(ubicNombre)}</span>` : ''}</td>
          <td class="acciones">${accionesBotones}</td>
        </tr>
      `);
    });
  }

  tbody.innerHTML = rows.join('');
}

// ===== Formulario producto =====
function abrirFormProducto(id) {
  const prod   = id ? _productos.find(p => p.id === id) : null;
  const titulo = prod ? 'Editar Producto' : 'Nuevo Producto';
  const opsCat = _categorias.map(c =>
    `<option value="${c.id}" ${prod?.categoria_id == c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`
  ).join('');

  abrirModal(`
    <div class="modal-header">
      <h3>${titulo}</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <form id="form-producto" novalidate>
      <div class="form-row">
        <div class="form-group" style="grid-column:1/-1">
          <label>Nombre *</label>
          <input type="text" name="nombre" value="${esc(prod?.nombre||'')}" required>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Categoría *</label>
          <select name="categoria_id" required><option value="">Seleccione...</option>${opsCat}</select>
        </div>
        ${!prod ? `
        <div class="form-group">
          <label>Cantidad inicial</label>
          <input type="number" name="cantidad" value="0" min="0">
        </div>
        <div class="form-group">
          <label>Código de lote inicial</label>
          <input type="text" name="codigo_lote" placeholder="Ej: L2025-001 (opcional)">
        </div>
        <div class="form-group">
          <label>Vencimiento lote inicial</label>
          <input type="date" name="vencimiento_lote">
        </div>
        <div class="form-group">
          <label>Ubicación</label>
          ${selectUbicacion()}
        </div>
        <div class="form-group">
          <label>N° de compra</label>
          <input type="text" name="numero_compra" placeholder="Opcional">
        </div>
        ` : ''}
        <div class="form-group">
          <label>Umbral crítico</label>
          <input type="number" name="umbral_critico" value="${prod?.umbral_critico||0}" min="0">
        </div>
        <div class="form-group">
          <label>Umbral bajo</label>
          <input type="number" name="umbral_bajo" value="${prod?.umbral_bajo||0}" min="0">
        </div>
      </div>

      <div class="form-group" style="margin-top:.25rem">
        <label>Foto del producto</label>
        <div class="foto-upload-area${prod?.foto ? ' has-preview' : ''}" id="foto-drop-area">
          ${prod?.foto
            ? `<img src="${prod.foto}?t=${Date.now()}" class="foto-preview" id="foto-preview-img" alt="foto">`
            : `<div id="foto-preview-img" style="display:none"></div>`}
          <div id="foto-placeholder" style="${prod?.foto ? 'display:none' : ''}; font-size:.85rem; color:var(--color-text-muted)">
            📷 Haz clic o arrastra una imagen aquí
          </div>
          <input type="file" id="foto-input" accept="image/*" style="display:none">
        </div>
      </div>

      <div id="form-prod-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">${prod ? 'Guardar cambios' : 'Crear producto'}</button>
      </div>
    </form>
  `, { size: 'lg' });

  const getFotoFile = configurarFotoUpload();

  document.getElementById('form-producto').addEventListener('submit', async e => {
    e.preventDefault();
    const fd   = new FormData(e.target);
    const data = Object.fromEntries(fd);
    const errEl = document.getElementById('form-prod-error');
    errEl.classList.add('hidden');

    try {
      let prodId = prod?.id;
      if (prod) {
        await prodApi.editar(prod.id, data);
      } else {
        const cantInicial = Number(data.cantidad) || 0;
        const r = await prodApi.crear({ ...data, cantidad: 0 }); // siempre 0, lote maneja el stock
        prodId = r.id;
        if (cantInicial > 0) {
          await movApi.crear({
            producto_id:      prodId,
            tipo:             'entrada',
            cantidad:         cantInicial,
            codigo_lote:      data.codigo_lote      || null,
            vencimiento_lote: data.vencimiento_lote || null,
            ubicacion_id:     data.ubicacion_id     || null,
            ubicacion_nombre: _ubicaciones.find(u => u.id === data.ubicacion_id)?.nombre || null,
            numero_compra:    data.numero_compra    || null,
            motivo:           'Stock inicial',
          });
        }
      }
      const fotoFile = getFotoFile();
      if (fotoFile && prodId) await prodApi.subirFoto(prodId, fotoFile);
      toast(prod ? 'Producto actualizado' : 'Producto creado');
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== Modal movimiento (por lote) =====
function abrirModalMovimiento(productoId, loteId, tipoPreset) {
  const prod = _productos.find(p => p.id === productoId);
  if (!prod) return;

  const lote = loteId ? prod.lotes?.find(l => l.id === loteId) : null;
  const cantActual = lote ? lote.cantidad : prod.cantidad;
  const codLoteLabel = lote?.codigo_lote ? ` — Lote: ${esc(lote.codigo_lote)}` : '';

  abrirModal(`
    <div class="modal-header">
      <h3>Registrar Movimiento</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    ${prod.foto ? `<img src="${prod.foto}" style="width:100%;max-height:90px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:.75rem">` : ''}
    <p style="margin-bottom:.75rem">
      <strong>${esc(prod.nombre)}</strong>${codLoteLabel}
      <br><span class="text-muted">Stock actual: <strong>${fmtNum(cantActual)}</strong></span>
    </p>
    <form id="form-movimiento" novalidate>
      <div class="form-row">
        <div class="form-group">
          <label>Tipo *</label>
          <select name="tipo" required>
            <option value="entrada">Entrada (+)</option>
            <option value="salida">Salida − ${loteId ? '(este lote)' : '(FIFO automático)'}</option>
            <option value="ajuste">Ajuste (=)</option>
          </select>
        </div>
        <div class="form-group">
          <label id="lbl-cantidad">Cantidad *</label>
          <input type="number" name="cantidad" min="0" required>
        </div>
      </div>
      <div id="panel-entrada" style="display:none">
        <div class="form-row">
          <div class="form-group">
            <label>Código de lote</label>
            <input type="text" name="codigo_lote" value="${esc(lote?.codigo_lote||'')}" placeholder="Opcional">
          </div>
          <div class="form-group">
            <label>Vencimiento</label>
            <input type="date" name="vencimiento_lote" value="${lote?.vencimiento||''}">
          </div>
          <div class="form-group">
            <label>Ubicación</label>
          ${selectUbicacion(lote?.ubicacion_id||'')}
          </div>
          <div class="form-group">
            <label>N° de compra</label>
            <input type="text" name="numero_compra" value="${esc(lote?.numero_compra||'')}" placeholder="Opcional">
          </div>
        </div>
      </div>
      <div id="ayuda-salida" class="alert alert-info hidden" style="margin-bottom:.5rem;font-size:.82rem">
        ${loteId ? 'La salida se descuenta de este lote específico.' : 'La salida consume el lote más antiguo primero (FIFO automático).'}
      </div>
      <div id="ayuda-ajuste" class="alert alert-info hidden" style="margin-bottom:.5rem;font-size:.82rem">
        Ingrese el nuevo total de stock para este lote.
      </div>
      <div class="form-group">
        <label>Motivo</label>
        <input type="text" name="motivo" placeholder="Opcional">
      </div>
      <div id="form-mov-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Registrar</button>
      </div>
    </form>
  `);

  const tipoSel = document.querySelector('#form-movimiento [name=tipo]');
  if (tipoPreset) tipoSel.value = tipoPreset;
  tipoSel.dispatchEvent(new Event('change'));
  tipoSel.addEventListener('change', () => {
    const t = tipoSel.value;
    document.getElementById('panel-entrada').style.display  = t === 'entrada' ? '' : 'none';
    document.getElementById('ayuda-salida').classList.toggle('hidden', t !== 'salida');
    document.getElementById('ayuda-ajuste').classList.toggle('hidden', t !== 'ajuste');
    document.getElementById('lbl-cantidad').textContent = t === 'ajuste' ? 'Nuevo stock total *' : 'Cantidad *';
  });

  document.getElementById('form-movimiento').addEventListener('submit', async e => {
    e.preventDefault();
    const fd  = new FormData(e.target);
    const raw = Object.fromEntries(fd);
    const errEl = document.getElementById('form-mov-error');
    errEl.classList.add('hidden');

    const payload = {
      producto_id: productoId,
      tipo:        raw.tipo,
      cantidad:    raw.cantidad,
      motivo:      raw.motivo || null,
    };
    if (raw.tipo === 'entrada') {
      payload.codigo_lote      = raw.codigo_lote      || null;
      payload.vencimiento_lote = raw.vencimiento_lote || null;
      payload.ubicacion_id     = raw.ubicacion_id     || null;
      payload.ubicacion_nombre = _ubicaciones.find(u => u.id === raw.ubicacion_id)?.nombre || null;
      payload.numero_compra    = raw.numero_compra    || null;
    }
    if ((raw.tipo === 'salida' || raw.tipo === 'ajuste') && loteId) {
      payload.lote_id = loteId;
    }

    try {
      await movApi.crear(payload);
      toast('Movimiento registrado');
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== Modal nuevo lote =====
function abrirModalNuevoLote(productoId) {
  const prod = _productos.find(p => p.id === productoId);
  if (!prod) return;

  abrirModal(`
    <div class="modal-header">
      <h3>Agregar lote — ${esc(prod.nombre)}</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <form id="form-nuevo-lote" novalidate>
      <div class="form-row">
        <div class="form-group">
          <label>Cantidad *</label>
          <input type="number" name="cantidad" min="1" value="1" required>
        </div>
        <div class="form-group">
          <label>Código de lote</label>
          <input type="text" name="codigo_lote" placeholder="Ej: L2025-001 (opcional)">
        </div>
        <div class="form-group">
          <label>Vencimiento</label>
          <input type="date" name="vencimiento">
        </div>
        <div class="form-group">
          <label>Ubicación</label>
          ${selectUbicacion()}
        </div>
        <div class="form-group">
          <label>N° de compra</label>
          <input type="text" name="numero_compra" placeholder="Opcional">
        </div>
      </div>
      <p style="color:var(--color-text-muted);font-size:.82rem;margin:.25rem 0 .5rem">
        Si el código de lote ya existe, se sumará la cantidad a ese lote.
      </p>
      <div id="form-lote-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Agregar lote</button>
      </div>
    </form>
  `, { size: 'lg' });

  document.getElementById('form-nuevo-lote').addEventListener('submit', async e => {
    e.preventDefault();
    const raw   = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('form-lote-error');
    errEl.classList.add('hidden');
    try {
      await lotesApi.crear({
        producto_id:      productoId,
        cantidad:         raw.cantidad,
        codigo_lote:      raw.codigo_lote  || null,
        vencimiento:      raw.vencimiento  || null,
        ubicacion_id:     raw.ubicacion_id || null,
        ubicacion_nombre: _ubicaciones.find(u => u.id === raw.ubicacion_id)?.nombre || null,
        numero_compra:    raw.numero_compra || null,
      });
      toast('Lote agregado');
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== Modal editar item (producto + lote) =====
function abrirModalEditarItem(productoId, loteId) {
  const prod = _productos.find(p => p.id === productoId);
  if (!prod) return;
  const lote = loteId ? prod.lotes?.find(l => l.id === loteId) : null;
  const opsCat = _categorias.map(c =>
    `<option value="${c.id}" ${prod.categoria_id == c.id ? 'selected' : ''}>${esc(c.nombre)}</option>`
  ).join('');

  abrirModal(`
    <div class="modal-header">
      <h3>Editar — ${esc(prod.nombre)}</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <form id="form-editar-item" novalidate>
      <h4 class="edit-section-title">Producto</h4>
      <div class="form-row">
        <div class="form-group" style="grid-column:1/-1">
          <label>Nombre *</label>
          <input type="text" name="nombre" value="${esc(prod.nombre)}" required>
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Categoría *</label>
          <select name="categoria_id" required><option value="">Seleccione...</option>${opsCat}</select>
        </div>
        <div class="form-group">
          <label>Umbral crítico</label>
          <input type="number" name="umbral_critico" value="${prod.umbral_critico||0}" min="0">
        </div>
        <div class="form-group">
          <label>Umbral bajo</label>
          <input type="number" name="umbral_bajo" value="${prod.umbral_bajo||0}" min="0">
        </div>
      </div>

      ${lote ? `
      <h4 class="edit-section-title">Lote${lote.codigo_lote ? ` — ${esc(lote.codigo_lote)}` : ''}</h4>
      <div class="form-row">
        <div class="form-group">
          <label>Código de lote</label>
          <input type="text" name="codigo_lote" value="${esc(lote.codigo_lote||'')}">
        </div>
        <div class="form-group">
          <label>Vencimiento</label>
          <input type="date" name="vencimiento" value="${lote.vencimiento||''}">
        </div>
        <div class="form-group">
          <label>Ubicación</label>
          ${selectUbicacion(lote.ubicacion_id||'')}
        </div>
        <div class="form-group">
          <label>N° de compra</label>
          <input type="text" name="numero_compra" value="${esc(lote.numero_compra||'')}">
        </div>
      </div>
      <p style="color:var(--color-text-muted);font-size:.82rem;margin:.1rem 0 .5rem">
        Cantidad actual: <strong>${fmtNum(lote.cantidad)}</strong> — usa <strong>+</strong> / <strong>−</strong> para modificar la cantidad.
      </p>
      ` : ''}

      <h4 class="edit-section-title">Foto</h4>
      <div class="form-group" style="margin-top:.25rem">
        <div class="foto-upload-area${prod.foto ? ' has-preview' : ''}" id="foto-drop-area">
          ${prod.foto
            ? `<img src="${prod.foto}?t=${Date.now()}" class="foto-preview" id="foto-preview-img" alt="foto">`
            : `<div id="foto-preview-img" style="display:none"></div>`}
          <div id="foto-placeholder" style="${prod.foto ? 'display:none' : ''}; font-size:.85rem; color:var(--color-text-muted)">
            📷 Haz clic o arrastra una imagen aquí
          </div>
          <input type="file" id="foto-input" accept="image/*" style="display:none">
        </div>
      </div>

      <div id="form-item-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Guardar cambios</button>
      </div>
    </form>
  `, { size: 'lg' });

  const getFotoFile = configurarFotoUpload();

  document.getElementById('form-editar-item').addEventListener('submit', async e => {
    e.preventDefault();
    const raw   = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('form-item-error');
    errEl.classList.add('hidden');
    try {
      await prodApi.editar(productoId, {
        nombre:         raw.nombre,
        categoria_id:   raw.categoria_id,
        umbral_critico: raw.umbral_critico,
        umbral_bajo:    raw.umbral_bajo,
      });
      if (lote) {
        await lotesApi.editar(loteId, {
          codigo_lote:      raw.codigo_lote   || null,
          vencimiento:      raw.vencimiento   || null,
          ubicacion_id:     raw.ubicacion_id  || null,
          ubicacion_nombre: _ubicaciones.find(u => u.id === raw.ubicacion_id)?.nombre || null,
          numero_compra:    raw.numero_compra || null,
        });
      }
      const fotoFile = getFotoFile();
      if (fotoFile) await prodApi.subirFoto(productoId, fotoFile);
      toast('Cambios guardados');
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ===== Helper: subida de foto (arrastrar/soltar + preview) =====
// Espera en el DOM: #foto-drop-area, #foto-input, #foto-preview-img, #foto-placeholder.
// Devuelve un getter que retorna el archivo seleccionado (o null).
function configurarFotoUpload() {
  let fotoFile = null;
  const dropArea    = document.getElementById('foto-drop-area');
  const fotoInput   = document.getElementById('foto-input');
  const previewImg  = document.getElementById('foto-preview-img');
  const placeholder = document.getElementById('foto-placeholder');
  if (!dropArea) return () => null;

  function mostrarPreview(file) {
    fotoFile = file;
    const url = URL.createObjectURL(file);
    if (previewImg.tagName === 'IMG') {
      previewImg.src = url; previewImg.style.display = '';
    } else {
      const img = document.createElement('img');
      img.src = url; img.className = 'foto-preview'; img.id = 'foto-preview-img';
      dropArea.insertBefore(img, placeholder);
    }
    if (placeholder) placeholder.style.display = 'none';
    dropArea.classList.add('has-preview');
  }

  dropArea.addEventListener('click', () => fotoInput.click());
  fotoInput.addEventListener('change', e => { if (e.target.files[0]) mostrarPreview(e.target.files[0]); });
  dropArea.addEventListener('dragover', e => { e.preventDefault(); dropArea.style.borderColor = 'var(--color-primary)'; });
  dropArea.addEventListener('dragleave', () => { dropArea.style.borderColor = ''; });
  dropArea.addEventListener('drop', e => {
    e.preventDefault(); dropArea.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) mostrarPreview(file);
  });

  return () => fotoFile;
}

async function exportarInventario() {
  const { exportarInventarioExcel } = await import('./excel.js');
  exportarInventarioExcel(_productos);
}

// ===== Globales para onclick en tabla =====
window._addStock = (prodId, loteId) => abrirModalMovimiento(prodId, loteId, 'entrada');
window._subStock = (prodId, loteId) => abrirModalMovimiento(prodId, loteId, 'salida');
window._editItem = (prodId, loteId) => abrirModalEditarItem(prodId, loteId);
window._addLote  = (prodId) => abrirModalNuevoLote(prodId);
window._delProducto  = async (id) => {
  const p  = _productos.find(p => p.id === id);
  const ok = await confirmar(`¿Eliminar <strong>${esc(p?.nombre||id)}</strong>?`);
  if (!ok) return;
  try { await prodApi.eliminar(id); toast('Producto eliminado'); cargar(); }
  catch (e) { toast('Error: ' + e.message, 'error'); }
};
window._delLote = async (loteId, prodId) => {
  const prod = _productos.find(p => p.id === prodId);
  const lote = prod?.lotes?.find(l => l.id === loteId);
  const label = lote?.codigo_lote ? `el lote <strong>${esc(lote.codigo_lote)}</strong>` : 'este lote';
  const aviso = lote?.cantidad > 0 ? `<br><span class="text-muted">Aún tiene ${fmtNum(lote.cantidad)} unidades.</span>` : '';
  const ok = await confirmar(`¿Eliminar ${label}?${aviso}`);
  if (!ok) return;
  try { await lotesApi.eliminar(loteId, true); toast('Lote eliminado'); cargar(); }
  catch (e) { toast('Error: ' + e.message, 'error'); }
};

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function selectUbicacion(selectedId = '') {
  const ops = _ubicaciones.map(u =>
    `<option value="${u.id}" data-nombre="${esc(u.nombre)}" ${u.id === selectedId ? 'selected' : ''}>${esc(u.nombre)}</option>`
  ).join('');
  return `<select name="ubicacion_id"><option value="">Sin ubicación</option>${ops}</select>`;
}

// ===== Importar Excel =====
function abrirModalImportarExcel() {
  const opsCat = _categorias.map(c =>
    `<option value="${c.id}">${esc(c.nombre)}</option>`
  ).join('');

  abrirModal(`
    <div class="modal-header">
      <h3>📂 Importar productos desde Excel</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <p style="font-size:.85rem;color:var(--color-text-muted);margin-bottom:.75rem">
      El archivo debe tener los nombres de los productos en la <strong>columna A</strong> (la primera fila se omite como encabezado).
      Se crearán con stock 0 y podrás editar cada uno después.
    </p>
    <div class="form-row">
      <div class="form-group" style="grid-column:1/-1">
        <label>Archivo Excel (.xlsx, .xls, .csv) *</label>
        <input type="file" id="imp-file" accept=".xlsx,.xls,.csv" required>
      </div>
      <div class="form-group" style="grid-column:1/-1">
        <label>Categoría para todos los productos *</label>
        <select id="imp-categoria" required>
          <option value="">Seleccione una categoría...</option>${opsCat}
        </select>
      </div>
    </div>
    <div id="imp-preview" style="display:none;margin-bottom:.75rem">
      <p style="font-size:.82rem;font-weight:600;margin-bottom:.4rem">Vista previa (<span id="imp-count">0</span> productos):</p>
      <div id="imp-lista" style="max-height:200px;overflow-y:auto;font-size:.82rem;border:1px solid var(--color-border);border-radius:var(--radius-sm);padding:.5rem;background:var(--color-surface)"></div>
    </div>
    <div id="imp-error" class="alert alert-error hidden"></div>
    <div class="modal-footer">
      <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
      <button id="imp-btn-confirmar" class="btn btn-primary" disabled>Importar</button>
    </div>
  `, { size: 'lg' });

  let nombres = [];

  document.getElementById('imp-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const wb   = XLSX.read(ev.target.result, { type: 'array' });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        // Tomar columna A, saltar primera fila (encabezado), filtrar vacíos
        nombres = rows.slice(1)
          .map(r => String(r[0] || '').trim())
          .filter(n => n.length > 0);

        document.getElementById('imp-count').textContent = nombres.length;
        document.getElementById('imp-lista').innerHTML = nombres
          .map(n => `<div style="padding:.15rem 0;border-bottom:1px solid var(--color-border)">${esc(n)}</div>`)
          .join('');
        document.getElementById('imp-preview').style.display = '';
        document.getElementById('imp-btn-confirmar').disabled = nombres.length === 0;
      } catch {
        document.getElementById('imp-error').textContent = 'No se pudo leer el archivo.';
        document.getElementById('imp-error').classList.remove('hidden');
      }
    };
    reader.readAsArrayBuffer(file);
  });

  document.getElementById('imp-btn-confirmar').addEventListener('click', async () => {
    const catId  = document.getElementById('imp-categoria').value;
    const errEl  = document.getElementById('imp-error');
    errEl.classList.add('hidden');

    if (!catId)         { errEl.textContent = 'Selecciona una categoría.'; errEl.classList.remove('hidden'); return; }
    if (!nombres.length){ errEl.textContent = 'No hay productos para importar.'; errEl.classList.remove('hidden'); return; }

    const btn = document.getElementById('imp-btn-confirmar');
    btn.disabled = true; btn.textContent = `Importando 0/${nombres.length}...`;

    let ok = 0, errores = 0;
    for (const nombre of nombres) {
      try {
        await prodApi.crear({ nombre, categoria_id: catId, cantidad: 0, umbral_critico: 0, umbral_bajo: 0 });
        ok++;
      } catch { errores++; }
      btn.textContent = `Importando ${ok + errores}/${nombres.length}...`;
    }

    toast(`Importación completa: ${ok} creados${errores ? `, ${errores} errores` : ''}`);
    cerrarModal();
    cargar();
  });
}

// ===== Lightbox =====
window._verFoto = function(src, nombre) {
  const existing = document.getElementById('lightbox-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lightbox-overlay';
  overlay.innerHTML = `
    <div id="lightbox-inner">
      <img src="${src}" alt="${nombre}">
      <p>${nombre}</p>
    </div>
  `;
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('visible'));

  overlay.addEventListener('click', () => {
    overlay.classList.remove('visible');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  });

  const onKey = e => { if (e.key === 'Escape') overlay.click(); };
  document.addEventListener('keydown', onKey, { once: true });
};
