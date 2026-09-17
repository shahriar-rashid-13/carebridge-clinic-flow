import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel, StatCard } from "@/components/clinic/page";
import { useClinic } from "@/lib/clinic/store";
import { money } from "@/lib/clinic/data";

export const Route = createFileRoute("/_authenticated/reports")({
  head: () => ({
    meta: [
      { title: "Clinic Reports — CareBridge" },
      {
        name: "description",
        content: "Visits by specialty, revenue breakdown and appointment status across the clinic.",
      },
      { property: "og:title", content: "Clinic Reports — CareBridge" },
      {
        property: "og:description",
        content: "A calm read on clinic volume, revenue and appointment outcomes.",
      },
    ],
  }),
  component: ReportsPage,
});

function Bar({ label, value, max, hint }: { label: string; value: number; max: number; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate">{label}</span>
        <span className="shrink-0 text-muted-foreground">{hint ?? value}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${max === 0 ? 0 : Math.max(4, (value / max) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ReportsPage() {
  const { role, appointments, doctors, invoices, patients } = useClinic();

  if (role !== "receptionist") {
    return (
      <PageHeader
        title="Reception view only"
        description="Switch the role selector to Receptionist to open clinic reports."
      />
    );
  }

  const bySpecialty = Object.entries(
    appointments.reduce<Record<string, number>>((acc, a) => {
      const sp = doctors.find((d) => d.id === a.doctorId)?.specialty ?? "Other";
      acc[sp] = (acc[sp] ?? 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const byStatus = (["Requested", "Confirmed", "Completed", "Cancelled"] as const).map((s) => ({
    s,
    n: appointments.filter((a) => a.status === s).length,
  }));

  const revenueByDoctor = doctors
    .map((d) => ({
      name: d.name,
      total: invoices
        .filter((i) => i.doctorId === d.id && i.status === "Paid")
        .reduce((s, i) => s + i.total, 0),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  const collected = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.total, 0);
  const completed = appointments.filter((a) => a.status === "Completed").length;

  const maxSpec = Math.max(1, ...bySpecialty.map(([, n]) => n));
  const maxStatus = Math.max(1, ...byStatus.map((x) => x.n));
  const maxRev = Math.max(1, ...revenueByDoctor.map((r) => r.total));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Front desk"
        title="Clinic reports"
        description="A quiet read on volume, outcomes and revenue."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total appointments" value={appointments.length} tone="sage" />
        <StatCard label="Completed visits" value={completed} tone="mist" />
        <StatCard label="Registered patients" value={patients.length} tone="sand" />
        <StatCard label="Revenue collected" value={money(collected)} tone="terracotta" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Visits by specialty">
          <div className="space-y-4">
            {bySpecialty.map(([sp, n]) => (
              <Bar key={sp} label={sp} value={n} max={maxSpec} />
            ))}
          </div>
        </Panel>

        <Panel title="Appointment status overview">
          <div className="space-y-4">
            {byStatus.map(({ s, n }) => (
              <Bar key={s} label={s} value={n} max={maxStatus} />
            ))}
          </div>
        </Panel>

        <Panel title="Revenue by doctor" className="lg:col-span-2">
          {revenueByDoctor.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {revenueByDoctor.map((r) => (
                <Bar
                  key={r.name}
                  label={r.name}
                  value={r.total}
                  max={maxRev}
                  hint={money(r.total)}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
