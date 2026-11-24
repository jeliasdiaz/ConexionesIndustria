'use client';

import { type FormEvent, useState } from 'react';
import { ErrorAlert } from '../_components/error-alert';
import { Turnstile } from '../_components/turnstile';
import { api, jsonInit } from '../api';
import type { PublicEvent } from '../types';

// Entrada con correo: pide el código de 6 dígitos.
export function EmailStep({ event, base, onSent }: { event: PublicEvent; base: string; onSent: (email: string) => void }) {
  const [value, setValue] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsToken = !!event.turnstileSiteKey;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await api<{ ok: true }>(`${base}/otp/request`, jsonInit('POST', { email: value, turnstile: token || undefined }));
    setBusy(false);
    if (r.data) onSent(value.trim().toLowerCase());
    else setError(r.error?.message ?? 'No se pudo enviar el código.');
  }

  return (
    <form onSubmit={onSubmit} className="card stack">
      <div className="stack-sm">
        <h2 tabIndex={-1}>Entrar con su correo institucional</h2>
        <p className="muted">Le enviaremos un código de 6 dígitos. Nunca le pediremos su contraseña.</p>
      </div>
      <div className="field">
        <label htmlFor="email">Correo</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={`usuario@${event.domains[0] ?? 'uninorte.edu.co'}`}
        />
      </div>
      {event.turnstileSiteKey && <Turnstile siteKey={event.turnstileSiteKey} onToken={setToken} />}
      <button type="submit" className="block" disabled={busy || (needsToken && !token)}>
        {busy ? 'Enviando…' : 'Enviarme el código'}
      </button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </form>
  );
}
