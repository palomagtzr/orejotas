// Cliente del Worker. La única "credencial" aquí es el código de acceso que
// el usuario escribe; nunca hay keys de proveedores en el frontend.

export const WORKER_URL = (import.meta.env.VITE_WORKER_URL || '').replace(/\/+$/, '');
const CODE_KEY = 'juntas:access-code';

export function getAccessCode() {
  return localStorage.getItem(CODE_KEY) || '';
}
export function setAccessCode(code) {
  localStorage.setItem(CODE_KEY, code);
}
export function clearAccessCode() {
  localStorage.removeItem(CODE_KEY);
}

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function parse(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Error ${res.status}`);
  return data;
}

function headers(extra = {}) {
  return { 'x-access-code': getAccessCode(), ...extra };
}

export async function checkAccess(code) {
  if (!WORKER_URL) throw new ApiError(0, 'Falta configurar VITE_WORKER_URL');
  const res = await fetch(`${WORKER_URL}/health`, { headers: { 'x-access-code': code } });
  return parse(res);
}

/** Sube el audio con progreso (XHR, porque fetch no reporta progreso de subida). */
export function uploadAudio(blob, language, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${WORKER_URL}/transcribe`);
    xhr.setRequestHeader('x-access-code', getAccessCode());
    xhr.setRequestHeader('x-language', language);
    xhr.setRequestHeader('content-type', blob.type || 'application/octet-stream');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch { /* vacío */ }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, data.error || `Error ${xhr.status}`));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Sin conexión con el servidor'));
    xhr.send(blob);
  });
}

export async function getTranscript(id) {
  const res = await fetch(`${WORKER_URL}/transcribe/${encodeURIComponent(id)}`, { headers: headers() });
  return parse(res);
}

/** Hace polling hasta terminar. onTick(stage) permite mostrar estado. */
export async function waitForTranscript(id, { intervalMs = 4000, onTick, signal } = {}) {
  for (;;) {
    if (signal?.aborted) throw new ApiError(0, 'Cancelado');
    const r = await getTranscript(id);
    if (r.status === 'done') return r;
    if (r.status === 'error') throw new ApiError(502, r.message || 'La transcripción falló');
    onTick?.(r.stage);
    await new Promise((ok) => setTimeout(ok, intervalMs));
  }
}

export async function summarize(transcript, language) {
  const res = await fetch(`${WORKER_URL}/summarize`, {
    method: 'POST',
    headers: headers({ 'content-type': 'application/json' }),
    body: JSON.stringify({ transcript, language }),
  });
  return parse(res);
}
