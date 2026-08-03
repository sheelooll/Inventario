/**
 * Migra datos de SQLite → Firestore.
 *
 * Pasos previos:
 *   1. Firebase Console → Authentication → Habilitar "Correo y contraseña"
 *   2. Firebase Console → Configuración del proyecto → Cuentas de servicio
 *      → Generar nueva clave privada → guardar como scripts/serviceAccount.json
 *   3. npm install firebase-admin   (una sola vez)
 *   4. node scripts/migrar-firebase.js
 */

const admin    = require('firebase-admin');
const Database = require('better-sqlite3');
const path     = require('path');

// ── Configuración ─────────────────────────────────────────────────────────────
const SERVICE_ACCOUNT = path.join(__dirname, 'serviceAccount.json');
const DB_PATH         = path.join(__dirname, '..', 'inventario.db');
const ADMIN_EMAIL     = 'admin@inventario-nunoa.web.app';
const ADMIN_PASSWORD  = 'admin123';
// ──────────────────────────────────────────────────────────────────────────────

admin.initializeApp({
  credential: admin.credential.cert(require(SERVICE_ACCOUNT)),
});

const db      = admin.firestore();
const auth    = admin.auth();
const sqlite  = new Database(DB_PATH, { readonly: true });

async function run() {
  console.log('\n=== Migración SQLite → Firestore ===\n');

  // 1. Usuario administrador en Firebase Auth
  console.log('▸ Creando usuario admin en Firebase Auth...');
  try {
    const existing = await auth.getUserByEmail(ADMIN_EMAIL).catch(() => null);
    if (existing) {
      console.log('  Usuario ya existe, se omite creación.');
    } else {
      await auth.createUser({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, displayName: 'Administrador' });
      console.log(`  Creado: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    }
  } catch (e) {
    console.error('  Error creando usuario:', e.message);
  }

  // 2. Categorías
  console.log('\n▸ Migrando categorías...');
  const cats = sqlite.prepare('SELECT * FROM categorias').all();
  const catIdMap = {};  // sqlite_id → firestore_id

  for (const c of cats) {
    const ref = await db.collection('categorias').add({ nombre: c.nombre, creado_en: admin.firestore.FieldValue.serverTimestamp() });
    catIdMap[c.id] = ref.id;
    process.stdout.write('.');
  }
  console.log(`\n  ${cats.length} categorías migradas.`);

  // 3. Productos
  console.log('\n▸ Migrando productos...');
  const prods = sqlite.prepare('SELECT p.*, c.nombre AS cat_nombre FROM productos p JOIN categorias c ON p.categoria_id=c.id WHERE p.activo=1').all();
  const prodIdMap = {};  // sqlite_id → firestore_id

  for (const p of prods) {
    const ref = await db.collection('productos').add({
      nombre:            p.nombre,
      categoria_id:      catIdMap[p.categoria_id] || String(p.categoria_id),
      categoria_nombre:  p.cat_nombre,
      cantidad:          p.cantidad,
      unidades_por_caja: p.unidades_por_caja,
      umbral_critico:    p.umbral_critico,
      umbral_bajo:       p.umbral_bajo,
      vencimiento:       p.vencimiento || null,
      lote:              p.lote        || null,
      foto:              null,
      activo:            true,
      creado_en:         admin.firestore.FieldValue.serverTimestamp(),
    });
    prodIdMap[p.id] = ref.id;
    process.stdout.write('.');
  }
  console.log(`\n  ${prods.length} productos migrados.`);

  // 4. Lotes
  console.log('\n▸ Migrando lotes...');
  const lotesArr = sqlite.prepare('SELECT * FROM lotes').all();
  const loteIdMap = {};

  for (const l of lotesArr) {
    const fsProdId = prodIdMap[l.producto_id];
    if (!fsProdId) { console.log(`\n  Advertencia: producto ${l.producto_id} no encontrado, lote omitido.`); continue; }
    const ref = await db.collection('lotes').add({
      producto_id:  fsProdId,
      codigo_lote:  l.codigo_lote  || null,
      cantidad:     l.cantidad,
      vencimiento:  l.vencimiento  || null,
      fecha_ingreso: l.fecha_ingreso
        ? admin.firestore.Timestamp.fromDate(new Date(l.fecha_ingreso))
        : admin.firestore.FieldValue.serverTimestamp(),
    });
    loteIdMap[l.id] = ref.id;
    process.stdout.write('.');
  }
  console.log(`\n  ${lotesArr.length} lotes migrados.`);

  // 5. Movimientos (opcional — puede omitirse para empezar limpio)
  const migrMovs = process.argv.includes('--movimientos');
  if (migrMovs) {
    console.log('\n▸ Migrando movimientos...');
    const movs = sqlite.prepare(`
      SELECT m.*, p.nombre AS prod_nombre, c.nombre AS cat_nombre, u.nombre AS usr_nombre
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      JOIN categorias c ON p.categoria_id = c.id
      JOIN usuarios u ON m.usuario_id = u.id
    `).all();

    let n = 0;
    for (const m of movs) {
      const fsProdId = prodIdMap[m.producto_id];
      if (!fsProdId) continue;
      await db.collection('movimientos').add({
        producto_id:      fsProdId,
        lote_id:          loteIdMap[m.lote_id] || null,
        tipo:             m.tipo,
        cajas:            m.cajas             ?? null,
        unidades_por_caja: m.unidades_por_caja ?? null,
        cantidad:         m.cantidad,
        stock_resultante: m.stock_resultante,
        usuario_id:       '',
        usuario_nombre:   m.usr_nombre,
        producto_nombre:  m.prod_nombre,
        categoria_nombre: m.cat_nombre,
        motivo:           m.motivo || null,
        fecha:            m.fecha
          ? admin.firestore.Timestamp.fromDate(new Date(m.fecha))
          : admin.firestore.FieldValue.serverTimestamp(),
      });
      n++;
      if (n % 50 === 0) process.stdout.write('.');
    }
    console.log(`\n  ${n} movimientos migrados.`);
  } else {
    console.log('\n  Movimientos omitidos (agrega --movimientos para incluirlos).');
  }

  console.log('\n✓ Migración completada.\n');
  process.exit(0);
}

run().catch(e => { console.error('\n✗ Error:', e); process.exit(1); });
