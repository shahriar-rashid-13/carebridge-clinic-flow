import * as React from "react";
import { supabase } from "@/lib/supabase/client";

export type NotificationKind = "reminder_24h" | "no_show" | "waitlist_offer" | "offer_expired";

export type ClinicNotification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  appointment_id: string | null;
  offer_id: string | null;
  read_at: string | null;
  created_at: string;
};

export type WaitlistEntry = {
  id: string;
  patient_id: string;
  doctor_id: string;
  preferred_date: string;
  preferred_slot: string | null;
  reason: string;
  status: "waiting" | "offered" | "booked" | "expired" | "cancelled";
  created_at: string;
};

export type WaitlistOffer = {
  id: string;
  waitlist_id: string;
  patient_id: string;
  doctor_id: string;
  offer_date: string;
  time_slot: string;
  status: "pending" | "accepted" | "declined" | "expired";
  expires_at: string;
  created_at: string;
};

export type Followup = {
  id: string;
  appointment_id: string;
  reason: "no_show";
  status: "open" | "resolved";
  note: string;
  resolved_at: string | null;
  created_at: string;
};

export type AutomationRun = {
  reminders: number;
  no_shows: number;
  offers_expired: number;
  offers_made: number;
  ran_at: string;
};

// Fired when a notification arrives so waitlist and follow-up panels can refresh.
export const AUTOMATION_EVENT = "carebridge:automation";

export const announceAutomation = (kind?: NotificationKind) =>
  window.dispatchEvent(new CustomEvent(AUTOMATION_EVENT, { detail: kind }));

export function useAutomationRefresh(refresh: () => void) {
  React.useEffect(() => {
    window.addEventListener(AUTOMATION_EVENT, refresh);
    return () => window.removeEventListener(AUTOMATION_EVENT, refresh);
  }, [refresh]);
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "Something went wrong. Please try again.");
  return data as T;
}

export const joinWaitlist = (doctorId: string, date: string, slot: string | null, reason: string) =>
  rpc<string>("join_waitlist", {
    p_doctor_id: doctorId,
    p_date: date,
    p_slot: slot,
    p_reason: reason,
  });

export const leaveWaitlist = (id: string) => rpc<void>("leave_waitlist", { p_waitlist_id: id });

export const acceptWaitlistOffer = (id: string) =>
  rpc<string>("accept_waitlist_offer", { p_offer_id: id });

export const declineWaitlistOffer = (id: string) =>
  rpc<void>("decline_waitlist_offer", { p_offer_id: id });

export const resolveFollowup = (id: string, note: string) =>
  rpc<void>("resolve_followup", { p_followup_id: id, p_note: note });

export const runAutomationsNow = () => rpc<AutomationRun>("run_clinic_automations_now", {});

export function useNotifications(userId: string | undefined) {
  const [items, setItems] = React.useState<ClinicNotification[]>([]);
  const [latest, setLatest] = React.useState<ClinicNotification | null>(null);

  const load = React.useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, kind, title, body, appointment_id, offer_id, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data) setItems(data as ClinicNotification[]);
  }, [userId]);

  React.useEffect(() => {
    void load();
    if (!userId) return;
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as ClinicNotification;
          setItems((current) => [next, ...current.filter(({ id }) => id !== next.id)].slice(0, 30));
          setLatest(next);
          announceAutomation(next.kind);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, userId]);

  const markAllRead = React.useCallback(async () => {
    const unread = items.filter((item) => !item.read_at).map(({ id }) => id);
    if (unread.length === 0) return;
    const readAt = new Date().toISOString();
    setItems((current) => current.map((item) => (item.read_at ? item : { ...item, read_at: readAt })));
    await supabase.from("notifications").update({ read_at: readAt }).in("id", unread);
  }, [items]);

  return { items, latest, unread: items.filter((item) => !item.read_at).length, markAllRead, reload: load };
}
