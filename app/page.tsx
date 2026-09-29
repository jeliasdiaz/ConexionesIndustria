import { APP_NAME, OFFICIAL_SYSTEM } from '@/config/app';

export default function Home() {
  return (
    <main className="shell">
      <h1>{APP_NAME}</h1>
      <p>Constancias para salidas de campo. Para diligenciar un formato, use el enlace o el código QR que le compartió el organizador.</p>
      {!OFFICIAL_SYSTEM && (
        <p className="notice">
          Esta plataforma no es un sistema oficial de la Universidad del Norte. Nunca le pediremos la contraseña de su correo.
        </p>
      )}
    </main>
  );
}
