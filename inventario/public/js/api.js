import { db, authFB, FB_API_KEY } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, setDoc,
  query, where, orderBy, limit as fbLimit, writeBatch, serverTimestamp, Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import {
  signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';

// Convierte Firestore Timestamps a ISO string y agrega id
function toObj(snap) {
  const d = { ...snap.data() };
  for (const [k, v] of Object.entries(d)) {
    if (v && typeof v.toDate === 'function') d[k] = v.toDate().toISOString();
  }
  return { id: snap.id, ...d };
}

// Si el usuario escribe "admin" → "admin@inventario-nunoa.web.app"
function toEmail(u) {
  return u.includes('@') ? u : `${u}@inventario-nunoa.web.app`;
}

function currentUser() {
  return authFB.currentUser;
}

// ===== Helpers de sesión =====
async function perfilFirestore(user) {
  const snap = await getDoc(doc(db, 'usuarios', user.uid));
  if (snap.exists()) {
    const d = snap.data();
    if (d.activo === false) { await signOut(authFB); throw new Error('Usuario desactivado'); }
    // Sincronizar displayName para que aparezca en movimientos
    if (d.nombre && user.displayName !== d.nombre) {
      await updateProfile(user, { displayName: d.nombre });
    }
    return { id: user.uid, nombre: d.nombre || user.email.split('@')[0], rol: d.rol || 'usuario', email: user.email };
  }
  await signOut(authFB);
  throw new Error('Usuario no autorizado');
}

// ===== Auth =====
export const auth = {
  login: async (usuario, password) => {
    const cred = await signInWithEmailAndPassword(authFB, toEmail(usuario), password);
    return perfilFirestore(cred.user);
  },
  logout: () => signOut(authFB),
  me: () => new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(authFB, async user => {
      unsub();
      if (!user) { reject(new Error('No autenticado')); return; }
      perfilFirestore(user).then(resolve).catch(reject);
    });
  }),
};

// ===== Usuarios =====
export const usuarios = {
  listar: async () => {
    const snap = await getDocs(collection(db, 'usuarios'));
    return snap.docs.map(toObj);
  },

  // Crea usuario en Firebase Auth (vía REST API para no cerrar sesión actual)
  // y guarda su perfil en Firestore
  crear: async ({ nombre, email, password, rol }) => {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FB_API_KEY}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, returnSecureToken: true }) }
    );
    const data = await res.json();
    if (!res.ok) {
      const code = data.error?.message || '';
      if (code === 'EMAIL_EXISTS') throw new Error('El correo ya está registrado');
      throw new Error(code || 'Error al crear usuario');
    }
    await setDoc(doc(db, 'usuarios', data.localId), {
      nombre, email, rol: rol || 'usuario', activo: true, creado_en: serverTimestamp(),
    });
    return { id: data.localId };
  },

  desactivar: async (id) => {
    await updateDoc(doc(db, 'usuarios', String(id)), { activo: false });
    return { ok: true };
  },
  activar: async (id) => {
    await updateDoc(doc(db, 'usuarios', String(id)), { activo: true });
    return { ok: true };
  },
  eliminar: async (id) => {
    await deleteDoc(doc(db, 'usuarios', String(id)));
    return { ok: true };
  },
};

// ===== Ubicaciones =====
export const ubicaciones = {
  listar: async () => {
    const snap = await getDocs(query(collection(db, 'ubicaciones'), orderBy('nombre')));
    return snap.docs.map(toObj);
  },
  crear: async ({ nombre }) => {
    const r = await addDoc(collection(db, 'ubicaciones'), { nombre, creado_en: serverTimestamp() });
    return { id: r.id };
  },
  editar: async (id, { nombre }) => {
    await updateDoc(doc(db, 'ubicaciones', String(id)), { nombre });
    return { ok: true };
  },
  eliminar: async (id) => {
    await deleteDoc(doc(db, 'ubicaciones', String(id)));
    return { ok: true };
  },
};

// ===== Exámenes (catálogo para cotizaciones) =====
const EXAMENES_EJEMPLO = [
  { nombre: 'Hemograma completo',              precio: 6500,  descripcion: 'Recuento de células sanguíneas' },
  { nombre: 'Perfil lipídico',                 precio: 8900,  descripcion: 'Colesterol total, HDL, LDL, triglicéridos' },
  { nombre: 'Glicemia en ayunas',             precio: 3500,  descripcion: 'Nivel de glucosa en sangre' },
  { nombre: 'Perfil bioquímico',               precio: 12000, descripcion: 'Panel metabólico completo' },
  { nombre: 'Perfil hepático',                 precio: 9500,  descripcion: 'Función del hígado' },
  { nombre: 'Orina completa',                  precio: 4000,  descripcion: 'Análisis físico-químico de orina' },
  { nombre: 'Urocultivo',                      precio: 7000,  descripcion: 'Detección de infección urinaria' },
  { nombre: 'TSH (hormona tiroidea)',          precio: 8500,  descripcion: 'Función de la tiroides' },
  { nombre: 'Hemoglobina glicosilada (HbA1c)', precio: 9000,  descripcion: 'Control de diabetes' },
  { nombre: 'Creatinina',                      precio: 3800,  descripcion: 'Función renal' },
  { nombre: 'Proteína C reactiva (PCR)',       precio: 5500,  descripcion: 'Marcador de inflamación' },
  { nombre: 'VHS',                             precio: 3000,  descripcion: 'Velocidad de eritrosedimentación' },
];

export const examenes = {
  listar: async () => {
    const snap = await getDocs(query(collection(db, 'examenes'), orderBy('nombre')));
    return snap.docs.map(toObj);
  },
  crear: async ({ nombre, precio, descripcion }) => {
    const r = await addDoc(collection(db, 'examenes'), {
      nombre, precio: Number(precio) || 0, descripcion: descripcion || '', creado_en: serverTimestamp(),
    });
    return { id: r.id };
  },
  editar: async (id, { nombre, precio, descripcion }) => {
    await updateDoc(doc(db, 'examenes', String(id)), {
      nombre, precio: Number(precio) || 0, descripcion: descripcion || '',
    });
    return { ok: true };
  },
  eliminar: async (id) => {
    await deleteDoc(doc(db, 'examenes', String(id)));
    return { ok: true };
  },
  // Crea exámenes de ejemplo solo si la colección está vacía
  sembrarEjemplos: async () => {
    const snap = await getDocs(query(collection(db, 'examenes'), fbLimit(1)));
    if (!snap.empty) return { creados: 0 };
    const batch = writeBatch(db);
    for (const e of EXAMENES_EJEMPLO) {
      batch.set(doc(collection(db, 'examenes')), { ...e, creado_en: serverTimestamp() });
    }
    await batch.commit();
    return { creados: EXAMENES_EJEMPLO.length };
  },
};

// ===== Categorias =====
export const categorias = {
  listar: async () => {
    const snap = await getDocs(query(collection(db, 'categorias'), orderBy('nombre')));
    return snap.docs.map(toObj);
  },
  crear: async ({ nombre }) => {
    const r = await addDoc(collection(db, 'categorias'), { nombre, creado_en: serverTimestamp() });
    return { id: r.id };
  },
  editar: async (id, { nombre }) => {
    await updateDoc(doc(db, 'categorias', String(id)), { nombre });
    return { ok: true };
  },
  eliminar: async (id) => {
    const snap = await getDocs(query(
      collection(db, 'productos'),
      where('categoria_id', '==', String(id)),
      where('activo', '==', true),
      fbLimit(1)
    ));
    if (!snap.empty) throw new Error('No se puede eliminar: hay productos en esta categoría');
    await deleteDoc(doc(db, 'categorias', String(id)));
    return { ok: true };
  },
};

// ===== Helpers internos =====

async function getLotesProducto(producto_id) {
  const snap = await getDocs(query(collection(db, 'lotes'), where('producto_id', '==', String(producto_id))));
  return snap.docs.map(toObj);
}

// Calcula cantidad total y lote principal (el de vencimiento más lejano)
function calcSync(lotes) {
  const activos = lotes.filter(l => l.cantidad > 0);
  const total   = activos.reduce((s, l) => s + l.cantidad, 0);
  const sorted  = [...activos].sort((a, b) => {
    if (!a.vencimiento && !b.vencimiento) return 0;
    if (!a.vencimiento) return 1;
    if (!b.vencimiento) return -1;
    return b.vencimiento.localeCompare(a.vencimiento);
  });
  const principal = sorted[0] || null;
  return {
    cantidad:    total,
    vencimiento: principal?.vencimiento ?? null,
    lote:        principal?.codigo_lote ?? null,
  };
}

function estadoProducto(p) {
  const today = new Date().toISOString().slice(0, 10);
  const en30  = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  return {
    estado:     p.cantidad <= p.umbral_critico ? 'critico' : p.cantidad <= p.umbral_bajo ? 'bajo' : 'aceptable',
    vencido:    !!(p.vencimiento && p.vencimiento < today),
    por_vencer: !!(p.vencimiento && p.vencimiento >= today && p.vencimiento <= en30),
  };
}

function sortLotes(lotes) {
  return [...lotes].sort((a, b) => {
    if (!a.vencimiento && !b.vencimiento) return 0;
    if (!a.vencimiento) return 1;
    if (!b.vencimiento) return -1;
    return b.vencimiento.localeCompare(a.vencimiento);
  });
}

// Redimensiona y comprime una imagen a base64 JPEG (máx 400px, calidad 0.75)
function comprimirImagen(file, maxPx = 400, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale  = Math.min(1, maxPx / Math.max(img.width, img.height));
      const w      = Math.round(img.width  * scale);
      const h      = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width  = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ===== Productos =====
export const productos = {
  listar: async () => {
    const [prodSnap, lotesSnap] = await Promise.all([
      getDocs(query(collection(db, 'productos'), where('activo', '==', true), orderBy('nombre'))),
      getDocs(collection(db, 'lotes')),
    ]);

    const lotesByProd = {};
    for (const d of lotesSnap.docs) {
      const l = toObj(d);
      if (!lotesByProd[l.producto_id]) lotesByProd[l.producto_id] = [];
      lotesByProd[l.producto_id].push(l);
    }

    return prodSnap.docs.map(d => {
      const p = toObj(d);
      const lotes = sortLotes(lotesByProd[p.id] || []);
      return { ...p, ...estadoProducto(p), lotes };
    });
  },

  crear: async (data) => {
    const catSnap = await getDoc(doc(db, 'categorias', String(data.categoria_id)));
    const r = await addDoc(collection(db, 'productos'), {
      nombre:            data.nombre,
      categoria_id:      String(data.categoria_id),
      categoria_nombre:  catSnap.data()?.nombre || '',
      cantidad:          0,
      umbral_critico:    Number(data.umbral_critico)    || 0,
      umbral_bajo:       Number(data.umbral_bajo)       || 0,
      vencimiento: null, lote: null, foto: null,
      activo:      true,
      creado_en:   serverTimestamp(),
    });
    return { id: r.id };
  },

  editar: async (id, data) => {
    const catSnap = await getDoc(doc(db, 'categorias', String(data.categoria_id)));
    await updateDoc(doc(db, 'productos', String(id)), {
      nombre:            data.nombre,
      categoria_id:      String(data.categoria_id),
      categoria_nombre:  catSnap.data()?.nombre || '',
      umbral_critico:    Number(data.umbral_critico)    || 0,
      umbral_bajo:       Number(data.umbral_bajo)       || 0,
    });
    return { ok: true };
  },

  eliminar: async (id) => {
    await updateDoc(doc(db, 'productos', String(id)), { activo: false });
    return { ok: true };
  },

  subirFoto: async (id, file) => {
    const base64 = await comprimirImagen(file);
    await updateDoc(doc(db, 'productos', String(id)), { foto: base64 });
    return { ok: true, foto: base64 };
  },
};

// ===== Lotes =====
export const lotes = {
  listar: async (producto_id) => {
    const lts = await getLotesProducto(producto_id);
    return sortLotes(lts);
  },

  crear: async ({ producto_id, codigo_lote, cantidad, vencimiento, ubicacion_id, ubicacion_nombre, numero_compra }) => {
    producto_id = String(producto_id);
    cantidad    = Number(cantidad);
    if (cantidad <= 0) throw new Error('Cantidad debe ser mayor a 0');

    const prodSnap = await getDoc(doc(db, 'productos', producto_id));
    if (!prodSnap.exists()) throw new Error('Producto no encontrado');
    const prod = prodSnap.data();

    const allLotes = await getLotesProducto(producto_id);

    // Buscar lote existente con mismo código
    const existing = codigo_lote
      ? allLotes.find(l => l.codigo_lote === codigo_lote) || null
      : null;

    const batch  = writeBatch(db);
    let loteId;
    let modLotes = [...allLotes];

    if (existing) {
      batch.update(doc(db, 'lotes', existing.id), { cantidad: existing.cantidad + cantidad });
      modLotes = modLotes.map(l => l.id === existing.id ? { ...l, cantidad: l.cantidad + cantidad } : l);
      loteId = existing.id;
    } else {
      const newRef = doc(collection(db, 'lotes'));
      const newL   = {
        producto_id, codigo_lote: codigo_lote || null, cantidad,
        vencimiento:      vencimiento      || null,
        ubicacion_id:     ubicacion_id     || null,
        ubicacion_nombre: ubicacion_nombre || null,
        numero_compra:    numero_compra    || null,
      };
      batch.set(newRef, { ...newL, fecha_ingreso: serverTimestamp() });
      modLotes.push({ id: newRef.id, ...newL });
      loteId = newRef.id;
    }

    const sync = calcSync(modLotes);
    batch.update(doc(db, 'productos', producto_id), sync);

    const u = currentUser();
    batch.set(doc(collection(db, 'movimientos')), {
      producto_id, lote_id: loteId, tipo: 'entrada', cantidad,
      stock_resultante: sync.cantidad,
      usuario_id: u?.uid || '', usuario_nombre: u?.displayName || u?.email?.split('@')[0] || '',
      producto_nombre: prod.nombre, categoria_nombre: prod.categoria_nombre || '',
      fecha: serverTimestamp(), motivo: `Ingreso lote ${codigo_lote || '(sin código)'}`,
    });

    await batch.commit();
    return { ok: true, lote: { id: loteId } };
  },

  editar: async (id, { codigo_lote, vencimiento, ubicacion_id, ubicacion_nombre, numero_compra }) => {
    const loteRef  = doc(db, 'lotes', String(id));
    const loteSnap = await getDoc(loteRef);
    if (!loteSnap.exists()) throw new Error('Lote no encontrado');

    const producto_id = loteSnap.data().producto_id;
    const allLotes    = await getLotesProducto(producto_id);

    const campos = {
      codigo_lote:      codigo_lote      || null,
      vencimiento:      vencimiento      || null,
      ubicacion_id:     ubicacion_id     || null,
      ubicacion_nombre: ubicacion_nombre || null,
      numero_compra:    numero_compra    || null,
    };
    const batch = writeBatch(db);
    batch.update(loteRef, campos);
    const modLotes = allLotes.map(l => l.id === id ? { ...l, ...campos } : l);
    batch.update(doc(db, 'productos', producto_id), calcSync(modLotes));
    await batch.commit();
    return { ok: true };
  },

  eliminar: async (id, forzar = false) => {
    const loteRef  = doc(db, 'lotes', String(id));
    const loteSnap = await getDoc(loteRef);
    if (!loteSnap.exists()) throw new Error('Lote no encontrado');
    const lote = loteSnap.data();
    if (lote.cantidad > 0 && !forzar)
      throw new Error(`El lote aún tiene ${lote.cantidad} unidades`);

    const allLotes = await getLotesProducto(lote.producto_id);
    const batch    = writeBatch(db);
    batch.delete(loteRef);
    batch.update(doc(db, 'productos', lote.producto_id), calcSync(allLotes.filter(l => l.id !== id)));
    await batch.commit();
    return { ok: true };
  },
};

// ===== Movimientos (lógica central) =====

async function registrarMovimiento(data) {
  const { tipo, motivo, codigo_lote, vencimiento_lote, lote_id, ubicacion_id, ubicacion_nombre, numero_compra } = data;
  const producto_id = String(data.producto_id);
  const cant        = Number(data.cantidad);
  const u           = currentUser();

  const prodSnap = await getDoc(doc(db, 'productos', producto_id));
  if (!prodSnap.exists()) throw new Error('Producto no encontrado');
  const prod = prodSnap.data();

  const allLotes = await getLotesProducto(producto_id);
  const batch    = writeBatch(db);
  let modLotes   = [...allLotes];
  let loteId     = null;

  if (tipo === 'entrada') {
    const existing = codigo_lote
      ? allLotes.find(l => l.codigo_lote === codigo_lote) || null
      : null;

    if (existing) {
      batch.update(doc(db, 'lotes', existing.id), { cantidad: existing.cantidad + cant });
      modLotes = modLotes.map(l => l.id === existing.id ? { ...l, cantidad: l.cantidad + cant } : l);
      loteId   = existing.id;
    } else {
      const newRef = doc(collection(db, 'lotes'));
      const newL   = {
        producto_id, codigo_lote: codigo_lote || null, cantidad: cant,
        vencimiento:      vencimiento_lote || null,
        ubicacion_id:     ubicacion_id     || null,
        ubicacion_nombre: ubicacion_nombre || null,
        numero_compra:    numero_compra    || null,
      };
      batch.set(newRef, { ...newL, fecha_ingreso: serverTimestamp() });
      modLotes.push({ id: newRef.id, ...newL });
      loteId = newRef.id;
    }

  } else if (tipo === 'salida') {
    if (lote_id) {
      // Salida del lote específico
      const lote = allLotes.find(l => l.id === String(lote_id));
      if (!lote) throw new Error('Lote no encontrado');
      if (lote.cantidad < cant) throw new Error(`Stock insuficiente en este lote. Stock: ${lote.cantidad}`);
      const newCant = lote.cantidad - cant;
      if (newCant === 0) {
        batch.delete(doc(db, 'lotes', lote.id));
        modLotes = modLotes.filter(l => l.id !== lote.id);
      } else {
        batch.update(doc(db, 'lotes', lote.id), { cantidad: newCant });
        modLotes = modLotes.map(l => l.id === lote.id ? { ...l, cantidad: newCant } : l);
        loteId = lote.id;
      }
    } else {
      // FIFO: consumir desde el lote más antiguo
      if (prod.cantidad < cant) throw new Error(`Stock insuficiente. Stock actual: ${prod.cantidad}`);
      const ordered = [...allLotes]
        .filter(l => l.cantidad > 0)
        .sort((a, b) => {
          const fa = a.fecha_ingreso ? new Date(a.fecha_ingreso).getTime() : 0;
          const fb = b.fecha_ingreso ? new Date(b.fecha_ingreso).getTime() : 0;
          return fa - fb;
        });
      let restante = cant;
      for (const lote of ordered) {
        if (restante <= 0) break;
        const deducir = Math.min(lote.cantidad, restante);
        const newCant = lote.cantidad - deducir;
        if (newCant === 0) {
          batch.delete(doc(db, 'lotes', lote.id));
          modLotes = modLotes.filter(l => l.id !== lote.id);
        } else {
          batch.update(doc(db, 'lotes', lote.id), { cantidad: newCant });
          modLotes = modLotes.map(l => l.id === lote.id ? { ...l, cantidad: newCant } : l);
          if (!loteId) loteId = lote.id;
        }
        restante -= deducir;
      }
    }

  } else { // ajuste
    if (lote_id) {
      const lote = allLotes.find(l => l.id === String(lote_id));
      if (!lote) throw new Error('Lote no encontrado');
      if (cant === 0) {
        batch.delete(doc(db, 'lotes', lote.id));
        modLotes = modLotes.filter(l => l.id !== lote.id);
      } else {
        batch.update(doc(db, 'lotes', lote.id), { cantidad: cant });
        modLotes = modLotes.map(l => l.id === lote.id ? { ...l, cantidad: cant } : l);
        loteId = lote.id;
      }
    } else {
      // Ajuste global: eliminar todos los lotes y crear uno nuevo
      for (const l of allLotes) batch.delete(doc(db, 'lotes', l.id));
      modLotes = [];
      if (cant > 0) {
        const newRef = doc(collection(db, 'lotes'));
        const newL   = { producto_id, codigo_lote: null, cantidad: cant, vencimiento: null };
        batch.set(newRef, { ...newL, fecha_ingreso: serverTimestamp() });
        modLotes = [{ id: newRef.id, ...newL }];
        loteId = newRef.id;
      }
    }
  }

  const sync = calcSync(modLotes);
  batch.update(doc(db, 'productos', producto_id), sync);

  batch.set(doc(collection(db, 'movimientos')), {
    producto_id,
    lote_id:          loteId || null,
    tipo,
    cantidad:         cant,
    stock_resultante: sync.cantidad,
    usuario_id:       u?.uid || '',
    usuario_nombre:   u?.displayName || u?.email?.split('@')[0] || '',
    producto_nombre:  prod.nombre,
    categoria_nombre: prod.categoria_nombre || '',
    fecha:            serverTimestamp(),
    motivo:           motivo || null,
  });

  await batch.commit();
  return { ok: true, stock_resultante: sync.cantidad };
}

export const movimientos = {
  listar: async (params = {}) => {
    const { desde, hasta, tipo, producto_id, categoria_id } = params;

    let q;
    if (desde && hasta) {
      q = query(collection(db, 'movimientos'),
        where('fecha', '>=', Timestamp.fromDate(new Date(desde + 'T00:00:00'))),
        where('fecha', '<=', Timestamp.fromDate(new Date(hasta  + 'T23:59:59'))),
        orderBy('fecha', 'desc'), fbLimit(1000));
    } else if (desde) {
      q = query(collection(db, 'movimientos'),
        where('fecha', '>=', Timestamp.fromDate(new Date(desde + 'T00:00:00'))),
        orderBy('fecha', 'desc'), fbLimit(1000));
    } else {
      q = query(collection(db, 'movimientos'), orderBy('fecha', 'desc'), fbLimit(1000));
    }

    let items = (await getDocs(q)).docs.map(toObj);
    if (tipo)        items = items.filter(m => m.tipo       === tipo);
    if (producto_id) items = items.filter(m => m.producto_id === String(producto_id));
    if (categoria_id) {
      // necesita categoria_id en cada movimiento o filtramos por categoria_nombre (no confiable)
      // usamos join con productos en cliente
      const prodSnap = await getDocs(query(collection(db, 'productos'), where('categoria_id', '==', String(categoria_id))));
      const ids = new Set(prodSnap.docs.map(d => d.id));
      items = items.filter(m => ids.has(m.producto_id));
    }
    return items;
  },

  crear: registrarMovimiento,

  batch: async ({ lineas, motivo }) => {
    const resultados = [], errores = [];
    for (const l of (lineas || [])) {
      if (!l?.producto_id) continue;
      const cantidad = Number(l.cantidad);
      if (cantidad <= 0) { errores.push('Línea inválida'); continue; }
      try {
        const r = await registrarMovimiento({
          producto_id:   l.producto_id,
          tipo:          'entrada',
          cantidad,
          codigo_lote:   l.codigo_lote   || null,
          vencimiento_lote: l.vencimiento_lote || null,
          ubicacion_id:     l.ubicacion_id     || null,
          ubicacion_nombre: l.ubicacion_nombre || null,
          numero_compra: l.numero_compra || null,
          motivo,
        });
        resultados.push({ producto_id: l.producto_id, cantidad, stock_resultante: r.stock_resultante });
      } catch (e) {
        errores.push(`Producto ${l.producto_id}: ${e.message}`);
      }
    }
    return { ok: true, resultados, errores };
  },
};

// ===== Reportes =====
export const reportes = {
  mensual: async ({ mes, anio, categoria_id } = {}) => {
    const now = new Date();
    mes  = Number(mes)  || now.getMonth() + 1;
    anio = Number(anio) || now.getFullYear();
    const mm  = String(mes).padStart(2, '0');
    const ini = new Date(`${anio}-${mm}-01T00:00:00`);
    const fin = new Date(anio, mes, 0, 23, 59, 59);

    // Una sola consulta: todos los movimientos hasta el fin del período,
    // ordenados por fecha ascendente. Evita índices compuestos (producto_id + fecha)
    // que antes hacían fallar el reporte.
    const [prodSnap, movSnap] = await Promise.all([
      getDocs(query(collection(db, 'productos'), orderBy('nombre'))),
      getDocs(query(collection(db, 'movimientos'),
        where('fecha', '<=', Timestamp.fromDate(fin)),
        orderBy('fecha', 'asc'))),
    ]);

    let prods = prodSnap.docs.map(toObj).filter(p => p.activo !== false);
    if (categoria_id) prods = prods.filter(p => p.categoria_id === String(categoria_id));

    const today   = now.toISOString().slice(0, 10);
    const en30    = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);

    // Agrupar movimientos por producto (ya vienen ordenados por fecha asc)
    const iniMs = ini.getTime();
    const movsByProd = {};
    for (const d of movSnap.docs) {
      const m = toObj(d);
      (movsByProd[m.producto_id] ||= []).push(m);
    }

    const filas = prods.map((p) => {
      const todos    = movsByProd[p.id] || [];
      const antes    = todos.filter(m => new Date(m.fecha).getTime() <  iniMs);
      const movs     = todos.filter(m => new Date(m.fecha).getTime() >= iniMs);
      const stockInicial = antes.length
        ? antes[antes.length - 1].stock_resultante
        : (todos.length ? 0 : p.cantidad);
      const stockFinal   = movs.length
        ? movs[movs.length - 1].stock_resultante
        : (antes.length ? stockInicial : p.cantidad);
      const entradas = movs.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.cantidad, 0);
      const salidas  = movs.filter(m => m.tipo === 'salida').reduce((s, m) => s + m.cantidad, 0);
      const ajustes  = movs.filter(m => m.tipo === 'ajuste').length;
      return {
        id: p.id, nombre: p.nombre, categoria_nombre: p.categoria_nombre,
        stock_inicial: stockInicial, entradas, salidas, ajustes, stock_final: stockFinal,
        estado:     stockFinal <= p.umbral_critico ? 'critico' : stockFinal <= p.umbral_bajo ? 'bajo' : 'aceptable',
        vencido:    !!(p.vencimiento && p.vencimiento < today),
        por_vencer: !!(p.vencimiento && p.vencimiento >= today && p.vencimiento <= en30),
      };
    }).filter(f => f.entradas || f.salidas || f.ajustes || f.stock_final > 0);

    return {
      mes, anio, productos: filas,
      totales: {
        entradas:   filas.reduce((s, f) => s + f.entradas, 0),
        salidas:    filas.reduce((s, f) => s + f.salidas,  0),
        criticos:   filas.filter(f => f.estado === 'critico').length,
        bajos:      filas.filter(f => f.estado === 'bajo').length,
        vencidos:   filas.filter(f => f.vencido).length,
        por_vencer: filas.filter(f => f.por_vencer).length,
      },
    };
  },
};
