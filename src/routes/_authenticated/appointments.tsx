import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { CalendarClock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, Panel } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate, weekdayOf } from "@/lib/clinic/data";
import type { Appointment, AppointmentStatus } from "@/lib/clinic/types";

export const Route = createFileRoute("/_authenticated/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — CareBridge" },
      {
        name: "description",
        content:
          "Track requested, confirmed, completed and cancelled appointments across the clinic.",
      },
      { property: "og:title", content: "Appointments — CareBridge" },
      {
        property: "og:description",
        content: "Confirm requests, reschedule visits and follow every appointment status.",
      },
    ],
  }),
  component: AppointmentsPage,
});

const STATUSES: (AppointmentStatus | "All")[] = [
  "All",
  "Requested",
  "Confirmed",
  "Completed",
  "Cancelled",
];

function AppointmentsPage() {
  const clinic = useClinic();
  const { role, appointments, currentPatientId, currentDoctor, getDoctor, getPatient } = clinic;
  const [status, setStatus] = React.useState<AppointmentStatus | "All">("All");
  const [q, setQ] = React.useState("");
  const [detail, setDetail] = React.useState<Appointment | null>(null);
  const [cancelling, setCancelling] = React.useState<Appointment | null>(null);
  const [rescheduling, setRescheduling] = React.useState<Appointment | null>(null);

  const scoped = appointments.filter((a) =>
    role === "patient"
      ? a.patientId === currentPatientId
      : role === "doctor"
        ? a.doctorId === currentDoctor.id
        : true,
  );

  const list = scoped
    .filter((a) => status === "All" || a.status === status)
    .filter((a) => {
      if (!q.trim()) return true;
      const hay = [
        getPatient(a.patientId)?.name,
        getDoctor(a.doctorId)?.name,
        a.reason,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const title =
    role === "patient" ? "My appointments" : role === "doctor" ? "My appointments" : "Appointments";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={role === "receptionist" ? "Front desk" : role === "doctor" ? "Clinician" : "Patient portal"}
        title={title}
        description={
          role === "receptionist"
            ? "Confirm incoming requests, reschedule or cancel on behalf of patients."
            : role === "doctor"
              ? "Everything assigned to you, filterable by status."
              : "Your requests and visits with their current status."
        }
        actions={
          role === "patient" ? (
            <Button asChild>
              <Link to="/book">New appointment</Link>
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                "rounded-full border px-3.5 py-1.5 text-xs transition-colors " +
                (status === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-linen")
              }
            >
              {s}
              {s !== "All" && ` (${scoped.filter((a) => a.status === s).length})`}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={role === "patient" ? "Search doctor or reason" : "Search patient, doctor…"}
            className="pl-9"
          />
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          title="No appointments match"
          description="Try a different status filter or clear the search."
        />
      ) : (
        <Panel className="overflow-hidden">
          <ul className="divide-y divide-border">
            {list.map((a) => {
              const doc = getDoctor(a.doctorId);
              const pat = getPatient(a.patientId);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {role === "patient" ? doc?.name : pat?.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {role === "patient" ? doc?.specialty : doc?.name} · {prettyDate(a.date)} at{" "}
                      {a.slot}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{a.reason}</p>
                  </div>
                  <StatusBadge status={a.status} />
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => setDetail(a)}>
                      Details
                    </Button>
                    {role === "receptionist" && a.status === "Requested" && (
                      <>
                        <Button
                          size="sm"
                          onClick={async () => {
                            try {
                              await clinic.setAppointmentStatus(a.id, "Confirmed");
                              toast.success("Appointment confirmed", {
                                description: `${pat?.name} with ${doc?.name} on ${prettyDate(a.date)}.`,
                              });
                            } catch (error) {
                              toast.error(error instanceof Error ? error.message : "Could not confirm appointment.");
                            }
                          }}
                        >
                          Confirm
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setRescheduling(a)}>
                          Reschedule
                        </Button>
                      </>
                    )}
                    {role === "doctor" && a.status === "Confirmed" && (
                      <Button size="sm" asChild>
                        <Link to="/consult/$id" params={{ id: a.id }}>
                          Consult
                        </Link>
                      </Button>
                    )}
                    {(a.status === "Requested" || a.status === "Confirmed") &&
                      role !== "doctor" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setCancelling(a)}
                        >
                          Cancel
                        </Button>
                      )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Appointment details</DialogTitle>
            <DialogDescription>
              {detail && `${prettyDate(detail.date)} at ${detail.slot}`}
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Patient</dt>
                <dd>{getPatient(detail.patientId)?.name}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Doctor</dt>
                <dd>
                  {getDoctor(detail.doctorId)?.name} · {getDoctor(detail.doctorId)?.specialty}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <StatusBadge status={detail.status} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Reason</dt>
                <dd className="text-right">{detail.reason}</dd>
              </div>
              {detail.notes && (
                <div className="rounded-md border border-border bg-linen/70 p-3 text-xs">
                  {detail.notes}
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Requested on</dt>
                <dd>{prettyDate(detail.createdAt)}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <RescheduleDialog appt={rescheduling} onClose={() => setRescheduling(null)} />

      <AlertDialog open={!!cancelling} onOpenChange={(o) => !o && setCancelling(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelling &&
                `${getPatient(cancelling.patientId)?.name} with ${getDoctor(cancelling.doctorId)?.name} on ${prettyDate(cancelling.date)} at ${cancelling.slot}. This frees up the slot.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!cancelling) return;
                try {
                  await clinic.setAppointmentStatus(cancelling.id, "Cancelled");
                  toast.success("Appointment cancelled");
                  setCancelling(null);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not cancel appointment.");
                }
              }}
            >
              Cancel appointment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RescheduleDialog({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const { getDoctor, rescheduleAppointment, isSlotTaken } = useClinic();
  const [date, setDate] = React.useState("");
  const [slot, setSlot] = React.useState("");

  React.useEffect(() => {
    if (appt) {
      setDate(appt.date);
      setSlot(appt.slot);
    }
  }, [appt]);

  const doc = appt ? getDoctor(appt.doctorId) : undefined;
  const dayOk = doc && date ? doc.days.includes(weekdayOf(date)) : false;

  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule appointment</DialogTitle>
          <DialogDescription>
            {doc && `${doc.name} works ${doc.days.join(", ")}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="rdate">New date</Label>
            <Input
              id="rdate"
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setSlot("");
              }}
              className="mt-2"
            />
          </div>
          <div>
            <Label>New slot</Label>
            {!dayOk ? (
              <p className="mt-2 text-xs text-muted-foreground">
                No clinic on {date ? weekdayOf(date) : "that day"}. Pick another date.
              </p>
            ) : (
              <Select value={slot} onValueChange={setSlot}>
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Pick a slot" />
                </SelectTrigger>
                <SelectContent>
                  {doc?.slots.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      disabled={appt ? isSlotTaken(appt.doctorId, date, s) && s !== appt.slot : false}
                    >
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button
            disabled={!slot || !dayOk}
            onClick={async () => {
              if (!appt) return;
              try {
                await rescheduleAppointment(appt.id, date, slot);
                toast.success("Appointment rescheduled", {
                  description: `Now ${prettyDate(date)} at ${slot} — confirmed.`,
                });
                onClose();
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Could not reschedule appointment.");
              }
            }}
          >
            <CalendarClock className="size-4" /> Save & confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
