const router = require('express').Router();
const db = require('../db');

// Nullifica referencias antes de eliminar para no violar FK movimientos.lote_id
function deleteLote(id) {
  db.prepare('UPDATE movimientos SET lote_id=NULL WHERE lote_id=?').run(id);
  db.prepare('DELETE FROM lotes WHERE id=?').run(id);
}

function deleteLotesByProducto(producto_id) {
  const ids = db.prepare('SELECT id FROM lotes WHERE producto_id=?').all(producto_id).map(r => r.id);
  for (const id of ids) deleteLote(id);
}

function syncProducto(producto_id) {
  const total = db.prepare(
    'SELECT COALESCE(SUM(cantidad),0) as t FROM lotes WHERE producto_id=?'
  ).get(producto_id).t;

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

router.get('/', (req, res) => {
  const { desde, hasta, tipo, producto_id, categoria_id } = req.query;
  let q = `
    SELECT m.*, p.nombre AS producto_nombre, c.nombre AS categoria_nombre,
           u.nombre AS usuario_nombre, l.codigo_lote
    FROM movimientos m
    JOIN productos p ON m.producto_id = p.id
    JOIN categorias c ON p.categoria_id = c.id
    JOIN usuarios u ON m.usuario_id = u.id
    LEFT JOIN lotes l ON m.lote_id = l.id
    WHERE 1=1
  `;
  const params = [];
  if (desde)       { q += ' AND m.fecha >= ?';       params.push(desde); }
  if (hasta)       { q += ' AND m.fecha <= ?';       params.push(hasta + ' 23:59:59'); }
  if (tipo)        { q += ' AND m.tipo = ?';         params.push(tipo); }
  if (producto_id) { q += ' AND m.producto_id = ?';  params.push(producto_id); }
  if (categoria_id){ q += ' AND p.categoria_id = ?'; params.push(categoria_id); }
  q += ' ORDER BY m.fecha DESC LIMIT 1000';
  res.json(db.prepare(q).all(...params));
});

router.post('/', (req, res) => {
  const { producto_id, tipo, cajas, unidades_por_caja, cantidad,
          motivo, codigo_lote, vencimiento_lote } = req.body;

  if (!producto_id || !tipo || cantidad == null)
    return res.status(400).json({ error: 'producto_id, tipo y cantidad son requeridos' });
  if (!['entrada','salida','ajuste'].includes(tipo))
    return res.status(400).json({ error: 'Tipo inválido' });

  const prod = db.prepare('SELECT * FROM productos WHERE id=? AND activo=1').get(producto_id);
  if (!prod) return res.status(404).json({ error: 'Producto no encontrado' });

  const cant = Number(cantidad);
  let stockResultante;
  let loteId = null;

  try {
    db.transaction(() => {
      if (tipo === 'entrada') {
        // Buscar lote existente con mismo código o crear nuevo
        let lote = null;
        if (codigo_lote) {
          lote = db.prepare('SELECT * FROM lotes WHERE producto_id=? AND codigo_lote=?').get(producto_id, codigo_lote);
        }
        if (lote) {
          db.prepare('UPDATE lotes SET cantidad = cantidad + ? WHERE id=?').run(cant, lote.id);
          loteId = lote.id;
        } else {
          const r = db.prepare('INSERT INTO lotes (producto_id, codigo_lote, cantidad, vencimiento) VALUES (?,?,?,?)').run(
            producto_id, codigo_lote || null, cant, vencimiento_lote || null
          );
          loteId = r.lastInsertRowid;
        }
        syncProducto(producto_id);
        stockResultante = db.prepare('SELECT cantidad FROM productos WHERE id=?').get(producto_id).cantidad;

      } else if (tipo === 'salida') {
        const lote_id_salida = req.body.lote_id;

        if (lote_id_salida) {
          // Salida de un lote específico (el usuario eligió la fila)
          const lote = db.prepare('SELECT * FROM lotes WHERE id=? AND producto_id=?').get(lote_id_salida, producto_id);
          if (!lote) throw new Error('Lote no encontrado');
          if (lote.cantidad < cant)
            throw new Error(`Stock insuficiente en este lote. Stock del lote: ${lote.cantidad}`);
          const nuevaCant = lote.cantidad - cant;
          if (nuevaCant === 0) {
            deleteLote(lote_id_salida);
            loteId = null;
          } else {
            db.prepare('UPDATE lotes SET cantidad=? WHERE id=?').run(nuevaCant, lote_id_salida);
            loteId = lote_id_salida;
          }
        } else {
          // FIFO: consumir desde el lote más antiguo
          if (prod.cantidad < cant)
            throw new Error(`Stock insuficiente. Stock actual: ${prod.cantidad}`);
          const lots = db.prepare('SELECT * FROM lotes WHERE producto_id=? AND cantidad>0 ORDER BY fecha_ingreso ASC').all(producto_id);
          let restante = cant;
          for (const lote of lots) {
            if (restante <= 0) break;
            const deducir = Math.min(lote.cantidad, restante);
            const nuevaCant = lote.cantidad - deducir;
            if (nuevaCant === 0) {
              deleteLote(lote.id);
            } else {
              db.prepare('UPDATE lotes SET cantidad=? WHERE id=?').run(nuevaCant, lote.id);
              if (!loteId) loteId = lote.id;
            }
            restante -= deducir;
          }
        }
        syncProducto(producto_id);
        stockResultante = db.prepare('SELECT cantidad FROM productos WHERE id=?').get(producto_id).cantidad;

      } else { // ajuste a un lote específico
        const lote_id_ajuste = req.body.lote_id;
        if (lote_id_ajuste) {
          const lote = db.prepare('SELECT * FROM lotes WHERE id=? AND producto_id=?').get(lote_id_ajuste, producto_id);
          if (!lote) throw new Error('Lote no encontrado');
          if (cant === 0) {
            deleteLote(lote_id_ajuste);
            loteId = null;
          } else {
            db.prepare('UPDATE lotes SET cantidad=? WHERE id=?').run(cant, lote_id_ajuste);
            loteId = lote_id_ajuste;
          }
        } else {
          // Ajuste global: crear/reemplazar lote único
          deleteLotesByProducto(producto_id);
          if (cant > 0) {
            const r = db.prepare('INSERT INTO lotes (producto_id, cantidad) VALUES (?,?)').run(producto_id, cant);
            loteId = r.lastInsertRowid;
          }
        }
        syncProducto(producto_id);
        stockResultante = db.prepare('SELECT cantidad FROM productos WHERE id=?').get(producto_id).cantidad;
      }

      db.prepare(`INSERT INTO movimientos (producto_id, lote_id, tipo, cajas, unidades_por_caja, cantidad, stock_resultante, usuario_id, motivo)
                  VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(producto_id, loteId, tipo, cajas || null, unidades_por_caja || null,
             cant, stockResultante, req.session.userId, motivo || null);
    })();

    res.status(201).json({ ok: true, stock_resultante: stockResultante });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Carga masiva con lotes
router.post('/batch', (req, res) => {
  const { lineas, motivo } = req.body;
  if (!Array.isArray(lineas) || !lineas.length)
    return res.status(400).json({ error: 'Se requiere al menos una línea' });

  const resultados = [], errores = [];

  db.transaction(() => {
    for (const l of lineas) {
      const { producto_id, cajas, unidades_por_caja, codigo_lote, vencimiento_lote } = l;
      const cantidad = Number(cajas) * Number(unidades_por_caja);
      if (!producto_id || cantidad <= 0) { errores.push(`Línea inválida: producto ${producto_id}`); continue; }

      const prod = db.prepare('SELECT * FROM productos WHERE id=? AND activo=1').get(producto_id);
      if (!prod) { errores.push(`Producto ${producto_id} no encontrado`); continue; }

      let lote = null;
      if (codigo_lote) {
        lote = db.prepare('SELECT * FROM lotes WHERE producto_id=? AND codigo_lote=?').get(producto_id, codigo_lote);
      }
      let loteId;
      if (lote) {
        db.prepare('UPDATE lotes SET cantidad = cantidad + ? WHERE id=?').run(cantidad, lote.id);
        loteId = lote.id;
      } else {
        const r = db.prepare('INSERT INTO lotes (producto_id, codigo_lote, cantidad, vencimiento) VALUES (?,?,?,?)').run(
          producto_id, codigo_lote || null, cantidad, vencimiento_lote || null
        );
        loteId = r.lastInsertRowid;
      }
      syncProducto(producto_id);
      const total = db.prepare('SELECT cantidad FROM productos WHERE id=?').get(producto_id).cantidad;
      db.prepare(`INSERT INTO movimientos (producto_id, lote_id, tipo, cajas, unidades_por_caja, cantidad, stock_resultante, usuario_id, motivo)
                  VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(producto_id, loteId, 'entrada', cajas, unidades_por_caja, cantidad, total, req.session.userId, motivo || null);

      resultados.push({ producto_id, cantidad, stock_resultante: total });
    }
  })();

  if (errores.length && !resultados.length)
    return res.status(400).json({ error: errores.join('; ') });

  res.status(201).json({ ok: true, resultados, errores });
});

module.exports = router;
