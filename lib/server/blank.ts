// Formatos en blanco por evento (§11, Q4, plan B): los anexos con los datos del
// evento ya cargados, para diligenciar en papel. Se generan al primer pedido y
// quedan cacheados (generated_documents, purpose 'blank').
import 'server-only';
import { randomUUID } from 'node:crypto';
import { audit } from './audit.ts';
import { BUCKETS, db } from './db.ts';
import { renderDocx } from './docs.ts';
import { type EventRow, type EventTemplate, eventData } from './events.ts';
import { gotenbergConvert } from './pdf.ts';
import { downloadTemplateDocx, sha256 } from './templates.ts';

export async function blankPdfPath(event: EventRow, t: EventTemplate): Promise<string> {
  const client = db();
  const cached = await client.from('generated_documents').select('storage_path').eq('event_id', event.id).eq('template_id', t.id).eq('purpose', 'blank').maybeSingle();
  if (cached.error) throw new Error(`No se pudo leer el formato en blanco (${cached.error.code})`);
  if (cached.data) return cached.data.storage_path;

  const docx = await downloadTemplateDocx(t);
  if (sha256(docx) !== t.sha256) throw new Error('El archivo de la plantilla no coincide con su sha256');
  const filled = await renderDocx(docx, { event: eventData(event), student: null, signatureMode: 'none' });
  const pdf = await gotenbergConvert(filled, `${randomUUID()}.docx`);
  const path = `${event.id}/blank-${t.id}.pdf`;
  const up = await client.storage.from(BUCKETS.documents).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (up.error) throw new Error(`No se pudo guardar el formato en blanco (${up.error.message})`);
  // Dos pedidos simultáneos: el índice único deja uno; el otro solo relee.
  const { error } = await client
    .from('generated_documents')
    .insert({ event_id: event.id, template_id: t.id, purpose: 'blank', storage_path: path, sha256: sha256(pdf) });
  if (error && error.code !== '23505') throw new Error(`No se pudo registrar el formato en blanco (${error.code})`);
  if (!error) await audit({ actor: 'system', action: 'blank_generate', eventId: event.id, meta: { template_id: t.id } });
  return path;
}
