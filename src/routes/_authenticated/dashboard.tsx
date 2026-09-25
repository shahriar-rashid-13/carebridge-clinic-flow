import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CalendarPlus, Clock, HeartPulse, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { useClinic } from "@/lib/clinic/store";
import { money, prettyDate, today } from "@/lib/clinic/data";
import { useTheme } from "@/lib/theme/theme-context";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — CareBridge Clinic" },
      {
        name: "description",
        content:
          "One dashboard for patients, doctors and reception: visits, prescriptions, queues and billing.",
      },
      { property: "og:title", content: "Dashboard — CareBridge Clinic" },
      {
        property: "og:description",
        content: "Switch between patient, doctor and reception views of the same clinic day.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { role } = useClinic();
  if (role === "doctor") return <DoctorDashboard />;
  if (role === "receptionist") return <ReceptionDashboard />;
  return <PatientDashboard />;
}

function PatientDashboard() {
  const { appointments, prescriptions, currentPatient, getDoctor } = useClinic();
  const { theme } = useTheme();
  const isVibrant = theme === "vibrant";
  const mine = appointments.filter((a) => a.patientId === currentPatient.id);
  const upcoming = mine
    .filter((a) => (a.status === "Confirmed" || a.status === "Requested") && a.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date));
  const myRx = prescriptions.filter((p) => p.patientId === currentPatient.id);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Patient portal"
        title={`Good day, ${currentPatient.name.split(" ")[0]}.`}
        description="Your visits, prescriptions and health summary in one quiet place."
        actions={
          <Button
            asChild
            variant={isVibrant ? "3d-primary" : undefined}
            className={!isVibrant ? "bg-[#123f35] text-white hover:bg-[#0b2e27]" : ""}
          >
            <Link to="/book">
              <CalendarPlus className="size-4" /> Book appointment
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Upcoming visits" value={upcoming.length} tone={isVibrant ? "sage" : "sage"} />
        <StatCard label="Prescriptions" value={myRx.length} tone={isVibrant ? "rose" : "sand"} />
        <StatCard label="Blood type" value={currentPatient.bloodType} tone={isVibrant ? "mist" : "mist"} />
        <StatCard
          label="Allergies"
          value={currentPatient.allergies.length || "None"}
          hint={currentPatient.allergies.join(", ") || "Nothing on file"}
          tone={isVibrant ? "terracotta" : "terracotta"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Upcoming visits"
          actions={
            <Button variant="ghost" size="sm" asChild className="text-[#123f35] hover:bg-[#f1eee6]">
              <Link to="/appointments">
                All <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState
              title="No upcoming visits"
              description="When you book an appointment it will appear here."
              action={
                <Button asChild className="bg-[#123f35] text-white hover:bg-[#0b2e27]">
                  <Link to="/book">Book appointment</Link>
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-[rgba(23,42,37,0.08)]">
              {upcoming.map((a) => {
                const doc = getDoctor(a.doctorId);
                return (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#172a25]">{doc?.name}</p>
                      <p className="truncate text-xs text-[#5f6b66]">
                        {doc?.specialty} · {prettyDate(a.date)} at {a.slot}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <Panel
          title="Recent prescriptions"
          actions={
            <Button variant="ghost" size="sm" asChild className="text-[#123f35] hover:bg-[#f1eee6]">
              <Link to="/prescriptions">
                All <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          }
        >
          {myRx.length === 0 ? (
            <EmptyState title="No prescriptions yet" />
          ) : (
            <ul className="space-y-4">
              {myRx.slice(0, 3).map((rx) => (
                <li key={rx.id} className="rounded-[12px] border border-[rgba(23,42,37,0.08)] bg-[#f7f2e9] p-4">
                  <p className="text-sm font-medium text-[#172a25]">{rx.diagnosis}</p>
                  <p className="mt-1 text-xs text-[#5f6b66]">
                    {getDoctor(rx.doctorId)?.name} · {prettyDate(rx.date)}
                  </p>
                  <p className="mt-2 text-xs text-[#5f6b66]">
                    {rx.medications.map((m) => m.name).join(", ")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Health summary">
        <dl className="grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-[#5f6b66]">
              Conditions
            </dt>
            <dd className="mt-2 text-sm text-[#172a25]">
              {currentPatient.conditions.join(", ") || "None recorded"}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-[#5f6b66]">Allergies</dt>
            <dd className="mt-2 text-sm text-[#172a25]">{currentPatient.allergies.join(", ") || "None"}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-[#5f6b66]">Emergency</dt>
            <dd className="mt-2 text-sm text-[#172a25]">
              {currentPatient.emergency.name} · {currentPatient.emergency.phone}
            </dd>
          </div>
        </dl>
      </Panel>
    </div>
  );
}

function DoctorDashboard() {
  const { appointments, currentDoctor, getPatient, prescriptions } = useClinic();
  const { theme } = useTheme();
  const isVibrant = theme === "vibrant";
  const mine = appointments.filter((a) => a.doctorId === currentDoctor.id);
  const todays = mine
    .filter((a) => a.date === today() && a.status === "Confirmed")
    .sort((a, b) => a.slot.localeCompare(b.slot));
  const pending = mine.filter((a) => a.status === "Requested");
  const completed = mine.filter((a) => a.status === "Completed");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Clinician"
        title={`Today's list, ${currentDoctor.name.replace("Dr. ", "Dr. ")}`}
        description={`${currentDoctor.specialty} · ${currentDoctor.room}`}
        actions={
          <Button
            variant={isVibrant ? "3d-mist" : "outline"}
            asChild
            className={!isVibrant ? "border-[rgba(23,42,37,0.15)] text-[#172a25] hover:bg-[#f1eee6]" : ""}
          >
            <Link to="/schedule">
              <Clock className="size-4" /> My schedule
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Today's patients" value={todays.length} tone={isVibrant ? "sage" : "sage"} />
        <StatCard label="Awaiting confirmation" value={pending.length} tone={isVibrant ? "sand" : "sand"} />
        <StatCard label="Visits completed" value={completed.length} tone={isVibrant ? "mist" : "mist"} />
        <StatCard
          label="Prescriptions issued"
          value={prescriptions.filter((p) => p.doctorId === currentDoctor.id).length}
          tone={isVibrant ? "lavender" : "terracotta"}
        />
      </div>

      <Panel
        title="Patient queue — today"
        description="Confirmed appointments ready for consultation."
      >
        {todays.length === 0 ? (
          <EmptyState
            title="Nothing on the list today"
            description="Confirmed appointments for today will show up here."
          />
        ) : (
          <ul className="divide-y divide-[rgba(23,42,37,0.08)]">
            {todays.map((a) => {
              const p = getPatient(a.patientId);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                  <span className="w-20 shrink-0 text-sm tabular-nums text-[#5f6b66]">
                    {a.slot}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#172a25]">{p?.name}</p>
                    <p className="truncate text-xs text-[#5f6b66]">{a.reason}</p>
                  </div>
                  <Button size="sm" asChild className="bg-[#123f35] text-white hover:bg-[#0b2e27]">
                    <Link to="/consult/$id" params={{ id: a.id }}>
                      Open consultation
                    </Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Availability">
          <div className="flex flex-wrap gap-2">
            {currentDoctor.slots.map((d) => (
              <span
                key={d}
                className="rounded-full border border-[rgba(23,42,37,0.08)] bg-[#dce8e1] px-3 py-1 text-xs text-[#234d43]"
              >
                {d}
              </span>
            ))}
          </div>
          <p className="mt-4 text-xs text-[#5f6b66]">
            {currentDoctor.slots.length} slots per working day · {money(currentDoctor.fee)}{" "}
            consultation fee
          </p>
        </Panel>
        <Panel title="Recent patients">
          <ul className="space-y-3">
            {completed.slice(0, 4).map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-[#172a25]">{getPatient(a.patientId)?.name}</span>
                <span className="shrink-0 text-xs text-[#5f6b66]">{prettyDate(a.date)}</span>
              </li>
            ))}
            {completed.length === 0 && <EmptyState title="No completed visits yet" />}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function ReceptionDashboard() {
  const { appointments, invoices, patients, getPatient, getDoctor } = useClinic();
  const { theme } = useTheme();
  const isVibrant = theme === "vibrant";
  const todays = appointments.filter((a) => a.date === today());
  const pending = appointments.filter((a) => a.status === "Requested");
  const revenue = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.total, 0);
  const outstanding = invoices
    .filter((i) => i.status === "Unpaid")
    .reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Front desk"
        title="Reception overview"
        description="Clara Morgan · Everything moving through the clinic today."
        actions={
          <Button
            asChild
            variant={isVibrant ? "3d-terracotta" : undefined}
            className={!isVibrant ? "bg-[#123f35] text-white hover:bg-[#0b2e27]" : ""}
          >
            <Link to="/appointments">
              <Users className="size-4" /> Manage requests
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Arrivals today" value={todays.length} tone={isVibrant ? "sage" : "sage"} />
        <StatCard label="Pending requests" value={pending.length} tone={isVibrant ? "sand" : "sand"} />
        <StatCard label="Registered patients" value={patients.length} tone={isVibrant ? "mist" : "mist"} />
        <StatCard
          label="Revenue collected"
          value={money(revenue)}
          hint={`${money(outstanding)} outstanding`}
          tone={isVibrant ? "rose" : "terracotta"}
        />
      </div>

      {pending.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-[12px] border border-[#e9d6c7] bg-[#e9d6c7]/50 px-5 py-4">
          <HeartPulse className="size-5 shrink-0 text-[#8d6738]" />
          <p className="min-w-0 flex-1 text-sm text-[#8d6738]">
            {pending.length} appointment request{pending.length > 1 ? "s" : ""} waiting for
            confirmation.
          </p>
          <Button size="sm" variant="outline" asChild className="border-[#8d6738] text-[#8d6738] hover:bg-[#e9d6c7]">
            <Link to="/appointments">Review</Link>
          </Button>
        </div>
      )}

      <Panel title="Today's schedule">
        {todays.length === 0 ? (
          <EmptyState title="Nothing booked today" />
        ) : (
          <ul className="divide-y divide-[rgba(23,42,37,0.08)]">
            {todays
              .sort((a, b) => a.slot.localeCompare(b.slot))
              .map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                  <span className="w-20 shrink-0 text-sm tabular-nums text-[#5f6b66]">
                    {a.slot}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[#172a25]">{getPatient(a.patientId)?.name}</p>
                    <p className="truncate text-xs text-[#5f6b66]">
                      {getDoctor(a.doctorId)?.name} · {a.reason}
                    </p>
                  </div>
                  <StatusBadge status={a.status} />
                </li>
              ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
