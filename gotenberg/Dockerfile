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
