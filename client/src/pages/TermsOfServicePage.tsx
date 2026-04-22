import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";

/** Fecha visible para auditorías (Google Cloud, etc.). Actualizá al cambiar el texto. */
const LAST_UPDATED = "27 de marzo de 2026";

export default function TermsOfServicePage() {
  return (
    <MarketingLayout>
      <article className="legal-doc">
        <p className="legal-doc-meta">
          <Link to="/">← Volver al inicio</Link>
          <span aria-hidden> · </span>
          <Link to="/privacy">Política de privacidad</Link>
        </p>
        <h1>Términos y condiciones del servicio</h1>
        <p className="legal-doc-updated">Última actualización: {LAST_UPDATED}</p>

        <section>
          <h2>1. Identificación</h2>
          <p>
            El presente documento regula el acceso y uso del sitio web, aplicación y servicios asociados bajo la marca{" "}
            <strong>Promptplay</strong> (en adelante, el &quot;Servicio&quot;), incluidas las funcionalidades de
            competencias tipo prode, herramientas de IA orientadas al entretenimiento y formación, y cuentas de usuario.
          </p>
        </section>

        <section>
          <h2>2. Aceptación</h2>
          <p>
            Al crear una cuenta, iniciar sesión (incluido mediante proveedores externos como Google) o utilizar el
            Servicio, declarás haber leído y aceptado estos Términos. Si no estás de acuerdo, no utilices el Servicio.
          </p>
        </section>

        <section>
          <h2>3. Descripción general</h2>
          <p>
            El Servicio se ofrece &quot;tal cual&quot; y puede modificarse, suspenderse o interrumpirse por razones
            técnicas, legales o comerciales. No garantizamos disponibilidad ininterrumpida ni resultados específicos en
            competencias o en las respuestas generadas por sistemas de IA de terceros.
          </p>
        </section>

        <section>
          <h2>4. Cuentas y elegibilidad</h2>
          <p>
            Debes proporcionar información veraz (por ejemplo, un correo electrónico válido). Sos responsable de la
            confidencialidad de tu contraseña y de las actividades realizadas con tu cuenta. Podemos suspender o
            cancelar cuentas que incumplan estos Términos o que representen un riesgo para la seguridad o la
            experiencia de otros usuarios.
          </p>
        </section>

        <section>
          <h2>5. Uso aceptable</h2>
          <p>No está permitido:</p>
          <ul>
            <li>Utilizar el Servicio de forma ilegal o para fines ilícitos.</li>
            <li>Intentar acceder sin autorización a sistemas, datos o cuentas ajenas.</li>
            <li>Distribuir malware, realizar ingeniería social abusiva o saturar la infraestructura.</li>
            <li>Suplantar identidades o manipular resultados de forma fraudulenta.</li>
          </ul>
        </section>

        <section>
          <h2>6. Contenido y propiedad intelectual</h2>
          <p>
            Los elementos de marca, diseño, código y materiales del Servicio están protegidos por las leyes aplicables.
            No adquirís derechos de propiedad sobre ellos salvo licencias limitadas necesarias para usar el Servicio
            según lo previsto. El contenido que generes o cargues permanece bajo tu responsabilidad respecto de
            terceros.
          </p>
        </section>

        <section>
          <h2>7. IA y resultados automáticos</h2>
          <p>
            Las funciones basadas en modelos de lenguaje u otros sistemas de IA pueden producir errores, imprecisiones
            o contenido inadecuado. No deben usarse como única fuente para decisiones críticas (salud, legal, finanzas,
            etc.). El uso de dichas funciones es bajo tu propio riesgo.
          </p>
        </section>

        <section>
          <h2>8. Limitación de responsabilidad</h2>
          <p>
            En la máxima medida permitida por la ley aplicable, el Servicio y sus operadores no serán responsables por
            daños indirectos, lucro cesante, pérdida de datos o interrupciones del negocio. En ningún caso la
            responsabilidad agregada superará el monto que hubieras abonado por el Servicio en los últimos doce (12)
            meses, o cero si el acceso fue gratuito.
          </p>
        </section>

        <section>
          <h2>9. Enlaces y terceros</h2>
          <p>
            El Servicio puede integrarse con terceros (por ejemplo, inicio de sesión con Google, procesadores de pago o
            APIs externas). Esos servicios se rigen por sus propios términos y políticas.
          </p>
        </section>

        <section>
          <h2>10. Modificaciones</h2>
          <p>
            Podemos actualizar estos Términos publicando la nueva versión en esta página y ajustando la fecha de
            &quot;Última actualización&quot;. El uso continuado tras cambios razonables implica aceptación, salvo que la
            ley exija otro procedimiento.
          </p>
        </section>

        <section>
          <h2>11. Legislación y jurisdicción</h2>
          <p>
            Salvo disposición imperativa en contrario, cualquier controversia se someterá a los tribunales competentes
            según la legislación aplicable al prestador del Servicio, sin perjuicio de derechos irrenunciables del
            consumidor cuando corresponda.
          </p>
        </section>

        <section>
          <h2>12. Contacto</h2>
          <p>
            Para consultas sobre estos Términos podés escribir al correo de soporte indicado en el sitio o en las
            comunicaciones oficiales del Servicio.
          </p>
        </section>
      </article>
    </MarketingLayout>
  );
}
