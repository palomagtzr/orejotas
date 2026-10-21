import { useEffect, useRef, useState } from 'react';
import { Microphone, Pause, Play, Stop, UploadSimple, ArrowCounterClockwise, Trash } from '@phosphor-icons/react';
import { useRecorder } from '../lib/useRecorder.js';
import { recoverChunks, getRecordingMeta, clearChunks, saveMeeting, saveAudio, newId } from '../lib/db.js';
import { uploadAudio, waitForTranscript } from '../lib/api.js';
import { fmtTime } from '../lib/exporters.js';

export const LANGUAGES = [
  ['es', 'Español'],
  ['en', 'English'],
  ['auto', 'Detectar automáticamente'],
  ['pt', 'Português'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['it', 'Italiano'],
];

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const STAGES = { queued: 'En cola…', processing: 'Transcribiendo…' };

export default function Recorder({ onDone }) {
  const rec = useRecorder();
  const [language, setLanguage] = useState(localStorage.getItem('juntas:lang') || 'es');
  const [title, setTitle] = useState('');
  const [blob, setBlob] = useState(null);
  const [recovered, setRecovered] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | error
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => localStorage.setItem('juntas:lang', language), [language]);

  // Recuperación de una grabación interrumpida.
  useEffect(() => {
    (async () => {
      const parts = await recoverChunks();
      if (parts && parts.length) {
        const meta = await getRecordingMeta();
        setRecovered({ parts, mime: meta?.mime || parts[0].type || 'audio/webm', startedAt: meta?.startedAt });
      }
    })();
  }, []);

  const acceptRecovered = () => {
    setBlob(new Blob(recovered.parts, { type: recovered.mime }));
    setTitle(`Junta recuperada ${new Date(recovered.startedAt || Date.now()).toLocaleDateString('es-MX')}`);
    setRecovered(null);
  };
  const discardRecovered = async () => {
    await clearChunks();
    setRecovered(null);
  };

  const handleStop = async () => {
    const b = await rec.stop();
    if (b && b.size > 0) setBlob(b);
    else setError('La grabación quedó vacía');
  };

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setBlob(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
    e.target.value = '';
  };

  const discard = async () => {
    await clearChunks();
    setBlob(null);
    rec.reset();
    setError(null);
  };

  const transcribe = async () => {
    if (!blob) return;
    setError(null);
    setPhase('uploading');
    setProgress(0);
    const id = newId();
    const meeting = {
      id,
      title: title.trim() || `Junta ${new Date().toLocaleDateString('es-MX')}`,
      createdAt: Date.now(),
      language,
      durationSec: rec.elapsed || 0,
      status: 'processing',
      utterances: [],
      speakers: {},
      summary: null,
      audioType: blob.type,
    };
    try {
      await saveAudio(id, blob);
      await saveMeeting(meeting);
      const sub = await uploadAudio(blob, language, setProgress);
      setPhase('processing');
      await clearChunks();
      const result = sub.result || (await waitForTranscript(sub.id, { onTick: (s) => setStage(STAGES[s] || 'Procesando…') }));
      const speakers = {};
      result.speakers.forEach((s) => { speakers[s] = ''; });
      const done = {
        ...meeting,
        status: 'done',
        utterances: result.utterances,
        speakers,
        durationSec: result.durationSec || meeting.durationSec,
        detectedLanguage: result.language,
      };
      await saveMeeting(done);
      onDone(done);
    } catch (e) {
      setPhase('error');
      setError(e.message || 'Algo falló');
      await saveMeeting({ ...meeting, status: 'error', error: e.message });
    }
  };

  if (phase === 'uploading' || phase === 'processing') {
    return (
      <div className="recorder">
        <div className="progress">
          <strong>{phase === 'uploading' ? `Subiendo audio… ${Math.round(progress * 100)}%` : stage || 'Transcribiendo…'}</strong>
          <div className={`bar ${phase === 'processing' ? 'indeterminate' : ''}`}><i style={{ width: `${progress * 100}%` }} /></div>
          <span className="hint">
            {phase === 'processing' ? 'Suele tardar entre 15 y 30% de la duración del audio. Puedes dejar esta pestaña abierta.' : 'No cierres la pestaña.'}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="recorder">
      {recovered && (
        <div className="hint warn">
          Encontré una grabación interrumpida ({recovered.parts.length * 5}s aprox.).{' '}
          <button className="btn small" onClick={acceptRecovered}><ArrowCounterClockwise /> Recuperar</button>{' '}
          <button className="btn small ghost" onClick={discardRecovered}>Descartar</button>
        </div>
      )}

      <div className="options">
        <div className="field">
          <label htmlFor="title">Título</label>
          <input id="title" className="input" placeholder="Ej. Seguimiento semanal" value={title} onChange={(e) => setTitle(e.target.value)} disabled={rec.state !== 'idle' && rec.state !== 'stopped'} />
        </div>
        <div className="field">
          <label htmlFor="lang">Idioma de la junta</label>
          <select id="lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className={`clock ${rec.state === 'recording' ? 'live' : ''}`}>{fmtTime(rec.elapsed)}</div>
      <div className="meter"><i style={{ width: `${rec.level * 100}%` }} /></div>

      {rec.error && <div className="hint error">{rec.error}</div>}
      {error && <div className="hint error">{error}</div>}

      <div className="controls">
        {rec.state === 'idle' && !blob && (
          <>
            <button className="btn rec" onClick={rec.start} disabled={!rec.supported}><Microphone weight="fill" /> Grabar</button>
            <button className="btn" onClick={() => fileRef.current?.click()}><UploadSimple /> Subir archivo</button>
            <input ref={fileRef} type="file" accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.aac" hidden onChange={handleFile} />
          </>
        )}
        {rec.state === 'recording' && (
          <>
            <button className="btn" onClick={rec.pause}><Pause /> Pausar</button>
            <button className="btn primary" onClick={handleStop}><Stop weight="fill" /> Terminar</button>
          </>
        )}
        {rec.state === 'paused' && (
          <>
            <button className="btn" onClick={rec.resume}><Play weight="fill" /> Continuar</button>
            <button className="btn primary" onClick={handleStop}><Stop weight="fill" /> Terminar</button>
          </>
        )}
        {blob && (rec.state === 'stopped' || rec.state === 'idle') && (
          <>
            <button className="btn primary" onClick={transcribe}>Transcribir ({(blob.size / 1048576).toFixed(1)} MB)</button>
            <button className="btn ghost danger" onClick={discard}><Trash /> Descartar</button>
          </>
        )}
      </div>

      {!rec.supported && <div className="hint warn">Este navegador no permite grabar. Usa "Subir archivo" con una grabación de tu teléfono.</div>}
      {rec.state === 'idle' && !blob && (
        <p className="hint">
          Avisa a los participantes que se graba. Coloca el dispositivo al centro de la mesa.
          {isIOS && ' En iPhone la grabación se detiene si bloqueas la pantalla o cambias de app: mantén la pantalla encendida, o graba con Notas de Voz y súbela aquí.'}
        </p>
      )}
      {rec.state === 'recording' && <p className="hint">Grabando en mono. Cada 5 s se guarda una copia local por si se cierra la pestaña.</p>}
    </div>
  );
}
