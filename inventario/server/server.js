const express = require('express');
const session = require('express-session');
const path = require('path');

const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Servir xlsx desde node_modules
app.use('/xlsx.full.min.js', express.static(
  path.join(__dirname, '..', 'node_modules', 'xlsx', 'dist', 'xlsx.full.min.js')
));

app.use(session({
  secret: process.env.SESSION_SECRET || 'inventario-cesfam-2024-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 horas
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  if (req.session.rol !== 'admin') return res.status(403).json({ error: 'Se requiere rol administrador' });
  next();
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/productos', requireAuth, require('./routes/productos'));
app.use('/api/categorias', requireAuth, require('./routes/categorias'));
app.use('/api/movimientos', requireAuth, require('./routes/movimientos'));
app.use('/api/lotes', requireAuth, require('./routes/lotes'));
app.use('/api/reportes', requireAuth, require('./routes/reportes'));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nServidor corriendo en http://localhost:${PORT}`);
  console.log('Usuario admin: admin  |  Contraseña: admin123\n');
});
