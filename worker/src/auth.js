import { HttpError, clientIp, rateLimit } from './http.js';

const enc = new TextEncoder();

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** Comparación en tiempo constante sobre hashes de longitud fija. */
async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

/**
 * Verifica el header x-access-code contra el secret ACCESS_CODE.
 * Los fallos se limitan por IP para frenar fuerza bruta.
 */
export async function requireAccess(request, env) {
  if (!env.ACCESS_CODE) throw new HttpError(500, 'ACCESS_CODE no configurado en el Worker');
  const given = request.headers.get('x-access-code') || '';
  const ip = clientIp(request);

  if (given.length === 0 || given.length > 128 || !(await safeEqual(given, env.ACCESS_CODE))) {
    const ok = await rateLimit(env.RL_AUTH_FAIL, `auth:${ip}`);
    if (!ok) throw new HttpError(429, 'Demasiados intentos. Espera un minuto.');
    throw new HttpError(401, 'Código de acceso incorrecto');
  }
}
