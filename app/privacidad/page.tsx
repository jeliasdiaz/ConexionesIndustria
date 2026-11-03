import { APP_NAME, OFFICIAL_SYSTEM } from '@/config/app';
import { DATA_CONTROLLERS, DATA_PROCESSORS, DATA_SHARING, PRIVACY_CONTACT } from '@/config/privacy';
import { PRIVACY_NOTICE_VERSION } from '@/lib/server/submissions';
import { DOCUMENT_TTL_MINUTES, OTP_TTL_HOURS, ORPHAN_SIGNATURE_HOURS, UNFINISHED_TTL_HOURS } from '@/lib/shared/retention';
import { SiteHeader } from '../site-header';

// Apéndice A. Responsables, proveedores y canal en config/privacy.ts (DECISIONS
// 2026-10-24). La constancia dura lo que el evento: si algún día se borra sola,
// este texto cambia en el mismo cambio que el código.
export default function Privacy() {
  const contact = <a href={`mailto:${PRIVACY_CONTACT}`}>{PRIVACY_CONTACT}</a>;
  return (
    <>
      <SiteHeader />
      <main className="shell narrow page stack-lg">
        <div className="stack-sm">
          <span className="eyebrow">{APP_NAME}</span>
          <h1>Aviso de privacidad</h1>
        </div>
        <ol className="card prose">
          <li>
            <strong>Responsables del tratamiento:</strong> {DATA_CONTROLLERS.join(' y ')}, personas naturales que operan {APP_NAME}.
            {!OFFICIAL_SYSTEM && ` ${APP_NAME} no es un sistema oficial de la Universidad del Norte.`} Contacto: {contact}.
          </li>
          <li>
            <strong>Finalidad:</strong> generar los formatos de la salida de campo con sus datos y su firma, para que usted y el organizador los
            descarguen y los entreguen a la Universidad del Norte. Desde que la Universidad los recibe, los trata según su propia Política de
            Tratamiento de Datos.
          </li>
          <li>
            <strong>Datos tratados:</strong> identificación, código, programa, correo institucional (solo en los eventos que lo piden), EPS, alergias
            y condición médica (datos sensibles), contacto de emergencia (dato de un tercero), imagen procesada de la firma, IP y navegador como
            evidencia de aceptación. La fecha de nacimiento se usa para calcular la edad y no se guarda.
          </li>
          <li>
            <strong>Datos sensibles:</strong> la EPS, las alergias y la condición médica los piden los formatos de la Universidad para la salida. Usted
            no está obligado a autorizar su tratamiento (Ley 1581 de 2012, art. 6). Si prefiere no darlos aquí, descargue los formatos en blanco en
            la página del evento y llénelos a mano.
          </li>
          <li>
            <strong>Menores de edad:</strong> si es menor de edad, los formatos los firma su padre, madre o acudiente y se diligencian en papel. La
            plataforma no guarda datos suyos.
          </li>
          <li>
            <strong>Proveedores:</strong> {APP_NAME} usa proveedores que tratan los datos por encargo de los responsables y solo para operar la
            plataforma. Sus servidores están fuera de Colombia:
            <ul>
              {DATA_PROCESSORS.map((p) => (
                <li key={p.name}>
                  <strong>{p.name}:</strong> {p.role} ({p.country}).
                </li>
              ))}
            </ul>
            Sus datos {DATA_SHARING}.
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
                documentos repetidos se guarda una huella de su número de documento, calculada con una clave secreta, que no permite leerlo. Esta
                constancia se conserva hasta que el organizador borra el evento en la plataforma, o antes si usted pide que se borre.
              </li>
            </ul>
          </li>
          <li>
            <strong>Sus derechos:</strong> conocer, actualizar y rectificar sus datos, pedir prueba de su autorización, saber cómo se han usado,
            revocar la autorización y pedir que se borren (Ley 1581 de 2012, art. 8). Escriba a {contact} con su nombre, su código y lo que pide.
            Las consultas se responden en máximo 10 días hábiles y los reclamos en máximo 15 (arts. 14 y 15). Si no queda conforme con la
            respuesta, puede presentar una queja ante la Superintendencia de Industria y Comercio.
          </li>
        </ol>
        <p className="hint">Versión: {PRIVACY_NOTICE_VERSION}</p>
      </main>
    </>
  );
}
