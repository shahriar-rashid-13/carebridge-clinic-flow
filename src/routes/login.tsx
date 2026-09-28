import * as React from "react";
import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { DEMO_USERS, initializeAuth, useAuth } from "@/lib/auth/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/lib/theme/theme-context";

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
  const { theme } = useTheme();
  const isVibrant = theme === "vibrant";

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
      toast.error(error instanceof Error ? error.message : "Failed to login. Please try again.");
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
        error instanceof Error ? error.message : "Failed to sign in with Google. Please try again.",
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
    <div className="min-h-screen bg-[#f7f2e9]">
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left Panel - Editorial */}
        <div className="relative hidden flex-col justify-between bg-[#123f35] p-12 text-white lg:flex">
          <div>
            <Link to="/" className="flex items-center gap-2.5">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white text-[#123f35]">
                <Activity className="size-4" />
              </span>
              <span className="font-display text-lg leading-none">CareBridge</span>
            </Link>
          </div>

          <div className="max-w-md">
            <p className="eyebrow text-[#a9b6a3]">Welcome back</p>
            <h1 className="mt-4 font-display text-[3rem] leading-[1.1] tracking-[-0.04em]">
              Healthcare that feels more human.
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#b7c2be]">
              Access your clinic account to manage appointments, prescriptions, and care plans.
            </p>
          </div>

          <div className="flex items-center gap-4 text-sm text-[#b7c2be]">
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
              <h2 className="font-display text-2xl text-[#172a25]">Welcome back</h2>
              <p className="mt-2 text-sm text-[#5f6b66]">
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
                      className="rounded-[12px] border border-[rgba(23,42,37,0.08)] bg-white p-3 text-left text-xs transition-colors hover:bg-[#f1eee6]"
                    >
                      <div className="font-medium text-[#172a25]">{demoUser.name}</div>
                      <div className="mt-1 text-[#5f6b66]">Use the real account password</div>
                    </button>
                  ))}
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
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 rounded-[10px] border-[rgba(23,42,37,0.15)] bg-white px-4 text-[#172a25] placeholder:text-[#5f6b66] focus:border-[#123f35] focus:ring-1 focus:ring-[#123f35]"
                  />
                </div>
              </div>

              <Button
                type="submit"
                variant={isVibrant ? "3d-primary" : undefined}
                className={isVibrant ? "h-11 w-full" : "h-11 w-full rounded-[10px] bg-[#123f35] text-white hover:bg-[#0b2e27]"}
                disabled={isLoading}
              >
                {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Sign in
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
                className={isVibrant ? "h-11 w-full" : "h-11 w-full rounded-[10px] border-[rgba(23,42,37,0.15)] bg-white text-[#172a25] hover:bg-[#f1eee6]"}
                disabled={isLoading}
                onClick={handleGoogleLogin}
              >
                {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Continue with Google
              </Button>

              <div className="text-center text-sm">
                <span className="text-[#5f6b66]">Don't have an account? </span>
                <Link to="/signup" className="font-medium text-[#123f35] hover:underline">
                  Create an account
                </Link>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
