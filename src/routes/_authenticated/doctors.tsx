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
  const { role, doctors, patients, appointments, toggleDoctorActive, upsertDoctor, promotePatientToDoctor } = useClinic();
  const [editing, setEditing] = React.useState<Doctor | null>(null);
  const [rawSlots, setRawSlots] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);
  const [patientQuery, setPatientQuery] = React.useState("");
  const [selectedPatientId, setSelectedPatientId] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const openDoctorEditor = (doctor: Doctor) => {
    setIsAdding(false);
    setEditing({ ...doctor });
    setRawSlots(doctor.slots.join(", "));
  };

  const openAddDoctor = () => {
    setIsAdding(true);
    setPatientQuery("");
    setSelectedPatientId("");
    setEditing(emptyDoctor());
    setRawSlots(emptyDoctor().slots.join(", "));
  };

  const selectedPatient = patients.find((patient) => patient.id === selectedPatientId);
  const matchingPatients = patients.filter((patient) => {
    const query = patientQuery.trim().toLowerCase();
    return !query || [patient.name, patient.email, patient.phone].some((value) => value.toLowerCase().includes(query));
  });

  const closeEditor = () => {
    if (isSaving) return;
    setEditing(null);
    setIsAdding(false);
  };

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
          <Button onClick={openAddDoctor}>
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
                  onCheckedChange={async () => {
                    try {
                      await toggleDoctorActive(d.id);
                      toast.success(`${d.name} is now ${d.active ? "unavailable" : "bookable"}`);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not update doctor availability.");
                    }
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => openDoctorEditor(d)}>
                  Edit
                </Button>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && closeEditor()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isAdding ? "Add doctor" : "Edit doctor"}</DialogTitle>
            <DialogDescription>
              {isAdding ? "Select an existing patient, then set their doctor roster." : "Set the roster, slots and consultation fee."}
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              {isAdding && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <Label className="text-xs">Existing patient</Label>
                  {selectedPatient ? (
                    <div className="mt-2 flex items-center justify-between gap-3 rounded-md bg-card p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{selectedPatient.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{selectedPatient.email || "No email on profile"}</p>
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={() => setSelectedPatientId("")} disabled={isSaving}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={patientQuery}
                        onChange={(e) => setPatientQuery(e.target.value)}
                        placeholder="Search by name, email, or phone"
                        className="mt-1.5"
                      />
                      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                        {matchingPatients.map((patient) => (
                          <button
                            key={patient.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-card"
                            onClick={() => setSelectedPatientId(patient.id)}
                          >
                            <span className="min-w-0"><span className="block truncate font-medium">{patient.name}</span><span className="block truncate text-xs text-muted-foreground">{patient.email || patient.phone || "No contact details"}</span></span>
                            <span className="text-xs text-muted-foreground">Select</span>
                          </button>
                        ))}
                        {matchingPatients.length === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">No active patients match that search.</p>}
                      </div>
                    </>
                  )}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {!isAdding && <div>
                  <Label className="text-xs">Name</Label>
                  <Input
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="Dr. Jane Doe"
                    className="mt-1.5"
                  />
                </div>}
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
              {isAdding && (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <Label htmlFor="new-doctor-active" className="text-sm">Bookable immediately</Label>
                    <p className="text-xs text-muted-foreground">Controls whether patients can book this doctor now.</p>
                  </div>
                  <Switch id="new-doctor-active" checked={editing.active} onCheckedChange={(active) => setEditing({ ...editing, active })} />
                </div>
              )}
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
                  value={rawSlots}
                  onChange={(e) => setRawSlots(e.target.value)}
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
            <Button variant="outline" onClick={closeEditor} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!editing) return;
                const slots = rawSlots.split(",").map((slot) => slot.trim()).filter(Boolean);
                if (!editing.specialty.trim()) {
                  toast.error("Specialty is required.");
                  return;
                }
                if (!Number.isFinite(editing.fee) || editing.fee <= 0) {
                  toast.error("Consultation fee must be greater than zero.");
                  return;
                }
                if (editing.days.length === 0 || slots.length === 0) {
                  toast.error("Choose at least one working day and time slot.");
                  return;
                }
                if (isAdding && !selectedPatient) {
                  toast.error("Select an existing patient to promote.");
                  return;
                }
                if (!isAdding && !editing.name.trim()) {
                  toast.error("Name is required.");
                  return;
                }
                try {
                  setIsSaving(true);
                  if (isAdding && selectedPatient) {
                    await promotePatientToDoctor({
                      profileId: selectedPatient.id,
                      specialization: editing.specialty,
                      consultationFee: editing.fee,
                      availableDays: editing.days,
                      slots,
                      active: editing.active,
                      bio: editing.bio,
                      room: editing.room,
                    });
                    toast.success(`${selectedPatient.name} is now a doctor.`);
                  } else {
                    await upsertDoctor({ ...editing, slots });
                    toast.success("Doctor schedule saved");
                  }
                  setEditing(null);
                  setIsAdding(false);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not save doctor schedule.");
                } finally {
                  setIsSaving(false);
                }
              }}
              disabled={isSaving}
            >
              {isSaving ? "Saving…" : "Save doctor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
