export type PartRow = {
  id: number;
  code: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  year_from: number | null;
  year_to: number | null;
  condition: "Excelente" | "Bueno" | "Regular" | "Para reparar";
  price: number;
  stock: number;
  location: string;
  donor_vehicle: string;
  image: string;
  notes: string;
};

function getSupabaseConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Falta la configuración de Supabase. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.",
    );
  }

  return { url: url.replace(/\/$/, ""), anonKey };
}

export async function supabaseRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const { url, anonKey } = getSupabaseConfig();
  const headers = new Headers(options.headers);
  headers.set("apikey", anonKey);
  headers.set("Authorization", `Bearer ${anonKey}`);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers });
  const body = await response.text();

  if (!response.ok) {
    let message = body || `HTTP ${response.status}`;
    try {
      const error = JSON.parse(body) as { message?: string; details?: string };
      message = error.message || error.details || message;
    } catch {
      // Keep the response text when Supabase doesn't return JSON.
    }
    throw new Error(`Supabase: ${message}`);
  }

  if (response.status === 204 || !body) return null;
  return JSON.parse(body) as T;
}
