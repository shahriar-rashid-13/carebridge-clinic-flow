import * as React from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import {
  DEMO_USERS,
  initializeAuth,
  useAuth,
} from "@/lib/auth/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search["redirect"] as string) || "/dashboard",
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { redirect } = useSearch({ from: "/login" });

  const [isLoading, setIsLoading] = React.useState(false);
  const [email, setEmail] = React.useState("sarah@example.com");
  const [password, setPassword] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await login(email, password);

      toast.success("Successfully logged in!");

      navigate({ to: redirect });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to login. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);

    try {
      await loginWithGoogle(redirect);
    } catch (error) {
      setIsLoading(false);

      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sign in with Google. Please try again.",
      );
    }
  };

  const handleDemoPick = (demoUser: (typeof DEMO_USERS)[number]) => {
    setEmail(demoUser.email);
  };

  React.useEffect(() => {
    void initializeAuth().catch(() => undefined);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-linen/30 px-4 py-12">
      <div className="w-full max-w-md space-y-8 rounded-2xl border bg-background p-8 shadow-xl">
        <div className="text-center">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Activity className="size-6" />
            </div>

            <span className="font-display text-2xl font-bold">
              CareBridge
            </span>
          </Link>

          <h2 className="mt-6 text-3xl font-bold tracking-tight">
            Welcome back
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Enter your details to access your clinic account
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {DEMO_USERS.map((demoUser) => (
                <button
                  key={demoUser.email}
                  type="button"
                  onClick={() => handleDemoPick(demoUser)}
                  className="rounded-md border border-border bg-card px-3 py-2 text-left text-xs transition-colors hover:bg-linen"
                >
                  <div className="font-medium text-foreground">
                    {demoUser.name}
                  </div>

                  <div className="mt-1 text-muted-foreground">
                    Use the real account password
                  </div>
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>

              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>

              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}

            Sign in
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={handleGoogleLogin}
          >
            {isLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}

            Continue with Google
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>

            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or
              </span>
            </div>
          </div>

          <div className="text-center text-sm">
            Don't have an account?{" "}
            <Link
              to="/signup"
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}