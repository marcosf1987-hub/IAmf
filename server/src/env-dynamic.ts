/**
 * Lectura de `process.env` por nombre en runtime.
 * Evita el patrón `process.env.VAR_FIJA`: Railpack/Railway puede marcar esas VAR
 * como secretos de BuildKit y exigirlas durante `npm run build`, aunque solo
 * se usen al arrancar el servidor.
 */
export function envString(name: string): string | undefined {
  return process.env[name];
}
