import { useMemo, useState } from 'react';
import { ArrowLeft, DownloadSimple, Trash, Sparkle, Copy, FileDoc, FileText, MusicNote, CalendarBlank, Clock, Users } from '@phosphor-icons/react';
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

  const speakerLabels = useMemo(() => Object.keys(meeting.speakers || {}), [meeting.speakers]);
  const colorIndex = useMemo(() => Object.fromEntries(speakerLabels.map((s, i) => [s, i % 6])), [speakerLabels]);

  const persist = async (next) => { setMeeting(next); await saveMeeting(next); };
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
          {meeting.utterances.map((u, i) => (
            <div className="utterance" key={i}>
              <time>{fmtTime(u.start)}</time>
              <span className={`avatar c${colorIndex[u.speaker] ?? 0}`}>{initial(speakerName(meeting, u.speaker))}</span>
              <div>
                <div className="who">{speakerName(meeting, u.speaker)}</div>
                <p>{u.text}</p>
              </div>
            </div>
          ))}
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
