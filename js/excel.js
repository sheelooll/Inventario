// Exportaciones a Excel usando SheetJS (XLSX global cargado en index.html)

function descargar(wb, nombre) {
  XLSX.writeFile(wb, nombre);
}

function hoy() {
  return new Date().toISOString().slice(0, 10);
}

function estadoTexto(p) {
  if (p.vencido)    return 'Vencido';
  if (p.por_vencer) return 'Por vencer';
  return { critico: 'Crítico', bajo: 'Bajo', aceptable: 'Aceptable' }[p.estado] || p.estado;
}

// ===== Inventario actual =====
export function exportarInventarioExcel(productos) {
  const filas = productos.map(p => ({
    'Nombre':          p.nombre,
    'Categoría':       p.categoria_nombre,
    'Cantidad':        p.cantidad,
    'Estado':          estadoTexto(p),
    'Umbral Crítico':  p.umbral_critico,
    'Umbral Bajo':     p.umbral_bajo,
    'Vencimiento':     p.vencimiento || '',
  }));

  const ws = XLSX.utils.json_to_sheet(filas);
  ajustarColumnas(ws, filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario');
  descargar(wb, `inventario_${hoy()}.xlsx`);
}

// ===== Historial de movimientos =====
export function exportarMovimientosExcel(movimientos) {
  const filas = movimientos.map(m => ({
    'Fecha':            m.fecha,
    'Producto':         m.producto_nombre,
    'Categoría':        m.categoria_nombre,
    'Tipo':             m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1),
    'Cantidad':         m.cantidad,
    'Stock Resultante': m.stock_resultante,
    'Usuario':          m.usuario_nombre,
    'Motivo':           m.motivo || '',
  }));

  const ws = XLSX.utils.json_to_sheet(filas);
  ajustarColumnas(ws, filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
  descargar(wb, `movimientos_${hoy()}.xlsx`);
}

// ===== Reporte mensual =====
export function exportarReporteExcel(reporte) {
  const meses = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio',
                 'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  const filas = reporte.productos.map(p => ({
    'Producto':      p.nombre,
    'Categoría':     p.categoria_nombre,
    'Stock Inicial': p.stock_inicial,
    'Entradas':      p.entradas,
    'Salidas':       p.salidas,
    'Ajustes':       p.ajustes,
    'Stock Final':   p.stock_final,
    'Estado':        estadoTexto(p),
  }));

  filas.push({
    'Producto':      'TOTALES',
    'Categoría':     '',
    'Stock Inicial': '',
    'Entradas':      reporte.totales.entradas,
    'Salidas':       reporte.totales.salidas,
    'Ajustes':       '',
    'Stock Final':   '',
    'Estado':        '',
  });

  const ws = XLSX.utils.json_to_sheet(filas);
  ajustarColumnas(ws, filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  descargar(wb, `reporte_${meses[reporte.mes]}_${reporte.anio}.xlsx`);
}

function ajustarColumnas(ws, filas) {
  if (!filas.length) return;
  const keys = Object.keys(filas[0]);
  ws['!cols'] = keys.map(k => ({
    wch: Math.min(40, Math.max(k.length + 2, ...filas.map(f => String(f[k] ?? '').length + 1)))
  }));
}
