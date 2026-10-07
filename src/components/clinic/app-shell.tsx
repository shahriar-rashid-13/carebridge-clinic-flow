import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  CreditCard,
  FileText,
  Gauge,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Menu,
  PieChart,
  Sparkles,
  Stethoscope,
  User,
  Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { NotificationBell, NotificationsProvider } from "@/components/clinic/notification-bell";
import { useClinic } from "@/lib/clinic/store";
import { useAuth } from "@/lib/auth/store";
import { useTheme } from "@/lib/theme/theme-context";
import type { Role } from "@/lib/clinic/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

const NAV: Record<Role, NavItem[]> = {
  patient: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/book", label: "Book Appointment", icon: CalendarPlus },
    { to: "/appointments", label: "My Appointments", icon: CalendarDays },
    { to: "/prescriptions", label: "My Prescriptions", icon: FileText },
    { to: "/profile", label: "My Profile", icon: User },
    { to: "/ai", label: "CareBridge AI", icon: Sparkles },
  ],
  doctor: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/schedule", label: "My Schedule", icon: CalendarDays },
    { to: "/appointments", label: "My Appointments", icon: ClipboardList },
    { to: "/records", label: "Patient Records", icon: Users },
    { to: "/ai", label: "CareBridge AI", icon: Sparkles },
  ],
  receptionist: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/appointments", label: "Appointments", icon: CalendarDays },
    { to: "/doctors", label: "Manage Doctors", icon: Stethoscope },
    { to: "/patients", label: "Patients", icon: Users },
    { to: "/billing", label: "Billing", icon: CreditCard },
    { to: "/reports", label: "Reports", icon: PieChart },
    { to: "/campaigns", label: "Campaigns", icon: Megaphone },
    { to: "/ai", label: "CareBridge AI", icon: Sparkles },
    { to: "/metrics", label: "AI Metrics", icon: Gauge },
  ],
};

const ROLE_LABEL: Record<Role, string> = {
  patient: "Patient",
  doctor: "Doctor",
  receptionist: "Receptionist",
};

function Wordmark() {
  const { theme } = useTheme();
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-md text-white",
          theme === "calm" ? "bg-[#123f35]" : "bg-[#2d5a3d]",
        )}
      >
        <Activity className="size-4" />
      </span>
      <span className="font-display text-lg leading-none">CareBridge</span>
    </Link>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { role } = useClinic();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { theme } = useTheme();

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
              "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors",
              active
                ? theme === "calm"
                  ? "bg-[#123f35] font-medium text-white"
                  : "bg-[#2d5a3d] font-medium text-white"
                : theme === "calm"
                  ? "text-[#5f6b66] hover:bg-[#f1eee6] hover:text-[#172a25]"
                  : "text-[#666666] hover:bg-[#f5f0e8] hover:text-[#1a1a2e]",
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

function SignOutButton({ onSignOut }: { onSignOut: () => void }) {
  const { theme } = useTheme();
  return (
    <Button
      variant="outline"
      className={cn(
        "w-full justify-start",
        theme === "calm"
          ? "border-[rgba(23,42,37,0.15)] text-[#172a25] hover:bg-[#f1eee6]"
          : "border-[rgba(26,26,46,0.15)] text-[#1a1a2e] hover:bg-[#f5f0e8]",
      )}
      onClick={onSignOut}
    >
      <LogOut className="size-4" />
      Sign out
    </Button>
  );
}

function CurrentUserCard() {
  const { role, currentDoctor } = useClinic();
  const { user } = useAuth();
  const { theme } = useTheme();
  const name = user?.name ?? "CareBridge user";
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
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-[12px] border px-4 py-3",
        theme === "calm"
          ? "border-[rgba(23,42,37,0.08)] bg-white"
          : "border-[rgba(26,26,46,0.1)] bg-white",
      )}
    >
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-full text-sm font-medium",
          theme === "calm" ? "bg-[#ff9670] text-[#8c4d3a]" : "bg-[#ff8b94] text-[#c73e1d]",
        )}
      >
        {initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-[#172a25]">{name}</p>
        <p className="truncate text-xs text-[#5f6b66]">
          {ROLE_LABEL[role]} · {sub}
        </p>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const { logout, completeSignOut } = useAuth();
  const { theme } = useTheme();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAiRoute = pathname === "/ai";

  const handleSignOut = async () => {
    try {
      await logout();
      setOpen(false);
      await navigate({ to: "/" });
      completeSignOut();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to sign out. Please try again.");
    }
  };

  return (
    <NotificationsProvider>
      <div className={cn("min-h-screen", theme === "calm" ? "bg-[#f7f2e9]" : "bg-[#faf6f0]")}>
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r px-5 py-6 lg:flex",
            theme === "calm"
              ? "border-[rgba(31, 75, 63, 0.08)] bg-[#f1eea6]"
              : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <Wordmark />
            <NotificationBell />
          </div>
          <div className="mt-8 flex-1 overflow-y-auto">
            <NavList />
          </div>
          <div className="mt-6">
            <CurrentUserCard />
          </div>
          <div className="mt-3">
            <SignOutButton onSignOut={handleSignOut} />
          </div>
        </aside>

        <header
          className={cn(
            "sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-sm lg:hidden",
            theme === "calm"
              ? "border-[rgba(23,42,37,0.08)] bg-[#f7f2e9]/95"
              : "border-[rgba(26,26,46,0.1)] bg-[#faf6f0]/95",
          )}
        >
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Open menu"
                className={cn(
                  theme === "calm"
                    ? "border-[rgba(23,42,37,0.15)]"
                    : "border-[rgba(26,26,46,0.15)]",
                )}
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              className={cn(
                "w-[280px] px-5 py-6",
                theme === "calm" ? "bg-[#f1eee6]" : "bg-[#f5f0e8]",
              )}
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <Wordmark />
              <div className="mt-6">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
              <div className="mt-6">
                <CurrentUserCard />
              </div>
              <div className="mt-3">
                <SignOutButton onSignOut={handleSignOut} />
              </div>
            </SheetContent>
          </Sheet>
          <Wordmark />
          <div className="ml-auto">
            <NotificationBell />
          </div>
        </header>

        <main
          className={cn(
            "lg:pl-72",
            isAiRoute &&
              "flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden lg:h-screen",
          )}
        >
          {isAiRoute ? (
            children
          ) : (
            <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">{children}</div>
          )}
        </main>
      </div>
    </NotificationsProvider>
  );
}
