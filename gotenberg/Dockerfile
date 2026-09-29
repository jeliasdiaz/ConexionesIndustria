# Gotenberg 8 con las fuentes del formato oficial (Fase 0, tarea 1).
# LibreOffice sustituye cualquier fuente que no esté instalada y eso cambia
# métricas, saltos de línea y paginación. Revisar las fuentes del DOCX con
# `npm run docx:inspect -- <archivo>` y copiar aquí las que falten.
FROM gotenberg/gotenberg:8

USER root

# Fuentes métricamente compatibles ya incluidas en la imagen base:
#   Arial/Helvetica → Liberation Sans · Times New Roman → Liberation Serif
#   Calibri → Carlito · Cambria → Caladea
# Fuentes con licencia (p. ej. Calibri, Arial reales) copiadas a mano en
# gotenberg/fonts/ (no se versionan: ver .gitignore y fonts/README.md).
COPY fonts/ /usr/local/share/fonts/custom/
RUN rm -f /usr/local/share/fonts/custom/README.md && fc-cache -f

USER gotenberg

# S10: las protecciones viven en la imagen, no en docker-compose, para que
# cualquier hosting que construya este Dockerfile (Railway, Cloud Run) las
# herede. Sin GOTENBERG_API_BASIC_AUTH_USERNAME/PASSWORD el contenedor no
# arranca. El puerto sale de $PORT: el hosting lo sobreescribe; si no, 3000.
ENV PORT=3000
CMD ["gotenberg", \
     "--api-port-from-env=PORT", \
     "--api-enable-basic-auth", \
     "--api-timeout=60s", \
     "--api-body-limit=10MB", \
     "--chromium-disable-routes", \
     "--pdfengines-disable-routes", \
     "--webhook-disable", \
     "--libreoffice-restart-after=10"]
