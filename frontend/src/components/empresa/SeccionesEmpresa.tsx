import { EmpresaCompleta } from "../../api/client";
import { inputClass } from "../../lib/ui";
import { calcularDvNit } from "../../lib/nitDigitoVerificacion";

// Los 5 grupos de campos del wizard de primer uso, reutilizados tal cual en la pestaña "Empresa"
// del panel de administración (ver frontend/src/pages/SetupWizardPage.tsx y
// frontend/src/pages/AdminPage.tsx) — cada uno es puramente de presentación: recibe el valor
// actual y avisa el cambio campo por campo, quien lo use decide cuándo y cómo guardar.
export type FormularioEmpresa = Omit<EmpresaCompleta, "id" | "logoRuta" | "configuradoEn" | "updatedAt">;

interface Props<K extends keyof FormularioEmpresa> {
  valores: FormularioEmpresa;
  onChange: (campo: K, valor: FormularioEmpresa[K]) => void;
}

function Campo({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
      {etiqueta}
      {children}
    </label>
  );
}

export function SeccionDatosEmpresa({ valores, onChange }: Props<keyof FormularioEmpresa>) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <Campo etiqueta="NIT">
          <input
            value={valores.nit}
            onChange={(e) => {
              const nit = e.target.value.replace(/\D/g, "");
              onChange("nit", nit);
              if (nit) onChange("nitDv", calcularDvNit(nit));
            }}
            placeholder="900123456"
            className={inputClass}
          />
        </Campo>
        <Campo etiqueta="Dígito de verificación">
          <input value={valores.nitDv} onChange={(e) => onChange("nitDv", e.target.value.replace(/\D/g, "").slice(0, 1))} className={inputClass} />
        </Campo>
      </div>
      <Campo etiqueta="Nombre completo de la entidad">
        <input value={valores.nombre} onChange={(e) => onChange("nombre", e.target.value)} className={inputClass} />
      </Campo>
      <Campo etiqueta="Sigla (nombre corto)">
        <input value={valores.nombreCorto} onChange={(e) => onChange("nombreCorto", e.target.value)} className={inputClass} />
      </Campo>
      <Campo etiqueta="Dirección">
        <input value={valores.direccion} onChange={(e) => onChange("direccion", e.target.value)} className={inputClass} />
      </Campo>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Campo etiqueta="Sitio web">
          <input value={valores.sitioWeb} onChange={(e) => onChange("sitioWeb", e.target.value)} placeholder="https://..." className={inputClass} />
        </Campo>
        <Campo etiqueta="Correo de contacto">
          <input value={valores.email} onChange={(e) => onChange("email", e.target.value)} type="email" className={inputClass} />
        </Campo>
      </div>
      <Campo etiqueta="Teléfonos">
        <input
          value={valores.telefonos}
          onChange={(e) => onChange("telefonos", e.target.value)}
          placeholder="Separados por coma si hay varios"
          className={inputClass}
        />
      </Campo>
    </div>
  );
}

export function SeccionMarca({
  valores,
  onChange,
  logoActualUrl,
  onSubirLogo,
  subiendoLogo,
}: Props<keyof FormularioEmpresa> & {
  logoActualUrl: string;
  onSubirLogo: (archivo: File) => void;
  subiendoLogo: boolean;
}) {
  return (
    <div className="space-y-4">
      <Campo etiqueta="Color de marca">
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={valores.colorMarca}
            onChange={(e) => onChange("colorMarca", e.target.value)}
            className="h-10 w-14 cursor-pointer rounded-lg border border-slate-300 dark:border-slate-700"
          />
          <input
            value={valores.colorMarca}
            onChange={(e) => onChange("colorMarca", e.target.value)}
            className={`${inputClass} w-32`}
          />
          <span className="text-xs text-slate-500 dark:text-slate-500">
            Define toda la escala de colores de la app, en modo claro y oscuro.
          </span>
        </div>
      </Campo>
      <div>
        <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">Logo</p>
        <div className="flex items-center gap-3">
          {logoActualUrl ? (
            <img src={logoActualUrl} alt="Logo actual" className="h-16 w-16 rounded-lg border border-slate-300 object-contain p-1 dark:border-slate-700" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-slate-300 text-[10px] text-slate-400 dark:border-slate-700">
              Sin logo
            </div>
          )}
          <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
            {subiendoLogo ? "Subiendo..." : "Elegir imagen"}
            <input
              type="file"
              accept="image/*"
              disabled={subiendoLogo}
              className="hidden"
              onChange={(e) => {
                const archivo = e.target.files?.[0];
                if (archivo) onSubirLogo(archivo);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}

export function SeccionCatastral({ valores, onChange }: Props<keyof FormularioEmpresa>) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-500">
        Código DANE del municipio donde opera la entidad — lo exige el reporte mensual de PQR al SUI. Búscalo en el{" "}
        <a
          href="https://geoportal.dane.gov.co/laboratoriogeoportal/servicios-ide/divipola/"
          target="_blank"
          rel="noreferrer"
          className="text-brand-600 hover:underline dark:text-brand-400"
        >
          Divipola del DANE
        </a>
        .
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Campo etiqueta="Departamento">
          <input value={valores.daneDepartamento} onChange={(e) => onChange("daneDepartamento", e.target.value)} placeholder="86" className={inputClass} />
        </Campo>
        <Campo etiqueta="Municipio">
          <input value={valores.daneMunicipio} onChange={(e) => onChange("daneMunicipio", e.target.value)} placeholder="001" className={inputClass} />
        </Campo>
        <Campo etiqueta="Centro poblado">
          <input value={valores.daneCentroPoblado} onChange={(e) => onChange("daneCentroPoblado", e.target.value)} placeholder="000" className={inputClass} />
        </Campo>
      </div>
      <Campo etiqueta="GLN de GS1 Colombia (opcional)">
        <input value={valores.glnGs1} onChange={(e) => onChange("glnGs1", e.target.value)} placeholder="Solo si hay convenio de recaudo bancario" className={inputClass} />
      </Campo>
    </div>
  );
}

export function SeccionSubdominios({ valores, onChange }: Props<keyof FormularioEmpresa>) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-500">
        Escribe el dominio completo, sin "https://" ni barra al final — cada uno debe apuntar, en Cloudflare, al mismo
        túnel de este despliegue (ver ONBOARDING.md). Una vez guardados, la app queda lista para funcionar en esos
        dominios sin más cambios.
      </p>
      <Campo etiqueta="Panel interno (operativo)">
        <input value={valores.dominioOperativo} onChange={(e) => onChange("dominioOperativo", e.target.value)} placeholder="operativo.midominio.com" className={inputClass} />
      </Campo>
      <Campo etiqueta="PQRS (público)">
        <input value={valores.dominioPqrs} onChange={(e) => onChange("dominioPqrs", e.target.value)} placeholder="pqrs.midominio.com" className={inputClass} />
      </Campo>
      <Campo etiqueta="Documentos SGC (público)">
        <input value={valores.dominioCalidad} onChange={(e) => onChange("dominioCalidad", e.target.value)} placeholder="calidad.midominio.com" className={inputClass} />
      </Campo>
    </div>
  );
}

export function SeccionCorreo({ valores, onChange }: Props<keyof FormularioEmpresa>) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-500">
        Cuenta de correo desde la que se notifican las PQRS (radicación, respuesta, cierre). Sin esto, el sistema
        sigue funcionando igual, solo no se envían esos correos.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr_1fr]">
        <Campo etiqueta="Servidor SMTP">
          <input value={valores.smtpHost} onChange={(e) => onChange("smtpHost", e.target.value)} placeholder="mail.midominio.com" className={inputClass} />
        </Campo>
        <Campo etiqueta="Puerto">
          <input
            type="number"
            value={valores.smtpPort ?? ""}
            onChange={(e) => onChange("smtpPort", e.target.value ? Number(e.target.value) : null)}
            placeholder="465"
            className={inputClass}
          />
        </Campo>
      </div>
      <Campo etiqueta="Usuario">
        <input value={valores.smtpUser} onChange={(e) => onChange("smtpUser", e.target.value)} placeholder="pqrs@midominio.com" className={inputClass} />
      </Campo>
      <Campo etiqueta="Contraseña">
        <input type="password" value={valores.smtpPass} onChange={(e) => onChange("smtpPass", e.target.value)} className={inputClass} />
      </Campo>
      <Campo etiqueta="Remitente que ve el ciudadano">
        <input
          value={valores.smtpFrom}
          onChange={(e) => onChange("smtpFrom", e.target.value)}
          placeholder='PQRS Mi Acueducto <pqrs@midominio.com>'
          className={inputClass}
        />
      </Campo>
    </div>
  );
}
