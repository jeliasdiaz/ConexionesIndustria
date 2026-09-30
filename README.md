# Conexiones con la Industria

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
cp .env.example .env.local  # desarrollo local; .env queda para el proyecto alojado
npm run db:start            # Supabase local (CLI + Docker, puertos 554xx); aplica supabase/migrations
npx supabase status -o env  # copiar ANON_KEY y SERVICE_ROLE_KEY a .env.local
                            # y generar OTP_PEPPER, SESSION_SECRET y GOTENBERG_PASSWORD
docker compose up -d        # Gotenberg 8 en 127.0.0.1:3001 con basic auth (lee GOTENBERG_PASSWORD de .env)
npm run admin:add -- tu-correo@example.com
npm run dev                 # http://localhost:3000/admin
```

Todos los correos (magic link de admin, códigos OTP y confirmaciones) llegan a
Mailpit: <http://127.0.0.1:55424>. Supabase local no se levanta con
`docker compose` sino con su CLI (ver DECISIONS).

### Probar los documentos de punta a punta

1. `/admin/plantillas`: subir las 4 plantillas con su audiencia (Anexo 1 →
   Todos, Anexo 2 mayores → Mayores, Anexo 2 menores y Anexo 3 → Menores).
   Sin el DOCX oficial, sirven las sintéticas que genera `npm run spike`
   (`out/spike/synthetic/`).
2. `/admin/eventos` → Nuevo evento. Para probar con un correo que no es
   institucional, agregarlo en "Correos adicionales permitidos". Publicar.
3. Abrir el enlace `/v/<slug>` (mejor en el celular o con la vista móvil del
   navegador), pedir el código (llega a Mailpit), diligenciar, aceptar, subir
   la foto de una firma y enviar. Los PDF quedan listos en segundos.
4. Una fecha de nacimiento de menor de edad lleva a los formatos en blanco.
5. En el detalle del evento (admin) aparecen el envío y sus PDF.

## Pruebas

| Comando | Qué cubre | Necesita |
|---|---|---|
| `npm test` | Unitarias: render, firma, validador de plantillas, texto legal, paleta | — |
| `npm run test:integration` | RLS y Storage con la anon key, registro apagado, 401/403, magic link, plantillas, vista previa | Supabase local, Gotenberg, poppler |
| `npm run build && npm run test:e2e` | Navegador real: login, subida, rechazo, vista previa, sin violaciones de CSP | Lo anterior + Chromium de Playwright |
| `npm run lint` · `npm run typecheck` | ESLint (Next) y TypeScript | — |

Si Chromium está preinstalado fuera del caché de Playwright:
`PW_CHROMIUM_PATH=/ruta/a/chrome npm run test:e2e`.

Con Node 22.17.1, Playwright no carga los specs (`Unexpected module status 3`,
un error del cargador de módulos de Node); con Node 24 funciona. Las pruebas
de integración y E2E se niegan a correr si `SUPABASE_URL` no es local.

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

## Producción (Vercel + Supabase + Render)

Todo lo que se puede automatizar lo hace el workflow **Producción**
(`.github/workflows/produccion.yml`, Actions → Producción → Run workflow):
aplica las migraciones, configura el login de admin (SMTP de Resend, plantilla
del magic link, límites), carga las variables en Vercel, redespliega y corre
pruebas de humo (`scripts/deploy/smoke.ts`). Cada merge a `main` despliega solo
por la integración de GitHub de Vercel; el workflow hace falta cuando cambia
una migración, `supabase/config.toml` o una variable.

Una sola vez, a mano:

1. **Gotenberg en Render:** Render → New → Blueprint → este repositorio
   (`render.yaml`, plan gratis). Copie la URL del servicio y la contraseña
   que genera Render (`GOTENBERG_API_BASIC_AUTH_PASSWORD`).
2. **Resend:** cuenta con el correo que va a recibir los correos de prueba y
   una API key. Sin dominio verificado (H6) el remitente es
   `onboarding@resend.dev` y Resend **solo entrega al dueño de la cuenta**.
3. **Secretos del repositorio** (Settings → Secrets and variables → Actions):
   `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
   `RESEND_API_KEY`, `GOTENBERG_URL`, `GOTENBERG_PASSWORD`; antes del piloto,
   `TURNSTILE_SITEKEY` y `TURNSTILE_SECRET` (sin ellos se usan las claves de
   prueba de Cloudflare, que no protegen de bots).
4. **Admins:** `ENV_FILE=.env npm run admin:add -- <correo>` con las
   variables del proyecto alojado en `.env`.

Render (plan gratis) apaga Gotenberg tras 15 min sin tráfico. La app lo
despierta cuando un estudiante abre el evento, y la generación espera hasta
120 s y se reintenta sola; aun así, el primer PDF después de un rato sin uso
puede tardar alrededor de un minuto.

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
