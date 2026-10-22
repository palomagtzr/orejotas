// Proveedor Deepgram (Nova-3). Mismo contrato que assemblyai.js.
// Deepgram es síncrono: submit() devuelve el resultado completo en { result }.
import { HttpError } from '../http.js';

const BASE = 'https://api.deepgram.com/v1/listen';

function normalize(dg) {
  const utterances = (dg.results?.utterances || []).map((u) => ({
    speaker: String.fromCharCode(65 + (u.speaker ?? 0)), // 0 -> A, 1 -> B ...
    start: u.start,
    end: u.end,
    text: u.transcript,
    confidence: u.confidence,
    words: (u.words || []).map((w) => ({ s: w.start, e: w.end, t: w.punctuated_word || w.word })),
  }));
  const ch = dg.results?.channels?.[0];
  return {
    status: 'done',
    utterances,
    text: ch?.alternatives?.[0]?.transcript || '',
    durationSec: dg.metadata?.duration || 0,
    language: ch?.detected_language || null,
    speakers: [...new Set(utterances.map((u) => u.speaker))],
  };
}

async function submit(body, { language, contentType }, env) {
  if (!env.DEEPGRAM_API_KEY) throw new HttpError(500, 'DEEPGRAM_API_KEY no configurada');
  const q = new URLSearchParams({
    model: 'nova-3',
    diarize: 'true',
    utterances: 'true',
    smart_format: 'true',
    punctuate: 'true',
  });
  if (language === 'auto') q.set('detect_language', 'true');
  else q.set('language', language);

  const res = await fetch(`${BASE}?${q}`, {
    method: 'POST',
    headers: {
      authorization: `Token ${env.DEEPGRAM_API_KEY}`,
      'content-type': contentType || 'application/octet-stream',
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new HttpError(502, `Deepgram respondió ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  return { id: `dg_${data.metadata?.request_id || crypto.randomUUID()}`, result: normalize(data) };
}

async function status() {
  // Nunca debería llamarse: el resultado ya viajó en submit().
  return { status: 'error', message: 'Deepgram no usa polling' };
}

async function cleanup() {
  // Deepgram no almacena transcripts: nada que borrar.
}

export const deepgram = { name: 'deepgram', submit, status, cleanup };
