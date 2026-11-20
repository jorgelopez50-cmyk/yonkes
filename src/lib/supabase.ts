export type PartRow = {
  id: number;
  owner_id: string | null;
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
  phone?: string | null;
  accountRole?: AuthRole;
};

export type AuthRole = "admin" | "user";

export type ManagedUser = {
  id: string;
  email: string | null;
  role: AuthRole;
};

export type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: AuthUser;
};

const AUTH_STORAGE_KEY = "yonkes_supabase_auth";
const PART_IMAGES_BUCKET = "part-images";
const MAX_PART_IMAGE_SIZE = 5 * 1024 * 1024;
const PART_IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

function getStorageErrorMessage(body: string, status: number): string {
  let message = body || `HTTP ${status}`;
  try {
    const error = JSON.parse(body) as { message?: string; error?: string };
    message = error.message || error.error || message;
  } catch {
    // Keep the response text when Supabase doesn't return JSON.
  }
  if (/bucket not found/i.test(message)) {
    return `No existe el bucket "${PART_IMAGES_BUCKET}". En el mismo proyecto de Supabase que usa la app, ejecuta el bloque de Storage de supabase/schema.sql. Si ya lo ejecutaste, verifica que VITE_SUPABASE_URL apunte a ese proyecto.`;
  }
  return `Supabase Storage: ${message}`;
}

export async function uploadPartImage(file: File): Promise<{ url: string; path: string }> {
  const extension = PART_IMAGE_EXTENSIONS[file.type];
  if (!extension) throw new Error("Elige una imagen JPG, PNG o WebP.");
  if (file.size > MAX_PART_IMAGE_SIZE) throw new Error("La foto no puede pesar más de 5 MB.");

  const session = readStoredSession();
  if (!session) throw new Error("Inicia sesión para subir fotos de repuestos.");

  const { url, anonKey } = getSupabaseConfig();
  const path = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
  const response = await fetch(
    `${url}/storage/v1/object/${PART_IMAGES_BUCKET}/${path}`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: file,
    },
  );
  if (!response.ok) {
    throw new Error(getStorageErrorMessage(await response.text(), response.status));
  }
  return {
    url: `${url}/storage/v1/object/public/${PART_IMAGES_BUCKET}/${path}`,
    path,
  };
}

export async function removePartImage(path: string): Promise<void> {
  const session = readStoredSession();
  if (!session) throw new Error("Inicia sesión para administrar las fotos de repuestos.");

  const { url, anonKey } = getSupabaseConfig();
  const response = await fetch(`${url}/storage/v1/object/${PART_IMAGES_BUCKET}`, {
    method: "DELETE",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefixes: [path] }),
  });
  if (!response.ok) {
    throw new Error(getStorageErrorMessage(await response.text(), response.status));
  }
}

async function loadProfile(session: AuthSession): Promise<AuthSession> {
  const user = await authRequest<AuthUser>("/auth/v1/user", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const profiles = await authRequest<Array<{ role: AuthRole; phone: string | null }>>(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role,phone`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  );
  const profile = profiles?.[0];
  const role = profile?.role;
  if (role !== "admin" && role !== "user") {
    throw new Error("No se encontró un rol válido para esta cuenta. Verifica la configuración de perfiles en Supabase.");
  }
  return { ...session, user: { ...user, phone: profile?.phone, accountRole: role } };
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

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const rows = await supabaseRequest<ManagedUser[]>(
    "profiles?select=id,email,role&order=email.asc",
  );
  if (!rows) throw new Error("Supabase no devolvió la lista de usuarios.");
  return rows;
}

export async function updateManagedUserRole(
  userId: string,
  role: AuthRole,
): Promise<ManagedUser> {
  const rows = await supabaseRequest<ManagedUser[]>(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,role`,
    {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ role }),
    },
  );
  if (!rows?.[0]) {
    throw new Error("Supabase no encontró al usuario o no tienes permiso para cambiar su rol.");
  }
  return rows[0];
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
  async confirmSignup(
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
  ): Promise<AuthSession> {
    if (!accessToken || !refreshToken) {
      throw new Error("El enlace de confirmación está incompleto. Solicita uno nuevo.");
    }
    const authenticated = await loadProfile({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt || undefined,
      user: { id: "" },
    });
    storeSession(authenticated);
    return authenticated;
  },

  async recoverPassword(email: string): Promise<void> {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    await authRequest("/auth/v1/recover?redirect_to=" + encodeURIComponent(redirectTo), {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  },

  async resendSignupConfirmation(email: string): Promise<void> {
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    await authRequest("/auth/v1/resend?redirect_to=" + encodeURIComponent(redirectTo), {
      method: "POST",
      body: JSON.stringify({ type: "signup", email }),
    });
  },

  async updatePassword(accessToken: string, password: string): Promise<void> {
    await authRequest("/auth/v1/user", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ password }),
    });
  },

  async signUp(
    email: string,
    password: string,
    phone: string,
    termsVersion: string,
  ): Promise<AuthSession | null> {
    const result = await authRequest<AuthSession | { user: AuthUser; session: AuthSession | null }>(
      "/auth/v1/signup?redirect_to=" +
        encodeURIComponent(`${window.location.origin}${window.location.pathname}`),
      {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          data: { phone, terms_accepted: true, terms_version: termsVersion },
        }),
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

  async updatePhone(phone: string): Promise<AuthSession> {
    const session = readStoredSession();
    if (!session) throw new Error("Inicia sesión para guardar tu teléfono.");

    await supabaseRequest<string>("rpc/update_my_phone", {
      method: "POST",
      body: JSON.stringify({ new_phone: phone }),
    });
    const authenticated = await loadProfile(session);
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
