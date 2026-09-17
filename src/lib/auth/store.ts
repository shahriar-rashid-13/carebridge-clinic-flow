import { useSyncExternalStore } from "react";
import type { Role } from "@/lib/clinic/types";

export interface User {
  id: string;
  name: string;
  email: string;
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
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, role: Role) => Promise<void>;
  logout: () => void;
  signup: (email: string, name: string, role: Role) => Promise<void>;
  setUserRole: (role: Role) => void;
}

type Listener = () => void;

const listeners = new Set<Listener>();

let authState: AuthState;

const notify = () => listeners.forEach((listener) => listener());

const setAuthState = (next: AuthState) => {
  authState = next;
  notify();
};

const login = async (email: string, role: Role) => {
  const normalizedEmail = email.trim().toLowerCase();
  const match = DEMO_USERS.find(
    (demoUser) => demoUser.email.toLowerCase() === normalizedEmail && demoUser.role === role,
  );

  const resolvedUser =
    match ??
    DEMO_USERS.find((demoUser) => demoUser.email.toLowerCase() === normalizedEmail) ??
    DEMO_USERS.find((demoUser) => demoUser.role === role) ??
    {
      id: `demo-${Date.now()}`,
      name: "Demo User",
      email: normalizedEmail,
      role,
    };

  setAuthState({
    ...authState,
    user: { ...resolvedUser },
    isAuthenticated: true,
    isLoading: false,
  });
};

const signup = async (email: string, name: string, role: Role) => {
  setAuthState({
    ...authState,
    user: {
      id: `demo-${Date.now()}`,
      name: name.trim() || "New Demo User",
      email: email.trim(),
      role,
    },
    isAuthenticated: true,
    isLoading: false,
  });
};

const logout = () =>
  setAuthState({ ...authState, user: null, isAuthenticated: false, isLoading: false });

const setUserRole = (role: Role) => {
  if (!authState.user) return;
  setAuthState({
    ...authState,
    user: { ...authState.user, role },
  });
};

authState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login,
  logout,
  signup,
  setUserRole,
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
