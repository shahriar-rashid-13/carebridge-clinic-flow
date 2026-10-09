import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { GoogleIcon } from "@/components/google-icon";
import { useTheme } from "@/lib/theme/theme-context";
import { SkyBackdrop } from "@/components/sky-backdrop";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
});

function SignupPage() {
  const { signup, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isVibrant = theme === "vibrant";

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
        toast.success("Account created successfully. You are now signed in.");

        navigate({ to: "/dashboard" });
      } else {
        toast.success("Account created. Check your email to confirm it, then log in.");

        navigate({ to: "/login", search: { redirect: "/dashboard" } });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to create account. Please try again.",
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
    <div className="min-h-screen bg-[#f7f2e9]">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left Panel - Editorial */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-12 text-[#172a25] lg:flex">
          <SkyBackdrop />
          <div className="relative">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#123f35] text-white">
                <Activity className="size-4" />
              </span>
              <span className="font-display text-lg leading-none">CareBridge</span>
            </Link>
          </div>

          <div className="relative max-w-md">
            <p className="eyebrow cb-rise text-[#2f4a43]">Get started</p>
            <h1
              className="cb-rise mt-4 font-display text-[3rem] leading-[1.1] tracking-[-0.04em]"
              style={{ "--delay": "120ms" } as React.CSSProperties}
            >
              Join CareBridge today.
            </h1>
            <p
              className="cb-rise mt-6 text-lg leading-8 text-[#2f4a43]"
              style={{ "--delay": "240ms" } as React.CSSProperties}
            >
              Create your account to start managing your healthcare journey with ease.
            </p>
          </div>

          <div className="relative flex items-center gap-4 text-sm text-[#2f4a43]">
            <ShieldCheck className="size-5" />
            <span>Your data is secure and private</span>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
          <div className="w-full max-w-md">
            <div className="text-center lg:hidden">
              <Link to="/" className="inline-flex items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#123f35] text-white">
                  <Activity className="size-4" />
                </span>
                <span className="font-display text-lg leading-none">CareBridge</span>
              </Link>
            </div>

            <div className="mt-8 lg:mt-0">
              <h2 className="font-display text-2xl text-[#172a25]">Create your account</h2>
              <p className="mt-2 text-sm text-[#5f6b66]">
                Join thousands of clinics delivering better care
              </p>
            </div>

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm font-medium text-[#172a25]">
                    Full Name
                  </Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="h-11 rounded-[10px] border-[rgba(23,42,37,0.15)] bg-white px-4 text-[#172a25] placeholder:text-[#5f6b66] focus:border-[#123f35] focus:ring-1 focus:ring-[#123f35]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email" className="text-sm font-medium text-[#172a25]">
                    Email address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-11 rounded-[10px] border-[rgba(23,42,37,0.15)] bg-white px-4 text-[#172a25] placeholder:text-[#5f6b66] focus:border-[#123f35] focus:ring-1 focus:ring-[#123f35]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-medium text-[#172a25]">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Create a password"
                    minLength={6}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-[10px] border-[rgba(23,42,37,0.15)] bg-white px-4 text-[#172a25] placeholder:text-[#5f6b66] focus:border-[#123f35] focus:ring-1 focus:ring-[#123f35]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password" className="text-sm font-medium text-[#172a25]">
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
                    className="h-11 rounded-[10px] border-[rgba(23,42,37,0.15)] bg-white px-4 text-[#172a25] placeholder:text-[#5f6b66] focus:border-[#123f35] focus:ring-1 focus:ring-[#123f35]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant={isVibrant ? "3d-primary" : undefined}
                className={
                  isVibrant
                    ? "h-11 w-full"
                    : "h-11 w-full rounded-[10px] bg-[#123f35] text-white hover:bg-[#0b2e27]"
                }
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Create Account
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-[rgba(23,42,37,0.08)]" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#f7f2e9] px-2 text-[#5f6b66]">Or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant={isVibrant ? "3d-mist" : "outline"}
                className={
                  isVibrant
                    ? "h-11 w-full"
                    : "h-11 w-full rounded-[10px] border-[rgba(23,42,37,0.15)] bg-white text-[#172a25] hover:bg-[#f1eee6]"
                }
                disabled={isLoading}
                onClick={handleGoogleSignup}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <GoogleIcon className="mr-2 size-4" />
                )}
                Continue with Google
              </Button>

              <div className="text-center text-sm">
                <span className="text-[#5f6b66]">Already have an account? </span>
                <Link
                  to="/login"
                  search={{ redirect: "/dashboard" }}
                  className="font-medium text-[#123f35] hover:underline"
                >
                  Log in instead
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
