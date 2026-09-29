import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'out/**', 'node_modules/**', 'next-env.d.ts', 'lib/server/database.types.ts'] },
  {
    rules: {
      // S1: nada con secretos puede llegar al cliente.
      'no-restricted-imports': [
        'error',
        { paths: [{ name: '@supabase/supabase-js', importNames: ['createClient'], message: 'Use lib/server/db.ts o lib/server/auth.ts (solo servidor).' }] },
      ],
    },
  },
  { files: ['lib/server/**'], rules: { 'no-restricted-imports': 'off' } },
];

export default config;
