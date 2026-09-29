// Las pruebas de integración y E2E crean y borran usuarios, admins, eventos y
// archivos: nunca contra un proyecto alojado, aunque el .env apunte a uno.
export function assertLocalSupabase(): void {
  const url = process.env.SUPABASE_URL;
  if (!url) return;
  const host = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    throw new Error(`Estas pruebas solo corren contra Supabase local; SUPABASE_URL apunta a ${host}`);
  }
}
