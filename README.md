# Conexiones con la Industria uninorte

Plataforma de constancias para salidas de campo (Departamento de Ingeniería
Mecánica / CEIM). **No es un sistema oficial de la Universidad del Norte.**
El plan completo vive fuera del repo (PLAN.md v1.4); las decisiones tomadas
están en [DECISIONS.md](DECISIONS.md).

Estado: **Fase 0 (spike)**. Resultados y pendientes en [SPIKE.md](SPIKE.md).
La aplicación Next.js empieza en la Fase 1.

## Requisitos

- Node 22+
- Docker con Compose
- `poppler-utils` (`pdfinfo`, `pdftotext`, `pdffonts`, `pdftoppm`) para el spike

## Levantar en local

```bash
cp .env.example .env        # definir GOTENBERG_PASSWORD
docker compose up -d        # Gotenberg 8 en 127.0.0.1:3000 con basic auth
npm install
npm test                    # pruebas unitarias
npm run typecheck
npm run spike -- --cold     # Fase 0: render, conversión, firma, tiempos
```

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run spike [-- --cold]` | Spike de la Fase 0. Modo real si hay plantillas en `fixtures/templates/prepared/`; si no, sintético. Salidas en `out/spike/` |
| `npm run docx:inspect -- <archivo> [--blocks] [--json]` | Fuentes, resaltados, marcas de edición, cambios rastreados, secciones y bloques de un DOCX |
| `npm run docx:split -- <archivo> [--at i,j,k,l]` | Separa los 4 anexos en 4 DOCX sin cambiar el texto |
| `npm run mail:test` | Envía 5 correos tipo OTP por Resend a `MAIL_TEST_TO` (H6, H10) |

## Reglas que no se negocian

- Cero datos reales en el repo, fixtures, logs o capturas (`scripts/fake-data.ts`).
- No se cambia la redacción ni el diseño del formato oficial.
- Nada destructivo por defecto (`PURGE_ENABLED=false`).
- El formato oficial, los PDF de referencia y las fotos reales de firmas no se
  versionan mientras el repositorio no sea privado.
