import { IconAlert } from '@/app/icons';
import { APP_NAME } from '@/config/app';
import { PRIVACY_NOTICE_VERSION } from '@/lib/server/submissions';
import { DOCUMENT_TTL_MINUTES, OTP_TTL_HOURS, ORPHAN_SIGNATURE_HOURS, UNFINISHED_TTL_HOURS } from '@/lib/shared/retention';
import { SiteHeader } from '../site-header';

// Esqueleto del Apéndice A. BORRADOR: lo revisa y completa la oficina que
// corresponda antes de cualquier dato real (H9, Q5).
export default function Privacy() {
  return (
    <>
      <SiteHeader />
      <main className="shell narrow page stack-lg">
        <div className="stack-sm">
          <span className="eyebrow">{APP_NAME}</span>
          <h1>Aviso de privacidad</h1>
        </div>
        <p className="alert warning">
          <IconAlert />
          <span>
            <strong>Borrador pendiente de revisión.</strong> Este aviso todavía no fue aprobado; la plataforma no recibe datos reales hasta que lo
            esté.
          </span>
        </p>
        <ol className="card prose">
          <li>
            <strong>Responsable del tratamiento:</strong> pendiente de definir (Q5).
          </li>
          <li>
            <strong>Finalidad:</strong> generar los formatos de la salida de campo y entregarlos a la Universidad del Norte. Los datos no se entregan
            a terceros.
          </li>
          <li>
            <strong>Datos tratados:</strong> identificación, código, programa, correo institucional (solo en los eventos que lo piden), EPS, alergias
            y condición médica (datos sensibles), contacto de emergencia (dato de un tercero), imagen procesada de la firma, IP y navegador como
            evidencia de aceptación. La fecha de nacimiento se usa para calcular la edad y no se guarda.
          </li>
          <li>
            <strong>Datos sensibles:</strong> el titular no está obligado a autorizar su tratamiento (Ley 1581 de 2012, art. 6).
          </li>
          <li>
            <strong>Proveedores:</strong> alojamiento y correo con proveedores que pueden tratar datos fuera de Colombia (pendiente de detallar).
          </li>
          <li>
            <strong>Conservación:</strong> la plataforma no es el archivo oficial; descargue sus PDF y entréguelos al organizador.
            <ul>
              <li>
                Los PDF, la imagen de su firma, su número de documento, su EPS, sus alergias, su condición médica y los datos de su contacto de
                emergencia{' '}
                <strong>se borran {DOCUMENT_TTL_MINUTES} minutos después de generarse los PDF</strong>. Si los PDF no se pudieron generar, esos
                datos se borran a los {UNFINISHED_TTL_HOURS / 24} días.
              </li>
              <li>
                Una firma que se subió pero no se envió se borra a las {ORPHAN_SIGNATURE_HOURS} horas. Los códigos de acceso por correo se borran
                a las {OTP_TTL_HOURS} horas.
              </li>
              <li>
                Como constancia de su aceptación se conservan su nombre, código, programa y correo (si el evento lo pide), la fecha, la versión de
                los textos que aceptó, la IP y el navegador, y una huella de cada PDF que permite verificar una copia sin guardarla. Para detectar
                documentos repetidos se guarda una huella de su número de documento, calculada con una clave secreta, que no permite leerlo. El
                plazo de conservación de esta constancia está pendiente de definir con la Universidad (Q6).
              </li>
            </ul>
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
    </>
  );
}
