import { useState } from 'react';
import { checkAccess, setAccessCode, WORKER_URL } from '../lib/api.js';

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
    <form className="gate" onSubmit={submit}>
      <h1>Juntas</h1>
      <p>Escribe el código de acceso de tu servidor. Se guarda solo en este navegador.</p>
      {!WORKER_URL && <div className="notice error">Falta configurar <code>VITE_WORKER_URL</code> al compilar la app.</div>}
      <div className="field">
        <label htmlFor="code">Código de acceso</label>
        <input id="code" className="input" type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      {error && <div className="notice error">{error}</div>}
      <button className="btn primary" type="submit" disabled={busy || !WORKER_URL}>
        {busy ? 'Verificando…' : 'Entrar'}
      </button>
    </form>
  );
}
