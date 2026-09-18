import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState, PageHeader, Panel } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { useClinic } from "@/lib/clinic/store";
import { money, prettyDate, shiftDays, weekdayOf } from "@/lib/clinic/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/schedule")({
  head: () => ({
    meta: [
      { title: "My Schedule — CareBridge" },
      {
        name: "description",
        content: "A doctor's weekly clinic view with confirmed appointments and availability.",
      },
      { property: "og:title", content: "My Schedule — CareBridge" },
      {
        property: "og:description",
        content: "See the week ahead, slot by slot, and toggle your availability.",
      },
    ],
  }),
  component: SchedulePage,
});

function SchedulePage() {
  const { role, currentDoctor, appointments, getPatient, toggleDoctorActive } = useClinic();
  const [selected, setSelected] = React.useState(shiftDays(0));

  if (role !== "doctor") {
    return (
      <PageHeader
        title="Doctor view only"
        description="Switch the role selector to Doctor to see this schedule."
      />
    );
  }

  const week = Array.from({ length: 7 }, (_, i) => shiftDays(i));
  const dayList = appointments
    .filter((a) => a.doctorId === currentDoctor.id && a.date === selected && a.status !== "Cancelled")
    .sort((a, b) => a.slot.localeCompare(b.slot));

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Clinician"
        title="My schedule"
        description={`${currentDoctor.specialty} · ${currentDoctor.room} · ${money(currentDoctor.fee)} per consultation`}
        actions={
          <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
            <Label htmlFor="avail" className="text-xs text-muted-foreground">
              Accepting patients
            </Label>
            <Switch
              id="avail"
              checked={currentDoctor.active}
              onCheckedChange={async () => {
                try {
                  await toggleDoctorActive(currentDoctor.id);
                  toast.success(
                    currentDoctor.active ? "Marked unavailable" : "Marked available for booking",
                  );
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not update availability.");
                }
              }}
            />
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {week.map((d) => {
          const works = currentDoctor.days.includes(weekdayOf(d));
          const count = appointments.filter(
            (a) => a.doctorId === currentDoctor.id && a.date === d && a.status === "Confirmed",
          ).length;
          return (
            <button
              key={d}
              onClick={() => setSelected(d)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                selected === d ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-linen",
              )}
            >
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
                {weekdayOf(d)}
              </p>
              <p className="font-display mt-1 text-lg leading-none">
                {new Date(`${d}T12:00:00`).getDate()}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {works ? `${count} booked` : "Off"}
              </p>
            </button>
          );
        })}
      </div>

      <Panel title={prettyDate(selected)} description="Slots for the selected day.">
        {!currentDoctor.days.includes(weekdayOf(selected)) ? (
          <EmptyState title="No clinic this day" description="You don't hold clinic hours here." />
        ) : (
          <ul className="divide-y divide-border">
            {currentDoctor.slots.map((s) => {
              const appt = dayList.find((a) => a.slot === s);
              return (
                <li key={s} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                  <span className="w-20 shrink-0 text-sm tabular-nums text-muted-foreground">
                    {s}
                  </span>
                  {appt ? (
                    <>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {getPatient(appt.patientId)?.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{appt.reason}</p>
                      </div>
                      <StatusBadge status={appt.status} />
                      {appt.status === "Confirmed" && (
                        <Button size="sm" asChild>
                          <Link to="/consult/$id" params={{ id: appt.id }}>
                            Consult
                          </Link>
                        </Button>
                      )}
                    </>
                  ) : (
                    <span className="flex-1 text-sm text-muted-foreground">Open</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
