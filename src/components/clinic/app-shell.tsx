import * as React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  CreditCard,
  FileText,
  LayoutDashboard,
  Menu,
  PieChart,
  Stethoscope,
  User,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClinic } from "@/lib/clinic/store";
import type { Role } from "@/lib/clinic/types";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: Record<Role, NavItem[]> = {
  patient: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/book", label: "Book Appointment", icon: CalendarPlus },
    { to: "/appointments", label: "My Appointments", icon: CalendarDays },
    { to: "/prescriptions", label: "My Prescriptions", icon: FileText },
    { to: "/profile", label: "My Profile", icon: User },
  ],
  doctor: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/schedule", label: "My Schedule", icon: CalendarDays },
    { to: "/appointments", label: "My Appointments", icon: ClipboardList },
    { to: "/records", label: "Patient Records", icon: Users },
  ],
  receptionist: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/doctors", label: "Manage Doctors", icon: Stethoscope },
    { to: "/patients", label: "Patients", icon: Users },
    { to: "/billing", label: "Billing", icon: CreditCard },
    { to: "/reports", label: "Reports", icon: PieChart },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  patient: "Patient",
  doctor: "Doctor",
  receptionist: "Receptionist",
};

function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground">
        <Activity className="size-4" />
      </span>
      <span className="font-display text-lg leading-none">CareBridge</span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useClinic();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="space-y-1">
      {NAV[role].map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              active
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-linen hover:text-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function RoleSwitcher() {
  const { role, setRole, currentDoctorId, setCurrentDoctorId, doctors, currentPatient } =
    useClinic();
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
        Viewing as
      </p>
      <Select value={role} onValueChange={(v) => setRole(v as Role)}>
        <SelectTrigger className="w-full bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="patient">Patient — {currentPatient.name}</SelectItem>
          <SelectItem value="doctor">Doctor</SelectItem>
          <SelectItem value="receptionist">Receptionist — Clara Gomez</SelectItem>
        </SelectContent>
      </Select>
      {role === "doctor" && (
        <Select value={currentDoctorId} onValueChange={setCurrentDoctorId}>
          <SelectTrigger className="w-full bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {doctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} — {d.specialty}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function CurrentUserCard() {
  const { role, currentDoctor, currentPatient } = useClinic();
  const name =
    role === "patient" ? currentPatient.name : role === "doctor" ? currentDoctor.name : "Clara Gomez";
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
    <div className="flex min-w-0 items-center gap-3 rounded-md border border-border bg-linen px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-terracotta text-sm font-medium text-terracotta-foreground">
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {ROLE_LABEL[role]} · {sub}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-border bg-linen/50 px-5 py-6 lg:flex">
        <Wordmark />
        <div className="mt-7">
          <RoleSwitcher />
        </div>
        <div className="mt-7 flex-1 overflow-y-auto">
          <NavList />
        </div>
        <div className="mt-6">
          <CurrentUserCard />
        </div>
      </aside>

      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[280px] bg-linen px-5 py-6">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Wordmark />
            <div className="mt-6">
              <RoleSwitcher />
            </div>
            <div className="mt-6">
              <NavList onNavigate={() => setOpen(false)} />
            </div>
            <div className="mt-6">
              <CurrentUserCard />
            </div>
          </SheetContent>
        </Sheet>
        <Wordmark />
      </header>

      <main className="lg:pl-72">
        <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">{children}</div>
      </main>
    </div>
  );
}
