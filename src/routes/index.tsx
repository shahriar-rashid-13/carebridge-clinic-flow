// import { useEffect } from "react";
// import { testSupabaseConnection } from "@/lib/supabase/test";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarCheck2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CareBridge — Clinic access" },
      {
        name: "description",
        content:
          "CareBridge helps patients, doctors and reception staff coordinate clinic visits in one calm workspace.",
      },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {

  // test DB connection //
  
  // useEffect(() => {
  //   testSupabaseConnection();
  
  // }, []);
  return (
    <div className="min-h-screen bg-[#f7f4ed] px-4 py-8 text-[#16231f] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4 rounded-[20px] border border-[#d7ddd8] bg-white/70 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-[#163a32] text-[#f7f4ed]">
              <ShieldCheck className="size-4" />
            </div>
            <div className="font-display text-[1.6rem] leading-none tracking-[-0.04em]">CareBridge</div>
          </div>

          <nav className="hidden items-center gap-6 text-sm text-[#5f6b66] md:flex">
            <Link to="/" className="transition-colors hover:text-[#16231f]">About</Link>
            <Link to="/" className="transition-colors hover:text-[#16231f]">My threads</Link>
            <Link to="/" className="transition-colors hover:text-[#16231f]">Sign in</Link>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="ghost" className="h-10 border border-[#d7ddd8] bg-transparent" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button className="h-10 bg-[#163a32] text-white hover:bg-[#0e2b25]" asChild>
              <Link to="/signup">
                Create account <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </header>

        <main className="mt-14 lg:mt-16">
          <div className="grid gap-8 lg:grid-cols-[1.3fr_0.7fr] lg:items-end">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#5f6b66]">
                Carebridge / clinic care
              </p>
              <h1 className="mt-5 max-w-[14ch] font-display text-[4.15rem] leading-[0.92] tracking-[-0.06em] text-[#16231f] sm:text-[5.2rem] lg:text-[6.3rem]">
                Healthcare that feels more human.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[#5f6b66]">
                A calmer way to manage appointments, care plans, prescriptions and billing across the clinic.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button size="lg" className="h-12 bg-[#163a32] px-6 text-base hover:bg-[#0e2b25]" asChild>
                  <Link to="/login">
                    Book an appointment <ArrowRight className="ml-2 size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" className="h-12 border-[#163a32]/35 bg-transparent px-6 text-base" asChild>
                  <Link to="/signup">Sign in</Link>
                </Button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[18px] border border-[#d7ddd8] bg-[#f1ddd4] p-4 sm:p-6">
              <div className="absolute inset-x-8 top-0 h-px bg-[#163a32]/20" />
              <div className="rounded-[16px] border border-[#163a32]/20 bg-[#f7f4ed]/80 p-4 shadow-[0_12px_30px_rgba(22,58,50,0.08)]">
                <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#5f6b66]">
                  Demo flow
                </p>
                <ul className="mt-4 space-y-3">
                  {[
                    ["Patient books", "Requested"],
                    ["Reception confirms", "Confirmed"],
                    ["Doctor consults", "Completed"],
                    ["Billing settles", "Paid"],
                  ].map(([label, status]) => (
                    <li
                      key={label}
                      className="flex items-center justify-between rounded-[10px] border border-[#d7ddd8] bg-white/80 px-3 py-2.5 text-sm"
                    >
                      <span className="text-[#16231f]">{label}</span>
                      <span className="rounded-full border border-[#d7ddd8] bg-[#e8efe9] px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[#234d43]">
                        {status}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
