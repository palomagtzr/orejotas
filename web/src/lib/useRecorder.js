import { useCallback, useEffect, useRef, useState } from 'react';
import fixWebmDuration from 'fix-webm-duration';
import { appendChunk, clearChunks, setRecordingMeta } from './db.js';

const CHUNK_MS = 5000;

// Mono, 64 kbps: una hora ≈ 29 MB. Suficiente para voz; evita el cobro doble por estéreo.
const CONSTRAINTS = {
  audio: {
    channelCount: { ideal: 1 },
    echoCancellation: false,
    noiseSuppression: false, // apaga voces lejanas; mejor dejar el ruido y que el modelo lo maneje
    autoGainControl: true,
  },
};

export function pickMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (typeof MediaRecorder === 'undefined') return '';
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

export function extensionFor(mime) {
  if (!mime) return 'webm';
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * Estados: idle | recording | paused | stopped
 * Devuelve el Blob final al parar. Cada fragmento se persiste en IndexedDB
 * para poder recuperar la grabación si se cierra la pestaña.
 */
export function useRecorder() {
  const [state, setState] = useState('idle');
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState(null);
  const [mime, setMime] = useState('');

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const partsRef = useRef([]);
  const idxRef = useRef(0);
  const startedAtRef = useRef(0);
  const pausedTotalRef = useRef(0);
  const pauseStartRef = useRef(0);
  const timerRef = useRef(null);
  const wakeRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) wakeRef.current = await navigator.wakeLock.request('screen');
    } catch { /* no soportado o rechazado: no es fatal */ }
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && recRef.current?.state === 'recording') requestWakeLock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [requestWakeLock]);

  // Avisar antes de cerrar la pestaña mientras se graba.
  useEffect(() => {
    const warn = (e) => {
      if (state === 'recording' || state === 'paused') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [state]);

  const startMeter = (stream) => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      audioCtxRef.current = ctx;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / data.length) * 3));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* medidor opcional */ }
  };

  const stopMeter = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevel(0);
  };

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(CONSTRAINTS);
      const type = pickMimeType();
      const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 64000 } : { audioBitsPerSecond: 64000 });
      partsRef.current = [];
      idxRef.current = 0;
      await clearChunks();
      await setRecordingMeta({ mime: rec.mimeType, startedAt: Date.now() });

      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          partsRef.current.push(e.data);
          appendChunk(idxRef.current++, e.data).catch(() => {});
        }
      };
      rec.onerror = () => setError('El navegador interrumpió la grabación');

      rec.start(CHUNK_MS);
      recRef.current = rec;
      streamRef.current = stream;
      setMime(rec.mimeType);
      startedAtRef.current = Date.now();
      pausedTotalRef.current = 0;
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startedAtRef.current - pausedTotalRef.current) / 1000));
      }, 500);
      startMeter(stream);
      requestWakeLock();
      setState('recording');
    } catch (e) {
      setError(e.name === 'NotAllowedError' ? 'Permiso de micrófono denegado' : `No se pudo iniciar: ${e.message}`);
    }
  }, [requestWakeLock]);

  const pause = useCallback(() => {
    if (recRef.current?.state === 'recording') {
      recRef.current.pause();
      pauseStartRef.current = Date.now();
      setState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (recRef.current?.state === 'paused') {
      recRef.current.resume();
      pausedTotalRef.current += Date.now() - pauseStartRef.current;
      setState('recording');
    }
  }, []);

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec) return resolve(null);
      rec.onstop = async () => {
        let blob = new Blob(partsRef.current, { type: rec.mimeType });
        // Chrome/Firefox graban webm sin duración en la cabecera: sin esto no se puede
        // saltar a un punto del audio ni leer su duración.
        if (rec.mimeType.includes('webm')) {
          const ms = Date.now() - startedAtRef.current - pausedTotalRef.current;
          try { blob = await fixWebmDuration(blob, ms, { logger: false }); } catch { /* se queda el original */ }
        }
        streamRef.current?.getTracks().forEach((t) => t.stop());
        clearInterval(timerRef.current);
        stopMeter();
        wakeRef.current?.release().catch(() => {});
        wakeRef.current = null;
        recRef.current = null;
        setState('stopped');
        resolve(blob);
      };
      if (rec.state !== 'inactive') rec.stop();
    });
  }, []);

  const reset = useCallback(() => {
    partsRef.current = [];
    setElapsed(0);
    setState('idle');
    setError(null);
  }, []);

  return { supported, state, elapsed, level, error, mime, start, pause, resume, stop, reset };
}
