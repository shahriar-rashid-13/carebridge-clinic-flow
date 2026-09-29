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
import { joinWaitlist } from "@/lib/clinic/automations";
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
  const [waitSlot, setWaitSlot] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);

  const doctor = doctors.find((d) => d.id === doctorId);
  const dayOk = doctor ? doctor.days.includes(weekdayOf(date)) : false;
  const allTaken = !!doctor && dayOk && doctor.slots.every((s) => isSlotTaken(doctorId, date, s));

  const join = async (preferredSlot: string | null) => {
    if (!doctor) return;
    setJoining(true);
    try {
      await joinWaitlist(doctorId, date, preferredSlot, reason.trim());
      toast.success("You're on the waitlist", {
        description: `${doctor.name} · ${prettyDate(date)} · ${preferredSlot ?? "any slot"}. We'll offer it to you if it opens up.`,
      });
      navigate({ to: "/appointments" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not join the waitlist.");
    } finally {
      setJoining(false);
    }
  };

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doctor || !slot || !reason.trim()) {
      toast.error("Pick a doctor, a time slot and add a reason.");
      return;
    }
    try {
      await bookAppointment({ patientId: currentPatientId, doctorId, date, slot, reason, notes });
      toast.success("Appointment requested", {
        description: `${doctor.name} · ${prettyDate(date)} at ${slot}. Reception will confirm shortly.`,
      });
      navigate({ to: "/appointments" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not request appointment.");
    }
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
                setWaitSlot(null);
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
                setWaitSlot(null);
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
                      title={taken ? "Taken. Click to join the waitlist." : undefined}
                      onClick={() => {
                        if (taken) {
                          setSlot("");
                          setWaitSlot(s);
                        } else {
                          setSlot(s);
                          setWaitSlot(null);
                        }
                      }}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-xs transition-colors",
                        taken && waitSlot !== s && "border-border bg-muted text-muted-foreground/60 line-through",
                        taken && waitSlot === s && "border-[#c2185b] bg-muted text-[#c2185b] line-through",
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
            {dayOk && (waitSlot || allTaken) && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-linen/60 px-4 py-3">
                <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                  {waitSlot
                    ? `${waitSlot} is taken. Join the waitlist and it is offered to you automatically if it is cancelled.`
                    : "Every slot on this day is taken. Join the waitlist for the first one that opens up."}
                </p>
                <div className="flex gap-2">
                  {waitSlot && (
                    <Button type="button" size="sm" disabled={joining} onClick={() => void join(waitSlot)}>
                      Wait for {waitSlot}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={waitSlot ? "outline" : "default"}
                    disabled={joining}
                    onClick={() => void join(null)}
                  >
                    Any slot that day
                  </Button>
                </div>
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
