import * as React from "react";
import {
  createFileRoute,
  Link,
  useNavigate,
} from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const [isLoading, setIsLoading] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      setIsLoading(false);
      return;
    }

    try {
      const session = await signup(email, name, password);

      if (session) {
        toast.success(
          "Account created successfully. You are now signed in.",
        );

        navigate({ to: "/dashboard" });
      } else {
        toast.success(
          "Account created. Check your email to confirm it, then log in.",
        );

        navigate({ to: "/login" });
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create account. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setIsLoading(true);

    try {
      await loginWithGoogle("/dashboard");
    } catch (error) {
      setIsLoading(false);

      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to continue with Google. Please try again.",
      );
    }
  };

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
            Create your account
          </h2>

          <p className="mt-2 text-sm text-muted-foreground">
            Join thousands of clinics delivering better care
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>

              <Input
                id="name"
                type="text"
                placeholder="John Doe"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
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
                placeholder="Create a password"
                minLength={6}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">
                Confirm password
              </Label>

              <Input
                id="confirm-password"
                type="password"
                placeholder="Repeat your password"
                minLength={6}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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

            Create Account
          </Button>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isLoading}
            onClick={handleGoogleSignup}
          >
            {isLoading ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : null}

            Continue with Google
          </Button>

          <div className="text-center text-sm">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-medium text-primary hover:underline"
            >
              Log in instead
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}