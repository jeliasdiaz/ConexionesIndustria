'use client';

import { useEffect, useState } from 'react';
import { IconClock } from '@/app/icons';
import { formatBogotaTime, pad2 } from '@/lib/shared/format';
import { DOCUMENT_TTL_MS } from '@/lib/shared/retention';

const URGENT_MS = 5 * 60_000;

// Cuenta regresiva hasta que se borran los PDF. Es una ayuda: si el reloj de
// este equipo está mal, manda el servidor (la descarga responde 410).
export function ExpiryNotice({ until, anonymous }: { until: string; anonymous: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const end = new Date(until);
  const left = Math.max(0, end.getTime() - now);
  const seconds = Math.ceil(left / 1000);
  const urgent = left <= URGENT_MS;
  return (
    <div className={`alert ${urgent ? 'error' : 'warning'}`}>
      <IconClock />
      <div className="countdown">
        <span>
          <strong>Descárguelos ahora.</strong> Están disponibles hasta las {formatBogotaTime(end)} y después se borran de la plataforma, junto con
          su firma, su número de documento y sus datos de salud y de contacto.
          {anonymous && ' Si usa un computador compartido, pulse "Salir" al terminar.'}
        </span>
        {/* role="timer" no se anuncia cada segundo; el aviso de abajo, una vez. */}
        <p className="countdown__time" role="timer">
          Quedan{' '}
          <strong>
            {pad2(Math.floor(seconds / 60))}:{pad2(seconds % 60)}
          </strong>
        </p>
        <div className="progress__track" aria-hidden="true">
          <div className="progress__bar" style={{ width: `${Math.min(100, (left / DOCUMENT_TTL_MS) * 100)}%` }} />
        </div>
        <span className="visually-hidden" role="status">
          {urgent && 'Quedan menos de 5 minutos para descargar sus documentos.'}
        </span>
      </div>
    </div>
  );
}
