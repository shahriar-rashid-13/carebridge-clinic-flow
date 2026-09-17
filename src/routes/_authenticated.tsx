import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/store";
import { ClinicProvider, useClinic } from "@/lib/clinic/store";
import { AppShell } from "@/components/clinic/app-shell";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    throw redirect({
      to: "/login",
      search: {
        redirect: typeof window !== 'undefined' ? window.location.pathname : '/dashboard',
      },
    });
  }

  return (
    <ClinicProvider>
      <AuthRoleSync />
      <AppShell>
        <Outlet />
      </AppShell>
    </ClinicProvider>
  );
}

function AuthRoleSync() {
  const { user } = useAuth();
  const { setRole, role } = useClinic();

  useEffect(() => {
    if (user && user.role !== role) {
      setRole(user.role);
    }
  }, [user, role, setRole]);

  return null;
}
