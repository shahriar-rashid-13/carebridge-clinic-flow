import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, PageHeader, Panel } from "@/components/clinic/page";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_TEMPLATES,
  SEGMENTS,
  SKIP_LABEL,
  bookingRate,
  fetchCampaignResults,
  fetchSegmentCounts,
  previewCampaign,
  sendCampaign,
  type CampaignPreview,
  type CampaignResult,
  type Segment,
  type SegmentCounts,
} from "@/lib/clinic/campaigns";
import { useClinic } from "@/lib/clinic/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/campaigns")({
  head: () => ({
    meta: [
      { title: "Recall Campaigns — CareBridge" },
      {
        name: "description",
        content: "Email patients who are due a check-up, missed a visit, or need a follow-up.",
      },
    ],
  }),
  component: CampaignsPage,
});

const segmentLabel = (id: Segment) => SEGMENTS.find((s) => s.id === id)?.label ?? id;

function CampaignsPage() {
  const { role } = useClinic();
  const [counts, setCounts] = React.useState<SegmentCounts | null>(null);
  const [results, setResults] = React.useState<CampaignResult[]>([]);
  const [segment, setSegment] = React.useState<Segment>("checkup_overdue");
  const [draft, setDraft] = React.useState(DEFAULT_TEMPLATES.checkup_overdue);
  const [preview, setPreview] = React.useState<CampaignPreview | null>(null);
  const [previewing, setPreviewing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const [nextCounts, nextResults] = await Promise.all([
        fetchSegmentCounts(),
        fetchCampaignResults(),
      ]);
      setCounts(nextCounts);
      setResults(nextResults);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load campaigns.");
    }
  }, []);

  React.useEffect(() => {
    if (role === "receptionist") void load();
  }, [load, role]);

  if (role !== "receptionist") {
    return (
      <PageHeader
        title="Reception view only"
        description="Recall campaigns are run by the front desk."
      />
    );
  }

  const pickSegment = (next: Segment) => {
    setSegment(next);
    setDraft(DEFAULT_TEMPLATES[next]);
    setPreview(null);
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      setPreview(await previewCampaign(segment));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not preview the campaign.");
    } finally {
      setPreviewing(false);
    }
  };

  const send = async () => {
    setSending(true);
    try {
      await sendCampaign(draft.name, segment, draft.subject, draft.body);
      toast.success("Campaign queued. Emails go out within a minute.");
      setPreview(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the campaign.");
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  };

  const draftReady = draft.name.trim() && draft.subject.trim() && draft.body.trim();
  const scheduledLater = preview ? preview.eligible - preview.send_today : 0;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Front desk"
        title="Recall campaigns"
        description="Invite patients back by email. Opted-out patients, patients without an email and anyone emailed in the last 7 days are left out automatically."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {SEGMENTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => pickSegment(s.id)}
            aria-pressed={segment === s.id}
            className={cn(
              "rounded-[12px] border bg-white p-5 text-left transition-colors hover:bg-[#f7f2e9]",
              segment === s.id
                ? "border-[#123f35] ring-1 ring-[#123f35]"
                : "border-[rgba(23,42,37,0.08)]",
            )}
          >
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-[#5f6b66]">
              {s.label}
            </p>
            <p className="font-display mt-3 text-3xl leading-none text-[#172a25]">
              {counts ? counts[s.id] : "…"}
            </p>
            <p className="mt-2 text-xs leading-5 text-[#5f6b66]">{s.description}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Compose"
          description="Use {name} for the patient's name. A booking link and an unsubscribe link are added to every email."
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaign-name">Campaign name</Label>
              <Input
                id="campaign-name"
                maxLength={120}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-subject">Subject</Label>
              <Input
                id="campaign-subject"
                maxLength={150}
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="campaign-body">Message</Label>
              <Textarea
                id="campaign-body"
                rows={8}
                maxLength={2000}
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              />
            </div>
            <Button onClick={runPreview} disabled={previewing} variant="outline">
              {previewing ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Preview audience
            </Button>
          </div>
        </Panel>

        <Panel title="Audience" description={segmentLabel(segment)}>
          {!preview ? (
            <EmptyState
              title="No preview yet"
              description="Preview the audience to see who gets this email and who is left out."
            />
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-[#5f6b66]">In segment</dt>
                  <dd className="font-medium">{preview.total}</dd>
                </div>
                <div>
                  <dt className="text-[#5f6b66]">Will be emailed</dt>
                  <dd className="font-medium">{preview.eligible}</dd>
                </div>
                <div>
                  <dt className="text-[#5f6b66]">Left out</dt>
                  <dd className="font-medium">
                    {preview.excluded.opted_out} opted out, {preview.excluded.no_email} no email,{" "}
                    {preview.excluded.frequency_cap} emailed recently
                  </dd>
                </div>
                <div>
                  <dt className="text-[#5f6b66]">Daily email allowance left</dt>
                  <dd className="font-medium">{preview.quota_left}</dd>
                </div>
              </dl>
              {scheduledLater > 0 && (
                <p className="rounded-[10px] bg-[#e9d6c7]/50 p-3 text-xs leading-5">
                  {preview.send_today} go out today. The other {scheduledLater} are scheduled for
                  8:00 tomorrow to stay within the daily limit.
                </p>
              )}
              <ul className="divide-y divide-[rgba(23,42,37,0.08)] text-sm">
                {preview.sample.map((p) => (
                  <li
                    key={`${p.full_name}-${p.detail}`}
                    className="flex justify-between gap-3 py-2"
                  >
                    <span className="truncate">{p.full_name}</span>
                    <span className="shrink-0 text-xs text-[#5f6b66]">
                      {p.skip_reason ? SKIP_LABEL[p.skip_reason] : p.detail}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={!draftReady || preview.eligible === 0 || sending}
              >
                <Send className="mr-2 size-4" />
                Send to {preview.eligible} patient{preview.eligible === 1 ? "" : "s"}
              </Button>
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Results"
        description="Booked means the patient made a new appointment within 14 days of the campaign."
      >
        {results.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Sent campaigns and their results appear here."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Recipients</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Delivered</TableHead>
                <TableHead className="text-right">Bounced</TableHead>
                <TableHead className="text-right">Unsubscribed</TableHead>
                <TableHead className="text-right">Booked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-[#5f6b66]">
                      {segmentLabel(r.segment)} · {new Date(r.created_at).toLocaleDateString()}
                      {r.skipped > 0 ? ` · ${r.skipped} left out` : ""}
                      {r.scheduled > 0 ? ` · ${r.scheduled} scheduled` : ""}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">{r.recipients}</TableCell>
                  <TableCell className="text-right">{r.sent}</TableCell>
                  <TableCell className="text-right">{r.delivered}</TableCell>
                  <TableCell className="text-right">{r.bounced + r.failed}</TableCell>
                  <TableCell className="text-right">{r.opted_out}</TableCell>
                  <TableCell className="text-right">
                    {r.booked_14d} ({bookingRate(r)})
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              "{draft.subject}" goes to {preview?.eligible ?? 0} patients in {segmentLabel(segment)}
              . This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={sending}
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
            >
              {sending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
              Send campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
