import { useEffect, useState } from 'react';
import { Plus, SignOut } from '@phosphor-icons/react';
import AccessGate from './components/AccessGate.jsx';
import Recorder from './components/Recorder.jsx';
import MeetingView from './components/MeetingView.jsx';
import { getAccessCode, clearAccessCode } from './lib/api.js';
import { listMeetings } from './lib/db.js';
import { fmtDate, fmtTime } from './lib/exporters.js';

export default function App() {
  const [authed, setAuthed] = useState(!!getAccessCode());
  const [view, setView] = useState('list'); // list | record | meeting
  const [meetings, setMeetings] = useState([]);
  const [current, setCurrent] = useState(null);

  const refresh = async () => setMeetings(await listMeetings());
  useEffect(() => { if (authed) refresh(); }, [authed]);

  if (!authed) return <div className="app"><AccessGate onReady={() => setAuthed(true)} /></div>;

  const open = (m) => { setCurrent(m); setView('meeting'); };
  const back = async () => { await refresh(); setView('list'); };

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={back}><span className="dot" /> Juntas</button>
        <nav>
          {view !== 'record' && <button className="btn small" onClick={() => setView('record')}><Plus /> Nueva</button>}
          <button className="btn small ghost" title="Salir" onClick={() => { clearAccessCode(); setAuthed(false); }}><SignOut /></button>
        </nav>
      </header>

      {view === 'record' && <Recorder onDone={(m) => { refresh(); open(m); }} />}

      {view === 'meeting' && current && (
        <MeetingView meeting={current} onBack={back} onDeleted={back} />
      )}

      {view === 'list' && (
        meetings.length === 0 ? (
          <div className="empty">
            <p>Todavía no hay juntas.</p>
            <button className="btn primary" onClick={() => setView('record')}><Plus /> Grabar la primera</button>
          </div>
        ) : (
          <div className="list">
            {meetings.map((m) => (
              <button className="row" key={m.id} onClick={() => open(m)} disabled={m.status === 'processing'}>
                <div>
                  <h3>{m.summary?.title || m.title}</h3>
                  <div className="meta">
                    <span>{fmtDate(m.createdAt)}</span>
                    <span>{fmtTime(m.durationSec)}</span>
                    <span>{Object.keys(m.speakers || {}).length} hablantes</span>
                  </div>
                </div>
                <div>
                  {m.status === 'done' && m.summary && <span className="pill ok">Resumida</span>}
                  {m.status === 'done' && !m.summary && <span className="pill">Transcrita</span>}
                  {m.status === 'processing' && <span className="pill warn">Interrumpida</span>}
                  {m.status === 'error' && <span className="pill warn">Error</span>}
                </div>
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
