import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Panel } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate } from "@/lib/clinic/data";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — CareBridge" },
      {
        name: "description",
        content: "Your contact details, medical history and emergency contact on file.",
      },
      { property: "og:title", content: "My Profile — CareBridge" },
      {
        property: "og:description",
        content: "Personal details, allergies, conditions and emergency contact.",
      },
    ],
  }),
  component: ProfilePage,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-3 last:border-0">
      <span className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</span>
      <span className="min-w-0 text-sm">{value}</span>
    </div>
  );
}

function ProfilePage() {
  const { currentPatient: p, appointments, role, getDoctor } = useClinic();

  if (role !== "patient") {
    return (
      <PageHeader
        title="Patient view only"
        description="Switch the role selector to Patient to see this profile."
      />
    );
  }

  const history = appointments
    .filter((a) => a.patientId === p.id && a.status === "Completed")
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Patient portal" title="My profile" description={p.email} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Personal details">
          <Row label="Full name" value={p.name} />
          <Row label="Date of birth" value={prettyDate(p.dob)} />
          <Row label="Gender" value={p.gender} />
          <Row label="Phone" value={p.phone} />
          <Row label="Address" value={p.address} />
        </Panel>

        <Panel title="Medical history">
          <Row label="Blood type" value={p.bloodType} />
          <Row label="Conditions" value={p.conditions.join(", ") || "None recorded"} />
          <Row label="Allergies" value={p.allergies.join(", ") || "None"} />
          <Row label="Visits completed" value={String(history.length)} />
        </Panel>

        <Panel title="Emergency contact">
          <Row label="Name" value={p.emergency.name} />
          <Row label="Relation" value={p.emergency.relation} />
          <Row label="Phone" value={p.emergency.phone} />
        </Panel>

        <Panel title="Past visits">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed visits yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {history.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.reason}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {getDoctor(a.doctorId)?.name} · {prettyDate(a.date)}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
