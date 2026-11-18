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

export type AuthUser = {
  id: string;
  email?: string;
  accountRole?: AuthRole;
};

export type AuthRole = "admin" | "user";

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: AuthUser;
};

const AUTH_STORAGE_KEY = "yonkes_supabase_auth";

function readStoredSession(): AuthSession | null {
  try {
    const value = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return value ? JSON.parse(value) as AuthSession : null;
  } catch {
    return null;
  }
}

function storeSession(session: AuthSession | null) {
  if (session) {
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } else {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

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

async function loadProfile(session: AuthSession): Promise<AuthSession> {
  const user = await authRequest<AuthUser>("/auth/v1/user", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const profiles = await authRequest<Array<{ role: AuthRole }>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  const role = profiles?.[0]?.role;
  if (role !== "admin" && role !== "user") {
    throw new Error("No se encontró un rol válido para esta cuenta. Verifica la configuración de perfiles en Supabase.");
  }
  return { ...session, user: { ...user, accountRole: role } };
}

export async function supabaseRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T | null> {
  const { url, anonKey } = getSupabaseConfig();
  const headers = new Headers(options.headers);
  headers.set("apikey", anonKey);
  const session = readStoredSession();
  headers.set("Authorization", `Bearer ${session?.access_token || anonKey}`);
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

async function authRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { url, anonKey } = getSupabaseConfig();
  const headers = new Headers(options.headers);
  headers.set("apikey", anonKey);
  if (!headers.has("Authorization")) headers.set("Authorization", `Bearer ${anonKey}`);
  headers.set("Accept", "application/json");
  if (options.body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${url}${path}`, { ...options, headers });
  const body = await response.text();
  if (!response.ok) {
    let message = body || `HTTP ${response.status}`;
    try {
      const error = JSON.parse(body) as { message?: string; msg?: string; error_description?: string };
      message = error.message || error.msg || error.error_description || message;
    } catch {
      // Keep the response text when Supabase doesn't return JSON.
    }
    throw new Error(`Supabase: ${message}`);
  }
  return body ? JSON.parse(body) as T : null as T;
}

export const auth = {
  async signUp(email: string, password: string): Promise<AuthSession | null> {
    const result = await authRequest<AuthSession | { user: AuthUser; session: AuthSession | null }>(
      "/auth/v1/signup",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );

    const session = "access_token" in result ? result : result.session;
    if (!session) return null;
    const authenticated = await loadProfile(session);
    if (authenticated.user.accountRole !== "user") {
      storeSession(null);
      throw new Error("Las cuentas nuevas solo pueden registrarse como usuario.");
    }
    storeSession(authenticated);
    return authenticated;
  },

  async signIn(email: string, password: string, expectedRole: AuthRole): Promise<AuthSession> {
    const session = await authRequest<AuthSession>(
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    try {
      const authenticated = await loadProfile(session);
      if (authenticated.user.accountRole !== expectedRole) {
        throw new Error(
          expectedRole === "admin"
            ? "Esta cuenta no tiene acceso de administrador."
            : "Esta cuenta es de administrador. Usa el acceso de administrador.",
        );
      }
      storeSession(authenticated);
      return authenticated;
    } catch (error) {
      storeSession(null);
      throw error;
    }
  },

  async getSession(): Promise<AuthSession | null> {
    const session = readStoredSession();
    if (!session) return null;

    try {
      const authenticated = await loadProfile(session);
      storeSession(authenticated);
      return authenticated;
    } catch (error) {
      storeSession(null);
      throw error;
    }
  },

  async signOut(): Promise<void> {
    const session = readStoredSession();
    if (session) {
      try {
        await authRequest("/auth/v1/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
      } catch {
        // The local session is cleared even if Supabase cannot be reached.
      }
    }
    storeSession(null);
  },
};
