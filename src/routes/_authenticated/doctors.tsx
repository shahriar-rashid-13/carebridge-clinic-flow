import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { PageHeader, Panel } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { newDoctorId, useClinic } from "@/lib/clinic/store";
import { money } from "@/lib/clinic/data";
import { WEEKDAYS, type Doctor } from "@/lib/clinic/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/doctors")({
  head: () => ({
    meta: [
      { title: "Manage Doctors — CareBridge" },
      {
        name: "description",
        content: "Configure doctor working days, time slots, consultation fees and availability.",
      },
      { property: "og:title", content: "Manage Doctors — CareBridge" },
      {
        property: "og:description",
        content: "Front desk control over clinic rosters, slots and fees.",
      },
    ],
  }),
  component: DoctorsPage,
});

const emptyDoctor = (): Doctor => ({
  id: newDoctorId(),
  name: "",
  specialty: "",
  fee: 100,
  days: ["Mon", "Wed"],
  slots: ["09:00 AM", "10:00 AM", "11:00 AM"],
  active: true,
  bio: "",
  room: "",
});

function DoctorsPage() {
  const { role, doctors, appointments, toggleDoctorActive, upsertDoctor } = useClinic();
  const [editing, setEditing] = React.useState<Doctor | null>(null);

  if (role !== "receptionist") {
    return (
      <PageHeader
        title="Reception view only"
        description="Switch the role selector to Receptionist to manage doctors."
      />
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Front desk"
        title="Manage doctors"
        description="Working days, slots, fees and booking availability."
        actions={
          <Button onClick={() => setEditing(emptyDoctor())}>
            <Plus className="size-4" /> Add doctor
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {doctors.map((d) => (
          <Panel
            key={d.id}
            title={d.name}
            description={`${d.specialty} · ${d.room || "Room TBD"}`}
            actions={<StatusBadge status={d.active ? "Active" : "Inactive"} />}
          >
            <p className="text-sm text-muted-foreground">{d.bio}</p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w) => (
                <span
                  key={w}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    d.days.includes(w)
                      ? "border-sage-foreground/20 bg-sage text-sage-foreground"
                      : "border-border bg-muted text-muted-foreground/70",
                  )}
                >
                  {w}
                </span>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {d.slots.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border bg-linen px-2.5 py-0.5 text-xs text-muted-foreground"
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <div className="text-xs text-muted-foreground">
                {money(d.fee)} per visit ·{" "}
                {appointments.filter((a) => a.doctorId === d.id).length} appointments
              </div>
              <div className="flex items-center gap-3">
                <Label htmlFor={`sw-${d.id}`} className="text-xs text-muted-foreground">
                  Bookable
                </Label>
                <Switch
                  id={`sw-${d.id}`}
                  checked={d.active}
                  onCheckedChange={() => {
                    toggleDoctorActive(d.id);
                    toast.success(`${d.name} is now ${d.active ? "unavailable" : "bookable"}`);
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => setEditing({ ...d })}>
                  Edit
                </Button>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.name ? "Edit doctor" : "Add doctor"}</DialogTitle>
            <DialogDescription>Set the roster, slots and consultation fee.</DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Dr. Jane Doe"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Specialty</Label>
                  <Input
                    value={editing.specialty}
                    onChange={(e) => setEditing({ ...editing, specialty: e.target.value })}
                    placeholder="Paediatrics"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Consultation fee (USD)</Label>
                  <Input
                    type="number"
                    value={editing.fee}
                    onChange={(e) => setEditing({ ...editing, fee: Number(e.target.value) })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label className="text-xs">Room</Label>
                  <Input
                    value={editing.room}
                    onChange={(e) => setEditing({ ...editing, room: e.target.value })}
                    placeholder="Suite 101"
                    className="mt-1.5"
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Working days</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WEEKDAYS.map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() =>
                        setEditing({
                          ...editing,
                          days: editing.days.includes(w)
                            ? editing.days.filter((x) => x !== w)
                            : [...editing.days, w],
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        editing.days.includes(w)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card",
                      )}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs">Time slots (comma separated)</Label>
                <Input
                  value={editing.slots.join(", ")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      slots: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-xs">Short bio</Label>
                <Textarea
                  rows={3}
                  value={editing.bio}
                  onChange={(e) => setEditing({ ...editing, bio: e.target.value })}
                  className="mt-1.5"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!editing) return;
                if (!editing.name.trim() || !editing.specialty.trim()) {
                  toast.error("Name and specialty are required.");
                  return;
                }
                upsertDoctor(editing);
                toast.success("Doctor schedule saved");
                setEditing(null);
              }}
            >
              Save doctor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
