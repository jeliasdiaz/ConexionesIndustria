'use client';

import { useState } from 'react';
import { IconShield } from '@/app/icons';
import { DOCUMENT_TTL_MINUTES } from '@/lib/shared/retention';
import { ErrorAlert } from '../_components/error-alert';
import { Needs } from '../_components/needs';
import { Turnstile } from '../_components/turnstile';
import { api, jsonInit } from '../api';
import type { PublicEvent } from '../types';

// Entrada sin correo: un botón, con Turnstile si hay clave.
export function StartStep({ event, base, onStarted }: { event: PublicEvent; base: string; onStarted: () => Promise<void> }) {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsToken = !!event.turnstileSiteKey;
  if (event.state !== 'open') return null;

  async function start() {
    setBusy(true);
    setError(null);
    const r = await api<{ active: true }>(`${base}/session`, jsonInit('POST', { turnstile: token || undefined }));
    if (r.data) await onStarted();
    else setError(r.error?.message ?? 'No pudimos iniciar.');
    setBusy(false);
  }

  return (
    <section className="card stack">
      <div className="stack-sm">
        <h2 tabIndex={-1}>Antes de empezar</h2>
        <p className="muted">Son {event.signatureMode === 'photo' ? 4 : 3} pasos y toman unos 4 minutos. Tenga a mano:</p>
      </div>
      <Needs photo={event.signatureMode === 'photo'} />
      <p className="alert info">
        <IconShield />
        <span>
          No le pedimos correo ni contraseña. Sus PDF se descargan desde este navegador durante {DOCUMENT_TTL_MINUTES} minutos; después se borran,
          junto con sus datos de salud y de contacto.
        </span>
      </p>
      {event.turnstileSiteKey && <Turnstile siteKey={event.turnstileSiteKey} onToken={setToken} />}
      <button type="button" className="block" onClick={() => void start()} disabled={busy || (needsToken && !token)}>
        {busy ? 'Un momento…' : 'Empezar'}
      </button>
      {error && <ErrorAlert>{error}</ErrorAlert>}
    </section>
  );
}
