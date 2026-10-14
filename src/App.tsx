import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";

/* =========================================================
   CATÁLOGO DE REPUESTOS (DESGUACE) – versión TypeScript
   Reemplaza TODO el contenido de src/App.tsx por este archivo.

   CÓMO CONECTAR TU BASE DE DATOS (MySQL)
   1. Cambia CONFIG.USE_MOCK a false.
   2. Pon la URL de tu backend en CONFIG.API_URL.
   3. Tu backend debe responder:
        GET    /parts        -> lista de repuestos
        POST   /parts        -> crea uno y devuelve el creado
        PUT    /parts/:id    -> actualiza y devuelve el actualizado
        DELETE /parts/:id    -> elimina
   ========================================================= */

const CONFIG = {
  BUSINESS_NAME: "Mi Desguace",
  USE_MOCK: true,
  API_URL: "http://localhost:3000/api",
  WHATSAPP: "573000000000", // código de país + número, sin + ni espacios
};

/* ------------------------------ Tipos ------------------------------ */
type Condition = "Excelente" | "Bueno" | "Regular" | "Para reparar";

type Part = {
  id: number;
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
type PartInput = Omit<Part, "id"> & { id?: number };

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

/* ------------------------ Datos de ejemplo ------------------------ */
const MOCK_PARTS: Part[] = [
  { id: 1, code: "MOT-0012", name: "Motor completo 1.6L", category: "Motor", brand: "Chevrolet", model: "Aveo", yearFrom: 2012, yearTo: 2016, condition: "Bueno", price: 3800000, stock: 1, location: "Bodega A - Estante 2", donorVehicle: "Aveo 2014 (siniestro frontal)", image: "", notes: "Probado, 85.000 km." },
  { id: 2, code: "TRN-0045", name: "Caja de cambios manual", category: "Transmisión", brand: "Renault", model: "Logan", yearFrom: 2010, yearTo: 2015, condition: "Bueno", price: 1450000, stock: 1, location: "Bodega A - Estante 4", donorVehicle: "Logan 2013", image: "", notes: "" },
  { id: 3, code: "LUZ-0108", name: "Farola delantera derecha", category: "Luces", brand: "Mazda", model: "3", yearFrom: 2014, yearTo: 2018, condition: "Excelente", price: 320000, stock: 2, location: "Bodega B - Caja 7", donorVehicle: "Mazda 3 2016", image: "", notes: "Sin rayones ni humedad." },
  { id: 4, code: "SUS-0077", name: "Amortiguador delantero", category: "Suspensión", brand: "Kia", model: "Picanto", yearFrom: 2012, yearTo: 2017, condition: "Regular", price: 140000, stock: 4, location: "Bodega B - Estante 1", donorVehicle: "Picanto 2015", image: "", notes: "" },
  { id: 5, code: "CAR-0201", name: "Puerta delantera izquierda", category: "Carrocería", brand: "Toyota", model: "Corolla", yearFrom: 2009, yearTo: 2013, condition: "Bueno", price: 480000, stock: 1, location: "Patio 1", donorVehicle: "Corolla 2011", image: "", notes: "Color gris plata." },
  { id: 6, code: "ELE-0033", name: "Alternador 90A", category: "Eléctrico", brand: "Hyundai", model: "i10", yearFrom: 2011, yearTo: 2016, condition: "Excelente", price: 260000, stock: 0, location: "Bodega B - Caja 2", donorVehicle: "i10 2013", image: "", notes: "Vendido, se espera otro." },
  { id: 7, code: "FRE-0090", name: "Disco de freno delantero (par)", category: "Frenos", brand: "Chevrolet", model: "Spark", yearFrom: 2011, yearTo: 2017, condition: "Bueno", price: 120000, stock: 3, location: "Bodega A - Estante 6", donorVehicle: "Spark GT 2014", image: "", notes: "" },
  { id: 8, code: "INT-0054", name: "Panel de instrumentos", category: "Interior", brand: "Nissan", model: "Versa", yearFrom: 2012, yearTo: 2019, condition: "Bueno", price: 380000, stock: 1, location: "Bodega B - Caja 5", donorVehicle: "Versa 2015", image: "", notes: "" },
];

/* ---------------------- Capa de datos (API) ----------------------
   Todo el acceso a la base de datos pasa por aquí. */

// Si tus columnas tienen otros nombres, ajusta estas dos funciones.
const fromDb = (row: Part): Part => row;
const toDb = (part: PartInput): PartInput => part;

let mockDb: Part[] = [...MOCK_PARTS];

function wait<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(CONFIG.API_URL + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error("Error " + res.status + " al comunicarse con el servidor");
  return (res.status === 204 ? null : await res.json()) as T;
}

const api = {
  async list(): Promise<Part[]> {
    if (CONFIG.USE_MOCK) return wait([...mockDb]);
    const rows = await request<Part[]>("/parts");
    return rows.map(fromDb);
  },
  async create(part: PartInput): Promise<Part> {
    if (CONFIG.USE_MOCK) {
      const created: Part = { ...part, id: Date.now() };
      mockDb = [created, ...mockDb];
      return wait(created);
    }
    return fromDb(await request<Part>("/parts", { method: "POST", body: JSON.stringify(toDb(part)) }));
  },
  async update(part: Part): Promise<Part> {
    if (CONFIG.USE_MOCK) {
      mockDb = mockDb.map((p) => (p.id === part.id ? part : p));
      return wait(part);
    }
    return fromDb(await request<Part>("/parts/" + part.id, { method: "PUT", body: JSON.stringify(toDb(part)) }));
  },
  async remove(id: number): Promise<void> {
    if (CONFIG.USE_MOCK) {
      mockDb = mockDb.filter((p) => p.id !== id);
      await wait(null);
      return;
    }
    await request<null>("/parts/" + id, { method: "DELETE" });
  },
};

/* --------------------------- Utilidades --------------------------- */
const formatPrice = (n: number): string => "$" + Number(n || 0).toLocaleString("es-CO");

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
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

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
    try {
      await onSave(part);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

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
          <label>Precio (COP) *
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
          <label className="span2">URL de la foto
            <input value={form.image} onChange={set("image")} placeholder="https://..." />
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

function whatsappLink(p: Part): string {
  const text =
    "Hola, me interesa este repuesto: " + p.name + " (" + (p.code || "sin código") + ") " +
    [p.brand, p.model, years(p)].filter(Boolean).join(" ") + ". ¿Sigue disponible?";
  return "https://wa.me/" + CONFIG.WHATSAPP + "?text=" + encodeURIComponent(text);
}

function PartImage({ part }: { part: Part }) {
  const [failed, setFailed] = useState<boolean>(false);
  if (part.image && !failed) {
    return <img src={part.image} alt={part.name} loading="lazy" onError={() => setFailed(true)} />;
  }
  return <div className="dz-noimg"><WrenchIcon size={40} /><span>Sin foto</span></div>;
}

type CardProps = {
  part: Part;
  admin: boolean;
  onEdit: (part: Part) => void;
  onDelete: (part: Part) => void;
};

function PartCard({ part, admin, onEdit, onDelete }: CardProps) {
  const s = stockInfo(part);
  return (
    <article className="dz-card">
      <div className="dz-card-media">
        <PartImage part={part} />
        <span className={"dz-stock " + s.cls}>{s.label}</span>
      </div>
      <div className="dz-card-body">
        <p className="dz-code">{part.code || "Sin código"} · {part.category}</p>
        <h3>{part.name}</h3>
        <p className="dz-fit"><CarIcon />{[part.brand, part.model, years(part)].filter(Boolean).join(" ") || "Compatibilidad sin especificar"}</p>
        {part.location && <p className="dz-loc"><PinIcon />{part.location}</p>}

        <div className="dz-card-row">
          <span className="dz-price">{formatPrice(part.price)}</span>
          <span className="dz-cond">{part.condition}</span>
        </div>

        {admin ? (
          <div className="dz-admin-actions">
            <button className="dz-btn dz-btn-ghost" onClick={() => onEdit(part)}>Editar</button>
            <button className="dz-btn dz-btn-danger" onClick={() => onDelete(part)}>Eliminar</button>
          </div>
        ) : (
          <a
            className={"dz-btn dz-btn-primary dz-block" + (part.stock <= 0 ? " is-disabled" : "")}
            href={part.stock <= 0 ? undefined : whatsappLink(part)}
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
  onEdit: (part: Part) => void;
  onDelete: (part: Part) => void;
};

function PartsTable({ parts, admin, onEdit, onDelete }: TableProps) {
  return (
    <div className="dz-table-wrap">
      <table className="dz-table">
        <thead>
          <tr>
            <th>Código</th><th>Repuesto</th><th>Vehículo</th><th>Estado</th>
            <th>Stock</th><th>Ubicación</th><th className="num">Precio</th>
            {admin && <th>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => (
            <tr key={p.id}>
              <td>{p.code}</td>
              <td><strong>{p.name}</strong><br /><small>{p.category}</small></td>
              <td>{[p.brand, p.model, years(p)].filter(Boolean).join(" ")}</td>
              <td>{p.condition}</td>
              <td>{p.stock}</td>
              <td>{p.location}</td>
              <td className="num">{formatPrice(p.price)}</td>
              {admin && (
                <td className="dz-row-actions">
                  <button className="dz-link" onClick={() => onEdit(p)}>Editar</button>
                  <button className="dz-link danger" onClick={() => onDelete(p)}>Eliminar</button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
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
  const [admin, setAdmin] = useState<boolean>(false); // En producción, actívalo con un inicio de sesión real
  const [editing, setEditing] = useState<Part | "new" | null>(null);

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
    if (!window.confirm('¿Eliminar "' + p.name + '"? Esta acción no se puede deshacer.')) return;
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
          <label className="dz-switch">
            <input type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
            <span>Modo administrador</span>
          </label>
        </div>
      </header>

      <main className="dz-container dz-main">
        <section className="dz-intro">
          <div>
            <h1>Encuentra el repuesto que necesitas</h1>
            <p>Busca por pieza, marca, modelo o código. Todos los repuestos salen de vehículos desarmados en nuestro patio.</p>
          </div>
          {admin && (
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

        {!loading && filtered.length > 0 && (view === "cards" ? (
          <section className="dz-grid">
            {filtered.map((p) => (
              <PartCard key={p.id} part={p} admin={admin} onEdit={setEditing} onDelete={(part) => void handleDelete(part)} />
            ))}
          </section>
        ) : (
          <PartsTable parts={filtered} admin={admin} onEdit={setEditing} onDelete={(part) => void handleDelete(part)} />
        ))}
      </main>

      {editing && (
        <PartForm
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={save}
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
.dz-switch { display: flex; align-items: center; gap: 8px; font-size: 14px; color: #d8dadd; cursor: pointer; }

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
@media (max-width: 480px)  { .dz-grid { grid-template-columns: 1fr; } .dz-view { margin-left: 0; } }

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
.dz-form-error { color: var(--bad); margin: 12px 0 0; font-size: 14px; }
.dz-modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 18px; }
@media (max-width: 520px) { .dz-form { grid-template-columns: 1fr; } .dz-form .span2 { grid-column: span 1; } }

@media (prefers-reduced-motion: reduce) { .dz * { transition: none !important; } }
`;