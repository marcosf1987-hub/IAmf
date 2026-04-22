# IA + Prode 2026 

Sistema de inducción a IA para RRHH con Prode FIFA 2026, chat con IA y ranking anonimizado

## Requisitos

- Node.js 18+
- PostgreSQL (local o Docker)
- Cuenta OpenAI (o proveedor compatible) para el chat

## Setup inicial

### 1. Base de datos

**Opción A - Con Docker:**
```bash
docker compose up -d
```

**Opción B - PostgreSQL local:** Crear usuario y base en pgAdmin o psql:

```sql
CREATE USER rrhhia WITH PASSWORD '1234' CREATEDB;
CREATE DATABASE rrhhia_prode OWNER rrhhia;
```

### 2. Backend

```bash
cd server
npm install
cp .env.example .env
# Editar .env con DATABASE_URL y OPENAI_API_KEY
npx prisma db push
npm run db:seed
```

### 3. Frontend

```bash
cd client
npm install
```

## Ejecución

**Terminal 1 - Backend:**
```bash
cd server
npm run dev
```
API en http://localhost:4000

**Terminal 2 - Frontend:**
```bash
cd client
npm run dev
```
App en http://localhost:5173

## Usuarios de prueba

- **Admin RRHH:** admin@demo.com / Admin1234
- Crear empleados desde Admin o signup

## Despliegue (GitHub + Railway)

Guía detallada para principiantes: **[DEPLOY.md](./DEPLOY.md)** (Git, GitHub, Railway, PostgreSQL, dominio).

## Estructura

- `client/` - React + Vite (frontend)
- `server/` - Express + Prisma (backend)
- `server/prisma/` - Schema y migraciones

## Variables de entorno (server/.env)

| Variable | Descripción |
|----------|-------------|
| DATABASE_URL | Conexión PostgreSQL |
| JWT_SECRET | Clave para tokens |
| OPENAI_API_KEY | Clave API OpenAI |
| AI_MODEL | Modelo (default: gpt-4o-mini) |
| AI_BASE_URL | Opcional: otro proveedor compatible |

## Funcionalidades

- **Empleados:** Login, Prode, Chat IA, Mis resultados, Mi usuario
- **Admin:** ABM usuarios, métricas, export CSV, cargar resultados partidos
- **Ranking:** Anonimizado por empresa (Empleado #xxxx)

## Pendientes

- **Integración de pago / facturación (B2B):** cerrar el flujo más allá del enlace a checkout (`BILLING_CHECKOUT_BASE_URL` / `VITE_BILLING_CHECKOUT_BASE_URL`): webhooks del gateway (p. ej. Stripe) para actualizar `seatLimit` / datos de empresa tras el pago, pruebas end-to-end en staging/producción y mensajes claros si el checkout no está configurado.

- **Internacionalización (i18n):** versión en inglés con rutas bajo `/en` (o prefijo de locale), traducción de todos los textos de UI, acciones, mensajes de error/flash y accesibilidad (`aria-*`); infraestructura tipo `react-i18next` o similar; fechas/números con `Intl`; revisar mensajes que vengan del API para códigos o traducciones en cliente.

*(Otras ideas que a veces quedan en el mismo saco, por si era una de ellas: emails transaccionales/invitaciones, observabilidad, o hardening de seguridad; no constan en el código como “acordadas”.)*
