import * as React from "react";
import { useTheme } from "@/lib/theme/theme-context";
import { Button } from "@/components/ui/button";
import { Palette, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      className={cn(
        "gap-2 border-[rgba(23,42,37,0.15)] bg-white text-[#172a25] hover:bg-[#f1eee6]",
        theme === "vibrant" && "border-[rgba(26,26,46,0.15)] bg-[#faf6f0] text-[#1a1a2e] hover:bg-[#f5f0e8]"
      )}
    >
      <Palette className="size-4" />
      <span className="text-xs font-medium">
        {theme === "calm" ? "Calm" : "Vibrant"}
      </span>
    </Button>
  );
}
