# Guía: subir el proyecto a GitHub y Railway (paso a paso)

Esta guía asume que **nunca** subiste un proyecto a GitHub ni usaste Railway. Tómate el tiempo de hacer cada paso en orden.

---

## Parte A — Crear cuenta en GitHub

1. Entrá a [https://github.com](https://github.com) y hacé clic en **Sign up**.
2. Completá email, contraseña y nombre de usuario.
3. Verificá el email si te lo piden.

---

## Parte B — Instalar Git en tu PC (Windows)

1. Descargá Git desde [https://git-scm.com/download/win](https://git-scm.com/download/win).
2. Instalalo con las opciones por defecto (siguiente, siguiente…).
3. Abrí **PowerShell** o **Terminal** y probá:
   ```bash
   git --version
   ```
   Si muestra un número de versión, está bien.

---

## Parte C — Configurar tu nombre y email en Git (una sola vez)

En PowerShell (reemplazá con tus datos):

```bash
git config --global user.name "Tu Nombre"
git config --global user.email "tu-email@ejemplo.com"
```

El email debería ser el mismo que usás en GitHub.

---

## Parte D — Subir el proyecto a GitHub

### 1. Ir a la carpeta del proyecto

En PowerShell:

```bash
cd C:\Users\Marcos\Desktop\frontend
```

(Ajustá la ruta si tu carpeta está en otro lado.)

### 2. Comprobar que NO subís secretos

- **No** debe existir `server/.env` en GitHub (contraseñas, API keys).
- El archivo `.gitignore` en la raíz del proyecto ignora `.env` automáticamente.

Si tenés dudas, **no** copies `.env` a otro nombre para subirlo.

### 3. Inicializar Git y primer commit

```bash
git init
git add .
git commit -m "Primer commit: app Prode"
```

Si Git te dice que falta `user.name` / `user.email`, volvé al **Parte C**.

### 4. Crear el repositorio vacío en GitHub

1. En GitHub: **+** → **New repository**.
2. **Repository name:** por ejemplo `prode-frontend` (el nombre que quieras).
3. Dejá **sin** marcar “Add a README” (el repo vacío).
4. **Create repository**.

### 5. Conectar tu carpeta con GitHub y subir

GitHub te mostrará comandos. Usá algo así (reemplazá `TU-USUARIO` y `NOMBRE-REPO`):

```bash
git branch -M main
git remote add origin https://github.com/TU-USUARIO/NOMBRE-REPO.git
git push -u origin main
```

La primera vez te pedirá iniciar sesión en GitHub. En Windows suele abrirse el navegador o pedirte un **Personal Access Token** en lugar de la contraseña.

**Si te pide token en GitHub:**

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token**.
2. Marcá al menos el permiso **repo**.
3. Copiá el token y usalo como “contraseña” cuando `git push` lo pida.

---

## Parte E — Crear cuenta en Railway

1. Entrá a [https://railway.app](https://railway.app).
2. **Login** → **Login with GitHub** (recomendado: así Railway ve tus repos).
3. Autorizá a Railway cuando GitHub lo pida.

---

## Parte F — Base de datos PostgreSQL en Railway

1. En el **Dashboard** de Railway: **New Project**.
2. **Empty Project** o **Provision PostgreSQL** (si ofrece plantilla con Postgres, podés elegirla).
3. Si no agregaste Postgres al crear el proyecto:
   - **New** → **Database** → **Add PostgreSQL**.
4. Abrí el servicio **PostgreSQL** → pestaña **Variables**.
5. Buscá la variable **`DATABASE_URL`** (Railway la crea sola). La vas a **referenciar** desde el backend (siguiente parte).

---

## Parte G — Desplegar el BACKEND (carpeta `server`)

1. En el mismo proyecto de Railway: **New** → **GitHub Repo**.
2. Elegí el repositorio que subiste (`prode-frontend` o como lo hayas llamado).
3. Railway detectará el repo. Configurá:
   - **Root Directory:** `server`  
     (muy importante: solo la carpeta del API.)
4. **Settings** → **Build** (o **Deploy**):
   - **Build Command** (si te deja editarlo):
     ```bash
     npm install && npx prisma generate && npm run build
     ```
   - **Start Command:**
     ```bash
     npx prisma migrate deploy && npm start
     ```
     Esto aplica migraciones y arranca Node con `node dist/index.js`.

5. **Variables** (pestaña **Variables** del servicio backend):

   | Nombre | Valor |
   |--------|--------|
   | `DATABASE_URL` | **Reference** → elegí la variable `DATABASE_URL` del servicio PostgreSQL (no la copies a mano si Railway ofrece “reference”). |
   | `JWT_SECRET` | Una frase larga y aleatoria (ej. 32 caracteres mezclando letras y números). **No** la compartas. |
   | `OPENAI_API_KEY` | Tu clave de OpenAI (la misma que usás en local en `.env`). |
   | `AI_MODEL` | `gpt-4o-mini` (o el que uses). |

   **No hace falta** poner `PORT` a mano: Railway lo asigna solo.

6. Guardá y esperá el despliegue. En **Settings** → **Networking** → **Generate Domain** para tener una URL pública del API, por ejemplo:
   `https://tu-backend-production.up.railway.app`

7. Copiá esa URL (la vas a usar en el frontend).

---

## Parte H — Desplegar el FRONTEND (carpeta `client`)

El frontend es estático después del build. Necesitás decirle **en el build** cuál es la URL del backend.

1. En Railway: **New** → **GitHub Repo** → el mismo repositorio.
2. **Root Directory:** `client`
3. **Variables** → agregar:

   | Nombre | Valor |
   |--------|--------|
   | `VITE_API_URL` | La URL pública del backend, **con https**, **sin** barra final. Ejemplo: `https://tu-backend-production.up.railway.app` |

4. **Build Command:**
   ```bash
   npm install && npm run build
   ```
5. **Start Command** (sitio estático): Railway a veces usa “Static” o Nixpacks. Si ofrece **Static Site**:
   - **Output directory:** `dist`
6. Si Railway pide un comando para servir archivos, a veces usan:
   ```bash
   npx serve dist -s -l 3000
   ```
   y variable `PORT=3000` si hace falta. (La interfaz de Railway cambia; lo importante es **build** → carpeta `dist` y que el servicio sirva esa carpeta.)

7. Generá un **dominio** para el frontend también (**Generate Domain**).

8. Abrí la URL del frontend en el navegador y probá login.

---

## Parte I — CORS y errores típicos

- El backend ya usa `cors()` abierto; no deberías tener bloqueo por origen en un primer despliegue.
- Si el frontend dice que la API devolvió HTML: revisá que `VITE_API_URL` sea exactamente la URL del backend y que **vuelvas a desplegar** el frontend después de cambiar esa variable (Vite “hornea” la URL en el build).

---

## Parte J — Base de datos con datos iniciales (seed)

La primera vez, la base en Railway está vacía. Podés:

1. Desde tu PC, con la `DATABASE_URL` de Railway (copiá **solo** desde el panel de Postgres, con cuidado):
   ```bash
   cd server
   set DATABASE_URL=postgresql://...   # en PowerShell: $env:DATABASE_URL="..."
   npx prisma migrate deploy
   npm run db:seed
   ```
2. O ejecutar el seed como **one-off** si Railway ofrece “Run command” en el servicio backend.

(El comando exacto de seed en tu proyecto es `npm run db:seed` dentro de `server`.)

---

## Parte K — Conectar tu dominio de GoDaddy (opcional)

1. En Railway, en el servicio del **frontend** → **Domains** → **Custom Domain** → agregá `www.tudominio.com` o `tudominio.com`.
2. En GoDaddy → **DNS** → agregá el registro **CNAME** o **A** que Railway te indique.
3. Esperá unos minutos a horas a que propaguen los DNS.

---

## Resumen del orden

1. GitHub: cuenta + repo + `git push`.
2. Railway: proyecto + PostgreSQL.
3. Railway: servicio **backend** (`server/`) + variables + dominio del API.
4. Railway: servicio **frontend** (`client/`) + `VITE_API_URL` + build + dominio.
5. (Opcional) Seed y dominio propio.

Si en algún paso Railway muestra textos distintos (“Service”, “Nixpacks”, etc.), la idea es siempre: **root directory correcto**, **variables de entorno**, **build** que genere `dist` en client y `dist` en server con Prisma.

---

## ¿Necesitás ayuda con un error concreto?

Anotá el mensaje exacto (o captura) y el paso en el que estás (GitHub, Railway backend, Railway frontend).
