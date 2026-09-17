import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/store";
import { useClinic } from "@/lib/clinic/store";

const ROLE_LABEL: Record<string, string> = {
  patient: "Patient",
  doctor: "Doctor",
  receptionist: "Receptionist",
};

export function CurrentUserCard() {
  const { user, logout } = useAuth();
  const { role, currentDoctor, currentPatient } = useClinic();
  
  if (!user) return null;

  const name = user.name;
  const sub =
    role === "patient"
      ? "Patient portal"
      : role === "doctor"
        ? currentDoctor.specialty
        : "Front desk";
        
  const initials = name
    .replace("Dr. ", "")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-linen p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-terracotta text-sm font-medium text-terracotta-foreground">
          {initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {ROLE_LABEL[role]} · {sub}
          </p>
        </div>
      </div>
      <Button 
        variant="ghost" 
        size="sm" 
        className="mt-1 h-8 w-full justify-start gap-2 px-2 text-xs text-muted-foreground hover:text-destructive"
        onClick={() => logout()}
      >
        <LogOut className="size-3.5" />
        Log out
      </Button>
    </div>
  );
}
