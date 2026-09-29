'use client';

import { type ChangeEvent, useState } from 'react';

// §10 paso 6: el navegador reduce la foto (≤ 1.600 px, ≤ 1,5 MB) antes de
// subirla; Vercel rechaza requests de más de 4,5 MB. Pasar por un canvas
// también convierte HEIC (Safari lo decodifica) y descarta el EXIF.
const MAX_SIDE = 1600;
const MAX_BYTES = 1.4 * 1024 * 1024;

class ShrinkError extends Error {}

async function shrinkImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new ShrinkError('Este navegador no puede leer esa foto (¿formato HEIC?). Use "Tomar foto" desde esta página.');
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ShrinkError('No pudimos procesar la foto.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= MAX_BYTES) return blob;
    }
    throw new ShrinkError('La foto sigue siendo muy pesada. Acérquese solo a la firma.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function SignatureStep({ slug, onDone, onBack }: { slug: string; onDone: (signatureId: string) => void; onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; src: string } | null>(null);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const blob = await shrinkImage(file);
      const fd = new FormData();
      fd.set('photo', blob, 'firma.jpg');
      const res = await fetch(`/api/public/events/${slug}/signature`, { method: 'POST', body: fd });
      const body = await res.json().catch(() => ({}));
      if (res.ok) setPreview({ id: body.signature_id, src: body.preview });
      else setError(body.error?.message ?? `Error ${res.status}`);
    } catch (err) {
      setError(err instanceof ShrinkError ? err.message : 'No pudimos procesar la foto. Intente de nuevo.');
    } finally {
      setBusy(false);
      input.value = '';
    }
  }

  return (
    <section className="card stack">
      <h2>Foto de su firma</h2>
      <ol className="tips">
        <li>Firme en una hoja blanca con esfero negro o azul.</li>
        <li>Busque buena luz, sin sombras sobre la hoja.</li>
        <li>Acerque la cámara para que la firma ocupe casi toda la foto.</li>
      </ol>
      <div className="actions">
        <label className="button file-button">
          Tomar foto
          <input type="file" accept="image/jpeg,image/png" capture="environment" onChange={onFile} disabled={busy} />
        </label>
        <label className="button secondary file-button">
          Elegir de la galería
          <input type="file" accept="image/*" onChange={onFile} disabled={busy} />
        </label>
      </div>
      {busy && <p role="status">Procesando la foto…</p>}
      {error && (
        <p className="alert error" role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="stack">
          <p>Así saldrá en el documento. Si no se ve bien, tome otra foto.</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generada por el servidor */}
          <img className="sig-preview" src={preview.src} alt="Vista previa de su firma" />
          <button type="button" onClick={() => onDone(preview.id)}>
            Usar esta firma y enviar
          </button>
        </div>
      )}
      <button type="button" className="secondary" onClick={onBack} disabled={busy}>
        Volver
      </button>
    </section>
  );
}
