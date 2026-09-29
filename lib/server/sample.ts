// Datos de ejemplo para la vista previa de plantillas: siempre ficticios
// (regla 5), los mismos del spike de la Fase 0.
import 'server-only';
import sharp from 'sharp';
import { DATASETS, fakeStudents } from '../shared/fake-data.ts';
import type { EventData, GuardianData, StudentData } from '../shared/fields.ts';

const normal = DATASETS[0];
if (!normal) throw new Error('fake-data sin juego normal');

export const SAMPLE_EVENT: EventData = normal.event;
export const SAMPLE_STUDENT: StudentData = normal.student;
export const SAMPLE_STUDENTS: StudentData[] = fakeStudents(5, 11);
export const SAMPLE_GUARDIAN: GuardianData = {
  acudiente_nombre: 'ACUDIENTE FICTICIO DE PRUEBA',
  acudiente_documento: '9900000001',
  acudiente_direccion: 'Calle de Ejemplo # 00-00',
  acudiente_telefono: '3000000000',
};

let signature: Promise<Buffer> | null = null;

// Trazo ficticio con fondo transparente, como sale del procesamiento de S8.
export function sampleSignaturePng(): Promise<Buffer> {
  signature ??= sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="240"><path d="M 40 170 C 90 30, 170 30, 190 140 S 240 220, 300 130 C 340 70, 380 60, 410 130 C 440 190, 470 200, 520 120 C 560 60, 610 70, 640 140 C 670 200, 720 190, 760 120 M 60 205 C 300 185, 600 180, 860 195" fill="none" stroke="#1b2a6b" stroke-width="9" stroke-linecap="round"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  return signature;
}
