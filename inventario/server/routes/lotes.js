const router = require('express').Router();
const db = require('../db');

function deleteLote(id) {
  db.prepare('UPDATE movimientos SET lote_id=NULL WHERE lote_id=?').run(id);
  db.prepare('DELETE FROM lotes WHERE id=?').run(id);
}

// Sincroniza cantidad, vencimiento y lote principal del producto
// usando el lote con vencimiento más lejano como referencia principal
function syncProducto(producto_id) {
  const total = db.prepare(
    'SELECT COALESCE(SUM(cantidad),0) as t FROM lotes WHERE producto_id=?'
  ).get(producto_id).t;

  // Lote con vencimiento más lejano (NULLs al final)
  const principal = db.prepare(`
    SELECT codigo_lote, vencimiento FROM lotes
    WHERE producto_id=?
    ORDER BY (vencimiento IS NULL) ASC, vencimiento DESC, id DESC
    LIMIT 1
  `).get(producto_id);

  db.prepare('UPDATE productos SET cantidad=?, vencimiento=?, lote=? WHERE id=?').run(
    total,
    principal?.vencimiento ?? null,
    principal?.codigo_lote ?? null,
    producto_id
  );
}

// Listar lotes de un producto (vencimiento más lejano primero = principal)
router.get('/', (req, res) => {
  const { producto_id } = req.query;
  if (!producto_id) return res.status(400).json({ error: 'producto_id requerido' });
  const lotes = db.prepare(`
    SELECT * FROM lotes WHERE producto_id=?
    ORDER BY (vencimiento IS NULL) ASC, vencimiento DESC, fecha_ingreso ASC
  `).all(producto_id);
  res.json(lotes);
});

// Crear lote para un producto (o sumar a uno existente con mismo código)
router.post('/', (req, res) => {
  const { producto_id, codigo_lote, cantidad, vencimiento } = req.body;
  if (!producto_id || cantidad == null) return res.status(400).json({ error: 'producto_id y cantidad requeridos' });
  if (Number(cantidad) <= 0) return res.status(400).json({ error: 'Cantidad debe ser mayor a 0' });

  const prod = db.prepare('SELECT * FROM productos WHERE id=? AND activo=1').get(producto_id);
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

  let lote;
  if (codigo_lote) {
    lote = db.prepare('SELECT * FROM lotes WHERE producto_id=? AND codigo_lote=?').get(producto_id, codigo_lote);
  }

  db.transaction(() => {
    if (lote) {
      db.prepare('UPDATE lotes SET cantidad = cantidad + ? WHERE id = ?').run(Number(cantidad), lote.id);
      lote = db.prepare('SELECT * FROM lotes WHERE id=?').get(lote.id);
    } else {
      const r = db.prepare(
        'INSERT INTO lotes (producto_id, codigo_lote, cantidad, vencimiento) VALUES (?,?,?,?)'
      ).run(producto_id, codigo_lote || null, Number(cantidad), vencimiento || null);
      lote = db.prepare('SELECT * FROM lotes WHERE id=?').get(r.lastInsertRowid);
    }
    syncProducto(producto_id);

    const stock = db.prepare('SELECT cantidad FROM productos WHERE id=?').get(producto_id).cantidad;
    db.prepare(`INSERT INTO movimientos (producto_id, lote_id, tipo, cantidad, stock_resultante, usuario_id, motivo)
                VALUES (?,?,?,?,?,?,?)`)
      .run(producto_id, lote.id, 'entrada', Number(cantidad), stock,
           req.session.userId, `Ingreso lote ${codigo_lote || '(sin código)'}`);
  })();

  res.status(201).json({ ok: true, lote });
});

// Editar datos de un lote (código, vencimiento)
router.put('/:id', (req, res) => {
  const { codigo_lote, vencimiento } = req.body;
  const lote = db.prepare('SELECT * FROM lotes WHERE id=?').get(req.params.id);
  if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });

  db.transaction(() => {
    db.prepare('UPDATE lotes SET codigo_lote=?, vencimiento=? WHERE id=?').run(
      codigo_lote || null, vencimiento || null, req.params.id
    );
    syncProducto(lote.producto_id);
  })();

  res.json({ ok: true });
});

// Eliminar lote (solo si cantidad = 0 o forzado)
router.delete('/:id', (req, res) => {
  const lote = db.prepare('SELECT * FROM lotes WHERE id=?').get(req.params.id);
  if (!lote) return res.status(404).json({ error: 'Lote no encontrado' });
  if (lote.cantidad > 0 && !req.query.forzar)
    return res.status(409).json({ error: `El lote aún tiene ${lote.cantidad} unidades. Use forzar=1 para eliminar.` });

  db.transaction(() => {
    deleteLote(req.params.id);
    syncProducto(lote.producto_id);
  })();

  res.json({ ok: true });
});

module.exports = router;
