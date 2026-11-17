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
};

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

    if ("session" in result && result.session) {
      storeSession(result.session);
      return result.session;
    }

    if ("access_token" in result && result.access_token) {
      storeSession(result);
      return result;
    }

    return null;
  },

  async signIn(email: string, password: string): Promise<AuthSession> {
    const session = await authRequest<AuthSession>(
      "/auth/v1/token?grant_type=password",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
    storeSession(session);
    return session;
  },

  async getSession(): Promise<AuthSession | null> {
    const session = readStoredSession();
    if (!session) return null;

    try {
      const user = await authRequest<AuthUser>("/auth/v1/user", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      return { ...session, user };
    } catch {
      storeSession(null);
      return null;
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
