// Proveedor AssemblyAI. Contrato común (ver README "Proveedores"):
//   submit(body, opts, env)  -> { id }            (o { id, result } si fuera síncrono)
//   status(id, env)          -> { status: 'processing' | 'done' | 'error', ... }
//   cleanup(id, env)         -> borra el transcript del proveedor
import { HttpError } from '../http.js';

const BASE = 'https://api.assemblyai.com';

function headers(env) {
  if (!env.ASSEMBLYAI_API_KEY) throw new HttpError(500, 'ASSEMBLYAI_API_KEY no configurada');
  return { authorization: env.ASSEMBLYAI_API_KEY };
}

async function submit(body, { language, contentType }, env) {
  // 1) Subida en streaming: el audio nunca se carga completo en memoria del Worker.
  const up = await fetch(`${BASE}/v2/upload`, {
    method: 'POST',
    headers: { ...headers(env), 'content-type': contentType || 'application/octet-stream' },
    body,
  });
  if (!up.ok) throw new HttpError(502, `Upload falló (${up.status})`);
  const { upload_url } = await up.json();

  // 2) Solicitud de transcripción. Modelos explícitos: nunca confiar en el default.
  const speech_models = (env.AAI_SPEECH_MODELS || 'universal-3-pro,universal-2')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const params = {
    audio_url: upload_url,
    speech_models,
    speaker_labels: true, // único add-on. Nada más (summarization/auto_chapters cuestan extra y fallan en U3).
  };
  if (language === 'auto') params.language_detection = true;
  else params.language_code = language;

  const res = await fetch(`${BASE}/v2/transcript`, {
    method: 'POST',
    headers: { ...headers(env), 'content-type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new HttpError(502, `AssemblyAI rechazó la solicitud (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return { id: data.id };
}

async function status(id, env) {
  const res = await fetch(`${BASE}/v2/transcript/${encodeURIComponent(id)}`, { headers: headers(env) });
  if (res.status === 404) throw new HttpError(404, 'Transcripción no encontrada');
  if (!res.ok) throw new HttpError(502, `AssemblyAI respondió ${res.status}`);
  const t = await res.json();

  if (t.status === 'error') return { status: 'error', message: t.error || 'Error desconocido' };
  if (t.status !== 'completed') return { status: 'processing', stage: t.status };

  const utterances = (t.utterances || []).map((u) => ({
    speaker: String(u.speaker),
    start: u.start / 1000,
    end: u.end / 1000,
    text: u.text,
    confidence: u.confidence,
  }));

  return {
    status: 'done',
    utterances,
    text: t.text || '',
    durationSec: t.audio_duration || 0,
    language: t.language_code || null,
    speakers: [...new Set(utterances.map((u) => u.speaker))],
  };
}

async function cleanup(id, env) {
  // Borramos el transcript del proveedor: el único lugar donde vive es el navegador del usuario.
  await fetch(`${BASE}/v2/transcript/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: headers(env),
  }).catch(() => {});
}

export const assemblyai = { name: 'assemblyai', submit, status, cleanup };
