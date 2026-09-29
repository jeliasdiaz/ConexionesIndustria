// Misma precedencia que Next.js: .env.local (desarrollo local) gana sobre .env.
// process.loadEnvFile no sobreescribe variables ya definidas, así que basta el
// orden. Las variables del entorno (p. ej. CI) ganan sobre ambos archivos.
// ENV_FILE=<archivo> carga solo ese (p. ej. `ENV_FILE=.env npm run admin:add`
// para operar sobre el proyecto alojado aunque exista .env.local).
import { existsSync } from 'node:fs';

export function loadEnvFiles(): void {
  const only = process.env.ENV_FILE;
  if (only) {
    if (!existsSync(only)) throw new Error(`ENV_FILE=${only} no existe`);
    process.loadEnvFile(only);
    return;
  }
  for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f);
}
