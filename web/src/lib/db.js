// Persistencia local en IndexedDB. Nada sale de este dispositivo salvo el audio
// que se manda a transcribir y el texto que se manda a resumir.
import { createStore, get, set, del, keys, getMany, clear } from 'idb-keyval';

// Una base de datos por store: idb-keyval solo crea el store al abrir la BD por
// primera vez, así que tres stores en una misma BD fallan con "object store not found".
const meetings = createStore('orejotas-meetings', 'kv');
const chunks = createStore('orejotas-chunks', 'kv');
const audio = createStore('orejotas-audio', 'kv');

// ── Juntas ───────────────────────────────────────────────────────────────────
export async function listMeetings() {
  const ks = await keys(meetings);
  const all = await getMany(ks, meetings);
  return all.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
}
export const getMeeting = (id) => get(id, meetings);
export const saveMeeting = (m) => set(m.id, m, meetings);
export async function deleteMeeting(id) {
  await del(id, meetings);
  await del(id, audio);
}

// ── Audio por junta ──────────────────────────────────────────────────────────
export const saveAudio = (id, blob) => set(id, blob, audio);
export const getAudio = (id) => get(id, audio);

// ── Fragmentos de la grabación en curso (recuperación ante cierre) ──────────
export async function appendChunk(index, blob) {
  await set(index, blob, chunks);
}
export async function setRecordingMeta(meta) {
  await set('__meta', meta, chunks);
}
export async function getRecordingMeta() {
  return get('__meta', chunks);
}
export async function recoverChunks() {
  const ks = (await keys(chunks)).filter((k) => typeof k === 'number').sort((a, b) => a - b);
  if (ks.length === 0) return null;
  const parts = await getMany(ks, chunks);
  return parts.filter(Boolean);
}
export const clearChunks = () => clear(chunks);

export function newId() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
