import { verificarSesion, iniciarAuth, cerrarSesion } from './auth.js';
import { iniciarInventario }  from './inventario.js';
import { iniciarCategorias }  from './categorias.js';
import { iniciarMovimientos } from './movimientos.js';
import { iniciarCotizaciones } from './cotizaciones.js';
import { iniciarReportes }    from './reportes.js';
import { iniciarUsuarios }    from './usuarios.js';

const loginScreen = document.getElementById('login-screen');
const appEl       = document.getElementById('app');
const userDisplay = document.getElementById('user-display');
const btnLogout   = document.getElementById('btn-logout');
const navToggle   = document.getElementById('nav-toggle');
const sidebar     = document.getElementById('sidebar');

const VISTAS = {
  inventario:   iniciarInventario,
  categorias:   iniciarCategorias,
  movimientos:  iniciarMovimientos,
  cotizaciones: iniciarCotizaciones,
  reportes:     iniciarReportes,
  usuarios:     iniciarUsuarios,
};

const iniciadas = new Set();

function mostrarLogin() {
  appEl.classList.add('hidden');
  loginScreen.classList.remove('hidden');
}

function mostrarApp(usuario) {
  window.__sesionActiva = true;
  window.__usuarioActivo = usuario;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userDisplay.textContent = usuario.nombre;
  const avatar = document.getElementById('user-avatar');
  if (avatar) {
    const nombre = (usuario.nombre || '').trim();
    avatar.textContent = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '--';
    avatar.title = nombre;
  }

  // Solo admins ven todo; usuarios normales solo ven Inventario
  const soloAdmin = ['movimientos', 'categorias', 'cotizaciones', 'reportes', 'usuarios'];
  document.querySelectorAll('.nav-link[data-view]').forEach(a => {
    const esAdminOnly = soloAdmin.includes(a.dataset.view);
    a.parentElement.style.display = (esAdminOnly && usuario.rol !== 'admin') ? 'none' : '';
  });

  const hash = location.hash.slice(1);
  const destino = (usuario.rol !== 'admin' && hash !== 'inventario') ? 'inventario' : (VISTAS[hash] ? hash : 'inventario');
  navegarA(destino);
}

function navegarA(vista) {
  if (!VISTAS[vista]) vista = 'inventario';
  const u = window.__usuarioActivo;
  if (u && u.rol !== 'admin' && vista !== 'inventario') vista = 'inventario';

  document.querySelectorAll('.nav-link').forEach(a =>
    a.classList.toggle('active', a.dataset.view === vista)
  );
  document.querySelectorAll('.view').forEach(s => s.classList.add('hidden'));
  document.getElementById(`view-${vista}`).classList.remove('hidden');

  cerrarMenuMovil();
  history.replaceState(null, '', `#${vista}`);

  if (!iniciadas.has(vista)) {
    iniciadas.add(vista);
    VISTAS[vista]();
  } else {
    document.dispatchEvent(new CustomEvent(`refresh:${vista}`));
  }
}

// Navegación por links del menú
document.querySelectorAll('.nav-link[data-view]').forEach(a => {
  a.addEventListener('click', e => { e.preventDefault(); navegarA(a.dataset.view); });
});

// Hamburguesa en móvil
const navToggleIcon = document.getElementById('nav-toggle-icon');
function cerrarMenuMovil() {
  sidebar.classList.remove('open');
  if (navToggleIcon) navToggleIcon.textContent = 'menu';
}
navToggle.addEventListener('click', () => {
  const abierto = sidebar.classList.toggle('open');
  if (navToggleIcon) navToggleIcon.textContent = abierto ? 'close' : 'menu';
});

// Cerrar sesión (escritorio y menú móvil)
btnLogout.addEventListener('click', () => cerrarSesion(mostrarLogin));
document.getElementById('btn-logout-mobile')?.addEventListener('click', e => {
  e.preventDefault();
  cerrarMenuMovil();
  cerrarSesion(mostrarLogin);
});

// Tema claro / oscuro
document.querySelectorAll('.theme-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const oscuro = document.documentElement.classList.toggle('dark');
    try { localStorage.setItem('inv-theme', oscuro ? 'dark' : 'light'); } catch (e) {}
  });
});

// Exponer para otros módulos
window.navegarA = navegarA;

// Bootstrap
(async () => {
  const usuario = await verificarSesion();
  if (usuario) {
    mostrarApp(usuario);
  } else {
    mostrarLogin();
    iniciarAuth(mostrarApp);
  }
})();
