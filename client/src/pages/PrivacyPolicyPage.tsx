import { Link } from "react-router-dom";
import MarketingLayout from "../components/MarketingLayout";

const LAST_UPDATED = "27 de marzo de 2026";

export default function PrivacyPolicyPage() {
  return (
    <MarketingLayout>
      <article className="legal-doc">
        <p className="legal-doc-meta">
          <Link to="/">← Volver al inicio</Link>
          <span aria-hidden> · </span>
          <Link to="/terms">Términos del servicio</Link>
        </p>
        <h1>Política de privacidad</h1>
        <p className="legal-doc-updated">Última actualización: {LAST_UPDATED}</p>

        <section>
          <h2>1. Responsable del tratamiento</h2>
          <p>
            Esta política describe cómo se tratan los datos personales en el marco del Servicio <strong>Promptplay</strong>{" "}
            (sitio y aplicación). El responsable es quien opera el Servicio según los datos de contacto publicados en
            el sitio.
          </p>
        </section>

        <section>
          <h2>2. Datos que podemos recoger</h2>
          <ul>
            <li>
              <strong>Identificación y cuenta:</strong> correo electrónico, nombre, contraseña (almacenada de forma
              segura o ausente si usás solo inicio de sesión con Google u otro proveedor).
            </li>
            <li>
              <strong>Uso del Servicio:</strong> actividad dentro de la app (por ejemplo predicciones, participación en
              ligas, uso de funciones de IA) y registros técnicos (dirección IP, tipo de navegador, marcas de tiempo)
              cuando sea necesario por seguridad o diagnóstico.
            </li>
            <li>
              <strong>Pagos (si aplica):</strong> datos mínimos gestionados por el procesador de pagos; no almacenamos
              el número completo de tarjeta en nuestros servidores salvo que un proveedor nos lo comunique de forma
              tokenizada según su propio esquema.
            </li>
          </ul>
        </section>

        <section>
          <h2>3. Finalidades</h2>
          <p>Tratamos los datos para:</p>
          <ul>
            <li>Crear y mantener tu cuenta y la seguridad del Servicio.</li>
            <li>Operar competencias, rankings e invitaciones entre organizaciones.</li>
            <li>Mejorar el producto, soporte y cumplimiento legal.</li>
            <li>Enviar comunicaciones esenciales del Servicio (no spam comercial salvo base legal y preferencias).</li>
          </ul>
        </section>

        <section>
          <h2>4. Base legal</h2>
          <p>
            Según el caso: ejecución del contrato o relación precontractual (cuenta y uso del Servicio), interés
            legítimo (seguridad y mejora), obligación legal o, cuando corresponda, consentimiento (por ejemplo
            marketing opcional).
          </p>
        </section>

        <section>
          <h2>5. Proveedores y transferencias</h2>
          <p>
            Podemos utilizar proveedores de alojamiento, base de datos, autenticación (p. ej. Google OAuth), mensajería
            y modelos de IA. Pueden tratarse datos en servidores ubicados fuera de tu país. Exigimos a proveedores
            medidas razonables de seguridad y confidencialidad.
          </p>
        </section>

        <section>
          <h2>6. Conservación</h2>
          <p>
            Conservamos la información el tiempo necesario para las finalidades anteriores y según plazos legales.
            Podés solicitar la supresión de tu cuenta salvo que debamos retener ciertos datos por obligación legal.
          </p>
        </section>

        <section>
          <h2>7. Tus derechos</h2>
          <p>
            Según tu jurisdicción, podés ejercer derechos de acceso, rectificación, supresión, oposición, limitación y
            portabilidad, y retirar el consentimiento cuando la base sea el consentimiento. Contactá al soporte del
            Servicio para canalizar pedidos.
          </p>
        </section>

        <section>
          <h2>8. Cookies y tecnologías similares</h2>
          <p>
            Podemos usar cookies o almacenamiento local necesarios para la sesión, preferencias y seguridad. Las cookies
            no esenciales, si las hubiera, se describirán o solicitarán según corresponda.
          </p>
        </section>

        <section>
          <h2>9. Menores</h2>
          <p>
            El Servicio no está dirigido a menores de edad según la ley aplicable. Si tomás conocimiento de datos de
            menores sin consentimiento parental válido, contactanos.
          </p>
        </section>

        <section>
          <h2>10. Cambios</h2>
          <p>
            Publicaremos actualizaciones en esta página y modificaremos la fecha de &quot;Última actualización&quot;.
          </p>
        </section>
      </article>
    </MarketingLayout>
  );
}
