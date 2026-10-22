import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, DownloadSimple, Trash, Sparkle, Copy, FileDoc, FileText, MusicNote, CalendarBlank, Clock, Users, Play, Pause } from '@phosphor-icons/react';
import { saveMeeting, deleteMeeting, getAudio } from '../lib/db.js';
import { summarize } from '../lib/api.js';
import { SECTIONS, fmtTime, fmtDate, speakerName, summaryToMarkdown, fullMarkdown, transcriptToText, toDocx, download, slug } from '../lib/exporters.js';
import { extensionFor } from '../lib/useRecorder.js';
import { LANGUAGES } from './Recorder.jsx';

const initial = (name) => (name || '?').trim().charAt(0).toUpperCase();

export default function MeetingView({ meeting: initialMeeting, onBack, onDeleted }) {
  const [meeting, setMeeting] = useState(initialMeeting);
  const [tab, setTab] = useState(initialMeeting.summary ? 'summary' : 'transcript');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [sumLang, setSumLang] = useState(initialMeeting.language === 'auto' ? initialMeeting.detectedLanguage || 'es' : initialMeeting.language);

  const persist = async (next) => { setMeeting(next); await saveMeeting(next); };
  const [audioUrl, setAudioUrl] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const audioRef = useRef(null);

  // Audio local → object URL para el reproductor (se libera al salir).
  useEffect(() => {
    let url;
    getAudio(meeting.id).then((blob) => {
      if (blob) { url = URL.createObjectURL(blob); setAudioUrl(url); }
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [meeting.id]);

  // Posición actual con rAF para que el resaltado de palabra sea fluido.
  useEffect(() => {
    if (!playing) return;
    let raf;
    const tick = () => { if (audioRef.current) setNow(audioRef.current.currentTime); raf = requestAnimationFrame(tick); };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const seekTo = (sec) => {
    const a = audioRef.current;
    if (!a) return setError('El audio ya no está en este dispositivo');
    try {
      a.currentTime = Math.max(0, sec - 0.15);
      a.play().catch(() => {});
    } catch {
      setError('Este archivo no permite saltar a un punto. Los .webm importados a veces no lo soportan.');
    }
  };
  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {}); else a.pause();
  };

  const reassign = (index, label) => {
    const utterances = meeting.utterances.map((u, i) => (i === index ? { ...u, speaker: label } : u));
    const speakers = { ...meeting.speakers };
    if (!(label in speakers)) speakers[label] = '';
    persist({ ...meeting, utterances, speakers });
  };
  const addSpeakerTo = (index) => {
    const labels = Object.keys(meeting.speakers || {});
    let code = 65;
    while (labels.includes(String.fromCharCode(code))) code++;
    reassign(index, String.fromCharCode(code));
  };

  const speakerLabels = useMemo(() => Object.keys(meeting.speakers || {}), [meeting.speakers]);
  const colorIndex = useMemo(() => Object.fromEntries(speakerLabels.map((s, i) => [s, i % 6])), [speakerLabels]);

  const renameSpeaker = (label, name) => persist({ ...meeting, speakers: { ...meeting.speakers, [label]: name } });
  const renameTitle = (title) => persist({ ...meeting, title });

  const runSummary = async () => {
    setBusy(true);
    setError(null);
    try {
      const transcript = meeting.utterances.map((u) => ({ speaker: speakerName(meeting, u.speaker), text: u.text }));
      const summary = await summarize(transcript, sumLang);
      await persist({ ...meeting, summary, summaryLanguage: sumLang });
      setTab('summary');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('¿Borrar esta junta, su audio y su transcripción de este dispositivo?')) return;
    await deleteMeeting(meeting.id);
    onDeleted(meeting.id);
  };

  const base = slug(meeting.summary?.title || meeting.title);
  const exportMd = () => download(new Blob([fullMarkdown(meeting)], { type: 'text/markdown' }), `${base}.md`);
  const exportTxt = () => download(new Blob([transcriptToText(meeting)], { type: 'text/plain' }), `${base}-transcripcion.txt`);
  const exportDocx = async () => download(await toDocx(meeting), `${base}.docx`);
  const exportAudio = async () => {
    const blob = await getAudio(meeting.id);
    if (!blob) return setError('El audio ya no está en este dispositivo');
    download(blob, `${base}.${extensionFor(blob.type)}`);
  };
  const copySummary = async () => {
    await navigator.clipboard.writeText(summaryToMarkdown(meeting));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      <button className="btn ghost small" onClick={onBack}><ArrowLeft /> Juntas</button>

      <div className="meeting-head" style={{ marginTop: 12 }}>
        <input className="title" value={meeting.title} onChange={(e) => renameTitle(e.target.value)} aria-label="Título de la junta" />
        <div className="meta-row">
          <span><CalendarBlank /> {fmtDate(meeting.createdAt)}</span>
          <span><Clock /> {fmtTime(meeting.durationSec)}</span>
          <span><Users /> {speakerLabels.length} hablantes</span>
        </div>
        {audioUrl && (
          <div className="player">
            <button className="round pink sm" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
              {playing ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
            </button>
            <audio
              ref={audioRef}
              src={audioUrl}
              preload="metadata"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onTimeUpdate={(e) => { if (!playing) setNow(e.currentTarget.currentTime); }}
              controls
            />
          </div>
        )}
        <div className="toolbar">
          <button className="btn small" onClick={exportDocx}><FileDoc /> Word</button>
          <button className="btn small" onClick={exportMd}><FileText /> Markdown</button>
          <button className="btn small" onClick={exportTxt}><DownloadSimple /> .txt</button>
          <button className="btn small" onClick={exportAudio}><MusicNote /> Audio</button>
          <button className="btn small ghost danger" onClick={remove}><Trash /> Eliminar</button>
        </div>
      </div>

      <div className="speakers">
        {speakerLabels.map((label) => (
          <span className="chip" key={label}>
            <span className={`avatar c${colorIndex[label]}`}>{initial(meeting.speakers[label] || label)}</span>
            <input placeholder={`Hablante ${label}`} value={meeting.speakers[label] || ''} onChange={(e) => renameSpeaker(label, e.target.value)} aria-label={`Nombre del hablante ${label}`} />
          </span>
        ))}
      </div>

      <div className="segmented" role="tablist">
        <button role="tab" aria-selected={tab === 'transcript'} className={tab === 'transcript' ? 'active' : ''} onClick={() => setTab('transcript')}>Transcripción</button>
        <button role="tab" aria-selected={tab === 'summary'} className={tab === 'summary' ? 'active' : ''} onClick={() => setTab('summary')}>Resumen</button>
      </div>

      {error && <div className="notice error" style={{ marginBottom: 14 }}>{error}</div>}

      {tab === 'transcript' && (
        <div>
          <p className="hint" style={{ textAlign: 'left', marginBottom: 8 }}>Haz click en una palabra para escucharla. Si un fragmento tiene el hablante equivocado, cámbialo en su etiqueta.</p>
          {meeting.utterances.map((u, i) => {
            const active = now >= u.start && now < u.end;
            return (
              <div className={`utterance ${active ? 'active' : ''}`} key={i}>
                <button className="time" onClick={() => seekTo(u.start)} title="Reproducir desde aquí">{fmtTime(u.start)}</button>
                <span className={`avatar c${colorIndex[u.speaker] ?? 0}`}>{initial(speakerName(meeting, u.speaker))}</span>
                <div>
                  <div className="who">
                    <select
                      className="who-select"
                      value={u.speaker}
                      onChange={(e) => (e.target.value === '__new' ? addSpeakerTo(i) : reassign(i, e.target.value))}
                      aria-label="Hablante de este fragmento"
                    >
                      {speakerLabels.map((l) => <option key={l} value={l}>{speakerName(meeting, l)}</option>)}
                      <option value="__new">+ Nuevo hablante</option>
                    </select>
                  </div>
                  <p>
                    {u.words && u.words.length ? (
                      u.words.map((w, j) => (
                        <span
                          key={j}
                          className={`w ${now >= w.s && now < w.e ? 'on' : ''}`}
                          onClick={() => seekTo(w.s)}
                          role="button"
                          tabIndex={-1}
                        >
                          {w.t}{' '}
                        </span>
                      ))
                    ) : (
                      <span className="w" onClick={() => seekTo(u.start)} role="button" tabIndex={-1}>{u.text}</span>
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'summary' && !meeting.summary && (
        <div className="summary-card summary-cta">
          <p className="hint">Overview, puntos clave, action items, dudas sin resolver y pendientes. Pon primero los nombres de los hablantes para que el resumen los use.</p>
          <div className="toolbar">
            <select className="input" style={{ width: 'auto' }} value={sumLang} onChange={(e) => setSumLang(e.target.value)} aria-label="Idioma del resumen">
              {LANGUAGES.filter(([v]) => v !== 'auto').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className="btn pink" onClick={runSummary} disabled={busy}><Sparkle weight="fill" /> {busy ? 'Resumiendo…' : 'Generar resumen'}</button>
          </div>
        </div>
      )}

      {tab === 'summary' && meeting.summary && (
        <div className="summary-card">
          <div className="head">
            <span className="t"><Sparkle weight="fill" /> Resumen de Orejotas</span>
            <div className="toolbar">
              <button className="btn small" onClick={copySummary}><Copy /> {copied ? 'Copiado' : 'Copiar'}</button>
              <button className="btn small ghost" onClick={runSummary} disabled={busy}>{busy ? 'Regenerando…' : 'Regenerar'}</button>
            </div>
          </div>
          {SECTIONS.map(([key, label]) => {
            const v = meeting.summary[key];
            if (!v || (Array.isArray(v) && v.length === 0)) return null;
            return (
              <section key={key}>
                <h2>{label}</h2>
                {typeof v === 'string' ? (
                  v.split(/\n+/).map((p, i) => <p key={i}>{p}</p>)
                ) : (
                  <ul>
                    {v.map((item, i) =>
                      key === 'action_items' ? (
                        <li key={i}>
                          {item.task}
                          {(item.owner || item.due) && <span className="owner"> — {[item.owner, item.due].filter(Boolean).join(' · ')}</span>}
                        </li>
                      ) : (
                        <li key={i}>{item}</li>
                      ),
                    )}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
