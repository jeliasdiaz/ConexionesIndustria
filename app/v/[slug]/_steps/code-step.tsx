'use client';

import { type FormEvent, useState } from 'react';
import { ErrorAlert } from '../_components/error-alert';
import { api, jsonInit } from '../api';

export function CodeStep({ base, email, onVerified, onBack }: { base: string; email: string; onVerified: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true }>(`${base}/otp/verify`, jsonInit('POST', { email, code }));
    setBusy(false);
    if (r.data) onVerified();
    else setError(r.error?.message ?? 'Código inválido.');
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <div className="stack-sm">
        <h2 tabIndex={-1}>Escriba el código</h2>
        <p className="muted">
          Lo enviamos a <strong>{email}</strong>. Puede tardar un minuto; revise también la carpeta de spam. Vence en 10 minutos.
        </p>
      </div>
      <div className="field">
        <label htmlFor="code">Código de 6 dígitos</label>
        <input id="code" className="code-input" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} />
      </div>
      <button type="submit" className="block" disabled={busy}>
        {busy ? 'Verificando…' : 'Entrar'}
      </button>
      <button type="button" className="ghost block" onClick={onBack}>
        Pedir otro código
      </button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </form>
  );
}
