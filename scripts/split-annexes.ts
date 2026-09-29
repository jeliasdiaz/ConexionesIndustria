// Uso:
//   npm run docx:split -- <Anexos.docx> [--out fixtures/templates/annexes]
//        [--at 0,57,120,190] [--marker "UNIVERSIDAD DEL NORTE"]
// Sin --at, corta donde empieza cada tabla de encabezado (§8 regla 7).
// Revisar siempre el resultado con `npm run docx:inspect -- --blocks`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_START_MARKER, findAnnexStarts, splitDocx } from './spike/split.ts';

const ANNEX_NAMES = ['anexo-1', 'anexo-2-mayores', 'anexo-2-menores', 'anexo-3'];

const args = process.argv.slice(2);
const opt = (k: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : undefined;
};
const file = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!file) {
  console.error('Uso: npm run docx:split -- <Anexos.docx> [--out dir] [--at i,j,k,l] [--marker texto]');
  process.exit(2);
}
const outDir = opt('--out') ?? 'fixtures/templates/annexes';
const marker = opt('--marker') ? new RegExp(opt('--marker') as string, 'i') : DEFAULT_START_MARKER;
const buf = readFileSync(file);
const starts = opt('--at')?.split(',').map((n) => Number.parseInt(n, 10)) ?? findAnnexStarts(buf, marker);

if (starts.length !== ANNEX_NAMES.length) {
  console.error(`Se encontraron ${starts.length} inicios de anexo (${starts.join(', ')}); se esperaban ${ANNEX_NAMES.length}.`);
  console.error('Revisar con `npm run docx:inspect -- <archivo> --blocks` y pasar --at a mano.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });
for (const r of splitDocx(buf, starts, ANNEX_NAMES)) {
  const path = join(outDir, `${r.name}.docx`);
  writeFileSync(path, r.docx);
  console.log(`${path}  bloques ${r.range[0]}-${r.range[1]}`);
  for (const n of r.notes) console.log(`  · ${n}`);
}
