import { useEffect, useRef, useState } from 'react';
import { Microphone, Pause, Play, Stop, UploadSimple, ArrowCounterClockwise, Trash, Sparkle } from '@phosphor-icons/react';
import { useRecorder } from '../lib/useRecorder.js';
import { recoverChunks, getRecordingMeta, clearChunks, saveMeeting, saveAudio, newId } from '../lib/db.js';
import { uploadAudio, waitForTranscript } from '../lib/api.js';
import { fmtTime } from '../lib/exporters.js';
import { audioDuration } from '../lib/audio.js';
import { Mascot } from './Brand.jsx';

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
const BARS = 48;

function Wave({ level, live }) {
  const [hist, setHist] = useState(() => Array(BARS).fill(0));
  useEffect(() => {
    if (!live) return;
    setHist((h) => [...h.slice(1), level]);
  }, [level, live]);
  useEffect(() => { if (!live) setHist(Array(BARS).fill(0)); }, [live]);
  return (
    <div className="wave" aria-hidden="true">
      {hist.map((v, i) => <i key={i} className={v > 0.08 ? 'hot' : ''} style={{ height: `${4 + v * 50}px` }} />)}
    </div>
  );
}

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
  const [est, setEst] = useState({ pct: 0, audioSec: 0 });
  const fileRef = useRef(null);

  // Progreso estimado de la transcripción: AssemblyAI no reporta avance, así que se
  // calcula contra la duración del audio (suele tardar ~20-25% de ella) y se topa en 95%.
  useEffect(() => {
    if (phase !== 'processing' || !est.audioSec) return;
    const startedAt = Date.now();
    const expectedMs = Math.max(8000, est.audioSec * 0.25 * 1000);
    const t = setInterval(() => {
      const ratio = (Date.now() - startedAt) / expectedMs;
      setEst((e) => ({ ...e, pct: Math.min(0.95, ratio) }));
    }, 500);
    return () => clearInterval(t);
  }, [phase, est.audioSec]);

  useEffect(() => localStorage.setItem('juntas:lang', language), [language]);

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
  const discardRecovered = async () => { await clearChunks(); setRecovered(null); };

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

  const discard = async () => { await clearChunks(); setBlob(null); rec.reset(); setError(null); };

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
      const audioSec = (await audioDuration(blob)) || rec.elapsed || blob.size / 8000;
      const sub = await uploadAudio(blob, language, setProgress);
      setEst({ pct: 0, audioSec });
      setPhase('processing');
      await clearChunks();
      const result = sub.result || (await waitForTranscript(sub.id, { onTick: (s) => setStage(STAGES[s] || 'Procesando…') }));
      const speakers = {};
      result.speakers.forEach((s) => { speakers[s] = ''; });
      const done = { ...meeting, status: 'done', utterances: result.utterances, speakers, durationSec: result.durationSec || meeting.durationSec, detectedLanguage: result.language };
      await saveMeeting(done);
      onDone(done);
    } catch (e) {
      setPhase('error');
      setError(e.message || 'Algo falló');
      await saveMeeting({ ...meeting, status: 'error', error: e.message });
    }
  };

  const live = rec.state === 'recording';
  const idle = rec.state === 'idle' && !blob;

  if (phase === 'uploading' || phase === 'processing') {
    return (
      <div className="card progress">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Mascot size={64} />
          <strong>
            {phase === 'uploading'
              ? `Subiendo audio… ${Math.round(progress * 100)}%`
              : `${stage || 'Transcribiendo…'} ~${Math.round(est.pct * 100)}%`}
          </strong>
        </div>
        <div className="bar"><i style={{ width: `${(phase === 'uploading' ? progress : est.pct) * 100}%` }} /></div>
        <p className="hint" style={{ textAlign: 'left' }}>
          {phase === 'processing'
            ? `Orejotas está escuchando ${fmtTime(est.audioSec)} de audio. El porcentaje es estimado; el resultado llega cuando AssemblyAI termina. Puedes dejar la pestaña abierta.`
            : 'No cierres la pestaña mientras sube.'}
        </p>
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
          <input id="title" className="input" placeholder="Ej. Seguimiento semanal" value={title} onChange={(e) => setTitle(e.target.value)} disabled={live || rec.state === 'paused'} />
        </div>
        <div className="field">
          <label htmlFor="lang">Idioma de la junta</label>
          <select id="lang" className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>

      <div className={`stage ${live ? 'live' : ''}`}>
        <Mascot size={120} className="mascot-top" />
        <div className="ring-wrap">
          <span className="ring" /><span className="ring r2" /><span className="ring r3" />
          {idle ? (
            <button className="big-btn" onClick={rec.start} disabled={!rec.supported} aria-label="Grabar">
              <Microphone size={44} weight="fill" />
              <span className="lbl">Tap para grabar</span>
            </button>
          ) : (
            <div className="big-btn" role="timer" aria-live="off" style={{ cursor: 'default' }}>
              <span className="clock">{fmtTime(rec.elapsed)}</span>
              <span className="lbl">{live ? 'Grabando' : rec.state === 'paused' ? 'En pausa' : 'Listo'}</span>
            </div>
          )}
        </div>
        <Wave level={rec.level} live={live} />
      </div>

      {rec.error && <div className="hint error">{rec.error}</div>}
      {error && <div className="hint error">{error}</div>}

      <div className="controls">
        {live && (
          <>
            <div className="ctl"><button className="round" onClick={rec.pause} aria-label="Pausar"><Pause size={24} weight="fill" /></button>Pausar</div>
            <div className="ctl"><button className="round pink" onClick={handleStop} aria-label="Terminar"><Stop size={30} weight="fill" /></button>Terminar</div>
          </>
        )}
        {rec.state === 'paused' && (
          <>
            <div className="ctl"><button className="round" onClick={rec.resume} aria-label="Continuar"><Play size={24} weight="fill" /></button>Continuar</div>
            <div className="ctl"><button className="round pink" onClick={handleStop} aria-label="Terminar"><Stop size={30} weight="fill" /></button>Terminar</div>
          </>
        )}
        {blob && !live && rec.state !== 'paused' && (
          <>
            <button className="btn pink" onClick={transcribe}><Sparkle weight="fill" /> Transcribir ({(blob.size / 1048576).toFixed(1)} MB)</button>
            <button className="btn ghost danger" onClick={discard}><Trash /> Descartar</button>
          </>
        )}
      </div>

      {idle && (
        <div className="quick">
          <button className="btn tile" onClick={() => fileRef.current?.click()}><UploadSimple size={22} /> Importar audio</button>
          <input ref={fileRef} type="file" accept="audio/*,video/mp4,video/webm,.m4a,.mp3,.wav,.ogg,.webm,.aac" hidden onChange={handleFile} />
        </div>
      )}

      {!rec.supported && <div className="hint warn">Este navegador no permite grabar. Usa "Importar audio" con una grabación de tu teléfono.</div>}
      {idle && (
        <p className="hint">
          Avisa a los participantes que se graba y pon el dispositivo al centro de la mesa.
          {isIOS && ' En iPhone la grabación se detiene si bloqueas la pantalla o cambias de app: mantén la pantalla encendida, o graba con Notas de Voz e impórtala aquí.'}
        </p>
      )}
      {live && <p className="hint">Grabando en mono. Cada 5 s se guarda una copia local por si se cierra la pestaña.</p>}
    </div>
  );
}
