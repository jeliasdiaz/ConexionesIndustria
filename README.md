# Conexiones con la Industria uninorte

Plataforma de constancias para salidas de campo (Departamento de Ingeniería
Mecánica / CEIM). **No es un sistema oficial de la Universidad del Norte.**
El plan completo vive fuera del repo (PLAN.md v1.4); las decisiones tomadas
están en [DECISIONS.md](DECISIONS.md).

Estado: **Fase 1 (cimientos)**: Next.js, Supabase (migraciones, RLS
deny-all, buckets privados), login de admin por magic link, plantillas
(subir, validar, versionar, vista previa, audiencia), CI y gitleaks.
La Fase 0 sigue abierta en lo que depende de insumos humanos: ver
[SPIKE.md](SPIKE.md).

## Requisitos

- Node 22+
- Docker con Compose (Gotenberg y Supabase local)
- `poppler-utils` (`pdfinfo`, `pdftotext`, `pdftoppm`) para el spike y las
  pruebas de integración

## Levantar en local

```bash
npm install                 # también activa el hook de gitleaks (.githooks)
cp .env.example .env        # definir GOTENBERG_PASSWORD
npm run db:start            # Supabase local (CLI + Docker); aplica supabase/migrations
npx supabase status -o env  # copiar API_URL, ANON_KEY y SERVICE_ROLE_KEY a .env
docker compose up -d        # Gotenberg 8 en 127.0.0.1:3001 con basic auth
npm run admin:add -- tu-correo@example.com
npm run dev                 # http://localhost:3000/admin
```

El magic link de admin llega a Mailpit: <http://127.0.0.1:54324>. Supabase
local no se levanta con `docker compose` sino con su CLI (ver DECISIONS).

## Pruebas

| Comando | Qué cubre | Necesita |
|---|---|---|
| `npm test` | Unitarias: render, firma, validador de plantillas, texto legal, paleta | — |
| `npm run test:integration` | RLS y Storage con la anon key, registro apagado, 401/403, magic link, plantillas, vista previa | Supabase local, Gotenberg, poppler |
| `npm run build && npm run test:e2e` | Navegador real: login, subida, rechazo, vista previa, sin violaciones de CSP | Lo anterior + Chromium de Playwright |
| `npm run lint` · `npm run typecheck` | ESLint (Next) y TypeScript | — |

Si Chromium está preinstalado fuera del caché de Playwright:
`PW_CHROMIUM_PATH=/ruta/a/chrome npm run test:e2e`.

CI (`.github/workflows/ci.yml`) corre todo lo anterior, verifica que ninguna
key de Supabase llegue a `.next/static` (S1), que las migraciones apliquen
desde cero, que `lib/server/database.types.ts` esté al día y pasa gitleaks
por toda la historia.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run admin:add -- <correo> [--remove]` | Crea el usuario de Auth y lo agrega a `admins` (el registro público está apagado) o lo quita de la allowlist |
| `npm run db:start` · `npm run db:reset` | Supabase local; `db:reset` vuelve a aplicar las migraciones (borra los datos locales) |
| `npm run db:types` | Regenera los tipos de la BD tras una migración |
| `npm run spike [-- --cold]` | Spike de la Fase 0. Modo real si hay plantillas en `fixtures/templates/prepared/`; si no, sintético. Salidas en `out/spike/` |
| `npm run docx:inspect -- <archivo> [--blocks] [--json]` | Fuentes, resaltados, marcas de edición, cambios rastreados, secciones y bloques de un DOCX |
| `npm run docx:split -- <archivo> [--at i,j,k,l]` | Separa los 4 anexos en 4 DOCX sin cambiar el texto |
| `npm run mail:test` | Envía 5 correos tipo OTP por Resend a `MAIL_TEST_TO` (H6, H10) |

## Supabase alojado (dev/prod, H7)

La configuración local vive en `supabase/config.toml`; en un proyecto alojado
hay que replicarla a mano en el panel:

1. **Authentication → Sign In / Providers:** "Allow new users to sign up"
   **apagado**; proveedor Email **encendido** (S3).
2. **URL Configuration:** Site URL = `APP_URL`; Redirect URLs =
   `APP_URL/admin/auth/confirm`.
3. **Email Templates → Magic Link:** el contenido de
   `supabase/templates/magic_link.html` (enlace con `token_hash` a la página de
   confirmación).
4. Migraciones: `npx supabase link` y `npx supabase db push`.
5. Admins: `npm run admin:add -- <correo>` con las variables del proyecto.

## Estructura

```
app/                      páginas y Route Handlers (runtime Node)
  admin/                  panel: login, plantillas
  api/admin/              auth (login, confirm, logout) y plantillas
lib/server/               solo servidor ('server-only'): db, auth, env, audit,
                          docs (render), pdf (Gotenberg), legal, templates,
                          signature, docx/{ooxml,inspect,validate}
lib/shared/               registro de campos y datos ficticios
proxy.ts                  CSP con nonce y headers de seguridad (S14)
supabase/                 config local, migraciones, plantilla del magic link
scripts/                  spike de la Fase 0, admin-add, utilidades DOCX
tests/{unit,integration,e2e,helpers}
```

## Reglas que no se negocian

- Cero datos reales en el repo, fixtures, logs o capturas (`lib/shared/fake-data.ts`).
- No se cambia la redacción ni el diseño del formato oficial.
- Nada destructivo por defecto (`PURGE_ENABLED=false`).
- El formato oficial, los PDF de referencia y las fotos reales de firmas no se
  versionan mientras el repositorio no sea privado.
