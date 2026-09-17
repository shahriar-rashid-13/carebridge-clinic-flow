import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, PageHeader, Panel } from "@/components/clinic/page";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate } from "@/lib/clinic/data";
import type { Medication } from "@/lib/clinic/types";

export const Route = createFileRoute("/_authenticated/consult/$id")({
  head: () => ({
    meta: [
      { title: "Consultation — CareBridge" },
      {
        name: "description",
        content: "Record a diagnosis, write the prescription and complete the appointment.",
      },
      { property: "og:title", content: "Consultation — CareBridge" },
      {
        property: "og:description",
        content: "Patient context, diagnosis, medications and notes in one consultation screen.",
      },
    ],
  }),
  component: ConsultPage,
});

const blank = (): Medication => ({ name: "", dosage: "", frequency: "", duration: "" });

function ConsultPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { appointments, getPatient, getDoctor, completeConsultation, prescriptions, role } =
    useClinic();
  const appt = appointments.find((a) => a.id === id);
  const [diagnosis, setDiagnosis] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [meds, setMeds] = React.useState<Medication[]>([blank()]);

  if (!appt) {
    return (
      <EmptyState
        title="Appointment not found"
        description="It may have been cancelled or rescheduled."
        action={
          <Button asChild>
            <Link to="/appointments">Back to appointments</Link>
          </Button>
        }
      />
    );
  }

  const patient = getPatient(appt.patientId);
  const doctor = getDoctor(appt.doctorId);
  const existing = prescriptions.find((p) => p.appointmentId === appt.id);

  const update = (i: number, key: keyof Medication, v: string) =>
    setMeds((prev) => prev.map((m, idx) => (idx === i ? { ...m, [key]: v } : m)));

  const submit = () => {
    const filled = meds.filter((m) => m.name.trim());
    if (!diagnosis.trim()) {
      toast.error("Add a diagnosis before completing the visit.");
      return;
    }
    if (filled.length === 0) {
      toast.error("Add at least one medication.");
      return;
    }
    completeConsultation({ appointmentId: appt.id, diagnosis, medications: filled, notes });
    toast.success("Prescription issued", {
      description: `${patient?.name}'s visit is marked completed and the prescription is in their portal.`,
    });
    navigate({ to: "/appointments" });
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Consultation"
        title={patient?.name ?? "Patient"}
        description={`${appt.reason} · ${prettyDate(appt.date)} at ${appt.slot} · ${doctor?.name}`}
        actions={
          <Button variant="outline" asChild>
            <Link to="/appointments">Back</Link>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <Panel title="Patient context">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Age / sex</dt>
              <dd>
                {patient ? new Date().getFullYear() - Number(patient.dob.slice(0, 4)) : "—"} ·{" "}
                {patient?.gender}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Blood type</dt>
              <dd>{patient?.bloodType}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Conditions</dt>
              <dd className="mt-1">{patient?.conditions.join(", ") || "None"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Allergies</dt>
              <dd className="mt-1 text-rose-foreground">
                {patient?.allergies.join(", ") || "None"}
              </dd>
            </div>
            {appt.notes && (
              <div className="rounded-md border border-border bg-linen/70 p-3 text-xs">
                <span className="text-muted-foreground">Patient note: </span>
                {appt.notes}
              </div>
            )}
          </dl>
        </Panel>

        {existing || appt.status === "Completed" ? (
          <Panel title="Visit completed">
            <p className="text-sm text-muted-foreground">
              A prescription was already issued for this appointment.
            </p>
            {existing && (
              <div className="mt-4 rounded-md border border-border bg-linen/60 p-4 text-sm">
                <p className="font-medium">{existing.diagnosis}</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {existing.medications.map((m, i) => (
                    <li key={i}>
                      {m.name} — {m.dosage}, {m.frequency}, {m.duration}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Panel>
        ) : (
          <div className="space-y-6">
            <Panel title="Diagnosis">
              <Input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Stage 1 hypertension, no end-organ damage"
              />
            </Panel>

            <Panel
              title="Medications"
              actions={
                <Button variant="outline" size="sm" onClick={() => setMeds((m) => [...m, blank()])}>
                  <Plus className="size-3.5" /> Add
                </Button>
              }
            >
              <div className="space-y-4">
                {meds.map((m, i) => (
                  <div
                    key={i}
                    className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2"
                  >
                    <div>
                      <Label className="text-xs">Medication</Label>
                      <Input
                        value={m.name}
                        onChange={(e) => update(i, "name", e.target.value)}
                        placeholder="Amlodipine"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Dosage</Label>
                      <Input
                        value={m.dosage}
                        onChange={(e) => update(i, "dosage", e.target.value)}
                        placeholder="5 mg"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Frequency</Label>
                      <Input
                        value={m.frequency}
                        onChange={(e) => update(i, "frequency", e.target.value)}
                        placeholder="Once daily, morning"
                        className="mt-1.5"
                      />
                    </div>
                    <div className="flex items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Label className="text-xs">Duration</Label>
                        <Input
                          value={m.duration}
                          onChange={(e) => update(i, "duration", e.target.value)}
                          placeholder="30 days"
                          className="mt-1.5"
                        />
                      </div>
                      {meds.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Remove medication"
                          onClick={() => setMeds((prev) => prev.filter((_, idx) => idx !== i))}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Doctor's notes">
              <Textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Follow-up instructions, lifestyle advice, referrals."
              />
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <Button variant="outline" asChild>
                  <Link to="/appointments">Discard</Link>
                </Button>
                <Button onClick={submit} disabled={role !== "doctor"}>
                  Issue prescription & complete
                </Button>
              </div>
              {role !== "doctor" && (
                <p className="mt-3 text-right text-xs text-muted-foreground">
                  Switch to the Doctor role to sign this off.
                </p>
              )}
            </Panel>
          </div>
        )}
      </div>
    </div>
  );
}
