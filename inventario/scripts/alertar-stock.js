/**
 * Envía alerta diaria de stock crítico/bajo via Resend.
 * Se ejecuta automáticamente desde GitHub Actions.
 *
 * Variables de entorno requeridas (GitHub Secrets):
 *   FIREBASE_SERVICE_ACCOUNT  → contenido JSON del serviceAccount
 *   RESEND_API_KEY            → API key de resend.com
 *   ALERT_EMAIL               → correo destinatario
 */

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore }        = require('firebase-admin/firestore');

const serviceAccount = JSON.parse(
  Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8')
);
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ALERT_EMAIL    = process.env.ALERT_EMAIL;

if (!RESEND_API_KEY || !ALERT_EMAIL) {
  console.error('Faltan variables de entorno: RESEND_API_KEY y ALERT_EMAIL');
  process.exit(1);
}

async function enviarAlerta() {
  const snap     = await db.collection('productos').where('activo', '==', true).get();
  const productos = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const criticos = productos.filter(p => p.cantidad <= (p.umbral_critico ?? 0));
  const bajos    = productos.filter(p => p.cantidad > (p.umbral_critico ?? 0) && p.cantidad <= (p.umbral_bajo ?? 0));

  if (!criticos.length && !bajos.length) {
    console.log('✅ Sin alertas de stock hoy.');
    return;
  }

  const hoy = new Date().toLocaleDateString('es-CL', {
    timeZone: 'America/Santiago', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const fila = (p) => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${p.nombre}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center"><strong>${p.cantidad}</strong></td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:center;color:#6b7280">${p.umbral_critico ?? 0} / ${p.umbral_bajo ?? 0}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e5e7eb">${p.categoria_nombre || '—'}</td>
    </tr>`;

  let html = `
    <div style="font-family:sans-serif;max-width:680px;margin:0 auto;color:#111">
      <div style="background:#1e40af;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="margin:0;font-size:20px">🏥 Alerta de Stock — Inventario CESFAM</h1>
        <p style="margin:4px 0 0;font-size:14px;opacity:.85">${hoy}</p>
      </div>
      <div style="background:#f9fafb;padding:20px 24px;border-radius:0 0 8px 8px">`;

  const tabla = (titulo, color, filas) => `
    <h2 style="color:${color};font-size:16px;margin:16px 0 8px">${titulo}</h2>
    <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden">
      <thead>
        <tr style="background:#f3f4f6;font-size:12px;color:#6b7280;text-transform:uppercase">
          <th style="padding:8px 12px;text-align:left">Producto</th>
          <th style="padding:8px 12px;text-align:center">Stock</th>
          <th style="padding:8px 12px;text-align:center">Umbral C/B</th>
          <th style="padding:8px 12px;text-align:left">Categoría</th>
        </tr>
      </thead>
      <tbody>${filas.map(fila).join('')}</tbody>
    </table>`;

  if (criticos.length) html += tabla(`🔴 Stock Crítico — ${criticos.length} producto${criticos.length !== 1 ? 's' : ''}`, '#991b1b', criticos);
  if (bajos.length)    html += tabla(`🟡 Stock Bajo — ${bajos.length} producto${bajos.length !== 1 ? 's' : ''}`, '#92400e', bajos);

  html += `</div></div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from:    'Inventario CESFAM <onboarding@resend.dev>',
      to:      [ALERT_EMAIL],
      subject: `⚠️ Stock CESFAM: ${criticos.length} crítico${criticos.length !== 1 ? 's' : ''}, ${bajos.length} bajo${bajos.length !== 1 ? 's' : ''}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend: ${JSON.stringify(err)}`);
  }

  console.log(`✅ Alerta enviada a ${ALERT_EMAIL}: ${criticos.length} críticos, ${bajos.length} bajos`);
}

enviarAlerta().catch(e => { console.error('Error:', e.message); process.exit(1); });
