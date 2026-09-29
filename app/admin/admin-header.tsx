import { APP_NAME, OFFICIAL_SYSTEM } from '@/config/app';

export function AdminHeader({ email }: { email?: string }) {
  return (
    <header className="topbar">
      <div className="shell">
        <div>
          <div className="brand">{APP_NAME} · Panel</div>
          {!OFFICIAL_SYSTEM && <p className="notice">No es un sistema oficial de la Universidad del Norte.</p>}
        </div>
        {email && (
          <form method="post" action="/api/admin/auth/logout">
            <span className="notice">{email} </span>
            <button type="submit" className="secondary">
              Salir
            </button>
          </form>
        )}
      </div>
    </header>
  );
}
