import { usuarios as usrApi } from './api.js';
import { toast, abrirModal, cerrarModal, confirmar } from './ui.js';

let _usuarios = [];

export function iniciarUsuarios() {
  cargar();
  document.getElementById('btn-nuevo-usuario').addEventListener('click', abrirFormUsuario);
  document.addEventListener('refresh:usuarios', cargar);
}

async function cargar() {
  try {
    _usuarios = await usrApi.listar();
    renderTabla();
  } catch (e) {
    toast('Error al cargar usuarios: ' + e.message, 'error');
  }
}

function renderTabla() {
  const tbody = document.getElementById('tbody-usuarios');
  if (!_usuarios.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">No hay usuarios registrados</td></tr>';
    return;
  }
  tbody.innerHTML = _usuarios.map(u => {
    const activo = u.activo !== false;
    const badge  = activo
      ? '<span class="badge badge-success">Activo</span>'
      : '<span class="badge badge-danger">Inactivo</span>';
    const rolBadge = u.rol === 'admin'
      ? '<span class="badge badge-info">Admin</span>'
      : '<span class="badge">Usuario</span>';
    const btnToggle = activo
      ? `<button class="btn btn-secondary btn-sm" onclick="window._desactivarUsr('${u.id}')">Desactivar</button>`
      : `<button class="btn btn-secondary btn-sm" onclick="window._activarUsr('${u.id}')">Activar</button>`;
    return `
      <tr>
        <td><strong>${esc(u.nombre)}</strong><br><span class="text-muted" style="font-size:.78rem">${esc(u.email||'')}</span></td>
        <td>${rolBadge}</td>
        <td>${badge}</td>
        <td class="acciones">${btnToggle}</td>
      </tr>`;
  }).join('');
}

function abrirFormUsuario() {
  abrirModal(`
    <div class="modal-header">
      <h3>Nuevo Usuario</h3>
      <button class="modal-close" aria-label="Cerrar">✕</button>
    </div>
    <form id="form-usuario" novalidate>
      <div class="form-row">
        <div class="form-group" style="grid-column:1/-1">
          <label>Nombre completo *</label>
          <input type="text" name="nombre" required placeholder="Ej: María González">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Correo electrónico *</label>
          <input type="email" name="email" required placeholder="correo@ejemplo.com">
        </div>
        <div class="form-group">
          <label>Contraseña *</label>
          <input type="password" name="password" required minlength="6" placeholder="Mínimo 6 caracteres">
        </div>
        <div class="form-group">
          <label>Rol *</label>
          <select name="rol" required>
            <option value="usuario">Usuario</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
      </div>
      <div id="form-usr-error" class="alert alert-error hidden" style="margin-top:.5rem"></div>
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary modal-close">Cancelar</button>
        <button type="submit" class="btn btn-primary">Crear usuario</button>
      </div>
    </form>
  `);

  document.getElementById('form-usuario').addEventListener('submit', async e => {
    e.preventDefault();
    const data  = Object.fromEntries(new FormData(e.target));
    const errEl = document.getElementById('form-usr-error');
    const btn   = e.target.querySelector('[type=submit]');
    errEl.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Creando...';
    try {
      await usrApi.crear(data);
      toast('Usuario creado correctamente');
      cerrarModal();
      cargar();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Crear usuario';
    }
  });
}

window._desactivarUsr = async (id) => {
  const u  = _usuarios.find(u => u.id === id);
  const ok = await confirmar(`¿Desactivar a <strong>${esc(u?.nombre || id)}</strong>?<br><small>No podrá iniciar sesión.</small>`);
  if (!ok) return;
  try { await usrApi.desactivar(id); toast('Usuario desactivado'); cargar(); }
  catch (e) { toast('Error: ' + e.message, 'error'); }
};

window._activarUsr = async (id) => {
  const u  = _usuarios.find(u => u.id === id);
  const ok = await confirmar(`¿Reactivar a <strong>${esc(u?.nombre || id)}</strong>?`);
  if (!ok) return;
  try { await usrApi.activar(id); toast('Usuario activado'); cargar(); }
  catch (e) { toast('Error: ' + e.message, 'error'); }
};

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
