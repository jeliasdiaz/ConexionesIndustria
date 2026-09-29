import { SiteHeader } from '../site-header';
import { AdminNav } from './admin-nav';

export function AdminHeader({ email }: { email?: string }) {
  return (
    <SiteHeader href="/admin">
      {email && (
        <div className="row">
          <AdminNav />
          <form method="post" action="/api/admin/auth/logout" className="user-menu">
            <span className="visually-hidden">Sesión de </span>
            <span className="user-email">{email}</span>
            <button type="submit" className="secondary small">
              Salir
            </button>
          </form>
        </div>
      )}
    </SiteHeader>
  );
}
