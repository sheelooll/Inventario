// Wrapper fetch con manejo centralizado de errores
async function apiFetch(url, opts = {}) {
  // FormData: dejar que el browser ponga Content-Type con el boundary correcto
  const headers = opts.body instanceof FormData
    ? {}
    : { 'Content-Type': 'application/json', ...(opts.headers || {}) };

  const res = await fetch(url, { credentials: 'same-origin', ...opts, headers });

  if (res.status === 401) {
    // Solo recargar si la sesión ya había iniciado (no durante el chequeo inicial)
    if (window.__sesionActiva) window.location.reload();
    throw new Error('No autenticado');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
}

// ===== Auth =====
export const auth = {
  login:  (u, p) => apiFetch('/api/auth/login',  { method: 'POST', body: JSON.stringify({ usuario: u, password: p }) }),
  logout: ()     => apiFetch('/api/auth/logout',  { method: 'POST' }),
  me:     ()     => apiFetch('/api/auth/me'),
};

// ===== Productos =====
export const productos = {
  listar:   ()         => apiFetch('/api/productos'),
  crear:    (data)     => apiFetch('/api/productos',        { method: 'POST',   body: JSON.stringify(data) }),
  editar:   (id, data) => apiFetch(`/api/productos/${id}`,  { method: 'PUT',    body: JSON.stringify(data) }),
  eliminar: (id)       => apiFetch(`/api/productos/${id}`,  { method: 'DELETE' }),
  subirFoto: (id, file) => {
    const fd = new FormData();
    fd.append('foto', file);
    return apiFetch(`/api/productos/${id}/foto`, { method: 'POST', body: fd });
  },
};

// ===== Categorias =====
export const categorias = {
  listar:   ()         => apiFetch('/api/categorias'),
  crear:    (data)     => apiFetch('/api/categorias',       { method: 'POST',   body: JSON.stringify(data) }),
  editar:   (id, data) => apiFetch(`/api/categorias/${id}`, { method: 'PUT',    body: JSON.stringify(data) }),
  eliminar: (id)       => apiFetch(`/api/categorias/${id}`, { method: 'DELETE' }),
};

// ===== Movimientos =====
export const movimientos = {
  listar:   (params = {}) => apiFetch('/api/movimientos?' + new URLSearchParams(params)),
  crear:    (data)        => apiFetch('/api/movimientos',       { method: 'POST', body: JSON.stringify(data) }),
  batch:    (data)        => apiFetch('/api/movimientos/batch', { method: 'POST', body: JSON.stringify(data) }),
};

// ===== Lotes =====
export const lotes = {
  listar:   (producto_id)         => apiFetch('/api/lotes?producto_id=' + producto_id),
  crear:    (data)                => apiFetch('/api/lotes',        { method: 'POST',   body: JSON.stringify(data) }),
  editar:   (id, data)            => apiFetch(`/api/lotes/${id}`,  { method: 'PUT',    body: JSON.stringify(data) }),
  eliminar: (id, forzar = false)  => apiFetch(`/api/lotes/${id}${forzar ? '?forzar=1' : ''}`, { method: 'DELETE' }),
};

// ===== Reportes =====
export const reportes = {
  mensual: (params = {}) => apiFetch('/api/reportes/mensual?' + new URLSearchParams(params)),
};
