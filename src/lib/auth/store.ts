import { useSyncExternalStore } from "react";
import type { Session, User as SupabaseUser } from "@supabase/supabase-js";
import type { Role } from "@/lib/clinic/types";
import { supabase } from "@/lib/supabase/client";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: Role;
}

export const DEMO_USERS: User[] = [
  {
    id: "p1",
    name: "Sarah Jenkins",
    email: "sarah@example.com",
    role: "patient",
  },
  {
    id: "d1",
    name: "Dr. Marcus Vance",
    email: "marcus@example.com",
    role: "doctor",
  },
  {
    id: "r1",
    name: "Clara Morgan",
    email: "clara@example.com",
    role: "receptionist",
  },
];

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  profileError: string | null;
  isAuthenticated: boolean;
  isSigningOut: boolean;
  loading: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (redirectTo?: string) => Promise<void>;
  logout: () => Promise<void>;
  completeSignOut: () => void;
  signup: (email: string, name: string, password: string) => Promise<Session | null>;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let authState: AuthState;
let initializationPromise: Promise<void> | null = null;
let sessionSyncVersion = 0;

const notify = () => listeners.forEach((listener) => listener());

const setAuthState = (next: AuthState) => {
  authState = next;
  notify();
};

const isRole = (value: unknown): value is Role =>
  value === "patient" || value === "doctor" || value === "receptionist";

const getProfile = async (supabaseUser: SupabaseUser): Promise<Profile> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", supabaseUser.id)
    .single();

  if (error) throw error;

  if (!data || !isRole(data.role)) {
    throw new Error("Your account profile is missing a valid clinic role.");
  }

  return data as Profile;
};

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "We could not initialize your clinic profile.";

const syncSession = async (session: Session | null) => {
  const version = ++sessionSyncVersion;

  if (!session?.user) {
    setAuthState({
      ...authState,
      user: null,
      session: null,
      profile: null,
      profileError: null,
      isAuthenticated: false,
      loading: false,
      isLoading: false,
    });
    return;
  }

  try {
    const profile = await getProfile(session.user);

    if (version !== sessionSyncVersion) return;

    setAuthState({
      ...authState,
      user: {
        id: session.user.id,
        name: profile.full_name || session.user.email || "CareBridge user",
        email: session.user.email || "",
        role: profile.role,
      },
      session,
      profile,
      profileError: null,
      isAuthenticated: true,
      loading: false,
      isLoading: false,
    });
  } catch (error) {
    if (version !== sessionSyncVersion) return;

    setAuthState({
      ...authState,
      user: null,
      session,
      profile: null,
      profileError: errorMessage(error),
      isAuthenticated: false,
      loading: false,
      isLoading: false,
    });

    throw error;
  }
};

export const initializeAuth = async () => {
  if (initializationPromise) return initializationPromise;

  initializationPromise = (async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    try {
      await syncSession(data.session);
    } catch {
      // syncSession records a profile-specific error for the authenticated layout.
    }

    supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(session).catch(() => undefined);
    });
  })().catch((error) => {
    setAuthState({
      ...authState,
      user: null,
      session: null,
      profile: null,
      profileError: errorMessage(error),
      isAuthenticated: false,
      loading: false,
      isLoading: false,
    });

    initializationPromise = null;
    return error;
  });

  return initializationPromise;
};

const login = async (email: string, password: string) => {
  setAuthState({
    ...authState,
    profileError: null,
    loading: true,
    isLoading: true,
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    setAuthState({
      ...authState,
      loading: false,
      isLoading: false,
    });

    throw error;
  }

  await syncSession(data.session);
};

const loginWithGoogle = async (redirectTo = "/dashboard") => {
  setAuthState({
    ...authState,
    profileError: null,
    loading: true,
    isLoading: true,
  });

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}${redirectTo}`,
    },
  });

  if (error) {
    setAuthState({
      ...authState,
      loading: false,
      isLoading: false,
    });

    throw error;
  }

  // signInWithOAuth redirects the browser to Google.
  // There is normally no further code execution here before navigation.
};

const signup = async (email: string, name: string, password: string) => {
  setAuthState({
    ...authState,
    profileError: null,
    loading: true,
    isLoading: true,
  });

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: {
        full_name: name.trim(),
      },
    },
  });

  if (error) {
    setAuthState({
      ...authState,
      loading: false,
      isLoading: false,
    });

    throw error;
  }

  if (data.session) {
    await syncSession(data.session);
  } else {
    setAuthState({
      ...authState,
      loading: false,
      isLoading: false,
    });
  }

  return data.session;
};

const logout = async () => {
  setAuthState({
    ...authState,
    isSigningOut: true,
  });

  const { error } = await supabase.auth.signOut();

  if (error) {
    setAuthState({
      ...authState,
      isSigningOut: false,
    });

    throw error;
  }

  await syncSession(null);
};

const completeSignOut = () => {
  setAuthState({
    ...authState,
    isSigningOut: false,
  });
};

authState = {
  user: null,
  session: null,
  profile: null,
  profileError: null,
  isAuthenticated: false,
  isSigningOut: false,
  loading: true,
  isLoading: true,
  login,
  loginWithGoogle,
  logout,
  completeSignOut,
  signup,
};

const subscribe = (listener: Listener) => {
  listeners.add(listener);

  return () => listeners.delete(listener);
};

const getAuthState = () => authState;

export const useAuth = Object.assign(
  () => useSyncExternalStore(subscribe, getAuthState, getAuthState),
  { getState: getAuthState },
);