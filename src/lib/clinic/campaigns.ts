import { supabase } from "@/lib/supabase/client";

export type Segment = "checkup_overdue" | "missed_visit" | "followup_due";

export const SEGMENTS: { id: Segment; label: string; description: string }[] = [
  {
    id: "checkup_overdue",
    label: "Check-up overdue",
    description: "Last completed visit more than 6 months ago, nothing booked.",
  },
  {
    id: "missed_visit",
    label: "Missed visit",
    description: "Open no-show follow-up, and no new appointment since.",
  },
  {
    id: "followup_due",
    label: "Follow-up overdue",
    description: "Prescription follow-up date has passed, and no later visit booked.",
  },
];

export const DEFAULT_TEMPLATES: Record<Segment, { name: string; subject: string; body: string }> = {
  checkup_overdue: {
    name: "Check-up reminder",
    subject: "Time for your check-up at CareBridge",
    body: "Hello {name},\n\nIt has been over six months since your last visit. A routine check-up helps catch problems early.\n\nBook a time that suits you using the link below.",
  },
  missed_visit: {
    name: "Missed visit rebooking",
    subject: "We missed you at CareBridge",
    body: "Hello {name},\n\nWe noticed you could not make your recent appointment. No problem, it happens.\n\nYou can pick a new time using the link below.",
  },
  followup_due: {
    name: "Follow-up reminder",
    subject: "Your follow-up visit is due",
    body: "Hello {name},\n\nYour doctor asked to see you again to review your treatment, and that date has now passed.\n\nPlease book your follow-up using the link below.",
  },
};

export type SegmentCounts = Record<Segment, number>;

export type CampaignPreview = {
  segment: Segment;
  total: number;
  eligible: number;
  excluded: { opted_out: number; no_email: number; frequency_cap: number };
  quota_left: number;
  send_today: number;
  sample: { full_name: string; detail: string; skip_reason: string | null }[];
};

export type CampaignResult = {
  id: string;
  name: string;
  segment: Segment;
  subject: string;
  created_at: string;
  recipients: number;
  skipped: number;
  scheduled: number;
  sent: number;
  delivered: number;
  bounced: number;
  complained: number;
  failed: number;
  opted_out: number;
  booked_14d: number;
};

async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || "Something went wrong. Please try again.");
  return data as T;
}

export const fetchSegmentCounts = () => rpc<SegmentCounts>("recall_segment_counts");

export const previewCampaign = (segment: Segment) =>
  rpc<CampaignPreview>("preview_campaign", { p_segment: segment });

export const sendCampaign = (name: string, segment: Segment, subject: string, body: string) =>
  rpc<string>("send_campaign", {
    p_name: name,
    p_segment: segment,
    p_subject: subject,
    p_body: body,
  });

export const fetchCampaignResults = () => rpc<CampaignResult[]>("campaign_results");

export function bookingRate(result: Pick<CampaignResult, "recipients" | "booked_14d">): string {
  if (result.recipients === 0) return "—";
  return `${Math.round((result.booked_14d / result.recipients) * 100)}%`;
}

export const SKIP_LABEL: Record<string, string> = {
  opted_out: "Opted out",
  no_email: "No email",
  frequency_cap: "Emailed in last 7 days",
};

export async function unsubscribe(token: string, scope: "campaign" | "all") {
  const { data, error } = await supabase.functions.invoke<{ ok: boolean; error?: string }>(
    "unsubscribe",
    { body: { token, scope } },
  );
  if (error || !data?.ok) throw new Error("This link is invalid or has expired.");
  return data;
}
