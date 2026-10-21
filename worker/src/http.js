// Helpers de respuesta y CORS. Nada de lógica de negocio aquí.

export function corsHeaders(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'content-type,x-access-code,x-language,x-filename',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export function originAllowed(env, origin) {
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  // En desarrollo local (wrangler dev) permitimos localhost.
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
  return allowed.includes(origin);
}

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra },
  });
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

/** Rate limit con el binding nativo. Si el binding no existe, no bloquea. */
export async function rateLimit(binding, key) {
  if (!binding || typeof binding.limit !== 'function') return true;
  const { success } = await binding.limit({ key });
  return success;
}
