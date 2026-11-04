import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { getSupabase, supabase } from '../lib/supabase';

interface User {
  id: string;
  email: string;
  nombre: string;
  rol: 'cliente' | 'admin';
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, password: string, nombre: string) => Promise<{ success: boolean; confirmationRequired: boolean }>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let active = true;
    const syncUser = async (authUser: SupabaseUser | null) => {
      if (!authUser) {
        if (active) setUser(null);
        if (active) setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, role')
        .eq('id', authUser.id)
        .maybeSingle();

      if (!active) return;
      setUser({
        id: authUser.id,
        email: authUser.email ?? '',
        nombre: profile?.display_name || String(authUser.user_metadata?.nombre ?? ''),
        rol: profile?.role === 'admin' ? 'admin' : 'cliente',
      });
      setLoading(false);
    };

    void supabase.auth.getSession().then(({ data }) => syncUser(data.session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => void syncUser(session?.user ?? null), 0);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email, password });
    if (error?.message.toLowerCase().includes('invalid login credentials')) return false;
    if (error) throw error;
    return Boolean(data.user);
  };

  const register = async (email: string, password: string, nombre: string) => {
    const { data, error } = await getSupabase().auth.signUp({
      email,
      password,
      options: { data: { nombre } },
    });
    if (error?.message.toLowerCase().includes('already registered')) {
      return { success: false, confirmationRequired: false };
    }
    if (error) throw error;
    return { success: true, confirmationRequired: !data.session };
  };

  const logout = async () => {
    const { error } = await getSupabase().auth.signOut();
    if (error) throw error;
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading,
      login, 
      register, 
      logout, 
      isAdmin: user?.rol === 'admin' 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
