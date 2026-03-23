# Cómo saber si el código llegó bien a GitHub (antes de confiar en Railway)

Railway **solo** lee lo que está en **GitHub**. Si el build falla con errores viejos (por ejemplo `auth.ts` línea 18 = `jwt.sign` con un tipo raro), casi siempre es porque **GitHub no tiene tu última versión**.

## Paso 1 — Abrí tu repositorio en el navegador

1. Entrá a [https://github.com](https://github.com) e iniciá sesión.
2. Abrí **tu repositorio** (el que conectaste a Railway).
3. En la lista de carpetas, entrá a: **`server`** → **`src`** → hacé clic en **`auth.ts`**.

## Paso 2 — Mirá el contenido del archivo

Tenés que ver algo parecido a esto (no hace falta que sea idéntico palabra por palabra):

- Una función llamada **`jwtExpiresInSeconds`** (varias líneas arriba de `signAccessToken`).
- Dentro de **`signAccessToken`**, la palabra **`jwtExpiresInSeconds()`** y/o un **`as any`** cerca de `jwt.sign`.

### Si en cambio ves código viejo

Por ejemplo **solo** una línea como:

`return jwt.sign(payload, getJwtSecret(), { expiresIn: ...`

sin `jwtExpiresInSeconds` ni el cast, entonces **GitHub está desactualizado**.

## Paso 3 — Subí los cambios desde tu PC

En la terminal (en la carpeta del proyecto), en este orden:

```bash
cd C:\Users\Marcos\Desktop\frontend
git status
git add .
git commit -m "fix: servidor compila en Railway"
git push origin main
```

Si `git push` pide usuario/contraseña, usá un **token** de GitHub (no la contraseña de la web). Detalle en `DEPLOY.md`.

Después **refrescá la página** de `auth.ts` en GitHub (F5) y volvé a verificar el Paso 2.

## Paso 4 — Recién ahí: Redeploy en Railway

Cuando en GitHub ya veas el `auth.ts` nuevo, andá a Railway → tu servicio **backend** → **Redeploy**.

---

**Resumen:** Si GitHub muestra el archivo viejo, Railway seguirá fallando hasta que `git push` funcione bien.
