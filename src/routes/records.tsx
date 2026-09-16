import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState, PageHeader, Panel } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate } from "@/lib/clinic/data";
import type { Patient } from "@/lib/clinic/types";

export const Route = createFileRoute("/records")({
  head: () => ({
    meta: [
      { title: "Patient Records — CareBridge" },
      {
        name: "description",
        content: "Directory of patients with medical history, allergies and past visits.",
      },
      { property: "og:title", content: "Patient Records — CareBridge" },
      {
        property: "og:description",
        content: "Open a patient to review conditions, allergies, visits and prescriptions.",
      },
    ],
  }),
  component: RecordsPage,
});

function RecordsPage() {
  const { role, patients, appointments, prescriptions, currentDoctor, getDoctor } = useClinic();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<Patient | null>(null);

  if (role !== "doctor") {
    return (
      <PageHeader
        title="Doctor view only"
        description="Switch the role selector to Doctor to browse patient records."
      />
    );
  }

  const seen = patients.filter((p) =>
    appointments.some((a) => a.patientId === p.id && a.doctorId === currentDoctor.id),
  );
  const list = seen.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  const history = open
    ? appointments
        .filter((a) => a.patientId === open.id)
        .sort((a, b) => b.date.localeCompare(a.date))
    : [];
  const rx = open ? prescriptions.filter((p) => p.patientId === open.id) : [];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Clinician"
        title="Patient records"
        description={`Patients you have seen or are scheduled to see as ${currentDoctor.name}.`}
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search patients"
          className="pl-9"
        />
      </div>

      {list.length === 0 ? (
        <EmptyState title="No patients found" description="Try a different name." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpen(p)}
              className="rounded-lg border border-border bg-card p-5 text-left transition-colors hover:bg-linen"
            >
              <p className="text-sm font-medium">{p.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {p.gender} · {p.bloodType} · born {prettyDate(p.dob)}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {p.conditions.join(", ") || "No chronic conditions"}
              </p>
              <p className="mt-3 text-xs">
                {appointments.filter((a) => a.patientId === p.id).length} visits on file
              </p>
            </button>
          ))}
        </div>
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{open?.name}</SheetTitle>
            <SheetDescription>
              {open && `${open.gender} · ${open.bloodType} · ${open.phone}`}
            </SheetDescription>
          </SheetHeader>
          {open && (
            <div className="space-y-6 px-4 pb-8">
              <Panel title="Medical history">
                <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Conditions
                </p>
                <p className="mt-1 text-sm">{open.conditions.join(", ") || "None recorded"}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Allergies
                </p>
                <p className="mt-1 text-sm">{open.allergies.join(", ") || "None"}</p>
                <p className="mt-4 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Emergency contact
                </p>
                <p className="mt-1 text-sm">
                  {open.emergency.name} ({open.emergency.relation}) · {open.emergency.phone}
                </p>
              </Panel>

              <Panel title="Visit history">
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No visits recorded.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {history.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 py-3 first:pt-0">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{a.reason}</p>
                          <p className="text-xs text-muted-foreground">
                            {getDoctor(a.doctorId)?.name} · {prettyDate(a.date)}
                          </p>
                        </div>
                        <StatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>

              <Panel title="Prescriptions">
                {rx.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nothing issued yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {rx.map((r) => (
                      <li key={r.id} className="rounded-md border border-border bg-linen/60 p-3">
                        <p className="text-sm font-medium">{r.diagnosis}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {prettyDate(r.date)} · {r.medications.map((m) => m.name).join(", ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
