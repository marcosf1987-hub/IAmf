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
git config --global user.name "MarcosF"
git config --global user.email "marcos.felsenstein@gmail.com"
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
git remote add origin https://github.com/marcosf1987-hub/IAmf.git
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

## ⚠️ Railway: cómo pegar comandos (Build / Start)

En **Build Command** y **Start Command** de Railway escribí **solo la línea del comando**, sin:

- Los ``` ``` (backticks) de Markdown
- La palabra `bash`
- Saltos de línea extra dentro del mismo campo

**Correcto:** `npm install && npm run build`  
**Incorrecto:** `` ```bash npm install && npm run build ``` `` → eso rompe el build (error tipo `cannot execute binary file` o exit 126).

Si no estás seguro, borrá el campo y escribilo a mano.

---

## Parte G — Desplegar el BACKEND (carpeta `server`)

1. En el mismo proyecto de Railway: **New** → **GitHub Repo**.
2. Elegí el repositorio que subiste (`prode-frontend` o como lo hayas llamado).
3. Railway detectará el repo. Configurá:
   - **Root Directory:** `server`  
     (muy importante: solo la carpeta del API.)
4. **Settings** → **Build** (o **Deploy**):
   - **Build Command** (si te deja editarlo):  
     `npm install && npx prisma generate && npm run build`
   - **Start Command:**  
     `npx prisma migrate deploy && npm start`  
     Esto aplica migraciones y arranca Node con `node dist/index.js`.

5. **Variables** (pestaña **Variables** del servicio backend):

   | Nombre | Valor |
   |--------|--------|
   | `DATABASE_URL` | **Reference** → elegí la variable `DATABASE_URL` del servicio PostgreSQL (no la copies a mano si Railway ofrece “reference”). |
   | `JWT_SECRET` | Una frase larga y aleatoria (ej. 32 caracteres mezclando letras y números). **No** la compartas. |
   | `OPENAI_API_KEY` | Tu clave de OpenAI (la misma que usás en local en `.env`). |
   | `AI_MODEL` | `gpt-4o-mini` (o el que uses). |
   | `FRONTEND_URL` | URL pública del sitio (sin `/` final), ej. `https://www.promptplay.pro`. Necesaria para volver del login con Google (`/oauth/callback`) y para enlaces por email. |
   | `OAUTH_PUBLIC_BASE_URL` | URL pública de **este** API (sin `/` final), la misma que el dominio público del backend en Railway. |
   | `OAUTH_GOOGLE_CLIENT_ID` y `OAUTH_GOOGLE_CLIENT_SECRET` | Credenciales OAuth 2.0 **Web** de Google Cloud. En Google, URI de redirección autorizada: `https://<tu-api>/auth/oauth/google/callback` (en local: `http://localhost:4000/auth/oauth/google/callback` si probás contra el API en el puerto 4000). |

   **Nota:** en `server/.env.example` no listamos valores `OAUTH_*=…` para no forzar secretos en build (Railpack). Los nombres exactos son los de la tabla.

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
   | `VITE_API_URL` | URL del backend **sin barra final**. Podés usar `https://iamf-production.up.railway.app` o solo el dominio `iamf-production.up.railway.app` (el front agrega `https://` solo). **No** pongas solo el nombre sin dominio completo. |

4. **Build Command:**  
   `npm install && npm run build`  
   (solo esa línea, sin Markdown; ver aviso arriba.)
5. **Start Command** (sitio estático): Railway a veces usa “Static” o Nixpacks. Si ofrece **Static Site**:
   - **Output directory:** `dist`
6. Si Railway pide un comando para servir archivos, a veces usan:  
   `npx serve dist -s -l 3000`
   y variable `PORT=3000` si hace falta. (La interfaz de Railway cambia; lo importante es **build** → carpeta `dist` y que el servicio sirva esa carpeta.)

7. Generá un **dominio** para el frontend también (**Generate Domain**).

8. Abrí la URL del frontend en el navegador y probá login.

---

## Parte I — CORS y errores típicos

- El backend permite CORS desde cualquier origen (adecuado para API + SPA en otro dominio).
- Si el frontend dice que la API devolvió HTML: revisá que `VITE_API_URL` sea exactamente la URL del backend y que **vuelvas a desplegar** el frontend después de cambiar esa variable (Vite “hornea” la URL en el build).

---

## El login no funciona (checklist)

1. **`VITE_API_URL` en el servicio del frontend (Railway)**  
   - Valor: la URL pública del **backend**, con `https://`, **sin** `/` al final.  
   - Ejemplo: `https://tu-api-production.up.railway.app`  
   - Después de agregarla o cambiarla: **Redeploy** del frontend (un build nuevo). Si no redeployás, el sitio sigue usando la URL vieja o `localhost`.

2. **Variables del backend**  
   - `JWT_SECRET` definida (cualquier string largo; si falta, el servidor puede fallar al firmar el token).  
   - `DATABASE_URL` referenciada al PostgreSQL de Railway.

3. **Base vacía**  
   - Si nunca corriste el **seed**, el usuario `admin@demo.com` no existe. Podés **registrarte** con “Crear cuenta” o ejecutar `npm run db:seed` contra la `DATABASE_URL` de Railway (ver Parte J).

4. **Probar el backend**  
   - En el navegador: `https://TU-BACKEND/health` debería devolver JSON `{"ok":true}`.

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

**Historial de predicciones (Laboratorio → Control de versiones):** requiere la migración `PredictionHistory` (p. ej. `20260316160000_prediction_history`). Si no corrés `migrate deploy`, el historial no se guarda ni se lista; el mensaje de error en pantalla puede indicar que falta aplicar migraciones.

---

## Error: «The table `ProdeGuidelines` does not exist» (u otras tablas)

El **login** puede funcionar (usa tablas creadas por la primera migración), pero **ProdeGuidelines**, **AiConfig**, resultados de partidos, etc. están en migraciones **posteriores**. Si no corrieron en Railway, aparece ese error.

### Qué hacer

1. **Confirmá el Start Command del backend** en Railway:  
   `npx prisma migrate deploy && npm start`  
   Sin `migrate deploy`, las tablas nuevas nunca se crean.

2. **Subí el código** a GitHub (este repo incluye la migración `20260319120000_schema_sync_prode_and_config`) y hacé **Redeploy** del backend.

3. **O** aplicá migraciones a mano desde tu PC (misma `DATABASE_URL` que Railway):

   ```powershell
   cd server
   $env:DATABASE_URL="postgresql://..."   # pegá la URL del Postgres en Railway
   npx prisma migrate deploy
   npm run db:seed
   ```

   Después probá de nuevo predicciones, IA y resultados.

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

## El build en Railway falla pero en tu PC compila

**Antes de seguir:** abrí en el navegador el archivo `server/src/auth.ts` **en tu repositorio de GitHub**. Si no ves la función `jwtExpiresInSeconds`, el código **no se subió**. Guía paso a paso: **[VERIFICAR-GITHUB.md](./VERIFICAR-GITHUB.md)**.

Railway **siempre** construye lo que está en **GitHub**, no lo que tenés solo en tu computadora. Si cambiás archivos en el PC y no los “subís” a GitHub, Railway sigue usando la versión vieja.

### Cómo hacer un deploy “desde cero” en Railway (no reintentar solo el deploy roto)

- **Lo que importa es el último commit en GitHub**, no el historial de deploys fallidos: cada **push** a la rama conectada (`main`) crea un **nuevo** intento de build con ese código.
- En el servicio: pestaña **Deployments** (o **Observability** → deployments, según la UI). Buscá un botón tipo **Deploy** / **New deployment** / **Deploy latest** que dispare desde **Git**, no el menú de tres puntos de un deploy viejo que solo dice **Redeploy** (eso a veces vuelve a ejecutar el mismo commit y el mismo error).
- Si no ves “deploy desde Git”: hacé un **push** vacío para forzar evento nuevo: `git commit --allow-empty -m "chore: trigger railway"` y `git push`.
- Si Railway muestra **cambios de variables sin aplicar**, revisá y **aplicá** esos cambios antes de esperar que el build pase.

El repo incluye `server/railpack.json` con `"secrets": []` para que Railpack **no** trate todas las variables del servicio como secretos obligatorios de BuildKit durante `docker build` cuando el build no necesita montar secretos por variable.

Abajo tenés **dónde** escribir los comandos y **qué** hacer, paso a paso, sin asumir experiencia previa.

---

### Dónde copiar y pegar los comandos (Windows)

Los comandos **no** van en GitHub ni en Railway. Van en una **terminal**: una ventana de texto negra o integrada en el editor donde el ordenador ejecuta instrucciones.

Tenés tres formas habituales (elegí una):

#### Opción A — Terminal dentro de Cursor (recomendada si ya usás el proyecto acá)

1. Abrí **Cursor** con tu carpeta del proyecto (`frontend`).
2. Menú superior: **Terminal** → **New Terminal** (o atajo de teclado **Ctrl + `** — la tecla debajo del Esc).
3. Se abre un panel abajo con una línea que termina en algo como `PS C:\Users\Marcos\Desktop\frontend>` Ese es el lugar correcto.
4. Ahí **pegás** los comandos (clic derecho → Pegar, o **Ctrl + V**) y tocás **Enter** para ejecutar cada uno.

#### Opción B — PowerShell de Windows

1. Tecla **Windows** del teclado.
2. Escribí **PowerShell** y abrí **Windows PowerShell**.
3. Se abre una ventana azul u oscura: ahí pegás los comandos y Enter.

#### Opción C — Carpeta del proyecto → “Abrir en terminal”

1. Abrí el **Explorador de archivos** y andá a la carpeta del proyecto, por ejemplo:  
   `C:\Users\Marcos\Desktop\frontend`
2. Clic en la **barra de direcciones** (donde dice la ruta), escribí `powershell` y Enter, **o** clic derecho en el fondo de la carpeta → **Abrir en Terminal** (si tu Windows lo muestra).

---

### Qué significa cada comando (en pocas palabras)

| Comando | Para qué sirve |
|--------|----------------|
| `cd C:\Users\Marcos\Desktop\frontend` | “Entrar” a la carpeta del proyecto (ajustá la ruta si tu carpeta tiene otro nombre o lugar). |
| `git status` | Mostrar qué archivos cambiaron y si hay algo pendiente de subir. |
| `git add .` | Marcar **todos** los cambios actuales para el próximo “paquete” (commit). |
| `git commit -m "mensaje"` | Guardar ese paquete en tu historial local con un mensaje corto (ej. “fix build”). |
| `git push origin main` | **Subir** esos cambios a GitHub. `main` es el nombre de la rama más común; a veces se llama `master`. |

---

### Pasos concretos (hacelos en orden)

1. Abrí la terminal (Opción A, B o C de arriba).
2. Si no estás ya en la carpeta del proyecto, escribí (y Enter):

   ```bash
   cd C:\Users\Marcos\Desktop\frontend
   ```

   *(Si tu proyecto está en otra ruta, cambiá solo esa parte.)*

3. Comprobá que Git “ve” el proyecto:

   ```bash
   git status
   ```

   - Si ves **“not a git repository”**, todavía no inicializaste Git: seguí la **Parte D** de arriba de este mismo documento (`git init`, conectar con GitHub, etc.).
   - Si ves una lista de archivos o **“nothing to commit”**, seguí al paso 4.

4. Guardá todos los cambios y prepará el envío:

   ```bash
   git add .
   ```

5. Creá un “paquete” con un mensaje que vos entiendas:

   ```bash
   git commit -m "Actualizo codigo para que Railway compile bien"
   ```

   - Si Git dice **“nothing to commit”**, no hay cambios nuevos: o ya estaba todo subido, o no guardaste los archivos en el editor (**Ctrl + S** en los archivos abiertos).

6. Subí a GitHub:

   ```bash
   git push origin main
   ```

   - Si tu rama **no** se llama `main`, Git a veces te sugiere el nombre correcto en un mensaje de error; podés probar:

     ```bash
     git push origin master
     ```

   - La primera vez puede pedirte **usuario y contraseña de GitHub**: hoy suele pedirse un **token** (no la contraseña de la web). Cómo crearlo está explicado un poco más arriba en **Parte D — punto 5** de esta guía.

7. Cuando `git push` termine **sin error**, entrá a [github.com](https://github.com), abrí tu repositorio y verificá que aparezcan los archivos o el commit reciente.

8. Volvé a **Railway** → tu servicio del **backend** → botón **Redeploy** (o “Deploy”) para que vuelva a construir usando el código nuevo de GitHub.

---

### Si algo sale mal

- **“git no se reconoce…”** → Git no está instalado o no está en el PATH. Instalá Git (**Parte B** de esta guía) y cerrá y volvé a abrir la terminal.
- **“Authentication failed”** al hacer `push` → Revisá usuario/token de GitHub (Parte D, token).
- **“failed to push” / “rejected”** → A veces alguien más cambió el repo; para uso solo con vos en una PC suele bastar con hacer pull antes: `git pull origin main --rebase` y después otra vez `git push`. Si no estás seguro, pedí ayuda con el texto exacto del error.

---

## ¿Necesitás ayuda con un error concreto?

Anotá el mensaje exacto (o captura) y el paso en el que estás (GitHub, Railway backend, Railway frontend).
