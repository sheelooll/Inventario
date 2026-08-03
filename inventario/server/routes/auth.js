const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../db');

router.post('/login', (req, res) => {
  const { usuario, password } = req.body;
  if (!usuario || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });

  const user = db.prepare('SELECT * FROM usuarios WHERE usuario = ? AND activo = 1').get(usuario);
  if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

  req.session.userId  = user.id;
  req.session.usuario = user.usuario;
  req.session.nombre  = user.nombre;
  req.session.rol     = user.rol;

  res.json({ id: user.id, nombre: user.nombre, usuario: user.usuario, rol: user.rol });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  res.json({
    id: req.session.userId,
    nombre: req.session.nombre,
    usuario: req.session.usuario,
    rol: req.session.rol
  });
});

module.exports = router;
