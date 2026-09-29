import { APP_NAME } from '@/config/app';
import { PRIVACY_NOTICE_VERSION } from '@/lib/server/submissions';

// Esqueleto del Apéndice A. BORRADOR: lo revisa y completa la oficina que
// corresponda antes de cualquier dato real (H9, Q5).
export default function Privacy() {
  return (
    <main className="shell narrow stack">
      <h1>Aviso de privacidad · {APP_NAME}</h1>
      <p className="alert error">
        <strong>Borrador pendiente de revisión.</strong> Este aviso todavía no fue aprobado; la plataforma no recibe datos reales hasta que lo esté.
      </p>
      <ol className="stack">
        <li>
          <strong>Responsable del tratamiento:</strong> pendiente de definir (Q5).
        </li>
        <li>
          <strong>Finalidad:</strong> generar los formatos de la salida de campo y entregarlos a la Universidad del Norte. Los datos no se entregan a
          terceros.
        </li>
        <li>
          <strong>Datos tratados:</strong> identificación, código, programa, correo institucional, EPS, alergias y condición médica (datos sensibles),
          contacto de emergencia (dato de un tercero), imagen procesada de la firma, IP y navegador como evidencia de aceptación. La fecha de nacimiento
          se usa para calcular la edad y no se guarda.
        </li>
        <li>
          <strong>Datos sensibles:</strong> el titular no está obligado a autorizar su tratamiento (Ley 1581 de 2012, art. 6).
        </li>
        <li>
          <strong>Proveedores:</strong> alojamiento y correo con proveedores que pueden tratar datos fuera de Colombia (pendiente de detallar).
        </li>
        <li>
          <strong>Conservación:</strong> pendiente de definir con la Universidad (Q6). La plataforma no es el archivo oficial.
        </li>
        <li>
          <strong>Derechos:</strong> conocer, actualizar, rectificar, suprimir y revocar; canal de consultas y reclamos pendiente de publicar.
        </li>
        <li>
          <strong>Política de la Universidad:</strong> aplica la Política de Tratamiento de Datos de la Universidad del Norte.
        </li>
      </ol>
      <p className="hint">Versión: {PRIVACY_NOTICE_VERSION}</p>
    </main>
  );
}
