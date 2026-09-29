# Fuentes para Gotenberg

Copia aquí los `.ttf`/`.otf` que use el formato oficial y que no estén en la
imagen base (`fc-list` dentro del contenedor). No se versionan: muchas fuentes
de Microsoft no permiten redistribución.

1. `npm run docx:inspect -- fixtures/templates/Anexos_Salidas_de_campo.docx`
   → líneas "Fuentes (fontTable)", "Fuentes usadas" y "Fuentes del tema".
2. Para cada fuente que no aparezca en
   `docker compose exec gotenberg fc-list : family`, copia el archivo aquí
   (desde un equipo con licencia) y reconstruye: `docker compose build gotenberg`.
3. Verifica en el PDF generado con `pdffonts` que no quedó ninguna sustitución.
