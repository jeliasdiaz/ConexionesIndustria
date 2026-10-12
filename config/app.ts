// D17: el nombre público vive solo aquí. Se usa en <title>, encabezado,
// remitente y asunto de los correos y aviso de privacidad.
export const APP_NAME = 'ARIA';

// Lo que abrevia la sigla. Solo acompaña al nombre en el encabezado.
export const APP_TAGLINE = 'Academic & Industrial Visit Assistant';

// §10 "Confianza": sin autorización expresa de la Universidad (Q9), la página
// y el correo dicen quién opera la plataforma y que no es un sistema oficial.
export const OFFICIAL_SYSTEM = false;

// Quienes desarrollaron la plataforma. Sale en el pie de todas las páginas.
export const APP_AUTHORS: { name: string; url?: string }[] = [
  { name: 'José Elías Díaz Marín', url: 'https://jeliasdiaz.com' },
  { name: 'Wilmar Andrés Fontalvo Vásquez' },
];
