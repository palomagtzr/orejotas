import { useEffect, useState } from 'react';
import { House, Folder, Microphone, SignOut, Users, Plus } from '@phosphor-icons/react';
import AccessGate from './components/AccessGate.jsx';
import Recorder from './components/Recorder.jsx';
import MeetingView from './components/MeetingView.jsx';
import { Mascot, Wordmark } from './components/Brand.jsx';
import { getAccessCode, clearAccessCode } from './lib/api.js';
import { listMeetings } from './lib/db.js';
import { fmtDate, fmtTime } from './lib/exporters.js';

function groupLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  if (diff < 7) return 'Esta semana';
  if (diff < 30) return 'Este mes';
  return 'Anteriores';
}

export default function App() {
  const [authed, setAuthed] = useState(!!getAccessCode());
  const [view, setView] = useState('home'); // home | record | meeting
  const [meetings, setMeetings] = useState([]);
  const [current, setCurrent] = useState(null);

  const refresh = async () => setMeetings(await listMeetings());
  useEffect(() => { if (authed) refresh(); }, [authed]);

  if (!authed) return <AccessGate onReady={() => setAuthed(true)} />;

  const open = (m) => { setCurrent(m); setView('meeting'); };
  const home = async () => { await refresh(); setView('home'); };
  const logout = () => { clearAccessCode(); setAuthed(false); };

  const groups = [];
  for (const m of meetings) {
    const label = groupLabel(m.createdAt);
    const g = groups.find((x) => x.label === label) || (groups.push({ label, items: [] }), groups[groups.length - 1]);
    g.items.push(m);
  }

  const Nav = ({ bottom }) => (
    <>
      <button className={view === 'home' ? 'active' : ''} onClick={home}><House size={bottom ? 22 : 20} weight={view === 'home' ? 'fill' : 'regular'} /> Inicio</button>
      <button className={view === 'record' ? 'active' : ''} onClick={() => setView('record')}><Microphone size={bottom ? 22 : 20} weight={view === 'record' ? 'fill' : 'regular'} /> Nueva junta</button>
      <button className={view === 'meeting' ? 'active' : ''} onClick={home}><Folder size={bottom ? 22 : 20} weight={view === 'meeting' ? 'fill' : 'regular'} /> Juntas</button>
    </>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <Wordmark />
        <nav className="nav"><Nav /></nav>
        <button className="btn ghost small" style={{ justifyContent: 'flex-start' }} onClick={logout}><SignOut /> Salir</button>
        <Mascot size={210} className="mascot-peek" />
      </aside>

      <div>
        <header className="mobile-top">
          <Wordmark />
          <button className="btn ghost small" onClick={logout} aria-label="Salir"><SignOut size={20} /></button>
        </header>

        <main className="main">
          {view === 'record' && (
            <>
              <h1 style={{ fontSize: 28, marginBottom: 18 }}>Nueva junta</h1>
              <Recorder onDone={(m) => { refresh(); open(m); }} />
            </>
          )}

          {view === 'meeting' && current && <MeetingView meeting={current} onBack={home} onDeleted={home} />}

          {view === 'home' && (
            <>
              <div className="hero">
                <div>
                  <h1>Graba tus juntas,<br />deja el resto en <em>Orejotas</em>.</h1>
                  <p>Transcripción con hablantes, resumen, action items y pendientes. Todo se queda en tu navegador.</p>
                  <div style={{ marginTop: 18 }}>
                    <button className="btn pink" onClick={() => setView('record')}><Microphone weight="fill" /> Grabar junta</button>
                  </div>
                </div>
                <Mascot size={190} className="mascot-hero" />
              </div>

              <div className="section-title">
                <h2>Juntas</h2>
                {meetings.length > 0 && <button className="btn small" onClick={() => setView('record')}><Plus /> Nueva</button>}
              </div>

              {meetings.length === 0 ? (
                <div className="card empty">
                  <p>Todavía no hay juntas. La primera tarda un minuto en configurarse: tocas grabar, eliges idioma y listo.</p>
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.label}>
                    <div className="group-label">{g.label}</div>
                    {g.items.map((m) => (
                      <button className="row" key={m.id} onClick={() => open(m)} disabled={m.status === 'processing'}>
                        <span className="ico"><Users size={22} weight="fill" /></span>
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
                          {m.status === 'done' && !m.summary && <span className="pill pink">Transcrita</span>}
                          {m.status === 'processing' && <span className="pill warn">Interrumpida</span>}
                          {m.status === 'error' && <span className="pill warn">Error</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </>
          )}
        </main>
      </div>

      <nav className="bottom-nav"><Nav bottom /></nav>
    </div>
  );
}
