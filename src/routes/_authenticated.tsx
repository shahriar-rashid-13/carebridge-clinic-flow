import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { initializeAuth, useAuth } from "@/lib/auth/store";
import { useClinic } from "@/lib/clinic/store";
import { useEffect } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isAuthenticated, isLoading, isSigningOut, profileError, logout, completeSignOut } =
    useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    void initializeAuth();
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated && !profileError && !isSigningOut) {
      navigate({
        to: "/login",
        search: { redirect: window.location.pathname },
      });
    }
  }, [isAuthenticated, isLoading, isSigningOut, navigate, profileError]);

  if (isLoading || isSigningOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-medium text-foreground">Your clinic profile is not ready</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {profileError} Please contact the clinic if this continues.
          </p>
          <button
            type="button"
            className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
            onClick={async () => {
              try {
                await logout();
                await navigate({ to: "/login", search: { redirect: "/dashboard" } });
                completeSignOut();
              } catch (error) {
                toast.error(
                  error instanceof Error ? error.message : "Unable to sign out. Please try again.",
                );
              }
            }}
          >
            Sign out and try again
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <>
      <AuthRoleSync />
      <Outlet />
    </>
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
