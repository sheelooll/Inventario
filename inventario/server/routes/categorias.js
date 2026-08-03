const router = require('express').Router();
const db = require('../db');

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM categorias ORDER BY nombre').all());
});

router.post('/', (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    const r = db.prepare('INSERT INTO categorias (nombre,descripcion) VALUES (?,?)').run(nombre, descripcion || null);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const { nombre, descripcion } = req.body;
  if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
  try {
    db.prepare('UPDATE categorias SET nombre=?,descripcion=? WHERE id=?').run(nombre, descripcion || null, req.params.id);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Ya existe una categoría con ese nombre' });
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', (req, res) => {
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM productos WHERE categoria_id=? AND activo=1').get(req.params.id);
  if (count > 0)
    return res.status(409).json({ error: `No se puede eliminar: hay ${count} producto(s) en esta categoría` });
  db.prepare('DELETE FROM categorias WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
