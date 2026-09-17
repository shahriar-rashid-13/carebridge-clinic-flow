import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Role } from '../clinic/types';

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, role: Role) => Promise<void>;
  logout: () => void;
  signup: (email: string, name: string, role: Role) => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      login: async (email, role) => {
        // Simulated login
        const mockUser: User = {
          id: role === 'doctor' ? 'd1' : role === 'patient' ? 'p1' : 'r1',
          name: role === 'doctor' ? 'Dr. Smith' : role === 'patient' ? 'John Doe' : 'Clara Gomez',
          email,
          role,
        };
        set({ user: mockUser, isAuthenticated: true });
      },
      signup: async (email, name, role) => {
        // Simulated signup
        const mockUser: User = {
          id: 'u' + Math.random().toString(36).substr(2, 9),
          name,
          email,
          role,
        };
        set({ user: mockUser, isAuthenticated: true });
      },
      logout: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'carebridge-auth',
    }
  )
);
