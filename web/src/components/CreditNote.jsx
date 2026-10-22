import { useState } from 'react';
import { Coins } from '@phosphor-icons/react';

// Tarifa estimada de AssemblyAI (Universal-3 Pro + diarización), USD por hora de audio.
// Si cambias de modelo o proveedor, ajusta aquí. Es una estimación: el saldo real está en
// https://www.assemblyai.com/dashboard/account/billing
const RATE_PER_HOUR = 0.23;
const KEY = 'orejotas:credit-anchor';

function readAnchor() {
  try { return JSON.parse(localStorage.getItem(KEY)) || { balance: 50, at: 0 }; } catch { return { balance: 50, at: 0 }; }
}

export default function CreditNote({ meetings, compact = false }) {
  const [anchor, setAnchor] = useState(readAnchor);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');

  const secondsSince = meetings
    .filter((m) => m.status === 'done' && m.createdAt > anchor.at)
    .reduce((acc, m) => acc + (m.durationSec || 0), 0);
  const spent = (secondsSince / 3600) * RATE_PER_HOUR;
  const left = Math.max(0, anchor.balance - spent);
  const hoursLeft = left / RATE_PER_HOUR;
  const low = left < 5;

  const sync = () => {
    const v = Number(String(input).replace(',', '.'));
    if (!Number.isFinite(v) || v < 0) return;
    const next = { balance: v, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(next));
    setAnchor(next);
    setEditing(false);
    setInput('');
  };

  return (
    <div className={`credit ${low ? 'low' : ''} ${compact ? 'compact' : ''}`}>
      <div className="credit-head"><Coins weight="fill" /> Crédito AssemblyAI</div>
      <div className="credit-amount">${left.toFixed(2)} <span>≈ {hoursLeft.toFixed(1)} h</span></div>
      {editing ? (
        <div className="credit-sync">
          <input className="input" inputMode="decimal" placeholder="Saldo del dashboard" value={input} onChange={(e) => setInput(e.target.value)} aria-label="Saldo real en USD" />
          <button className="btn small pink" onClick={sync}>Guardar</button>
          <button className="btn small ghost" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      ) : (
        <p className="credit-hint">
          Estimado a ${RATE_PER_HOUR}/h.{' '}
          <a href="https://www.assemblyai.com/dashboard/account/billing" target="_blank" rel="noreferrer">Ver saldo real</a>
          {' · '}
          <button className="linkish" onClick={() => setEditing(true)}>Sincronizar</button>
        </p>
      )}
      {low && <p className="credit-hint" style={{ color: 'var(--rosa)' }}>Queda poco: prepara la cuenta de Deepgram (README, "Cuando se acabe el crédito").</p>}
    </div>
  );
}
