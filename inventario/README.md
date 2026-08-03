# Sistema de Control de Inventario — CESFAM

Sistema web multiusuario para gestión de stock de laboratorio/bodega.  
Stack: Node.js + Express + SQLite (better-sqlite3) | Vanilla JS (ES modules) | SheetJS para Excel.

---

## Requisitos

- Node.js **v16 o superior** (`node -v`)
- npm (`npm -v`)

---

## Instalación y puesta en marcha

```bash
# 1. Entrar al directorio del proyecto
cd inventario

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor (incluye seed automático en primer arranque)
npm start
```

Abrir el navegador en: **http://localhost:3000**

---

## Usuario administrador por defecto

| Campo      | Valor      |
|------------|------------|
| Usuario    | `admin`    |
| Contraseña | `admin123` |

> **Cambia la contraseña después del primer ingreso** (ver sección abajo).

---

## Cómo cambiar la contraseña

Desde la terminal (mientras el servidor está detenido):

```bash
node -e "
const db = require('./server/db');
const bcrypt = require('bcrypt');
const hash = bcrypt.hashSync('NUEVA_CLAVE', 10);
db.prepare('UPDATE usuarios SET password_hash=? WHERE usuario=?').run(hash, 'admin');
console.log('Contraseña actualizada');
"
```

---

## Datos de ejemplo incluidos

Al primer arranque se crean automáticamente:

- **3 categorías:** Medicamentos · Material de Curación · Equipamiento  
- **10 productos** con diferentes niveles de stock, umbrales y fechas de vencimiento.

---

## Funcionalidades

| Sección              | Descripción                                                  |
|----------------------|--------------------------------------------------------------|
| **Inventario**       | Tabla con estado de stock, alertas, filtros y CRUD          |
| **Ingresar por Caja**| Carga múltiple de stock por cajas con cálculo automático    |
| **Movimientos**      | Historial de entradas/salidas/ajustes con filtros           |
| **Categorías**       | Alta, edición y eliminación de categorías                   |
| **Reportes**         | Reporte mensual con stock inicial/final y valorización      |
| **Excel**            | Exportar inventario, movimientos y reportes a `.xlsx`       |

---

## Estructura de carpetas

```
inventario/
├─ public/          Frontend estático (HTML + CSS + JS)
├─ server/          Backend Express
│  ├─ db.js         Conexión SQLite + tablas + seed
│  ├─ server.js     Punto de entrada
│  └─ routes/       auth · productos · categorias · movimientos · reportes
├─ data/            Base de datos SQLite (generada automáticamente)
└─ package.json
```

---

## Puerto

Por defecto el servidor escucha en el puerto **3000**.  
Para cambiarlo: `PORT=8080 npm start`
