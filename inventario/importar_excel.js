// Script de importación de datos desde excelreal.xlsx
const XLSX  = require('xlsx');
const path  = require('path');
const db    = require('./server/db');

const ARCHIVO = path.join(__dirname, '..', 'excelreal.xlsx');
const wb      = XLSX.readFile(ARCHIVO);

// Mapeo de palabras clave del encabezado → nombre corto de categoría
function detectarCategoria(texto) {
  const t = texto.toLowerCase();
  if (t.includes('química clínica') || t.includes('quimica clinica') || t.includes('hormonas'))
    return 'Química Clínica y Hormonas';
  if (t.includes('vhs'))   return 'VHS';
  if (t.includes('hemograma')) return 'Hemogramas';
  if (t.includes('coagulación') || t.includes('coagulacion')) return 'Coagulación';
  if (t.includes('hemoglobina glicada') || t.includes('a1c')) return 'Hemoglobina Glicada';
  if (t.includes('microbiología') || t.includes('microbiologia')) return 'Microbiología';
  if (t.includes('orina')) return 'Orinas';
  if (t.includes('epoc') || t.includes('urgencia') || t.includes('sar')) return 'EPOC Urgencia';
  return null;
}

function esCabecera(fila) {
  return fila[0] && typeof fila[0] === 'string' &&
    fila[0].length > 10 &&
    (fila[1] === '' || fila[1] === undefined) &&
    (fila[1] === 0 || !fila[1]);
}

function esProducto(fila) {
  return fila[0] && typeof fila[0] === 'string' &&
    fila[0].trim() !== '' &&
    !fila[0].toUpperCase().includes('TOTAL') &&
    !fila[0].toUpperCase().startsWith('DISPOSITIVO MEDICO') &&
    !fila[0].toUpperCase().startsWith('EPOC') &&
    (typeof fila[3] === 'number') &&
    fila[3] > 0;
}

// ---- Limpiar datos del seed y dejar solo admin ----
console.log('Limpiando datos anteriores...');
db.prepare('DELETE FROM movimientos').run();
db.prepare('DELETE FROM productos').run();
db.prepare('DELETE FROM categorias').run();
console.log('Datos anteriores eliminados.');

// ---- Parsear DETALLE ----
const ws   = wb.Sheets['DETALLE'];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

let categoriaActual = null;
const catMap = {}; // nombre → id

const insertCat  = db.prepare('INSERT OR IGNORE INTO categorias (nombre, descripcion) VALUES (?,?)');
const getCat     = db.prepare('SELECT id FROM categorias WHERE nombre = ?');
const insertProd = db.prepare(`
  INSERT INTO productos (nombre, categoria_id, cantidad, unidades_por_caja, umbral_critico, umbral_bajo, precio_unitario)
  VALUES (?,?,?,?,?,?,?)
`);
const insertMov = db.prepare(`
  INSERT INTO movimientos (producto_id, tipo, cantidad, stock_resultante, usuario_id, motivo)
  VALUES (?,?,?,?,1,'Stock inicial importado desde Excel')
`);

let totalProds = 0;
let totalCats  = 0;

for (const fila of rows) {
  // Detectar cabecera de categoría
  if (typeof fila[0] === 'string' && fila[0].length > 10) {
    const cat = detectarCategoria(fila[0]);
    if (cat) {
      categoriaActual = cat;
      if (!catMap[cat]) {
        insertCat.run(cat, fila[0].trim().slice(0, 200));
        catMap[cat] = getCat.get(cat).id;
        totalCats++;
        console.log(`  Categoría: ${cat}`);
      }
    }
  }

  // Detectar producto
  if (categoriaActual && esProducto(fila)) {
    const nombre    = String(fila[0]).trim().slice(0, 120);
    const cantidad  = Math.round(Number(fila[3]));
    const precio    = fila[2] && Number(fila[2]) > 0 ? Math.round(Number(fila[2])) : null;
    const catId     = catMap[categoriaActual];

    // Umbrales automáticos: crítico = 10% de la cantidad, bajo = 25%
    const umbralCrit = Math.max(1, Math.floor(cantidad * 0.10));
    const umbralBajo = Math.max(2, Math.floor(cantidad * 0.25));

    const r = insertProd.run(nombre, catId, cantidad, 1, umbralCrit, umbralBajo, precio);
    if (cantidad > 0) {
      insertMov.run(r.lastInsertRowid, 'entrada', cantidad, cantidad);
    }
    totalProds++;
    console.log(`    + ${nombre} (qty: ${cantidad})`);
  }
}

console.log(`\n✓ Importación completa: ${totalCats} categorías, ${totalProds} productos.`);
process.exit(0);
