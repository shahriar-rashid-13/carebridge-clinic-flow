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
  return (
    <div className="min-h-screen bg-linen/30 px-4 py-12 text-foreground">
      <div className="mx-auto max-w-5xl">
        <header className="flex items-center justify-between gap-4 rounded-full border border-border bg-background/80 px-5 py-3 shadow-sm backdrop-blur">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <div className="font-display text-xl font-bold">CareBridge</div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/login">Log in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">
                Create account <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </header>

        <main className="mt-16 grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <span className="inline-flex rounded-full border border-border bg-background px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Care coordination
            </span>
            <h1 className="mt-6 max-w-xl font-display text-5xl leading-tight tracking-tight sm:text-6xl">
              Simpler care, shared by every part of the clinic.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              Manage appointments, consultations, prescriptions and billing from one calm
              operational view built for patient care.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" asChild>
                <Link to="/login">
                  Access the demo <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/signup">Create demo account</Link>
              </Button>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <CalendarCheck2 className="size-4" />
                  <span className="text-sm font-medium">Appointments</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Book, confirm and reschedule in one flow.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <ShieldCheck className="size-4" />
                  <span className="text-sm font-medium">Consults</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Write notes and prescriptions as care progresses.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-background p-4 shadow-sm">
                <div className="flex items-center gap-2 text-primary">
                  <ArrowRight className="size-4" />
                  <span className="text-sm font-medium">Billing</span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  Close the visit with a tracked invoice and payment status.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-background p-6 shadow-xl">
            <div className="rounded-2xl border border-dashed border-border bg-linen/50 p-5">
              <p className="text-sm font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Demo flow
              </p>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                  <span>Patient books</span>
                  <span className="text-primary">Requested</span>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                  <span>Reception confirms</span>
                  <span className="text-primary">Confirmed</span>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                  <span>Doctor consults</span>
                  <span className="text-primary">Completed</span>
                </li>
                <li className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2">
                  <span>Billing settles</span>
                  <span className="text-primary">Paid</span>
                </li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
