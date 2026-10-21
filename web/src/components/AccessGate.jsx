import { useState } from 'react';
import { checkAccess, setAccessCode, WORKER_URL } from '../lib/api.js';
import { Mascot, Wordmark } from './Brand.jsx';

export default function AccessGate({ onReady }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await checkAccess(code.trim());
      setAccessCode(code.trim());
      onReady();
    } catch (err) {
      setError(err.status === 401 ? 'Código incorrecto' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="gate-wrap">
      <div className="gate">
        <Mascot size={150} />
        <Wordmark />
        <p>Escribe tu código de acceso. Se guarda solo en este navegador.</p>
        {!WORKER_URL && <div className="notice error">Falta configurar <code>VITE_WORKER_URL</code> al compilar la app.</div>}
        <form onSubmit={submit}>
          <input className="input" type="password" autoComplete="current-password" placeholder="Código de acceso" aria-label="Código de acceso" value={code} onChange={(e) => setCode(e.target.value)} />
          {error && <div className="notice error">{error}</div>}
          <button className="btn pink" type="submit" disabled={busy || !WORKER_URL}>
            {busy ? 'Verificando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
