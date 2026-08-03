# Prompt para Claude Code — Sistema de Control de Inventario

> Copia todo el bloque de abajo (desde "Quiero que construyas…" hasta el final) y pégalo en Claude Code.
> Está pensado para que genere el proyecto por partes, con HTML, CSS y JavaScript separados,
> las ventanas solicitadas y exportación a Excel.

---

Quiero que construyas un **sistema web de control de inventario** para un laboratorio / bodega, pensado para **uso real multiusuario**. Trabaja de forma incremental: primero propón la estructura de carpetas y el modelo de datos, espera nada y continúa creando los archivos uno a uno, y al final deja instrucciones claras para levantarlo.

## 1. Stack y separación de código (importante)

- **Frontend:** HTML, CSS y JavaScript **separados en archivos distintos** (nada de todo en un solo archivo). JavaScript **vanilla** (sin React ni frameworks), organizado en módulos ES (`import`/`export`).
- **Backend:** **Node.js + Express** con base de datos **SQLite** (para persistencia real y multiusuario). Simple, sin ORM pesado (usa `better-sqlite3`).
- **Exportación a Excel:** librería **SheetJS (xlsx)**.
- Sin dependencias innecesarias. Todo debe correr con `npm install` y `npm start`.

### Estructura de carpetas sugerida
```
inventario/
├─ public/
│  ├─ index.html            (una sola página; navegación por vistas/hash router)
│  ├─ css/
│  │  ├─ base.css           (variables, tipografía, layout general)
│  │  └─ components.css      (tablas, botones, modales, formularios)
│  └─ js/
│     ├─ app.js             (arranque + router entre ventanas)
│     ├─ api.js             (llamadas fetch al backend)
│     ├─ auth.js            (login / sesión)
│     ├─ inventario.js      (listado + estados de stock)
│     ├─ categorias.js      (administrar categorías)
│     ├─ ingreso.js         (ingresar productos por caja)
│     ├─ movimientos.js     (entradas / salidas / ajustes + historial)
│     ├─ reportes.js        (reportes mensuales)
│     ├─ excel.js           (exportar a Excel con SheetJS)
│     └─ ui.js              (helpers: modales, toasts, formato de fechas/números)
├─ server/
│  ├─ server.js             (Express + rutas)
│  ├─ db.js                 (conexión SQLite + creación de tablas + seed)
│  └─ routes/
│     ├─ auth.js  productos.js  categorias.js  movimientos.js  reportes.js
├─ data/                    (archivo .sqlite; ignorar en git)
├─ package.json
└─ README.md                (cómo instalar y correr)
```

## 2. Modelo de datos (SQLite)

- **usuarios**: id, nombre, usuario (único), password_hash (usa bcrypt), rol (`admin` / `operador`), activo.
- **categorias**: id, nombre (único), descripcion.
- **productos**: id, nombre, categoria_id, cantidad (stock actual, entero), unidades_por_caja (entero, por defecto 1), umbral_critico, umbral_bajo, vencimiento (fecha, opcional), precio_unitario (opcional), activo.
- **movimientos**: id, producto_id, tipo (`entrada` / `salida` / `ajuste`), cajas (opcional), unidades_por_caja (opcional), cantidad (total del movimiento), stock_resultante, usuario_id, motivo, fecha (timestamp).

Regla de estado de stock (calculado, no guardado):
- `cantidad <= umbral_critico` → **Crítico** (rojo)
- `cantidad <= umbral_bajo` → **Bajo** (ámbar)
- en otro caso → **Aceptable** (verde)
- Validar siempre `umbral_critico <= umbral_bajo`.

## 3. Ventanas / pantallas requeridas

Implementa estas ventanas como vistas navegables (menú lateral o superior). Solo se accede tras iniciar sesión.

### 3.1 Ingreso (Login)
- Pantalla inicial con usuario y contraseña.
- El backend valida contra la tabla `usuarios` (password con bcrypt) y devuelve una sesión (token simple o cookie de sesión).
- Mientras no haya sesión, ninguna otra ventana es accesible.
- Muestra el usuario conectado y un botón **Cerrar sesión**.
- Crea un usuario administrador por defecto en el seed (usuario: `admin`, clave: `admin123`) y muéstralo en el README para el primer ingreso.

### 3.2 Inventario (vista principal)
- Tabla de productos con: nombre, categoría, cantidad, estado (píldora de color), vencimiento, acciones.
- **Franja de alertas** arriba: cantidad de productos en crítico, en bajo, y por vencer/vencidos (por vencer = dentro de 30 días).
- Buscador por nombre y **filtros** por estado (Todos / Crítico / Bajo / Por vencer) y por **categoría**.
- Botón para registrar movimiento (entrada/salida/ajuste) en cada fila.
- Alta/edición/eliminación de producto (modal): nombre, categoría, cantidad inicial, unidades por caja, umbrales crítico y bajo, vencimiento, precio unitario opcional.

### 3.3 Categorías
- CRUD de categorías (crear, editar, eliminar).
- No permitir eliminar una categoría con productos asociados (avisar).
- Las categorías alimentan el selector de productos y el filtro del inventario.

### 3.4 Ingresar productos por caja
- Ventana dedicada para cargar stock **por cajas**.
- El usuario selecciona el producto, ingresa **cuántas cajas** y **cuántas unidades vienen por caja** (este último se autocompleta con `unidades_por_caja` del producto, pero es editable).
- El sistema calcula y muestra el **total de unidades = cajas × unidades por caja** antes de confirmar.
- Al confirmar, genera un movimiento tipo **entrada** con ese total, guarda `cajas` y `unidades_por_caja`, actualiza el stock y registra el usuario y un motivo opcional.
- Permitir ingresar **varias líneas** (varios productos) en una misma carga si es posible.

### 3.5 Movimientos
- Historial de todos los movimientos (fecha, producto, tipo, cambio ±, stock resultante, usuario, motivo).
- Filtros por rango de fechas, tipo, producto y categoría.
- Tipos:
  - **Entrada:** suma al stock (incluye la carga por cajas).
  - **Salida:** resta del stock, nunca deja el stock negativo (validar).
  - **Ajuste:** fija el stock a una cantidad exacta (conteo físico); el sistema calcula la diferencia.

### 3.6 Reportes mensuales
- Selector de **mes y año** (y filtro opcional por categoría).
- Muestra por producto: stock inicial del mes, total entradas, total salidas, ajustes, stock final.
- Totales generales y, si hay precio unitario, **valorización** (stock final × precio).
- Resumen de productos que quedaron en estado crítico/bajo al cierre y de los vencidos/por vencer.
- Botón **Exportar a Excel** de este reporte.

### 3.7 Exportar a Excel
- Módulo `excel.js` con SheetJS.
- Debe permitir exportar: (a) el **inventario actual** con su estado, (b) el **historial de movimientos** filtrado, y (c) el **reporte mensual**.
- Cada export genera un `.xlsx` con encabezados claros y nombre de archivo con fecha (ej: `inventario_2026-01.xlsx`).

## 4. Reglas de calidad

- Diseño limpio, responsivo (usable en tablet/móvil), con foco de teclado visible.
- Validaciones en frontend **y** backend (nunca confiar solo en el cliente).
- Manejo de errores con mensajes claros al usuario (no fallar en silencio).
- Fechas y números formateados en español de Chile (es-CL).
- Código comentado en español donde ayude, nombres de variables claros.
- Endpoints REST bien definidos (`/api/auth/login`, `/api/productos`, `/api/categorias`, `/api/movimientos`, `/api/reportes/mensual`, etc.).

## 5. Entregables

1. Todo el proyecto según la estructura de carpetas.
2. `package.json` con scripts `start` (levanta el servidor) y, si corresponde, `seed`.
3. `README.md` con: requisitos, cómo instalar (`npm install`), cómo correr, usuario admin por defecto, y cómo cambiar la clave.
4. Datos de ejemplo (seed) con 2–3 categorías y varios productos para probar de inmediato.

Empieza mostrando la estructura y el modelo de datos, y luego crea los archivos. Al final, dime el comando exacto para levantar el sistema y probarlo en el navegador.
