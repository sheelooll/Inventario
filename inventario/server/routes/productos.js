const router = require('express').Router();
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const db     = require('../db');

// Configuración de multer para fotos de productos
const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../public/img/productos'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `prod_${req.params.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Solo se permiten imágenes'));
    cb(null, true);
  }
});

function estado(cantidad, umbral_critico, umbral_bajo) {
  if (cantidad <= umbral_critico) return 'critico';
  if (cantidad <= umbral_bajo)    return 'bajo';
  return 'aceptable';
}

function enriquece(p) {
  const today = new Date().toISOString().slice(0, 10);
  const en30  = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  return {
    ...p,
    estado:     estado(p.cantidad, p.umbral_critico, p.umbral_bajo),
    vencido:    !!(p.vencimiento && p.vencimiento < today),
    por_vencer: !!(p.vencimiento && p.vencimiento >= today && p.vencimiento <= en30),
  };
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON p.categoria_id = c.id
    WHERE p.activo = 1
    ORDER BY p.nombre
  `).all();

  // Vencimiento más lejano primero (es el lote "principal" del producto)
  const getLotes = db.prepare(`
    SELECT * FROM lotes WHERE producto_id=?
    ORDER BY (vencimiento IS NULL) ASC, vencimiento DESC, fecha_ingreso ASC
  `);
  const result = rows.map(p => ({
    ...enriquece(p),
    lotes: getLotes.all(p.id)
  }));
  res.json(result);
});

router.post('/', (req, res) => {
  const { nombre, categoria_id, cantidad = 0, unidades_por_caja = 1,
          umbral_critico = 0, umbral_bajo = 0, vencimiento, lote } = req.body;

  if (!nombre || !categoria_id) return res.status(400).json({ error: 'Nombre y categoría son requeridos' });
  if (Number(umbral_critico) > Number(umbral_bajo))
    return res.status(400).json({ error: 'umbral_critico debe ser ≤ umbral_bajo' });

  try {
    const r = db.prepare(`
      INSERT INTO productos (nombre,categoria_id,cantidad,unidades_por_caja,umbral_critico,umbral_bajo,vencimiento,lote)
      VALUES (?,?,?,?,?,?,?,?)
    `).run(nombre, categoria_id, cantidad, unidades_por_caja,
           umbral_critico, umbral_bajo, vencimiento || null, lote || null);

    if (Number(cantidad) > 0) {
      db.prepare(`INSERT INTO movimientos (producto_id,tipo,cantidad,stock_resultante,usuario_id,motivo)
                  VALUES (?,?,?,?,?,?)`)
        .run(r.lastInsertRowid, 'entrada', cantidad, cantidad, req.session.userId, 'Stock inicial');
    }
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', (req, res) => {
  const { nombre, categoria_id, unidades_por_caja = 1,
          umbral_critico = 0, umbral_bajo = 0, vencimiento, lote } = req.body;

  if (!nombre || !categoria_id) return res.status(400).json({ error: 'Nombre y categoría son requeridos' });
  if (Number(umbral_critico) > Number(umbral_bajo))
    return res.status(400).json({ error: 'umbral_critico debe ser ≤ umbral_bajo' });

  try {
    db.prepare(`UPDATE productos SET nombre=?,categoria_id=?,unidades_por_caja=?,
                umbral_critico=?,umbral_bajo=?,vencimiento=?,lote=?
                WHERE id=? AND activo=1`)
      .run(nombre, categoria_id, unidades_por_caja, umbral_critico, umbral_bajo,
           vencimiento || null, lote || null, req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Subir foto del producto
router.post('/:id/foto', (req, res, next) => {
  upload.single('foto')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });

    const prod = db.prepare('SELECT foto FROM productos WHERE id=?').get(req.params.id);
    if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

    // Borrar foto anterior si existe
    if (prod.foto) {
      const oldPath = path.join(__dirname, '../../public', prod.foto);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const fotoUrl = `/img/productos/${req.file.filename}`;
    db.prepare('UPDATE productos SET foto=? WHERE id=?').run(fotoUrl, req.params.id);
    res.json({ ok: true, foto: fotoUrl });
  });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE productos SET activo=0 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
