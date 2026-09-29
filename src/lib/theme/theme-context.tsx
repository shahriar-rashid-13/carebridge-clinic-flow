import * as React from "react";

type Theme = "calm" | "vibrant";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = React.createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme: Theme = "vibrant";

  const setTheme = () => {
    // No-op; vibrant is always active
  };

  const toggleTheme = () => {
    // No-op; vibrant is always active
  };

  // Set vibrant theme on mount
  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", "vibrant");
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
