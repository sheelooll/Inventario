const router = require('express').Router();
const db = require('../db');

function estadoFn(cantidad, uc, ub) {
  if (cantidad <= uc) return 'critico';
  if (cantidad <= ub) return 'bajo';
  return 'aceptable';
}

router.get('/mensual', (req, res) => {
  const now = new Date();
  const mes  = parseInt(req.query.mes)  || (now.getMonth() + 1);
  const anio = parseInt(req.query.anio) || now.getFullYear();
  const cat  = req.query.categoria_id   || null;

  const mm  = String(mes).padStart(2, '0');
  const ini = `${anio}-${mm}-01`;
  const fin = `${anio}-${mm}-${new Date(anio, mes, 0).getDate()}`;

  let qProd = `
    SELECT p.id, p.nombre, p.cantidad AS stock_actual,
           p.umbral_critico, p.umbral_bajo, p.vencimiento, p.activo,
           c.id AS categoria_id, c.nombre AS categoria_nombre
    FROM productos p
    JOIN categorias c ON p.categoria_id = c.id
    WHERE (p.activo = 1 OR EXISTS (
      SELECT 1 FROM movimientos m WHERE m.producto_id = p.id AND m.fecha BETWEEN ? AND ?
    ))
  `;
  const params = [ini, fin + ' 23:59:59'];
  if (cat) { qProd += ' AND p.categoria_id = ?'; params.push(cat); }
  qProd += ' ORDER BY c.nombre, p.nombre';

  const productos = db.prepare(qProd).all(...params);

  const getMov = db.prepare(`
    SELECT tipo, cantidad, stock_resultante FROM movimientos
    WHERE producto_id=? AND fecha BETWEEN ? AND ? ORDER BY fecha ASC
  `);
  const getAntes = db.prepare(`
    SELECT stock_resultante FROM movimientos WHERE producto_id=? AND fecha < ? ORDER BY fecha DESC LIMIT 1
  `);

  const today = now.toISOString().slice(0, 10);
  const en30  = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

  const filas = productos.map(p => {
    const movs = getMov.all(p.id, ini, fin + ' 23:59:59');
    const antes = getAntes.get(p.id, ini);

    const stockInicial = antes ? antes.stock_resultante : (movs.length ? 0 : p.stock_actual);
    const stockFinal   = movs.length ? movs[movs.length - 1].stock_resultante : p.stock_actual;

    const entradas = movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.cantidad, 0);
    const salidas  = movs.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.cantidad, 0);
    const ajustes  = movs.filter(m => m.tipo === 'ajuste').length;

    return {
      id: p.id,
      nombre: p.nombre,
      categoria_nombre: p.categoria_nombre,
      stock_inicial: stockInicial,
      entradas,
      salidas,
      ajustes,
      stock_final: stockFinal,
      estado: estadoFn(stockFinal, p.umbral_critico, p.umbral_bajo),
      vencido:    !!(p.vencimiento && p.vencimiento < today),
      por_vencer: !!(p.vencimiento && p.vencimiento >= today && p.vencimiento <= en30),
    };
  });

  res.json({
    mes, anio,
    productos: filas,
    totales: {
      entradas:   filas.reduce((s, f) => s + f.entradas, 0),
      salidas:    filas.reduce((s, f) => s + f.salidas, 0),
      criticos:         filas.filter(f => f.estado === 'critico').length,
      bajos:            filas.filter(f => f.estado === 'bajo').length,
      vencidos:         filas.filter(f => f.vencido).length,
      por_vencer:       filas.filter(f => f.por_vencer).length,
    }
  });
});

module.exports = router;
