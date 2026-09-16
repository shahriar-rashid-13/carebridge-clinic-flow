import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, Panel } from "@/components/clinic/page";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate } from "@/lib/clinic/data";
import type { Prescription } from "@/lib/clinic/types";

export const Route = createFileRoute("/prescriptions")({
  head: () => ({
    meta: [
      { title: "My Prescriptions — CareBridge" },
      {
        name: "description",
        content: "Every prescription from your completed visits, with dosage and doctor's notes.",
      },
      { property: "og:title", content: "My Prescriptions — CareBridge" },
      {
        property: "og:description",
        content: "Medications, dosage, duration and instructions from each completed consultation.",
      },
    ],
  }),
  component: PrescriptionsPage,
});

function PrescriptionsPage() {
  const { prescriptions, currentPatient, getDoctor, role } = useClinic();
  const [q, setQ] = React.useState("");

  if (role !== "patient") {
    return (
      <PageHeader
        title="Patient view only"
        description="Switch the role selector to Patient to read prescriptions."
      />
    );
  }

  const mine = prescriptions
    .filter((p) => p.patientId === currentPatient.id)
    .filter(
      (p) =>
        !q.trim() ||
        p.diagnosis.toLowerCase().includes(q.toLowerCase()) ||
        p.medications.some((m) => m.name.toLowerCase().includes(q.toLowerCase())),
    );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Patient portal"
        title="My prescriptions"
        description="Issued after each completed consultation. Print or save a copy for your records."
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search diagnosis or medication"
          className="pl-9"
        />
      </div>

      {mine.length === 0 ? (
        <EmptyState
          title="No prescriptions yet"
          description="After a doctor completes your consultation, the prescription lands here."
          action={
            <Button asChild>
              <Link to="/book">Book appointment</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {mine.map((rx) => (
            <RxCard key={rx.id} rx={rx} doctorName={getDoctor(rx.doctorId)?.name ?? ""} />
          ))}
        </div>
      )}
    </div>
  );
}

function RxCard({ rx, doctorName }: { rx: Prescription; doctorName: string }) {
  const download = () => {
    const text = [
      `CareBridge Clinic — Prescription ${rx.id.toUpperCase()}`,
      `Date: ${prettyDate(rx.date)}`,
      `Doctor: ${doctorName}`,
      `Diagnosis: ${rx.diagnosis}`,
      "",
      "Medications:",
      ...rx.medications.map(
        (m) => `  • ${m.name} — ${m.dosage}, ${m.frequency}, for ${m.duration}`,
      ),
      "",
      `Notes: ${rx.notes}`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rx.id}-prescription.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title={rx.diagnosis}
      description={`${doctorName} · ${prettyDate(rx.date)} · ${rx.id.toUpperCase()}`}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="size-3.5" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={download}>
            <Download className="size-3.5" /> Save
          </Button>
        </>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <th className="pb-2 font-medium">Medication</th>
              <th className="pb-2 font-medium">Dosage</th>
              <th className="pb-2 font-medium">Frequency</th>
              <th className="pb-2 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rx.medications.map((m, i) => (
              <tr key={i}>
                <td className="py-2.5 font-medium">{m.name}</td>
                <td className="py-2.5 text-muted-foreground">{m.dosage}</td>
                <td className="py-2.5 text-muted-foreground">{m.frequency}</td>
                <td className="py-2.5 text-muted-foreground">{m.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rx.notes && (
        <div className="mt-5 rounded-md border border-border bg-linen/70 p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Doctor's notes</p>
          <p className="mt-2 text-sm">{rx.notes}</p>
        </div>
      )}
    </Panel>
  );
}
