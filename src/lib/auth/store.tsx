import * as React from "react";
import { Role } from "../clinic/types";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, role: Role) => Promise<void>;
  logout: () => void;
  signup: (email: string, name: string, role: Role) => Promise<void>;
}

const AuthContext = React.createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<User | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    const stored = localStorage.getItem("carebridge-auth");
    if (stored) {
      try {
        setUser(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored auth", e);
      }
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, role: Role) => {
    const mockUser: User = {
      id: role === "doctor" ? "d1" : role === "patient" ? "p1" : "r1",
      name: role === "doctor" ? "Dr. Smith" : role === "patient" ? "John Doe" : "Clara Gomez",
      email,
      role,
    };
    setUser(mockUser);
    localStorage.setItem("carebridge-auth", JSON.stringify(mockUser));
  };

  const signup = async (email: string, name: string, role: Role) => {
    const mockUser: User = {
      id: "u" + Math.random().toString(36).substr(2, 9),
      name,
      email,
      role,
    };
    setUser(mockUser);
    localStorage.setItem("carebridge-auth", JSON.stringify(mockUser));
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem("carebridge-auth");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        signup,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
