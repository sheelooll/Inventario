// ============================
// Helpers de interfaz: toasts, modales, formateo
// ============================

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export function fmtFecha(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr.replace(' ', 'T'));
  return d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
}

export function fmtFechaSolo(isoStr) {
  if (!isoStr) return '—';
  const [y, m, d] = isoStr.slice(0,10).split('-');
  return `${d}/${m}/${y}`;
}

export function fmtNum(n) {
  if (n == null) return '—';
  return Number(n).toLocaleString('es-CL');
}

export function nombreMes(n) { return MESES[n - 1] || ''; }

export function estadoBadge(estado, vencido, por_vencer) {
  if (vencido)    return '<span class="badge badge-vencido">Vencido</span>';
  if (por_vencer) return '<span class="badge badge-por-vencer">Por vencer</span>';
  const map = {
    critico:   '<span class="badge badge-critico">Crítico</span>',
    bajo:      '<span class="badge badge-bajo">Bajo</span>',
    aceptable: '<span class="badge badge-aceptable">Aceptable</span>',
  };
  return map[estado] || estado;
}

export function tipoBadge(tipo) {
  const map = {
    entrada: '<span class="badge badge-entrada">Entrada</span>',
    salida:  '<span class="badge badge-salida">Salida</span>',
    ajuste:  '<span class="badge badge-ajuste">Ajuste</span>',
  };
  return map[tipo] || tipo;
}

// ============================
// Toasts
// ============================
export function toast(msg, tipo = 'success', duracion = 3500) {
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), duracion);
}

// ============================
// Modal genérico
// ============================
export function abrirModal(html, opts = {}) {
  const overlay = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');

  const modal = document.createElement('div');
  modal.className = `modal${opts.size ? ' modal-' + opts.size : ''}`;
  modal.innerHTML = html;
  container.innerHTML = '';
  container.appendChild(modal);
  overlay.classList.remove('hidden');

  const cerrar = () => {
    overlay.classList.add('hidden');
    container.innerHTML = '';
  };

  overlay.onclick = (e) => { if (e.target === overlay) cerrar(); };
  modal.querySelectorAll('.modal-close, [data-dismiss]').forEach(el => el.addEventListener('click', cerrar));

  if (opts.onOpen) opts.onOpen(modal, cerrar);
  return cerrar;
}

export function cerrarModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal-container').innerHTML = '';
}

// ============================
// Confirmación simple
// ============================
export function confirmar(mensaje) {
  return new Promise(resolve => {
    const cerrar = abrirModal(`
      <div class="modal-header">
        <h3>Confirmar acción</h3>
        <button class="modal-close" aria-label="Cerrar">✕</button>
      </div>
      <p style="margin-bottom:1.25rem">${mensaje}</p>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-dismiss>Cancelar</button>
        <button class="btn btn-danger" id="confirm-ok">Confirmar</button>
      </div>
    `, { size: 'sm' });

    document.getElementById('confirm-ok').addEventListener('click', () => {
      cerrar();
      resolve(true);
    });
    document.querySelector('[data-dismiss]').addEventListener('click', () => resolve(false), { once: true });
  });
}
