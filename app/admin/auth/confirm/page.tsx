import { AdminHeader } from '../../admin-header';

export const dynamic = 'force-dynamic';

// El enlace del correo abre esta página; la sesión se crea al pulsar el botón
// (POST). Así un escáner de enlaces que haga GET no consume el token.
export default async function Confirm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = typeof params.token_hash === 'string' ? params.token_hash : '';
  return (
    <>
      <AdminHeader />
      <main className="shell">
        <h1>Entrar al panel</h1>
        {token ? (
          <form method="post" action="/api/admin/auth/confirm" className="card stack">
            <input type="hidden" name="token_hash" value={token} />
            <p>Pulse el botón para terminar de entrar.</p>
            <button type="submit">Entrar al panel</button>
          </form>
        ) : (
          <p className="alert error">El enlace está incompleto. Pida uno nuevo desde el panel.</p>
        )}
      </main>
    </>
  );
}
