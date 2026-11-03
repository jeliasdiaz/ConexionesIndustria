// Aviso de privacidad (DECISIONS 2026-10-24). Lo leen /privacidad y la casilla
// de autorización del estudiante: así no pueden decir cosas distintas.

// Quienes responden por los datos, como personas naturales: ARIA no es un
// sistema oficial de la Universidad (OFFICIAL_SYSTEM en config/app.ts). No es la
// lista de créditos (APP_AUTHORS): cambiar los créditos no cambia a los responsables.
export const DATA_CONTROLLERS = ['José Elías Díaz Marín', 'Wilmar Andrés Fontalvo Vásquez'];

// Canal de consultas y reclamos (Ley 1581 de 2012, arts. 14 y 15).
export const PRIVACY_CONTACT = 'fontalvowillmar13@gmail.com';

// Quienes tratan los datos por encargo de los responsables (Decreto 1377 de 2013,
// art. 25). Un servicio nuevo que reciba datos de estudiantes va aquí: lo exige
// tests/unit/privacy.test.ts para los que el servidor llama por fetch.
export const DATA_PROCESSORS: { name: string; role: string; country: string }[] = [
  { name: 'Supabase', role: 'base de datos y archivos', country: 'Estados Unidos' },
  { name: 'Vercel', role: 'servidor de la aplicación', country: 'Estados Unidos' },
  { name: 'Render', role: 'generación de los PDF', country: 'Estados Unidos' },
  { name: 'Resend', role: 'envío de los correos con el código de acceso', country: 'Estados Unidos' },
  { name: 'Cloudflare Turnstile', role: 'comprobar que no es un robot; ve su IP y su navegador', country: 'Estados Unidos y su red global' },
];

// Con quién se comparten los datos. Sin sujeto: el aviso dice "Sus datos…" y la
// autorización "Mis datos…".
export const DATA_SHARING = 'no se venden ni se comparten con nadie distinto de la Universidad y de los proveedores que operan la plataforma';
