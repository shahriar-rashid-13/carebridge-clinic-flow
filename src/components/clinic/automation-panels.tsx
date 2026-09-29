import * as React from "react";
import { toast } from "sonner";
import { Clock, Play, Sparkles, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/clinic/page";
import { useClinic } from "@/lib/clinic/store";
import { prettyDate } from "@/lib/clinic/data";
import { supabase } from "@/lib/supabase/client";
import {
  acceptWaitlistOffer,
  declineWaitlistOffer,
  leaveWaitlist,
  resolveFollowup,
  runAutomationsNow,
  useAutomationRefresh,
  type Followup,
  type WaitlistEntry,
  type WaitlistOffer,
} from "@/lib/clinic/automations";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

function useNow(intervalMs = 30_000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

const minutesLeft = (expiresAt: string, now: number) =>
  Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));

function useWaitlistData() {
  const [entries, setEntries] = React.useState<WaitlistEntry[]>([]);
  const [offers, setOffers] = React.useState<WaitlistOffer[]>([]);

  const load = React.useCallback(async () => {
    const [entryResult, offerResult] = await Promise.all([
      supabase
        .from("waitlist")
        .select("id, patient_id, doctor_id, preferred_date, preferred_slot, reason, status, created_at")
        .in("status", ["waiting", "offered"])
        .order("created_at", { ascending: true }),
      supabase
        .from("waitlist_offers")
        .select("id, waitlist_id, patient_id, doctor_id, offer_date, time_slot, status, expires_at, created_at")
        .eq("status", "pending")
        .order("expires_at", { ascending: true }),
    ]);
    if (entryResult.data) setEntries(entryResult.data as WaitlistEntry[]);
    if (offerResult.data) setOffers(offerResult.data as WaitlistOffer[]);
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);
  useAutomationRefresh(load);

  return { entries, offers, reload: load };
}

// ---------------------------------------------------------------- patient

export function PatientWaitlistPanel() {
  const { getDoctor, reload: reloadClinic } = useClinic();
  const { entries, offers, reload } = useWaitlistData();
  const [busy, setBusy] = React.useState<string | null>(null);
  const now = useNow();

  if (entries.length === 0 && offers.length === 0) return null;

  const act = async (id: string, action: () => Promise<unknown>, success: string, fallback: string) => {
    setBusy(id);
    try {
      await action();
      toast.success(success);
      await Promise.all([reload(), reloadClinic()]);
    } catch (error) {
      toast.error(errorMessage(error, fallback));
      await reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Waitlist"
      description="When a matching slot is cancelled, it is offered to you automatically."
    >
      <div className="space-y-4">
        {offers.map((offer) => {
          const doctor = getDoctor(offer.doctor_id);
          const left = minutesLeft(offer.expires_at, now);
          return (
            <div
              key={offer.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-[#2d5a3d]/30 bg-[#dce8e1]/50 p-4"
            >
              <Sparkles className="size-5 shrink-0 text-[#2d5a3d]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">A slot opened up for you</p>
                <p className="text-xs text-muted-foreground">
                  {doctor?.name ?? "Doctor"} · {prettyDate(offer.offer_date)} at {offer.time_slot}
                </p>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <Clock className="size-3" />
                  {left > 0 ? `Expires in ${left} min` : "Expiring now"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(
                      offer.id,
                      () => acceptWaitlistOffer(offer.id),
                      "Slot booked. Reception will confirm it.",
                      "Could not accept the offer.",
                    )
                  }
                >
                  Accept
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(
                      offer.id,
                      () => declineWaitlistOffer(offer.id),
                      "Offer declined. It goes to the next patient.",
                      "Could not decline the offer.",
                    )
                  }
                >
                  Decline
                </Button>
              </div>
            </div>
          );
        })}

        {entries.length > 0 && (
          <ul className="divide-y divide-border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{getDoctor(entry.doctor_id)?.name ?? "Doctor"}</p>
                  <p className="text-xs text-muted-foreground">
                    {prettyDate(entry.preferred_date)} · {entry.preferred_slot ?? "any slot"} ·{" "}
                    {entry.status === "offered" ? "offer pending" : "waiting"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={busy !== null}
                  onClick={() =>
                    void act(
                      entry.id,
                      () => leaveWaitlist(entry.id),
                      "You left the waitlist.",
                      "Could not leave the waitlist.",
                    )
                  }
                >
                  Leave
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- receptionist

export function ReceptionAutomationsPanel() {
  const { appointments, getDoctor, getPatient } = useClinic();
  const { entries, offers, reload: reloadWaitlist } = useWaitlistData();
  const [followups, setFollowups] = React.useState<Followup[]>([]);
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  const [running, setRunning] = React.useState(false);
  const [resolving, setResolving] = React.useState<string | null>(null);
  const now = useNow();

  const loadFollowups = React.useCallback(async () => {
    const { data } = await supabase
      .from("appointment_followups")
      .select("id, appointment_id, reason, status, note, resolved_at, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: false });
    if (data) setFollowups(data as Followup[]);
  }, []);

  React.useEffect(() => {
    void loadFollowups();
  }, [loadFollowups]);
  useAutomationRefresh(loadFollowups);

  const runNow = async () => {
    setRunning(true);
    try {
      const result = await runAutomationsNow();
      toast.success("Automations ran", {
        description: `${result.reminders} reminder(s), ${result.no_shows} no-show(s) flagged, ${result.offers_expired} offer(s) expired, ${result.offers_made} new offer(s).`,
      });
      await Promise.all([loadFollowups(), reloadWaitlist()]);
    } catch (error) {
      toast.error(errorMessage(error, "Could not run automations."));
    } finally {
      setRunning(false);
    }
  };

  const resolve = async (id: string) => {
    setResolving(id);
    try {
      await resolveFollowup(id, notes[id] ?? "");
      toast.success("Follow-up resolved");
      await loadFollowups();
    } catch (error) {
      toast.error(errorMessage(error, "Could not resolve the follow-up."));
    } finally {
      setResolving(null);
    }
  };

  const offerFor = (entryId: string) => offers.find((offer) => offer.waitlist_id === entryId);

  return (
    <Panel
      title="Automations"
      description="Reminders and no-show checks run every 15 minutes. Cancelled slots go to the waitlist instantly."
      actions={
        <Button size="sm" variant="outline" disabled={running} onClick={() => void runNow()}>
          <Play className="size-4" /> {running ? "Running…" : "Run now"}
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <UserX className="size-4" /> No-show follow-ups ({followups.length})
          </h3>
          {followups.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              No open follow-ups.
            </p>
          ) : (
            <ul className="space-y-3">
              {followups.map((followup) => {
                const appointment = appointments.find((item) => item.id === followup.appointment_id);
                return (
                  <li key={followup.id} className="rounded-md border border-border p-3">
                    <p className="text-sm font-medium">
                      {appointment ? getPatient(appointment.patientId)?.name : "Patient"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {appointment
                        ? `${getDoctor(appointment.doctorId)?.name} · ${prettyDate(appointment.date)} at ${appointment.slot}`
                        : "Appointment"}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={notes[followup.id] ?? ""}
                        onChange={(event) =>
                          setNotes((current) => ({ ...current, [followup.id]: event.target.value }))
                        }
                        placeholder="Note, e.g. called, rebooked"
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        disabled={resolving !== null}
                        onClick={() => void resolve(followup.id)}
                      >
                        Resolve
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
            <Sparkles className="size-4" /> Waitlist ({entries.length})
          </h3>
          {entries.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
              Nobody is waiting.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map((entry) => {
                const offer = offerFor(entry.id);
                return (
                  <li key={entry.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="text-sm font-medium">{getPatient(entry.patient_id)?.name ?? "Patient"}</p>
                    <p className="text-xs text-muted-foreground">
                      {getDoctor(entry.doctor_id)?.name} · {prettyDate(entry.preferred_date)} ·{" "}
                      {entry.preferred_slot ?? "any slot"}
                    </p>
                    {offer && (
                      <p className="mt-1 text-xs text-[#2d5a3d]">
                        Offered {offer.time_slot} · expires in {minutesLeft(offer.expires_at, now)} min
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}
