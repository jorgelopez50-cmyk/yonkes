import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { auth, listManagedUsers, removePartImage, supabaseRequest, updateManagedUserRole, uploadPartImage } from "./lib/supabase";
import type { AuthRole, AuthSession, ManagedUser, PartRow } from "./lib/supabase";

/* =========================================================
   CATÁLOGO DE REPUESTOS (DESGUACE) – versión TypeScript
   Reemplaza TODO el contenido de src/App.tsx por este archivo.

   ========================================================= */

const CONFIG = {
  BUSINESS_NAME: "AutoPartes LIN",
  WHATSAPP: "573000000000", // código de país + número, sin + ni espacios
};
const TERMS_VERSION = "1.0";

// Edita esta lista en el código para agregar o quitar palabras y frases.
const CENSORED_WORDS = [
  "puta",
  "puto",
  "mierda",
  "pendejo",
  "pendeja",
  "verga",
  "cabron",
  "cabrón",
  "cabrona",
  "gonorrea",
  "malparido",
  "malparida",
  "joder",
  "coño",
  "carajo",
];

/* ------------------------------ Tipos ------------------------------ */
type Condition = "Excelente" | "Bueno" | "Regular" | "Para reparar";

type Part = {
  id: number;
  ownerId: string | null;
  sellerPhone: string | null;
  code: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  yearFrom: number | "";
  yearTo: number | "";
  condition: Condition;
  price: number;
  stock: number;
  location: string;
  donorVehicle: string;
  image: string;
  notes: string;
};

// Repuesto que todavía puede no tener id (cuando se está creando)
type PartInput = Omit<Part, "id" | "ownerId" | "sellerPhone"> & { id?: number; ownerId?: string | null };

// El formulario guarda todo como texto
type FormState = {
  id?: number;
  code: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  yearFrom: string;
  yearTo: string;
  condition: string;
  price: string;
  stock: string;
  location: string;
  donorVehicle: string;
  image: string;
  notes: string;
};

const CATEGORIES: string[] = [
  "Motor",
  "Transmisión",
  "Suspensión",
  "Frenos",
  "Carrocería",
  "Luces",
  "Eléctrico",
  "Interior",
  "Otros",
];
const CONDITIONS: Condition[] = ["Excelente", "Bueno", "Regular", "Para reparar"];

/* ---------------------- Capa de datos (Supabase) ---------------------- */
const fromDb = (row: PartRow, sellerPhone: string | null = null): Part => ({
  id: row.id,
  ownerId: row.owner_id,
  sellerPhone,
  code: row.code,
  name: row.name,
  category: row.category,
  brand: row.brand,
  model: row.model,
  yearFrom: row.year_from ?? "",
  yearTo: row.year_to ?? "",
  condition: row.condition,
  price: row.price,
  stock: row.stock,
  location: row.location,
  donorVehicle: row.donor_vehicle,
  image: row.image,
  notes: row.notes,
});

const toDb = (part: PartInput): Omit<PartRow, "id" | "owner_id"> => ({
  code: part.code,
  name: part.name,
  category: part.category,
  brand: part.brand,
  model: part.model,
  year_from: part.yearFrom === "" ? null : part.yearFrom,
  year_to: part.yearTo === "" ? null : part.yearTo,
  condition: part.condition,
  price: part.price,
  stock: part.stock,
  location: part.location,
  donor_vehicle: part.donorVehicle,
  image: part.image,
  notes: part.notes,
});

async function withSellerPhones(rows: PartRow[]): Promise<Part[]> {
  const ownerIds = Array.from(new Set(rows.flatMap((row) => row.owner_id ? [row.owner_id] : [])));
  if (ownerIds.length === 0) return rows.map((row) => fromDb(row));

  const contacts = await supabaseRequest<Array<{ owner_id: string; phone: string }>>(
    `seller_whatsapp?owner_id=in.(${ownerIds.map(encodeURIComponent).join(",")})&select=owner_id,phone`,
  );
  const phonesByOwner = new Map((contacts || []).map((contact) => [contact.owner_id, contact.phone]));
  return rows.map((row) => fromDb(row, row.owner_id ? phonesByOwner.get(row.owner_id) || null : null));
}

const api = {
  async list(): Promise<Part[]> {
    const rows = await supabaseRequest<PartRow[]>("parts?select=*&order=id.desc");
    if (!rows) throw new Error("Supabase no devolvió el inventario.");
    return withSellerPhones(rows);
  },
  async create(part: PartInput): Promise<Part> {
    const rows = await supabaseRequest<PartRow[]>("parts?select=*", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(toDb(part)),
    });
    if (!rows?.[0]) throw new Error("Supabase no devolvió el repuesto creado.");
    return (await withSellerPhones([rows[0]]))[0];
  },
  async update(part: PartInput & { id: number }): Promise<Part> {
    const rows = await supabaseRequest<PartRow[]>(
      `parts?id=eq.${part.id}&select=*`,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(toDb(part)),
      },
    );
    if (!rows?.[0]) throw new Error("Supabase no encontró el repuesto que intentaste editar.");
    return (await withSellerPhones([rows[0]]))[0];
  },
  async remove(id: number): Promise<void> {
    await supabaseRequest<null>(`parts?id=eq.${id}`, { method: "DELETE" });
  },
};

/* --------------------------- Utilidades --------------------------- */
const formatPrice = (n: number): string => "$" + Number(n || 0).toLocaleString("es-CO");

function censorText(value: string, words: readonly string[]): string {
  return words.reduce((text, word) => {
    const escaped = word.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (!escaped) return text;
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}\\p{M}_])(${escaped})(?=$|[^\\p{L}\\p{N}\\p{M}_])`,
      "giu",
    );
    return text.replace(pattern, (_match, prefix: string, found: string) =>
      prefix + found.replace(/[\p{L}\p{N}]/gu, "*"),
    );
  }, value);
}

const years = (p: Part): string | number =>
  p.yearFrom && p.yearTo && p.yearFrom !== p.yearTo
    ? p.yearFrom + "–" + p.yearTo
    : p.yearFrom || p.yearTo || "";

const EMPTY_FORM: FormState = {
  code: "", name: "", category: CATEGORIES[0], brand: "", model: "",
  yearFrom: "", yearTo: "", condition: "Bueno", price: "", stock: "1",
  location: "", donorVehicle: "", image: "", notes: "",
};

const toForm = (p: Part | null): FormState =>
  p
    ? {
        id: p.id, code: p.code, name: p.name, category: p.category, brand: p.brand, model: p.model,
        yearFrom: String(p.yearFrom), yearTo: String(p.yearTo), condition: p.condition,
        price: String(p.price), stock: String(p.stock), location: p.location,
        donorVehicle: p.donorVehicle, image: p.image, notes: p.notes,
      }
    : EMPTY_FORM;

const errorMessage = (e: unknown): string => (e instanceof Error ? e.message : "Ocurrió un error inesperado");

function phoneForWhatsApp(value: string): string | null {
  const formatted = value.trim().replace(/[\s().-]/g, "");
  if (!/^\+[1-9]\d{7,14}$/.test(formatted)) return null;
  return formatted.slice(1);
}

/* ----------------------------- Hook ----------------------------- */
function useParts() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setParts(await api.list());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (part: PartInput): Promise<void> => {
    if (part.id !== undefined) {
      const updated = await api.update({ ...part, id: part.id });
      setParts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } else {
      const created = await api.create(part);
      setParts((prev) => [created, ...prev]);
    }
  };

  const remove = async (id: number): Promise<void> => {
    await api.remove(id);
    setParts((prev) => prev.filter((p) => p.id !== id));
  };

  return { parts, loading, error, reload: load, save, remove };
}

/* ----------------------------- Iconos ----------------------------- */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
const SearchIcon = () => <Icon><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></Icon>;
const PlusIcon = () => <Icon><path d="M5 12h14M12 5v14" /></Icon>;
const WrenchIcon = ({ size }: { size?: number }) => <Icon size={size}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z" /></Icon>;
const PinIcon = () => <Icon size={15}><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="3" /></Icon>;
const CarIcon = () => <Icon size={15}><path d="M5 17h14M3 13l2-6h14l2 6v4H3z" /><circle cx="7.5" cy="17" r="1.5" /><circle cx="16.5" cy="17" r="1.5" /></Icon>;
const GridIcon = () => <Icon size={16}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></Icon>;
const ListIcon = () => <Icon size={16}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></Icon>;

/* ------------------------- Formulario (modal) ------------------------- */
type PartFormProps = {
  initial: Part | null;
  onClose: () => void;
  onSave: (part: PartInput) => Promise<void>;
};

function PartForm({ initial, onClose, onSave }: PartFormProps) {
  const [form, setForm] = useState<FormState>(toForm(initial));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }
    const preview = URL.createObjectURL(imageFile);
    setImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [imageFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const set =
    (field: keyof FormState) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) return setError("Escribe el nombre del repuesto.");
    if (form.price === "" || Number(form.price) < 0) return setError("Escribe un precio válido.");
    setSaving(true);
    setError("");
    const part: PartInput = {
      id: form.id,
      ownerId: initial?.ownerId ?? null,
      code: form.code.trim(),
      name: form.name.trim(),
      category: form.category,
      brand: form.brand.trim(),
      model: form.model.trim(),
      yearFrom: form.yearFrom ? Number(form.yearFrom) : "",
      yearTo: form.yearTo ? Number(form.yearTo) : "",
      condition: form.condition as Condition,
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      location: form.location.trim(),
      donorVehicle: form.donorVehicle.trim(),
      image: form.image.trim(),
      notes: form.notes.trim(),
    };
    let uploadedPath: string | null = null;
    try {
      if (imageFile) {
        const uploaded = await uploadPartImage(imageFile);
        part.image = uploaded.url;
        uploadedPath = uploaded.path;
      }
      await onSave(part);
      onClose();
    } catch (e) {
      let message = errorMessage(e);
      if (uploadedPath) {
        try {
          await removePartImage(uploadedPath);
        } catch (cleanupError) {
          message += ` No pudimos limpiar la foto que se subió: ${errorMessage(cleanupError)}`;
        }
      }
      setError(message);
      setSaving(false);
    }
  };

  const selectImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageFile(null);
      setError("Elige una imagen JPG, PNG o WebP.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageFile(null);
      setError("La foto no puede pesar más de 5 MB.");
      return;
    }
    setError("");
    setImageFile(file);
  };

  const preview = imagePreview || form.image;

  return (
    <div className="dz-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dz-modal" role="dialog" aria-modal="true" aria-label={initial ? "Editar repuesto" : "Nuevo repuesto"}>
        <h2>{initial ? "Editar repuesto" : "Nuevo repuesto"}</h2>

        <div className="dz-form">
          <label className="span2">Nombre del repuesto *
            <input value={form.name} onChange={set("name")} placeholder="Ej: Farola delantera derecha" />
          </label>
          <label>Código interno
            <input value={form.code} onChange={set("code")} placeholder="Ej: LUZ-0108" />
          </label>
          <label>Categoría
            <select value={form.category} onChange={set("category")}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Marca del vehículo
            <input value={form.brand} onChange={set("brand")} placeholder="Ej: Mazda" />
          </label>
          <label>Modelo
            <input value={form.model} onChange={set("model")} placeholder="Ej: 3" />
          </label>
          <label>Año desde
            <input type="number" value={form.yearFrom} onChange={set("yearFrom")} />
          </label>
          <label>Año hasta
            <input type="number" value={form.yearTo} onChange={set("yearTo")} />
          </label>
          <label>Estado
            <select value={form.condition} onChange={set("condition")}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label>Precio (MXN) *
            <input type="number" min="0" value={form.price} onChange={set("price")} />
          </label>
          <label>Cantidad en stock
            <input type="number" min="0" value={form.stock} onChange={set("stock")} />
          </label>
          <label>Ubicación en bodega
            <input value={form.location} onChange={set("location")} placeholder="Ej: Bodega A - Estante 2" />
          </label>
          <label className="span2">Vehículo de donde salió
            <input value={form.donorVehicle} onChange={set("donorVehicle")} placeholder="Ej: Mazda 3 2016, siniestro lateral" />
          </label>
          <label className="span2">Foto del producto
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={selectImage} />
            <small className="dz-image-help">Sube una foto desde tu dispositivo (JPG, PNG o WebP; máximo 5 MB).</small>
            {preview && <img className="dz-image-preview" src={preview} alt="Vista previa de la foto del repuesto" />}
          </label>
          <label className="span2">Notas
            <textarea rows={2} value={form.notes} onChange={set("notes")} />
          </label>
        </div>

        {error && <p className="dz-form-error" role="alert">{error}</p>}

        <div className="dz-modal-actions">
          <button className="dz-btn dz-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="dz-btn dz-btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Tarjeta ------------------------------ */
function stockInfo(p: Part): { label: string; cls: string } {
  if (p.stock <= 0) return { label: "Agotado", cls: "is-out" };
  if (p.stock === 1) return { label: "Última unidad", cls: "is-low" };
  return { label: p.stock + " disponibles", cls: "is-ok" };
}

function whatsappLink(p: Part, words: readonly string[]): string {
  const text =
    "Hola, me interesa este repuesto: " + censorText(p.name, words) + " (" + censorText(p.code || "sin código", words) + ") " +
    [p.brand, p.model, years(p)].filter(Boolean).map((value) => censorText(String(value), words)).join(" ") + ". ¿Sigue disponible?";
  return "https://wa.me/" + (p.sellerPhone || CONFIG.WHATSAPP) + "?text=" + encodeURIComponent(text);
}

function PartImage({ part, censoredWords }: { part: Part; censoredWords: readonly string[] }) {
  const [failed, setFailed] = useState<boolean>(false);
  if (part.image && !failed) {
    return <img src={part.image} alt={censorText(part.name, censoredWords)} loading="lazy" onError={() => setFailed(true)} />;
  }
  return <div className="dz-noimg"><WrenchIcon size={40} /><span>Sin foto</span></div>;
}

type CardProps = {
  part: Part;
  admin: boolean;
  canEdit: boolean;
  censoredWords: readonly string[];
  onEdit: (part: Part) => void;
  onDelete: (part: Part) => void;
};

function PartCard({ part, admin, canEdit, censoredWords, onEdit, onDelete }: CardProps) {
  const s = stockInfo(part);
  return (
    <article className="dz-card">
      <div className="dz-card-media">
        <PartImage part={part} censoredWords={censoredWords} />
        <span className={"dz-stock " + s.cls}>{s.label}</span>
      </div>
      <div className="dz-card-body">
        <p className="dz-code">{censorText(part.code || "Sin código", censoredWords)} · {censorText(part.category, censoredWords)}</p>
        <h3>{censorText(part.name, censoredWords)}</h3>
        <p className="dz-fit"><CarIcon />{[part.brand, part.model, years(part)].filter(Boolean).map((value) => censorText(String(value), censoredWords)).join(" ") || "Compatibilidad sin especificar"}</p>
        {part.location && <p className="dz-loc"><PinIcon />{censorText(part.location, censoredWords)}</p>}

        <div className="dz-card-row">
          <span className="dz-price">{formatPrice(part.price)}</span>
          <span className="dz-cond">{part.condition}</span>
        </div>

        {canEdit ? (
          <div className={"dz-admin-actions" + (admin ? "" : " is-single")}>
            <button className="dz-btn dz-btn-ghost" onClick={() => onEdit(part)}>Editar</button>
            {admin && <button className="dz-btn dz-btn-danger" onClick={() => onDelete(part)}>Eliminar</button>}
          </div>
        ) : (
          <a
            className={"dz-btn dz-btn-primary dz-block" + (part.stock <= 0 ? " is-disabled" : "")}
            href={part.stock <= 0 ? undefined : whatsappLink(part, censoredWords)}
            target="_blank"
            rel="noreferrer"
          >
            Consultar por WhatsApp
          </a>
        )}
      </div>
    </article>
  );
}

/* ------------------------------- Tabla ------------------------------- */
type TableProps = {
  parts: Part[];
  admin: boolean;
  userId?: string;
  censoredWords: readonly string[];
  onEdit: (part: Part) => void;
  onDelete: (part: Part) => void;
};

function PartsTable({ parts, admin, userId, censoredWords, onEdit, onDelete }: TableProps) {
  const canEditAny = parts.some((part) => admin || part.ownerId === userId);
  return (
    <div className="dz-table-wrap">
      <table className="dz-table">
        <thead>
          <tr>
            <th>Código</th><th>Repuesto</th><th>Vehículo</th><th>Estado</th>
            <th>Stock</th><th>Ubicación</th><th className="num">Precio</th><th>Contacto</th>
            {canEditAny && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.id}>
              <td>{censorText(p.code, censoredWords)}</td>
              <td><strong>{censorText(p.name, censoredWords)}</strong><br /><small>{censorText(p.category, censoredWords)}</small></td>
              <td>{[p.brand, p.model, years(p)].filter(Boolean).map((value) => censorText(String(value), censoredWords)).join(" ")}</td>
              <td>{p.condition}</td>
              <td>{p.stock}</td>
              <td>{censorText(p.location, censoredWords)}</td>
              <td className="num">{formatPrice(p.price)}</td>
              <td>
                {p.stock > 0 && (
                  <a className="dz-link" href={whatsappLink(p, censoredWords)} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                )}
              </td>
              {canEditAny && (
                <td className="dz-row-actions">
                  {(admin || p.ownerId === userId) && (
                    <>
                      <button className="dz-link" onClick={() => onEdit(p)}>Editar</button>
                      {admin && <button className="dz-link danger" onClick={() => onDelete(p)}>Eliminar</button>}
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type LoginModalProps = {
  onClose: () => void;
  onSignedIn: (session: AuthSession) => void;
  initialMode: "login" | "signup";
  role: AuthRole;
};

function TermsPrivacyModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dz-overlay dz-terms-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dz-modal dz-terms-modal" role="dialog" aria-modal="true" aria-label="Términos de uso y aviso de privacidad">
        <h2>Términos de uso y aviso de privacidad</h2>
        <p className="dz-login-help">AutoPartes LIN · Versión {TERMS_VERSION}</p>
        <div className="dz-terms-content">
          <section>
            <h3>Uso del catálogo</h3>
            <p>El sitio muestra autopartes usadas ofrecidas por vendedores. Las fotos y los datos de condición, precio, existencias y compatibilidad son informativos; confirma con el vendedor que la pieza corresponde a tu vehículo y sigue disponible antes de acordar la compra.</p>
          </section>
          <section>
            <h3>Contacto y compras</h3>
            <p>El botón de WhatsApp abre una conversación con el teléfono asociado al vendedor y prepara un mensaje sobre el repuesto. La conversación, el pago, la entrega, la garantía y cualquier devolución se acuerdan directamente entre comprador y vendedor; el sitio no procesa pagos ni confirma la compraventa. WhatsApp aplica sus propios términos y aviso de privacidad.</p>
          </section>
          <section>
            <h3>Responsabilidades de quien publica</h3>
            <p>Publica información veraz y mantén actualizado el inventario. Solo ofrece piezas que puedas vender legalmente y usa fotos propias o que tengas permiso para publicar. No publiques artículos robados o ilegales, datos personales de terceros, contenido engañoso ni mensajes abusivos o de spam.</p>
          </section>
          <section>
            <h3>Datos que usamos</h3>
            <p>Para operar la cuenta y el catálogo se usan el correo, el teléfono de WhatsApp, la información de los productos y sus fotos. La autenticación, base de datos y almacenamiento de imágenes utilizan Supabase. No escribas contraseñas ni información financiera o sensible en las publicaciones.</p>
          </section>
          <section>
            <h3>Visibilidad y control del teléfono</h3>
            <p>El teléfono no se muestra como texto en la ficha, pero queda disponible en el enlace de WhatsApp para que los visitantes contacten al vendedor de productos disponibles. Puedes actualizarlo desde “Mi WhatsApp” después de iniciar sesión. El correo y el rol de la cuenta no se muestran al público en el catálogo.</p>
          </section>
          <section>
            <h3>Actualizaciones y solicitudes</h3>
            <p>El inventario puede cambiar sin previo aviso. Para corregir datos de tu perfil o solicitar la revisión o eliminación de información, contacta al administrador de AutoPartes LIN. Estos términos pueden actualizarse; si cambia su versión, se pedirá nuevamente la aceptación al crear una cuenta.</p>
          </section>
        </div>
        <div className="dz-modal-actions">
          <button className="dz-btn dz-btn-primary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

function LoginModal({ onClose, onSignedIn, initialMode, role }: LoginModalProps) {
  const [mode, setMode] = useState<"login" | "signup" | "recover">(initialMode);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmationPending, setConfirmationPending] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!email.trim()) {
      setError("Ingresa tu correo electrónico.");
      return;
    }
    const normalizedPhone = mode === "signup" ? phoneForWhatsApp(phone) : null;
    if (mode === "signup" && !normalizedPhone) {
      setError("Ingresa tu teléfono con código de país, por ejemplo +573001234567.");
      return;
    }
    if (mode === "signup" && !termsAccepted) {
      setError("Debes aceptar los términos de uso y el aviso de privacidad para crear una cuenta.");
      return;
    }
    if (mode !== "recover" && !password) {
      setError("Ingresa tu contraseña.");
      return;
    }
    if (mode === "signup" && password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (mode === "signup" && password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (mode === "recover") {
        await auth.recoverPassword(email.trim());
        setNotice("Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.");
      } else if (mode === "signup") {
        if (!normalizedPhone) throw new Error("Ingresa un teléfono válido con código de país.");
        const session = await auth.signUp(email.trim(), password, normalizedPhone, TERMS_VERSION);
        if (session) {
          onSignedIn(session);
          onClose();
        } else {
          setConfirmationPending(true);
          setNotice("Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.");
        }
      } else {
        onSignedIn(await auth.signIn(email.trim(), password, role));
        onClose();
      }
    } catch (e) {
      const message = errorMessage(e);
      if (mode === "login" && /email not confirmed|email_not_confirmed/i.test(message)) {
        setConfirmationPending(true);
        setNotice("Tu correo aún no está confirmado. Puedes solicitar otro enlace de confirmación.");
      } else {
        setError(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const resendConfirmation = async () => {
    if (!email.trim()) {
      setError("Ingresa el correo electrónico de tu cuenta.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await auth.resendSignupConfirmation(email.trim());
      setNotice("Si la cuenta necesita confirmación, enviaremos un nuevo enlace. Revisa también tu carpeta de spam.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="dz-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
        <div className="dz-modal dz-login-modal" role="dialog" aria-modal="true" aria-label={mode === "recover" ? "Recuperar contraseña" : mode === "signup" ? "Crear cuenta de usuario" : `Acceso de ${role === "admin" ? "administrador" : "usuario"}`}>
          <h2>{mode === "recover" ? "Recuperar contraseña" : mode === "signup" ? "Crear cuenta de usuario" : `Acceso de ${role === "admin" ? "administrador" : "usuario"}`}</h2>
          <p className="dz-login-help">
          {mode === "recover"
            ? "Ingresa el correo de tu cuenta y te enviaremos un enlace para cambiarla."
            : mode === "signup"
            ? "Regístrate para iniciar sesión como usuario."
            : role === "admin"
              ? "Este acceso es exclusivo para cuentas autorizadas como administrador."
              : "Inicia sesión con tu cuenta de usuario."}
        </p>
          <div className="dz-login-form">
            <label>
              Correo electrónico
              <input
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setConfirmationPending(false);
                }}
                autoComplete="email"
              />
            </label>
            {mode === "signup" && (
              <label>
                Teléfono WhatsApp con código de país
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+573001234567"
                  autoComplete="tel"
                  required
                />
                <small className="dz-phone-help">Este número se compartirá con compradores para contactar tus repuestos disponibles por WhatsApp.</small>
              </label>
            )}
            {mode !== "recover" && (
              <label>
                Contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  onKeyDown={(event) => event.key === "Enter" && void submit()}
                />
              </label>
            )}
            {mode === "signup" && (
              <label>
                Confirmar contraseña
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(event) => event.key === "Enter" && void submit()}
                />
              </label>
            )}
          </div>
          {mode === "signup" && (
            <div className="dz-terms-accept">
              <label className="dz-terms-check">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(event) => {
                    setTermsAccepted(event.target.checked);
                    if (event.target.checked) setError("");
                  }}
                />
                <span>Acepto los Términos de uso y el Aviso de privacidad (versión {TERMS_VERSION}).</span>
              </label>
              <button className="dz-auth-mode" type="button" onClick={() => setTermsOpen(true)}>
                Leer términos y aviso de privacidad
              </button>
            </div>
          )}
          {error && <p className="dz-form-error" role="alert">{error}</p>}
          {notice && <p className="dz-form-notice" role="status">{notice}</p>}
          {confirmationPending && mode !== "recover" && (
            <button className="dz-auth-mode" type="button" onClick={() => void resendConfirmation()} disabled={saving}>
              {saving ? "Enviando..." : "Reenviar correo de confirmación"}
            </button>
          )}
          {mode === "login" && (
            <button
              className="dz-auth-mode"
              type="button"
              onClick={() => {
                setMode("recover");
                setError("");
                setNotice("");
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          )}
          {role === "user" && mode !== "recover" && (
            <button
              className="dz-auth-mode"
              type="button"
              onClick={() => {
                setMode(mode === "signup" ? "login" : "signup");
                setError("");
                setNotice("");
              }}
            >
              {mode === "signup" ? "Ya tengo una cuenta" : "Crear una cuenta nueva"}
            </button>
          )}
          {mode === "recover" && (
            <button
              className="dz-auth-mode"
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setNotice("");
              }}
            >
              Volver al inicio de sesión
            </button>
          )}
          <div className="dz-modal-actions">
            <button className="dz-btn dz-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button className="dz-btn dz-btn-primary" onClick={() => void submit()} disabled={saving}>
              {saving
                ? (mode === "recover" ? "Enviando..." : mode === "signup" ? "Creando cuenta..." : "Ingresando...")
                : (mode === "recover" ? "Enviar enlace" : mode === "signup" ? "Crear cuenta" : "Iniciar sesión")}
            </button>
          </div>
        </div>
      </div>
      {termsOpen && <TermsPrivacyModal onClose={() => setTermsOpen(false)} />}
    </>
  );
}

function PhoneModal({
  currentPhone,
  onClose,
  onSaved,
}: {
  currentPhone: string | null | undefined;
  onClose: () => void;
  onSaved: (session: AuthSession) => void;
}) {
  const [phone, setPhone] = useState(currentPhone ? `+${currentPhone}` : "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    const normalizedPhone = phoneForWhatsApp(phone);
    if (!normalizedPhone) {
      setError("Ingresa tu teléfono con código de país, por ejemplo +573001234567.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      onSaved(await auth.updatePhone(normalizedPhone));
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dz-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dz-modal dz-login-modal" role="dialog" aria-modal="true" aria-label="Teléfono de WhatsApp">
        <h2>Teléfono de WhatsApp</h2>
        <p className="dz-login-help">Los compradores podrán abrir un chat contigo desde tus repuestos disponibles.</p>
        <div className="dz-login-form">
          <label>
            Número con código de país
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+573001234567"
              autoComplete="tel"
              required
              autoFocus
            />
          </label>
        </div>
        {error && <p className="dz-form-error" role="alert">{error}</p>}
        <div className="dz-modal-actions">
          <button className="dz-btn dz-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="dz-btn dz-btn-primary" onClick={() => void submit()} disabled={saving}>
            {saving ? "Guardando..." : "Guardar teléfono"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PasswordResetModal({ accessToken, onClose }: { accessToken: string; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await auth.updatePassword(accessToken, password);
      setComplete(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dz-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dz-modal dz-login-modal" role="dialog" aria-modal="true" aria-label="Cambiar contraseña">
        <h2>{complete ? "Contraseña actualizada" : "Elige una nueva contraseña"}</h2>
        {complete ? (
          <>
            <p className="dz-form-notice" role="status">Ya puedes iniciar sesión con tu nueva contraseña.</p>
            <div className="dz-modal-actions">
              <button className="dz-btn dz-btn-primary" onClick={onClose}>Listo</button>
            </div>
          </>
        ) : (
          <>
            <p className="dz-login-help">La nueva contraseña debe tener al menos 6 caracteres.</p>
            <div className="dz-login-form">
              <label>
                Nueva contraseña
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label>
                Confirmar nueva contraseña
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                  onKeyDown={(event) => event.key === "Enter" && void submit()}
                />
              </label>
            </div>
            {error && <p className="dz-form-error" role="alert">{error}</p>}
            <div className="dz-modal-actions">
              <button className="dz-btn dz-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
              <button className="dz-btn dz-btn-primary" onClick={() => void submit()} disabled={saving}>
                {saving ? "Guardando..." : "Cambiar contraseña"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function UserManagementModal({
  currentUserId,
  onClose,
}: {
  currentUserId: string;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void listManagedUsers()
      .then((rows) => {
        if (active) setUsers(rows);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const changeRole = async (user: ManagedUser, role: AuthRole) => {
    if (user.id === currentUserId || user.role === role) return;
    setSavingUserId(user.id);
    setError("");
    try {
      const updated = await updateManagedUserRole(user.id, role);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSavingUserId(null);
    }
  };

  return (
    <div className="dz-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="dz-modal dz-users-modal" role="dialog" aria-modal="true" aria-label="Administrar usuarios">
        <h2>Administrar usuarios</h2>
        <p className="dz-login-help">Cambia el acceso de cada cuenta. Tu propio rol está protegido para evitar perder el acceso de administrador.</p>
        {loading ? (
          <p role="status">Cargando usuarios...</p>
        ) : users.length === 0 ? (
          <p>No hay cuentas registradas.</p>
        ) : (
          <div className="dz-user-list">
            {users.map((user) => {
              const isCurrentUser = user.id === currentUserId;
              return (
                <div className="dz-user-row" key={user.id}>
                  <div className="dz-user-details">
                    <strong>{user.email || "Correo no disponible"}</strong>
                    {isCurrentUser && <small>Tu cuenta</small>}
                  </div>
                  <select
                    value={user.role}
                    aria-label={`Rol de ${user.email || "la cuenta"}`}
                    disabled={isCurrentUser || savingUserId === user.id}
                    onChange={(event) => {
                      const role = event.target.value;
                      if (role === "admin" || role === "user") void changeRole(user, role);
                    }}
                  >
                    <option value="user">Usuario</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              );
            })}
          </div>
        )}
        {error && <p className="dz-form-error" role="alert">{error}</p>}
        <div className="dz-modal-actions">
          <button className="dz-btn dz-btn-ghost" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- App ------------------------------- */
export default function App() {
  const { parts, loading, error, reload, save, remove } = useParts();

  const [query, setQuery] = useState<string>("");
  const [category, setCategory] = useState<string>("Todas");
  const [brand, setBrand] = useState<string>("Todas");
  const [condition, setCondition] = useState<string>("Todos");
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [loginOpen, setLoginOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authRole, setAuthRole] = useState<AuthRole>("user");
  const [editing, setEditing] = useState<Part | "new" | null>(null);
  const [passwordRecoveryToken, setPasswordRecoveryToken] = useState<string | null>(null);
  const [userManagementOpen, setUserManagementOpen] = useState(false);
  const [phoneEditorOpen, setPhoneEditorOpen] = useState(false);
  const admin = session?.user.accountRole === "admin";

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const type = params.get("type");
    const accessToken = params.get("access_token");
    if (type === "recovery" && accessToken) {
      setPasswordRecoveryToken(accessToken);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } else if (type === "signup" && accessToken) {
      const refreshToken = params.get("refresh_token") || "";
      const expiresIn = Number(params.get("expires_in")) || 0;
      const expiresAt = Number(params.get("expires_at")) || (expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : 0);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
      void auth.confirmSignup(accessToken, refreshToken, expiresAt)
        .then((authenticated) => {
          setSession(authenticated);
          setAuthError("");
          setAuthNotice("Correo confirmado. Ya iniciaste sesión.");
        })
        .catch((e: unknown) => setAuthError(errorMessage(e)));
    } else if (type === "recovery") {
      setAuthError(params.get("error_description") || "El enlace para cambiar la contraseña no es válido o ya venció.");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } else {
      const errorDescription = params.get("error_description");
      if (errorDescription) {
        setAuthError(errorDescription);
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }
  }, []);

  useEffect(() => {
    void auth.getSession()
      .then(setSession)
      .catch((e: unknown) => setAuthError(errorMessage(e)))
      .finally(() => setAuthLoading(false));
  }, []);

  const signOut = async () => {
    await auth.signOut();
    setSession(null);
    setAuthError("");
  };

  const handleSignedIn = (nextSession: AuthSession) => {
    setSession(nextSession);
    setAuthError("");
  };

  const handlePhoneSaved = (nextSession: AuthSession) => {
    setSession(nextSession);
    setAuthError("");
    setAuthNotice("Tu teléfono de WhatsApp se guardó correctamente.");
    void reload();
  };

  const openLogin = (role: AuthRole, mode: "login" | "signup") => {
    setAuthRole(role);
    setAuthMode(mode);
    setLoginOpen(true);
  };

  const brands = useMemo<string[]>(
    () => ["Todas", ...Array.from(new Set(parts.map((p) => p.brand).filter(Boolean))).sort()],
    [parts]
  );

  const filtered = useMemo<Part[]>(() => {
    const q = query.trim().toLowerCase();
    return parts.filter((p) => {
      if (category !== "Todas" && p.category !== category) return false;
      if (brand !== "Todas" && p.brand !== brand) return false;
      if (condition !== "Todos" && p.condition !== condition) return false;
      if (onlyAvailable && p.stock <= 0) return false;
      if (!q) return true;
      return [p.name, p.code, p.brand, p.model, p.donorVehicle, p.notes]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [parts, query, category, brand, condition, onlyAvailable]);

  const handleDelete = async (p: Part) => {
    if (!window.confirm('¿Eliminar "' + censorText(p.name, CENSORED_WORDS) + '"? Esta acción no se puede deshacer.')) return;
    try {
      await remove(p.id);
    } catch (e) {
      alert(errorMessage(e));
    }
  };

  const clearFilters = () => {
    setQuery(""); setCategory("Todas"); setBrand("Todas"); setCondition("Todos"); setOnlyAvailable(false);
  };

  return (
    <div className="dz">
      <style>{css}</style>

      <header className="dz-header">
        <div className="dz-container dz-header-inner">
          <div className="dz-brand">
            <span className="dz-logo"><WrenchIcon size={20} /></span>
            <div>
              <strong>{CONFIG.BUSINESS_NAME}</strong>
              <small>Repuestos usados para carros</small>
            </div>
          </div>
          {authLoading ? null : (
            <>
              {session ? (
                <div className="dz-auth-actions dz-desktop-auth">
                  <span className="dz-user">
                    {session.user.email || (admin ? "Administrador" : "Usuario")} · {admin ? "Administrador" : "Usuario"}
                  </span>
                  <button className="dz-login-button" onClick={() => setPhoneEditorOpen(true)}>
                    {session.user.phone ? "Mi WhatsApp" : "Agregar WhatsApp"}
                  </button>
                  {admin && (
                    <button className="dz-login-button" onClick={() => setUserManagementOpen(true)}>
                      Administrar usuarios
                    </button>
                  )}
                  <button className="dz-login-button" onClick={() => void signOut()}>Cerrar sesión</button>
                </div>
              ) : (
                <div className="dz-auth-actions dz-desktop-auth">
                  <button className="dz-login-button" onClick={() => openLogin("admin", "login")}>Acceso administrador</button>
                  <button className="dz-login-button" onClick={() => openLogin("user", "login")}>Acceso usuario</button>
                  <button className="dz-login-button dz-signup-button" onClick={() => openLogin("user", "signup")}>Crear cuenta</button>
                </div>
              )}
              <details className="dz-mobile-auth">
                <summary>{session ? "Cuenta" : "Acceder"}</summary>
                <div className="dz-mobile-auth-menu">
                  {session ? (
                    <>
                      <span className="dz-mobile-user">{session.user.email || (admin ? "Administrador" : "Usuario")}</span>
                      <button
                        className="dz-login-button"
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          setPhoneEditorOpen(true);
                        }}
                      >
                        {session.user.phone ? "Mi WhatsApp" : "Agregar WhatsApp"}
                      </button>
                      {admin && (
                        <button
                          className="dz-login-button"
                          onClick={(event) => {
                            event.currentTarget.closest("details")?.removeAttribute("open");
                            setUserManagementOpen(true);
                          }}
                        >
                          Administrar usuarios
                        </button>
                      )}
                      <button
                        className="dz-login-button"
                        onClick={(event) => {
                          event.currentTarget.closest("details")?.removeAttribute("open");
                          void signOut();
                        }}
                      >
                        Cerrar sesión
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="dz-login-button" onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        openLogin("user", "login");
                      }}>Acceso usuario</button>
                      <button className="dz-login-button" onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        openLogin("admin", "login");
                      }}>Acceso administrador</button>
                      <button className="dz-login-button" onClick={(event) => {
                        event.currentTarget.closest("details")?.removeAttribute("open");
                        openLogin("user", "signup");
                      }}>Crear cuenta</button>
                    </>
                  )}
                </div>
              </details>
            </>
          )}
        </div>
      </header>

      <main className="dz-container dz-main">
        {authError && <div className="dz-alert" role="alert">No pudimos verificar tu sesión. {authError}</div>}
        {authNotice && <div className="dz-form-notice" role="status">{authNotice}</div>}
        <section className="dz-intro">
          <div>
            <h1>Encuentra el repuesto que necesitas</h1>
            <p>Busca por pieza, marca, modelo o código. Todos los repuestos salen de vehículos desarmados en nuestro patio.</p>
          </div>
          {session && (
            <button className="dz-btn dz-btn-primary" onClick={() => setEditing("new")}>
              <PlusIcon /> Agregar repuesto
            </button>
          )}
        </section>

        <div className="dz-toolbar">
          <div className="dz-search">
            <SearchIcon />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar: farola, caja de cambios, Mazda 3, MOT-0012..."
              aria-label="Buscar repuestos"
            />
          </div>

          <div className="dz-filters">
            <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
              <option>Todas</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Marca">
              {brands.map((b) => <option key={b} value={b}>{b === "Todas" ? "Todas las marcas" : b}</option>)}
            </select>
            <select value={condition} onChange={(e) => setCondition(e.target.value)} aria-label="Estado">
              <option>Todos</option>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
            <label className="dz-check">
              <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
              Solo disponibles
            </label>
            <div className="dz-view" role="group" aria-label="Tipo de vista">
              <button className={view === "cards" ? "is-active" : ""} onClick={() => setView("cards")} aria-label="Ver en tarjetas"><GridIcon /></button>
              <button className={view === "table" ? "is-active" : ""} onClick={() => setView("table")} aria-label="Ver en tabla"><ListIcon /></button>
            </div>
          </div>
        </div>

        <p className="dz-count">
          {loading ? "Cargando inventario..." : filtered.length + " de " + parts.length + " repuestos"}
        </p>

        {error && (
          <div className="dz-alert" role="alert">
            No pudimos cargar el inventario. {error}
            <button className="dz-btn dz-btn-ghost" onClick={() => void reload()}>Reintentar</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="dz-empty">
            <p>No hay repuestos que coincidan con tu búsqueda.</p>
            <button className="dz-btn dz-btn-ghost" onClick={clearFilters}>Quitar filtros</button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          view === "cards" ? (
            <section className="dz-grid">
              {filtered.map((p) => (
                <PartCard key={p.id} part={p} admin={admin} canEdit={admin || p.ownerId === session?.user.id} censoredWords={CENSORED_WORDS} onEdit={setEditing} onDelete={(part) => void handleDelete(part)} />
              ))}
            </section>
          ) : (
            <PartsTable parts={filtered} admin={admin} userId={session?.user.id} censoredWords={CENSORED_WORDS} onEdit={setEditing} onDelete={(part) => void handleDelete(part)} />
          )
        )}
      </main>

      {editing && (
        <PartForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}

      {loginOpen && (
        <LoginModal
          onClose={() => setLoginOpen(false)}
          onSignedIn={handleSignedIn}
          initialMode={authMode}
          role={authRole}
        />
      )}
      {phoneEditorOpen && session && (
        <PhoneModal
          currentPhone={session.user.phone}
          onClose={() => setPhoneEditorOpen(false)}
          onSaved={handlePhoneSaved}
        />
      )}
      {passwordRecoveryToken && (
        <PasswordResetModal
          accessToken={passwordRecoveryToken}
          onClose={() => setPasswordRecoveryToken(null)}
        />
      )}
      {admin && userManagementOpen && session && (
        <UserManagementModal
          currentUserId={session.user.id}
          onClose={() => setUserManagementOpen(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------ Estilos ------------------------------ */
const css = `
.dz {
  --ink: #23272d; --graphite: #2c3138; --steel: #46606f; --steel-dark: #384e5b;
  --bg: #f2f1ee; --card: #ffffff; --line: #dedbd5; --muted: #646a72;
  --ok: #3b6f55; --warn: #8f5f1c; --bad: #983a3a;
  min-height: 100vh; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
  line-height: 1.45;
}
.dz *, .dz *::before, .dz *::after { box-sizing: border-box; }
.dz button, .dz input, .dz select, .dz textarea { font-family: inherit; font-size: 15px; }
.dz button { cursor: pointer; }
.dz :focus-visible { outline: 3px solid #7aa2b8; outline-offset: 2px; }
.dz-container { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 16px; }

/* Header */
.dz-header { background: var(--graphite); color: #f4f3f0; position: sticky; top: 0; z-index: 20; }
.dz-header-inner { display: flex; align-items: center; justify-content: space-between; height: 64px; gap: 12px; }
.dz-brand { display: flex; align-items: center; gap: 12px; }
.dz-brand strong { display: block; font-size: 18px; letter-spacing: .2px; }
.dz-brand small { display: block; font-size: 12px; color: #b9bdc2; }
.dz-logo { width: 38px; height: 38px; border-radius: 8px; background: #3d444c; display: grid; place-items: center; }
.dz-auth-actions { display: flex; align-items: center; gap: 12px; }
.dz-user { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; color: #d8dadd; }
.dz-login-button { min-height: 38px; border: 1px solid #69717a; border-radius: 8px; background: #38404a; color: #fff; padding: 0 12px; font-weight: 600; }
.dz-login-button:hover { background: #46505b; }
.dz-mobile-auth { display: none; position: relative; }
.dz-mobile-auth summary { display: grid; place-items: center; min-height: 44px; padding: 0 12px; border: 1px solid #69717a; border-radius: 8px; background: #38404a; color: #fff; font-size: 14px; font-weight: 600; list-style: none; cursor: pointer; }
.dz-mobile-auth summary::-webkit-details-marker { display: none; }
.dz-mobile-auth-menu { position: absolute; top: calc(100% + 8px); right: 0; z-index: 21; display: grid; gap: 8px; width: min(240px, calc(100vw - 24px)); padding: 10px; border: 1px solid #69717a; border-radius: 10px; background: var(--graphite); box-shadow: 0 10px 24px rgba(0,0,0,.24); }
.dz-mobile-auth-menu .dz-login-button { width: 100%; min-height: 44px; text-align: left; }
.dz-mobile-user { overflow-wrap: anywhere; color: #d8dadd; font-size: 12px; }
.dz-login-modal { max-width: 420px; }
.dz-users-modal { max-width: 620px; }
.dz-terms-modal { display: flex; flex-direction: column; max-width: 760px; max-height: calc(100vh - 48px); }
.dz-terms-overlay { z-index: 51; }
.dz-terms-content { display: grid; gap: 14px; overflow-y: auto; padding: 2px 4px 2px 0; }
.dz-terms-content h3 { margin: 0 0 4px; font-size: 15px; }
.dz-terms-content p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
.dz-terms-accept { display: grid; gap: 2px; margin-top: 14px; }
.dz-terms-check { display: flex; align-items: flex-start; gap: 9px; font-size: 13px; line-height: 1.45; cursor: pointer; }
.dz-terms-check input { flex: 0 0 auto; width: 17px; height: 17px; margin: 2px 0 0; accent-color: var(--steel); }
.dz-user-list { display: grid; gap: 8px; max-height: min(60vh, 480px); overflow-y: auto; }
.dz-user-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; }
.dz-user-details { min-width: 0; display: grid; gap: 3px; }
.dz-user-details strong { overflow: hidden; text-overflow: ellipsis; }
.dz-user-details small { color: var(--muted); font-size: 12px; }
.dz-user-row select { min-width: 145px; border: 1px solid #c9c6bf; border-radius: 8px; padding: 8px 10px; background: #fff; }
.dz-user-row select:disabled { opacity: .7; }
.dz-login-help { margin: -8px 0 16px; color: var(--muted); font-size: 14px; }
.dz-login-form { display: grid; gap: 12px; }
.dz-login-form label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 600; }
.dz-login-form input { border: 1px solid #c9c6bf; border-radius: 8px; padding: 10px; font-weight: 400; }
.dz-phone-help { color: var(--muted); font-size: 12px; font-weight: 400; }
.dz-signup-button { background: transparent; border-color: #b1b7bd; }
.dz-auth-mode { border: 0; background: transparent; color: var(--steel); padding: 10px 0 0; font-weight: 600; }
.dz-form-notice { color: var(--ok); margin: 12px 0 0; font-size: 14px; }

/* Intro */
.dz-main { padding-top: 28px; padding-bottom: 56px; }
.dz-intro { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 22px; flex-wrap: wrap; }
.dz-intro h1 { margin: 0 0 4px; font-size: 28px; line-height: 1.2; }
.dz-intro p { margin: 0; color: var(--muted); max-width: 60ch; }

/* Botones */
.dz-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  height: 40px; padding: 0 16px; border-radius: 8px; border: 1px solid transparent;
  font-weight: 600; text-decoration: none; transition: background .15s, border-color .15s;
}
.dz-btn:disabled { opacity: .6; cursor: default; }
.dz-block { width: 100%; }
.dz-btn-primary { background: var(--steel); color: #fff; }
.dz-btn-primary:hover:not(:disabled) { background: var(--steel-dark); }
.dz-btn-ghost { background: #fff; color: var(--ink); border-color: #c9c6bf; }
.dz-btn-ghost:hover:not(:disabled) { border-color: var(--steel); }
.dz-btn-danger { background: #fff; color: var(--bad); border-color: #d8b6b6; }
.dz-btn-danger:hover { background: #f8ecec; }
.dz-btn.is-disabled { background: #cfcdc8; color: #6f7378; pointer-events: none; }

/* Barra de búsqueda y filtros */
.dz-toolbar { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; display: grid; gap: 12px; }
.dz-search { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px; background: #f4f3f0; border-radius: 8px; color: var(--muted); }
.dz-search input { flex: 1; border: 0; background: transparent; height: 100%; color: var(--ink); }
.dz-search input:focus { outline: none; }
.dz-search:focus-within { box-shadow: 0 0 0 2px #7aa2b8; }
.dz-filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
.dz-filters select { height: 38px; padding: 0 10px; border: 1px solid #c9c6bf; border-radius: 8px; background: #fff; color: var(--ink); }
.dz-check { display: flex; align-items: center; gap: 6px; font-size: 14px; margin-left: 4px; }
.dz-view { margin-left: auto; display: flex; border: 1px solid #c9c6bf; border-radius: 8px; overflow: hidden; }
.dz-view button { width: 40px; height: 36px; border: 0; background: #fff; color: var(--muted); display: grid; place-items: center; }
.dz-view button.is-active { background: var(--graphite); color: #fff; }
.dz-count { margin: 16px 2px 12px; font-size: 14px; color: var(--muted); }

/* Tarjetas */
.dz-grid { display: grid; gap: 18px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 1024px) { .dz-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 760px)  { .dz-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dz-intro h1 { font-size: 24px; } }
@media (max-width: 600px)  { .dz-header-inner { height: auto; min-height: 64px; flex-wrap: wrap; padding-top: 10px; padding-bottom: 10px; } .dz-auth-actions { width: 100%; justify-content: flex-end; flex-wrap: wrap; gap: 8px; } }
@media (max-width: 480px)  { .dz-grid { grid-template-columns: 1fr; } .dz-view { margin-left: 0; } }
@media (max-width: 480px)  { .dz-user-row { align-items: stretch; flex-direction: column; } .dz-user-row select { width: 100%; } }

.dz-card { display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.dz-card-media { position: relative; aspect-ratio: 4 / 3; background: #e7e5e0; }
.dz-card-media img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dz-noimg { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #8a8e94; font-size: 13px; }
.dz-stock { position: absolute; top: 10px; left: 10px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #fff; border: 1px solid var(--line); }
.dz-stock.is-ok { color: var(--ok); }
.dz-stock.is-low { color: var(--warn); }
.dz-stock.is-out { color: var(--bad); }
.dz-card-body { display: flex; flex-direction: column; flex: 1; padding: 14px; gap: 6px; }
.dz-code { margin: 0; font-size: 12px; color: var(--muted); }
.dz-card h3 { margin: 0; font-size: 17px; line-height: 1.25; }
.dz-fit, .dz-loc { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--muted); }
.dz-card-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin: auto 0 8px; padding-top: 10px; }
.dz-price { font-size: 21px; font-weight: 700; }
.dz-cond { font-size: 12px; background: #ece9e3; border-radius: 999px; padding: 3px 10px; color: #4a4f56; white-space: nowrap; }
.dz-admin-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.dz-admin-actions.is-single { grid-template-columns: 1fr; }

/* Tabla */
.dz-table-wrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
.dz-table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 760px; }
.dz-table th { text-align: left; padding: 10px 12px; background: #ebe9e4; font-weight: 600; font-size: 13px; }
.dz-table td { padding: 10px 12px; border-top: 1px solid var(--line); vertical-align: top; }
.dz-table small { color: var(--muted); }
.dz-table .num { text-align: right; white-space: nowrap; }
.dz-row-actions { white-space: nowrap; }
.dz-link { background: none; border: 0; color: var(--steel); font-weight: 600; padding: 2px 6px; }
.dz-link.danger { color: var(--bad); }

/* Estados */
.dz-alert { display: flex; align-items: center; justify-content: space-between; gap: 12px; background: #f6e9e9; color: #6f2a2a; border: 1px solid #e0c2c2; padding: 12px 14px; border-radius: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.dz-empty { text-align: center; padding: 48px 0; color: var(--muted); }

/* Modal */
.dz-overlay { position: fixed; inset: 0; background: rgba(28,31,35,.55); z-index: 50; display: flex; align-items: flex-start; justify-content: center; padding: 24px 12px; overflow-y: auto; }
.dz-modal { background: #fff; color: var(--ink); border-radius: 12px; width: 100%; max-width: 640px; padding: 22px; }
.dz-modal h2 { margin: 0 0 16px; font-size: 20px; }
.dz-form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.dz-form label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: #3b4047; }
.dz-form .span2 { grid-column: span 2; }
.dz-form input, .dz-form select, .dz-form textarea { border: 1px solid #c9c6bf; border-radius: 8px; padding: 9px 10px; font-weight: 400; color: var(--ink); background: #fff; }
.dz-form input[type="file"] { width: 100%; }
.dz-image-help { color: var(--muted); font-size: 12px; font-weight: 400; }
.dz-image-preview { width: 100%; max-height: 220px; object-fit: contain; border-radius: 8px; background: #f2f1ee; }
.dz-form-error { color: var(--bad); margin: 12px 0 0; font-size: 14px; }
.dz-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
@media (max-width: 520px) { .dz-form { grid-template-columns: 1fr; } .dz-form .span2 { grid-column: span 1; } }

@media (max-width: 600px) {
  .dz-container { padding-left: 12px; padding-right: 12px; }
  .dz-main { padding-top: 18px; padding-bottom: 40px; }
  .dz-header-inner { align-items: center; height: 64px; min-height: 64px; flex-wrap: nowrap; gap: 10px; padding-top: 0; padding-bottom: 0; }
  .dz-brand { width: auto; min-width: 0; flex: 1; }
  .dz-brand strong { font-size: 16px; }
  .dz-brand small { font-size: 11px; white-space: nowrap; }
  .dz-desktop-auth { display: none; }
  .dz-mobile-auth { display: block; flex: 0 0 auto; }
  .dz-auth-actions { gap: 8px; }
  .dz-login-button { min-width: 0; min-height: 44px; padding: 6px 8px; font-size: 13px; }
  .dz-intro { align-items: stretch; gap: 12px; margin-bottom: 16px; }
  .dz-intro h1 { font-size: 23px; }
  .dz-intro p { font-size: 14px; }
  .dz-intro > .dz-btn { width: 100%; min-height: 44px; }
  .dz-toolbar { padding: 10px; gap: 10px; }
  .dz-search { height: 46px; }
  .dz-search input { min-width: 0; font-size: 16px; }
  .dz-filters { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .dz-filters select { width: 100%; min-width: 0; height: 44px; font-size: 14px; }
  .dz-check { grid-column: 1 / -1; min-height: 44px; margin: 0; padding: 0 6px; }
  .dz-view { grid-column: 1 / -1; width: 100%; margin: 0; }
  .dz-view button { flex: 1; height: 44px; }
  .dz-count { margin: 12px 2px; }
  .dz-grid { grid-template-columns: 1fr; gap: 12px; }
  .dz-card { display: grid; grid-template-columns: minmax(105px, 36%) minmax(0, 1fr); border-radius: 12px; }
  .dz-card-media { min-height: 156px; aspect-ratio: auto; }
  .dz-card-body { min-width: 0; padding: 11px; gap: 5px; }
  .dz-card .dz-btn { min-height: 44px; height: auto; padding-top: 8px; padding-bottom: 8px; }
  .dz-card h3, .dz-code, .dz-fit, .dz-loc { overflow-wrap: anywhere; }
  .dz-card h3 { font-size: 16px; }
  .dz-code { font-size: 11px; }
  .dz-fit, .dz-loc { font-size: 12px; }
  .dz-card-row { align-items: flex-start; flex-direction: column; gap: 4px; padding-top: 6px; }
  .dz-price { font-size: 18px; }
  .dz-cond { white-space: normal; }
  .dz-admin-actions { grid-template-columns: 1fr; }
  .dz-admin-actions .dz-btn { min-height: 42px; padding-left: 8px; padding-right: 8px; }
  .dz-overlay { padding: 8px; }
  .dz-modal { padding: 16px; }
  .dz-terms-modal { max-height: calc(100vh - 16px); }
  .dz-modal-actions { flex-direction: column-reverse; }
  .dz-modal-actions .dz-btn { width: 100%; min-height: 44px; }
  .dz-form input, .dz-form select, .dz-form textarea, .dz-login-form input { font-size: 16px; }
  .dz-table-wrap { max-width: 100%; overscroll-behavior-x: contain; }
}

@media (max-width: 360px) {
  .dz-card { grid-template-columns: minmax(92px, 32%) minmax(0, 1fr); }
  .dz-card-body { padding: 9px; }
}

@media (prefers-reduced-motion: reduce) { .dz * { transition: none !important; } }
`;