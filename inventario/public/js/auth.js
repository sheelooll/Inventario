import { auth as authApi } from './api.js';

export async function verificarSesion() {
  try {
    return await authApi.me(); // devuelve { id, nombre, usuario, rol } o lanza error
  } catch {
    return null;
  }
}

export function iniciarAuth(onLogin) {
  const form     = document.getElementById('login-form');
  const errDiv   = document.getElementById('login-error');
  const loginBtn = document.getElementById('login-btn');

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const usuario  = document.getElementById('login-usuario').value.trim();
    const password = document.getElementById('login-password').value;

    errDiv.classList.add('hidden');
    errDiv.textContent = '';
    loginBtn.disabled = true;
    loginBtn.textContent = 'Ingresando...';

    try {
      const usuario_data = await authApi.login(usuario, password);
      onLogin(usuario_data);
    } catch (err) {
      const code = err.code || '';
      errDiv.textContent = (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
        ? 'Usuario o contraseña incorrectos'
        : err.message;
      errDiv.classList.remove('hidden');
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = 'Ingresar';
    }
  });
}

export async function cerrarSesion(onLogout) {
  window.__sesionActiva = false;
  try { await authApi.logout(); } catch {}
  onLogout();
}
