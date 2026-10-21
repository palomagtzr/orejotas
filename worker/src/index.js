import { corsHeaders, originAllowed, json, HttpError, clientIp, rateLimit } from './http.js';
import { requireAccess } from './auth.js';
import { assemblyai } from './providers/assemblyai.js';
import { deepgram } from './providers/deepgram.js';
import { summarize } from './llm.js';

const PROVIDERS = { assemblyai, deepgram };
const LANGUAGES = new Set(['auto', 'es', 'en', 'pt', 'fr', 'de', 'it']);
const AUDIO_TYPES = /^(audio\/|video\/(mp4|webm)|application\/octet-stream)/;

// Límites del resumen: protegen al LLM de payloads absurdos y a tu crédito.
const MAX_UTTERANCES = 6000;
const MAX_UTTERANCE_CHARS = 4000;
const MAX_TOTAL_CHARS = 500_000;

function provider(env) {
  const p = PROVIDERS[env.STT_PROVIDER || 'assemblyai'];
  if (!p) throw new HttpError(500, `STT_PROVIDER inválido: ${env.STT_PROVIDER}`);
  return p;
}

/** Tope diario de transcripciones con KV (si está configurado). */
async function consumeDailyBudget(env) {
  if (!env.BUDGET) return;
  const max = Number(env.MAX_TRANSCRIPTS_PER_DAY || 15);
  const key = `day:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await env.BUDGET.get(key)) || 0);
  if (used >= max) throw new HttpError(429, `Límite diario alcanzado (${max} transcripciones). Mañana se reinicia.`);
  await env.BUDGET.put(key, String(used + 1), { expirationTtl: 60 * 60 * 48 });
}

async function handleTranscribe(request, env) {
  const ip = clientIp(request);
  if (!(await rateLimit(env.RL_TRANSCRIBE, `tx:${ip}`))) throw new HttpError(429, 'Demasiadas transcripciones seguidas. Espera un minuto.');

  const language = (request.headers.get('x-language') || 'auto').toLowerCase();
  if (!LANGUAGES.has(language)) throw new HttpError(400, 'Idioma no soportado');

  const contentType = (request.headers.get('content-type') || '').split(';')[0].trim();
  if (!AUDIO_TYPES.test(contentType)) throw new HttpError(415, 'El cuerpo debe ser un archivo de audio');

  const maxBytes = Number(env.MAX_UPLOAD_MB || 100) * 1024 * 1024;
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw new HttpError(413, `Audio demasiado grande (máx ${env.MAX_UPLOAD_MB || 100} MB)`);
  if (!request.body) throw new HttpError(400, 'Audio vacío');

  await consumeDailyBudget(env);
  return provider(env).submit(request.body, { language, contentType }, env);
}

async function handleStatus(id, env, ctx) {
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) throw new HttpError(400, 'ID inválido');
  const p = provider(env);
  const result = await p.status(id, env);
  if (result.status === 'done') ctx.waitUntil(p.cleanup(id, env));
  return result;
}

function validateTranscript(body) {
  if (!body || !Array.isArray(body.transcript)) throw new HttpError(400, 'Falta transcript');
  if (body.transcript.length === 0 || body.transcript.length > MAX_UTTERANCES) throw new HttpError(400, 'Transcript vacío o demasiado largo');
  let total = 0;
  const transcript = body.transcript.map((u) => {
    if (!u || typeof u.text !== 'string' || typeof u.speaker !== 'string') throw new HttpError(400, 'Formato de transcript inválido');
    if (u.text.length > MAX_UTTERANCE_CHARS || u.speaker.length > 60) throw new HttpError(400, 'Segmento demasiado largo');
    total += u.text.length;
    return { speaker: u.speaker, text: u.text };
  });
  if (total > MAX_TOTAL_CHARS) throw new HttpError(413, 'Transcripción demasiado larga para resumir');
  const language = typeof body.language === 'string' && LANGUAGES.has(body.language) && body.language !== 'auto' ? body.language : 'es';
  return { transcript, language };
}

async function handleSummarize(request, env) {
  const ip = clientIp(request);
  if (!(await rateLimit(env.RL_TRANSCRIBE, `sum:${ip}`))) throw new HttpError(429, 'Demasiados resúmenes seguidos. Espera un minuto.');
  const body = await request.json().catch(() => null);
  const { transcript, language } = validateTranscript(body);
  return summarize(transcript, language, env);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(env, origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (!originAllowed(env, origin)) throw new HttpError(403, 'Origen no permitido');
      if (!(await rateLimit(env.RL_GENERAL, `gen:${clientIp(request)}`))) throw new HttpError(429, 'Demasiadas peticiones');
      await requireAccess(request, env);

      const path = url.pathname.replace(/\/+$/, '');
      const statusMatch = path.match(/^\/transcribe\/([^/]+)$/);

      if (request.method === 'GET' && path === '/health') return json({ ok: true, provider: provider(env).name }, 200, cors);
      if (request.method === 'POST' && path === '/transcribe') return json(await handleTranscribe(request, env), 202, cors);
      if (request.method === 'GET' && statusMatch) return json(await handleStatus(statusMatch[1], env, ctx), 200, cors);
      if (request.method === 'POST' && path === '/summarize') return json(await handleSummarize(request, env), 200, cors);

      throw new HttpError(404, 'Ruta no encontrada');
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status, cors);
      console.error('Unhandled', err);
      // Nunca exponemos stack traces al cliente.
      return json({ error: 'Error interno' }, 500, cors);
    }
  },
};
