const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'inventario.sqlite'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('admin','operador')),
    activo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT UNIQUE NOT NULL,
    descripcion TEXT
  );

  CREATE TABLE IF NOT EXISTS productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    categoria_id INTEGER NOT NULL REFERENCES categorias(id),
    cantidad INTEGER NOT NULL DEFAULT 0,
    unidades_por_caja INTEGER NOT NULL DEFAULT 1,
    umbral_critico INTEGER NOT NULL DEFAULT 0,
    umbral_bajo INTEGER NOT NULL DEFAULT 0,
    vencimiento TEXT,
    precio_unitario REAL,
    activo INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS movimientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id INTEGER NOT NULL REFERENCES productos(id),
    tipo TEXT NOT NULL CHECK(tipo IN ('entrada','salida','ajuste')),
    cajas INTEGER,
    unidades_por_caja INTEGER,
    cantidad INTEGER NOT NULL,
    stock_resultante INTEGER NOT NULL,
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
    motivo TEXT,
    fecha TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
`);

function seed() {
  const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get('admin');
  if (existe) return;

  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO usuarios (nombre,usuario,password_hash,rol) VALUES (?,?,?,?)')
    .run('Administrador', 'admin', hash, 'admin');

  const ic = db.prepare('INSERT INTO categorias (nombre,descripcion) VALUES (?,?)');
  const c1 = ic.run('Medicamentos', 'Medicamentos y fármacos').lastInsertRowid;
  const c2 = ic.run('Material de Curación', 'Insumos para curación y procedimientos').lastInsertRowid;
  const c3 = ic.run('Equipamiento', 'Equipos e instrumentos médicos').lastInsertRowid;

  const ip = db.prepare(`INSERT INTO productos
    (nombre,categoria_id,cantidad,unidades_por_caja,umbral_critico,umbral_bajo,vencimiento,precio_unitario)
    VALUES (?,?,?,?,?,?,?,?)`);

  const prods = [
    ['Paracetamol 500mg',   c1, 250, 50, 20,  50,  '2027-06-30', 150],
    ['Ibuprofeno 400mg',    c1,  80, 30, 15,  40,  '2026-12-31', 200],
    ['Amoxicilina 500mg',   c1,  12, 20, 10,  25,  '2026-09-30', 350],
    ['Metformina 850mg',    c1, 300,100, 30,  80,  '2027-03-31', 120],
    ['Gasas Estériles',     c2,  45, 50, 10,  30,  null,          80],
    ['Guantes Nitrilo (caja)', c2, 8,100,  3,  10,  '2028-01-01', 4500],
    ['Alcohol 70% 1L',      c2,   6, 12,  2,   8,  '2027-05-01', 1200],
    ['Termómetro Digital',  c3,  15,  1,  3,   7,  null,          8500],
    ['Tensiómetro',         c3,   3,  1,  1,   3,  null,         45000],
    ['Estetoscopio',        c3,   5,  1,  2,   4,  null,         35000],
  ];

  prods.forEach(p => ip.run(...p));
  console.log('Seed completado: admin / admin123, categorías y productos de ejemplo creados.');
}

seed();

module.exports = db;
