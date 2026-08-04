/**
 * Importa categorías y productos desde Hoja 3 de excelreal.xlsx → Firestore
 *
 * Pasos previos:
 *   1. Descargar serviceAccount.json desde Firebase Console → Configuración del
 *      proyecto → Cuentas de servicio → Generar nueva clave privada
 *      y guardar como scripts/serviceAccount.json
 *   2. cd inventario && npm install firebase-admin xlsx
 *   3. node scripts/importar-excel-firebase.js
 */

const { initializeApp, cert }  = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const XLSX  = require('xlsx');
const path  = require('path');

const SERVICE_ACCOUNT = path.join(__dirname, 'serviceAccount.json');
const EXCEL_PATH      = path.join(__dirname, '..', '..', 'excelreal.xlsx');
const HOJA            = 'Hoja 3';

initializeApp({ credential: cert(require(SERVICE_ACCOUNT)) });

const db = getFirestore();

// ── Detectar si una fila es encabezado de categoría ───────────────────────────
function detectarCategoria(texto) {
  const t = (texto || '').toLowerCase();
  if (t.includes('química') || t.includes('quimica') || t.includes('hormonas'))
    return 'Química Clínica';
  if (t.includes('vhs'))
    return 'VHS';
  if (t.includes('hemograma'))
    return 'Hemogramas';
  if (t.includes('coagulación') || t.includes('coagulacion'))
    return 'Coagulación';
  if (t.includes('hemoglobina') || t.includes('a1c'))
    return 'Hemoglobina Glicada';
  if (t.includes('microbiolog'))
    return 'Microbiología';
  if (t.includes('orina'))
    return 'Orinas';
  if (t.startsWith('insumos'))
    return 'Insumos y Servicios';
  return null;
}

function esCabecera(texto) {
  const t = (texto || '').toLowerCase();
  return t.startsWith('dispositivo medico') || t.startsWith('insumos');
}

// ── Leer Excel ────────────────────────────────────────────────────────────────
const wb   = XLSX.readFile(EXCEL_PATH);
const ws   = wb.Sheets[HOJA];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

// Parsear: identificar categorías y productos
let categoriaActual = null;
const categorias = new Map(); // nombre → true
const productos  = [];        // { nombre, categoria }

for (const row of rows) {
  const celda = String(row[0] || '').trim();
  if (!celda) continue;

  const cat = detectarCategoria(celda);
  if (cat && esCabecera(celda)) {
    categoriaActual = cat;
    categorias.set(cat, true);
    continue;
  }

  if (categoriaActual && !esCabecera(celda)) {
    productos.push({ nombre: celda, categoria: categoriaActual });
  }
}

console.log(`\n📊 Encontrados: ${categorias.size} categorías, ${productos.length} productos`);
console.log('\nCategorías:');
for (const c of categorias.keys()) console.log(`  • ${c}`);

// ── Subir a Firestore ─────────────────────────────────────────────────────────
async function importar() {
  const catIds = {};

  // 1. Crear categorías
  console.log('\n⬆ Creando categorías...');
  for (const nombre of categorias.keys()) {
    const snap = await db.collection('categorias').where('nombre', '==', nombre).limit(1).get();
    if (!snap.empty) {
      catIds[nombre] = snap.docs[0].id;
      console.log(`  ✓ Ya existe: ${nombre}`);
    } else {
      const ref = await db.collection('categorias').add({
        nombre,
        creado_en: FieldValue.serverTimestamp(),
      });
      catIds[nombre] = ref.id;
      console.log(`  + Creada: ${nombre}`);
    }
  }

  // 2. Crear productos en lotes de 400 (límite de batch = 500)
  console.log('\n⬆ Creando productos...');
  let creados = 0, omitidos = 0;

  const LOTE = 400;
  for (let i = 0; i < productos.length; i += LOTE) {
    const batch = db.batch();
    const grupo = productos.slice(i, i + LOTE);

    for (const p of grupo) {
      const catId = catIds[p.categoria];
      if (!catId) { omitidos++; continue; }
      const ref = db.collection('productos').doc();
      batch.set(ref, {
        nombre:           p.nombre,
        categoria_id:     catId,
        categoria_nombre: p.categoria,
        cantidad:         0,
        unidades_por_caja: 1,
        umbral_critico:   0,
        umbral_bajo:      0,
        vencimiento:      null,
        lote:             null,
        foto:             null,
        activo:           true,
        creado_en:        FieldValue.serverTimestamp(),
      });
      creados++;
    }
    await batch.commit();
    console.log(`  Lote ${Math.floor(i / LOTE) + 1}: ${Math.min(i + LOTE, productos.length)}/${productos.length} productos`);
  }

  console.log(`\n✅ Importación completa:`);
  console.log(`   • ${categorias.size} categorías`);
  console.log(`   • ${creados} productos creados`);
  if (omitidos) console.log(`   • ${omitidos} omitidos (sin categoría)`);
  process.exit(0);
}

importar().catch(e => { console.error('Error:', e.message); process.exit(1); });
