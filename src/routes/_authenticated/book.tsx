import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Panel } from "@/components/clinic/page";
import { useClinic } from "@/lib/clinic/store";
import { money, prettyDate, shiftDays, weekdayOf } from "@/lib/clinic/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/book")({
  head: () => ({
    meta: [
      { title: "Book an Appointment — CareBridge" },
      {
        name: "description",
        content: "Choose a doctor, pick an open time slot and send your appointment request.",
      },
      { property: "og:title", content: "Book an Appointment — CareBridge" },
      {
        property: "og:description",
        content: "Pick a specialist, an open slot and describe your reason for the visit.",
      },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  const { doctors, bookAppointment, currentPatientId, isSlotTaken, role } = useClinic();
  const navigate = useNavigate();
  const active = doctors.filter((d) => d.active);
  const [doctorId, setDoctorId] = React.useState(active[0]?.id ?? "");
  const [date, setDate] = React.useState(shiftDays(1));
  const [slot, setSlot] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const doctor = doctors.find((d) => d.id === doctorId);
  const dayOk = doctor ? doctor.days.includes(weekdayOf(date)) : false;

  if (role !== "patient") {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Patient view only"
          description="Switch the role selector to Patient to book an appointment."
        />
      </div>
    );
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctor || !slot || !reason.trim()) {
      toast.error("Pick a doctor, a time slot and add a reason.");
      return;
    }
    bookAppointment({ patientId: currentPatientId, doctorId, date, slot, reason, notes });
    toast.success("Appointment requested", {
      description: `${doctor.name} · ${prettyDate(date)} at ${slot}. Reception will confirm shortly.`,
    });
    navigate({ to: "/appointments" });
  };

  return (
    <form onSubmit={submit} className="space-y-8">
      <PageHeader
        eyebrow="Patient portal"
        title="Book an appointment"
        description="Requests are reviewed by reception, usually within a few hours."
      />

      <Panel title="1 · Choose a doctor">
        <div className="grid gap-3 sm:grid-cols-2">
          {active.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => {
                setDoctorId(d.id);
                setSlot("");
              }}
              className={cn(
                "rounded-lg border p-4 text-left transition-colors",
                doctorId === d.id
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-linen",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.specialty}</p>
                </div>
                {doctorId === d.id && <Check className="size-4 shrink-0 text-primary" />}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{d.bio}</p>
              <p className="mt-3 text-xs">
                <span className="text-muted-foreground">Works </span>
                {d.days.join(", ")} · {money(d.fee)}
              </p>
            </button>
          ))}
        </div>
      </Panel>

      <Panel title="2 · Pick a date and time">
        <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              min={shiftDays(0)}
              onChange={(e) => {
                setDate(e.target.value);
                setSlot("");
              }}
              className="mt-2"
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {doctor ? `Available ${doctor.days.join(", ")}` : ""}
            </p>
          </div>
          <div>
            <Label>Time slot</Label>
            {!dayOk ? (
              <p className="mt-3 rounded-md border border-dashed border-border bg-linen/60 px-4 py-6 text-center text-sm text-muted-foreground">
                {doctor?.name} does not hold clinic on {weekdayOf(date)}. Pick another date.
              </p>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                {doctor?.slots.map((s) => {
                  const taken = isSlotTaken(doctorId, date, s);
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={taken}
                      onClick={() => setSlot(s)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                        taken && "cursor-not-allowed border-border bg-muted text-muted-foreground/60 line-through",
                        !taken && slot === s && "border-primary bg-primary text-primary-foreground",
                        !taken && slot !== s && "border-border bg-card hover:bg-linen",
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="3 · Tell us why">
        <div className="space-y-4">
          <div>
            <Label htmlFor="reason">Reason for visit</Label>
            <Input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Blood pressure follow-up"
              className="mt-2"
            />
          </div>
          <div>
            <Label htmlFor="notes">Notes for the doctor (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Symptoms, when they started, anything relevant."
              className="mt-2"
              rows={4}
            />
          </div>
        </div>
      </Panel>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-linen/70 px-5 py-4">
        <p className="min-w-0 text-sm text-muted-foreground">
          {doctor && slot
            ? `${doctor.name} · ${prettyDate(date)} at ${slot} · ${money(doctor.fee)}`
            : "Select a doctor and a slot to continue."}
        </p>
        <Button type="submit" disabled={!slot || !reason.trim()}>
          Request appointment
        </Button>
      </div>
    </form>
  );
}
