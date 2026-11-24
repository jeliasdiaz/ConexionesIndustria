# ARIA · Academic & Industrial Visit Assistant

Plataforma de constancias para salidas de campo (Departamento de Ingeniería
Mecánica / CEIM). **No es un sistema oficial de la Universidad del Norte.**

Estado: el flujo completo corre en producción (<https://aria-v1.vercel.app>):
plantillas, eventos, el formulario del estudiante desde el celular, los PDF
y su borrado a los 30 minutos. Ya procesó los formatos de más de 50
estudiantes. Lo que falta está en la sección 9 de [ARQUITECTURA.md](ARQUITECTURA.md#9-lo-que-falta).

## Documentación

| Documento | Para qué |
|---|---|
| [Wiki](https://jeliasdiaz.github.io/ConexionesIndustria/) | Cada pieza de ARIA explicada (qué es, cómo funciona, qué se descartó), las reglas del negocio y las preguntas de diseño. Se publica desde [`docs/index.html`](docs/index.html) con GitHub Pages |
| [ARQUITECTURA.md](ARQUITECTURA.md) | Cómo funciona el sistema y por qué. Es la fuente de verdad |
| [DECISIONS.md](DECISIONS.md) | Cada decisión con su fecha y su motivo |
| [SPIKE.md](SPIKE.md) | La Fase 0: fidelidad de los PDF, la firma por foto y la entrega de correo |

El plan original (PLAN.md v1.4) vive fuera del repo. Sus códigos (D11, S10,
Q9…), que aparecen en DECISIONS y en los comentarios del código, están
explicados en el [glosario de DECISIONS](DECISIONS.md#glosario-de-códigos).

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
2. `/admin/eventos` → Nuevo evento. El correo del estudiante viene apagado;
   para probar el código, marcar "Pedir correo institucional con código" y,
   si el correo no es institucional, agregarlo en "Correos adicionales
   permitidos". Publicar.
3. Abrir el enlace `/v/<slug>` (mejor en el celular o con la vista móvil del
   navegador) y pulsar "Empezar" o, si el evento pide correo, pedir el código
   (llega a Mailpit). Diligenciar, aceptar, subir la foto de una firma y
   enviar. Los PDF quedan listos en segundos y se pueden descargar durante 30
   minutos.
4. Una fecha de nacimiento de menor de edad lleva a los formatos en blanco.
5. En el detalle del evento (admin) aparecen el envío y sus PDF. Ahí mismo
   están "Ampliar plazo", "Cerrar formulario", "Regenerar pendientes" y
   "Borrar evento".

## Pruebas

| Comando | Qué cubre | Necesita |
|---|---|---|
| `npm test` | Unitarias: render, firma, fuentes, validador de plantillas, texto legal, edad y sesión, conservación, ampliar plazo, aviso de privacidad, tope de bytes, paleta | — |
| `npm run test:integration` | RLS y Storage con la anon key, registro apagado, 401/403, magic link, plantillas y vista previa, el flujo del estudiante con y sin correo, conservación, ampliar plazo, borrado de eventos y topes contra abuso | Supabase local, Gotenberg, poppler |
| `npm run build && npm run test:e2e` | Navegador real: el admin (login, subida, rechazo, vista previa) y el estudiante desde el celular (mayor de edad con sus PDF, menor con los formatos en blanco), sin violaciones de CSP | Lo anterior + Chromium de Playwright |
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

### Conservación (lo que se borra solo)

Los PDF, la firma y los datos sensibles de un envío se borran 30 minutos
después de generarse los PDF (plazos en `lib/shared/retention.ts`, motivo en
DECISIONS 2026-10-05). El reloj es `pg_cron` dentro de Supabase: cada minuto,
si hay algo vencido, llama a `POST /api/internal/purge-documents` con una clave
que el workflow genera y guarda en Vault y en Vercel (`CRON_SECRET`). Si ese
paso falla o la clave no coincide, **nada se borra solo**: las pruebas de humo
lo detectan.

En local el reloj no hace nada (no hay clave en Vault). Para probarlo de
verdad: poner el mismo valor (32+ caracteres) en `CRON_SECRET` de `.env.local`
y en Vault, con la URL de la app vista desde el contenedor de la BD:

```sql
select vault.create_secret('<la-misma-clave>', 'purge_secret');
select vault.create_secret('http://host.docker.internal:3000/api/internal/purge-documents', 'purge_url');
```

### Orden de despliegue cuando hay una migración

Vercel publica el código con el merge, pero la BD solo cambia al correr el
workflow. Si el código nuevo llega antes que sus columnas, la app falla. Las
migraciones se escriben para que el código anterior siga funcionando y se
aplican **antes**:

1. PR con CI en verde. Desde aquí la migración no se edita.
2. Actions → Producción → Run workflow, eligiendo **la rama del PR**. Aplica
   la migración y redespliega el código que ya estaba (sigue funcionando).
3. Merge. Vercel publica el código nuevo.
4. Actions → Producción → Run workflow desde `main` con "Solo las pruebas de
   humo".

Una sola vez, a mano:

1. **Gotenberg en Render:** Render → New → Blueprint → este repositorio
   (`render.yaml`, plan gratis). Copie la URL del servicio y la contraseña
   que genera Render (`GOTENBERG_API_BASIC_AUTH_PASSWORD`).
2. **Resend:** cuenta con el correo que va a recibir los correos de prueba y
   una API key. Sin dominio verificado (H6) el remitente es
   `onboarding@resend.dev` y Resend **solo entrega al dueño de la cuenta**.
3. **Secretos del repositorio** (Settings → Secrets and variables → Actions):
   `VERCEL_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`,
   `RESEND_API_KEY`, `GOTENBERG_URL`, `GOTENBERG_PASSWORD`,
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
  admin/                  panel: login, plantillas y eventos
  v/[slug]/               la página del estudiante: flow.tsx decide qué paso se muestra
    _steps/               un archivo por paso (inicio, correo, código, edad, datos,
                          lectura, firma, menores y la pantalla con los PDF)
    _components/          lo que comparten los pasos (resumen del evento, progreso,
                          cuenta regresiva, Turnstile, formatos en blanco)
  privacidad/             el aviso de privacidad
  api/admin/              auth, plantillas, eventos (publicar, ampliar plazo,
                          cerrar, regenerar, borrar) y documentos
  api/public/events/      lo que llama el estudiante: sesión, código, texto
                          legal, firma, envíos y formatos en blanco
  api/internal/           purge-documents, lo que llama el reloj de la BD
config/                   nombre, marca, aviso de privacidad y listas (EPS,
                          programas, parentescos)
lib/server/               solo servidor ('server-only'): db, auth, sesión, OTP,
                          eventos, envíos, generación (docs, pdf), firma,
                          conservación, correo, auditoría, docx/{ooxml,inspect,validate}
lib/shared/               campos, esquemas, normalización, edad, plazos y
                          datos ficticios
proxy.ts                  CSP con nonce y headers de seguridad (S14)
supabase/                 config local, migraciones, plantilla del magic link
gotenberg/                imagen de Gotenberg con sus protecciones (render.yaml la publica)
scripts/                  spike de la Fase 0, admin-add, utilidades DOCX y deploy/
                          (variables de Vercel, clave del reloj, pruebas de humo)
docs/                     la wiki (GitHub Pages), el logo y las capturas del spike
tests/{unit,integration,e2e,helpers}
```

## Reglas que no se negocian

- Cero datos reales en el repo, fixtures, logs o capturas (`lib/shared/fake-data.ts`).
- No se cambia la redacción ni el diseño del formato oficial.
- Nada destructivo por defecto (`PURGE_ENABLED=false`). La única excepción es
  la conservación de 30 minutos (arriba): un plazo fijo, decidido y publicado
  en el aviso de privacidad.
- El formato oficial, los PDF de referencia y las fotos reales de firmas no se
  versionan mientras el repositorio no sea privado.
