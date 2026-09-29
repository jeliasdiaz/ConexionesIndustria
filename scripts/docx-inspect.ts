// Uso: npm run docx:inspect -- <archivo.docx> [--blocks] [--json]
// Reporta fuentes, resaltados, marcas de edición, cambios rastreados,
// comentarios, secciones y bloques de primer nivel (para elegir dónde separar).
import { readFileSync } from 'node:fs';
import { openDocx } from '../lib/server/docx/ooxml.ts';
import { formatReport, inspectDocx } from '../lib/server/docx/inspect.ts';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file) {
  console.error('Uso: npm run docx:inspect -- <archivo.docx> [--blocks] [--json]');
  process.exit(2);
}
const report = inspectDocx(openDocx(readFileSync(file)));
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else console.log(formatReport(report, { blocks: args.includes('--blocks') }));
