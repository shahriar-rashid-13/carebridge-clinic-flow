import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader, Panel } from "@/components/clinic/page";
import { useClinic } from "@/lib/clinic/store";
import { joinWaitlist } from "@/lib/clinic/automations";
import { money, prettyDate, shiftDays, weekdayOf } from "@/lib/clinic/data";
import {
  DEFAULT_DOCTOR_QUERY,
  filterDoctors,
  groupDoctors,
  sortDays,
  specialtiesOf,
  workingDaysOf,
  type DoctorGroup,
  type DoctorQuery,
  type DoctorSort,
} from "@/lib/clinic/doctor-filters";
import { cn } from "@/lib/utils";

const SELECTED_DATE = "selected-date";

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="mt-2">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

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
  const { doctors, bookAppointment, currentPatientId, isSlotTaken, loadTakenSlots, role } =
    useClinic();
  const navigate = useNavigate();
  const active = React.useMemo(() => doctors.filter((d) => d.active), [doctors]);
  const [doctorId, setDoctorId] = React.useState(active[0]?.id ?? "");
  const [date, setDate] = React.useState(shiftDays(1));
  const [slot, setSlot] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [waitSlot, setWaitSlot] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(false);
  const [query, setQuery] = React.useState<DoctorQuery>(DEFAULT_DOCTOR_QUERY);

  const updateQuery = (patch: Partial<DoctorQuery>) => setQuery((q) => ({ ...q, ...patch }));
  const specialties = React.useMemo(() => specialtiesOf(active), [active]);
  const workingDays = React.useMemo(() => workingDaysOf(active), [active]);
  const visible = React.useMemo(
    () =>
      filterDoctors(active, {
        ...query,
        day: query.day === SELECTED_DATE ? weekdayOf(date) : query.day,
      }),
    [active, query, date],
  );
  const sections = React.useMemo(() => groupDoctors(visible, query.group), [visible, query.group]);
  const filtersActive =
    query.search.trim() !== "" || query.specialty !== "all" || query.day !== "any";

  const doctor = doctors.find((d) => d.id === doctorId);
  const dayOk = doctor ? doctor.days.includes(weekdayOf(date)) : false;
  const allTaken = !!doctor && dayOk && doctor.slots.every((s) => isSlotTaken(doctorId, date, s));

  React.useEffect(() => {
    void loadTakenSlots(doctorId, date);
  }, [doctorId, date, loadTakenSlots]);

  React.useEffect(() => {
    if (slot && isSlotTaken(doctorId, date, slot)) setSlot("");
  }, [slot, doctorId, date, isSlotTaken]);

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
      void loadTakenSlots(doctorId, date);
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))]">
          <div className="md:col-span-2 xl:col-span-1">
            <Label htmlFor="doctor-search">Search</Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="doctor-search"
                type="search"
                value={query.search}
                onChange={(e) => updateQuery({ search: e.target.value })}
                placeholder="Name, specialty or room"
                className="pl-9"
              />
            </div>
          </div>
          <FilterSelect
            id="doctor-specialty"
            label="Specialty"
            value={query.specialty}
            onChange={(specialty) => updateQuery({ specialty })}
            options={[
              { value: "all", label: "All specialties" },
              ...specialties.map((s) => ({ value: s, label: s })),
            ]}
          />
          <FilterSelect
            id="doctor-day"
            label="Available on"
            value={query.day}
            onChange={(day) => updateQuery({ day })}
            options={[
              { value: "any", label: "Any day" },
              { value: SELECTED_DATE, label: `Your date (${weekdayOf(date)})` },
              ...workingDays.map((d) => ({ value: d, label: d })),
            ]}
          />
          <FilterSelect
            id="doctor-sort"
            label="Sort by"
            value={query.sort}
            onChange={(sort) => updateQuery({ sort: sort as DoctorSort })}
            options={[
              { value: "name", label: "Name (A–Z)" },
              { value: "fee-asc", label: "Fee (low to high)" },
              { value: "fee-desc", label: "Fee (high to low)" },
              { value: "days", label: "Most available" },
            ]}
          />
          <FilterSelect
            id="doctor-group"
            label="Group by"
            value={query.group}
            onChange={(group) => updateQuery({ group: group as DoctorGroup })}
            options={[
              { value: "none", label: "No grouping" },
              { value: "specialty", label: "Specialty" },
              { value: "availability", label: "Working days" },
            ]}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            Showing {visible.length} of {active.length} doctors
            {doctor && !visible.some((d) => d.id === doctor.id) && (
              <> · Selected: {doctor.name} (hidden by the filters)</>
            )}
          </p>
          {filtersActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setQuery(DEFAULT_DOCTOR_QUERY)}
            >
              Clear filters
            </Button>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="mt-3 rounded-md border border-dashed border-border bg-linen/60 px-4 py-6 text-center text-sm text-muted-foreground">
            No doctor matches these filters.
          </p>
        ) : (
          <div className="mt-3 space-y-6">
            {sections.map((section) => (
              <section key={section.key} aria-label={section.label ?? "Doctors"}>
                {section.label && (
                  <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {section.label} <span className="font-normal">({section.doctors.length})</span>
                  </h3>
                )}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {section.doctors.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        setDoctorId(d.id);
                        setSlot("");
                        setWaitSlot(null);
                      }}
                      className={cn(
                        "flex flex-col rounded-lg border p-4 text-left transition-colors",
                        doctorId === d.id
                          ? "border-primary bg-primary/5"
                          : "border-border bg-card hover:bg-linen",
                      )}
                    >
                      <div className="flex w-full items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.name}</p>
                          <p className="text-xs text-muted-foreground">{d.specialty}</p>
                        </div>
                        {doctorId === d.id && <Check className="size-4 shrink-0 text-primary" />}
                      </div>
                      <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{d.bio}</p>
                      <p className="mt-auto pt-3 text-xs">
                        <span className="text-muted-foreground">Works </span>
                        {sortDays(d.days).join(", ")} · {money(d.fee)}
                      </p>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
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
              {doctor ? `Available ${sortDays(doctor.days).join(", ")}` : ""}
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
                        taken &&
                          waitSlot !== s &&
                          "border-border bg-muted text-muted-foreground/60 line-through",
                        taken &&
                          waitSlot === s &&
                          "border-[#c2185b] bg-muted text-[#c2185b] line-through",
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
                    <Button
                      type="button"
                      size="sm"
                      disabled={joining}
                      onClick={() => void join(waitSlot)}
                    >
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
