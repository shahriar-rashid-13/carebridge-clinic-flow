import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { Receipt } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, PageHeader, Panel, StatCard } from "@/components/clinic/page";
import { StatusBadge } from "@/components/clinic/status-badge";
import { useClinic } from "@/lib/clinic/store";
import { money, prettyDate } from "@/lib/clinic/data";
import type { Appointment, Invoice } from "@/lib/clinic/types";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing — CareBridge" },
      {
        name: "description",
        content: "Generate invoices for completed visits, add service fees and record payments.",
      },
      { property: "og:title", content: "Billing — CareBridge" },
      {
        property: "og:description",
        content: "Invoice completed consultations and mark them paid by card, cash or insurance.",
      },
    ],
  }),
  component: BillingPage,
});

const SERVICES = [
  { label: "ECG", amount: 60 },
  { label: "Blood panel", amount: 75 },
  { label: "X-ray", amount: 110 },
  { label: "Dressing / minor procedure", amount: 45 },
];

function BillingPage() {
  const clinic = useClinic();
  const { role, appointments, invoices, getPatient, getDoctor } = clinic;
  const [billing, setBilling] = React.useState<Appointment | null>(null);
  const [paying, setPaying] = React.useState<Invoice | null>(null);
  const [extras, setExtras] = React.useState<string[]>([]);
  const [method, setMethod] = React.useState("Card");
  const [view, setView] = React.useState<Invoice | null>(null);

  if (role !== "receptionist") {
    return (
      <PageHeader
        title="Reception view only"
        description="Switch the role selector to Receptionist to handle billing."
      />
    );
  }

  const uninvoiced = appointments.filter(
    (a) => a.status === "Completed" && !invoices.some((i) => i.appointmentId === a.id),
  );
  const collected = invoices.filter((i) => i.status === "Paid").reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.filter((i) => i.status === "Unpaid").reduce((s, i) => s + i.total, 0);
  const billingDoctor = billing ? getDoctor(billing.doctorId) : undefined;
  const draftTotal =
    (billingDoctor?.fee ?? 0) +
    extras.reduce((s, l) => s + (SERVICES.find((x) => x.label === l)?.amount ?? 0), 0);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Front desk" title="Billing" description="Invoices for completed visits." />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Collected" value={money(collected)} tone="sage" />
        <StatCard label="Outstanding" value={money(outstanding)} tone="terracotta" />
        <StatCard label="Awaiting invoice" value={uninvoiced.length} tone="sand" />
      </div>

      <Panel title="Completed visits awaiting an invoice">
        {uninvoiced.length === 0 ? (
          <EmptyState title="Everything is invoiced" description="No completed visits pending." />
        ) : (
          <ul className="divide-y divide-border">
            {uninvoiced.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{getPatient(a.patientId)?.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {getDoctor(a.doctorId)?.name} · {prettyDate(a.date)} · {a.reason}
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setBilling(a);
                    setExtras([]);
                  }}
                >
                  <Receipt className="size-3.5" /> Generate bill
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Invoices">
        {invoices.length === 0 ? (
          <EmptyState title="No invoices yet" />
        ) : (
          <ul className="divide-y divide-border">
            {invoices.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {i.id} · {getPatient(i.patientId)?.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {getDoctor(i.doctorId)?.name} · issued {prettyDate(i.issuedAt)}
                    {i.method ? ` · ${i.method}` : ""}
                  </p>
                </div>
                <span className="text-sm tabular-nums">{money(i.total)}</span>
                <StatusBadge status={i.status} />
                <Button variant="outline" size="sm" onClick={() => setView(i)}>
                  View
                </Button>
                {i.status === "Unpaid" && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setPaying(i);
                      setMethod("Card");
                    }}
                  >
                    Mark paid
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {/* Generate invoice */}
      <Dialog open={!!billing} onOpenChange={(o) => !o && setBilling(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate invoice</DialogTitle>
            <DialogDescription>
              {billing &&
                `${getPatient(billing.patientId)?.name} · ${billingDoctor?.name} · ${prettyDate(billing.date)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border border-border bg-linen/70 px-4 py-3 text-sm">
              <span>{billingDoctor?.specialty} consultation</span>
              <span className="tabular-nums">{money(billingDoctor?.fee ?? 0)}</span>
            </div>
            <div>
              <Label className="text-xs">Additional services</Label>
              <div className="mt-2 space-y-2">
                {SERVICES.map((s) => (
                  <label
                    key={s.label}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-border px-4 py-2.5 text-sm"
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-[oklch(0.41_0.056_152)]"
                        checked={extras.includes(s.label)}
                        onChange={() =>
                          setExtras((prev) =>
                            prev.includes(s.label)
                              ? prev.filter((x) => x !== s.label)
                              : [...prev, s.label],
                          )
                        }
                      />
                      {s.label}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{money(s.amount)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-4 text-sm font-medium">
              <span>Total</span>
              <span className="tabular-nums">{money(draftTotal)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBilling(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!billing || !billingDoctor) return;
                try {
                  await clinic.createInvoice(billing.id, [
                    {
                      label: `${billingDoctor.specialty} consultation`,
                      amount: billingDoctor.fee,
                    },
                    ...extras.map((l) => ({
                      label: l,
                      amount: SERVICES.find((x) => x.label === l)?.amount ?? 0,
                    })),
                  ]);
                  toast.success("Invoice created", { description: money(draftTotal) });
                  setBilling(null);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not create invoice.");
                }
              }}
            >
              Create invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View invoice */}
      <Dialog open={!!view} onOpenChange={(o) => !o && setView(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice {view?.id}</DialogTitle>
            <DialogDescription>
              {view &&
                `${getPatient(view.patientId)?.name} · issued ${prettyDate(view.issuedAt)}`}
            </DialogDescription>
          </DialogHeader>
          {view && (
            <div className="space-y-3 text-sm">
              {view.items.map((it, idx) => (
                <div key={idx} className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{it.label}</span>
                  <span className="tabular-nums">{money(it.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-border pt-3 font-medium">
                <span>Total</span>
                <span className="tabular-nums">{money(view.total)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 pt-2">
                <StatusBadge status={view.status} />
                <span className="text-xs text-muted-foreground">
                  {view.status === "Paid"
                    ? `${view.method} · ${view.paidAt ? prettyDate(view.paidAt) : ""}`
                    : "Payment pending"}
                </span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark paid */}
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              {paying && `${paying.id} · ${money(paying.total)}`}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Card">Card</SelectItem>
                <SelectItem value="Cash">Cash</SelectItem>
                <SelectItem value="Insurance">Insurance</SelectItem>
                <SelectItem value="Bank transfer">Bank transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPaying(null)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                if (!paying) return;
                try {
                  await clinic.markInvoicePaid(paying.id, method);
                  toast.success("Payment recorded", {
                    description: `${paying.id} settled by ${method.toLowerCase()}.`,
                  });
                  setPaying(null);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not record payment.");
                }
              }}
            >
              Mark as paid
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
