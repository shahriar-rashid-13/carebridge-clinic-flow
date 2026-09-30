import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PatientWaitlistPanel,
  ReceptionAutomationsPanel,
} from "@/components/clinic/automation-panels";
import { ThemeProvider } from "@/lib/theme/theme-context";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));
const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  reloadClinic: vi.fn(async () => undefined),
}));

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/clinic/store", () => ({
  useClinic: () => ({
    reload: mocks.reloadClinic,
    getDoctor: (id: string) => (id === "d1" ? { id, name: "Dr. Marcus Vance" } : undefined),
    getPatient: (id: string) => (id === "p1" ? { id, name: "Sarah Jenkins" } : undefined),
    appointments: [
      { id: "a1", patientId: "p1", doctorId: "d1", date: "2026-10-05", slot: "09:00 AM" },
    ],
  }),
}));

const entry = {
  id: "w1",
  patient_id: "p1",
  doctor_id: "d1",
  preferred_date: "2026-10-05",
  preferred_slot: null,
  reason: "Any",
  status: "waiting",
  created_at: "2026-09-29T10:00:00.000Z",
};

const offer = () => ({
  id: "o1",
  waitlist_id: "w1",
  patient_id: "p1",
  doctor_id: "d1",
  offer_date: "2026-10-05",
  time_slot: "09:00 AM",
  status: "pending",
  expires_at: new Date(Date.now() + 14.5 * 60_000).toISOString(),
  created_at: "2026-09-29T10:00:00.000Z",
});

const tables = (data: Record<string, unknown[]>) =>
  fake.onQuery((query) => (query.op === "select" ? { data: data[query.table] ?? [] } : undefined));

const renderInTheme = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);

beforeEach(() => {
  fake.reset();
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.reloadClinic.mockClear();
});

describe("PatientWaitlistPanel", () => {
  it("renders nothing when the patient is not waiting", async () => {
    tables({});
    const { container } = renderInTheme(<PatientWaitlistPanel />);
    await waitFor(() => expect(fake.queries).toHaveLength(2));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a pending offer with its countdown", async () => {
    tables({ waitlist: [{ ...entry, status: "offered" }], waitlist_offers: [offer()] });
    renderInTheme(<PatientWaitlistPanel />);

    expect(await screen.findByText("A slot opened up for you")).toBeInTheDocument();
    expect(screen.getByText("Expires in 15 min")).toBeInTheDocument();
    expect(screen.getByText(/any slot · offer pending/)).toBeInTheDocument();
  });

  it("accepts an offer and reloads clinic data", async () => {
    tables({ waitlist: [entry], waitlist_offers: [offer()] });
    renderInTheme(<PatientWaitlistPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("Slot booked. Reception will confirm it."),
    );
    expect(fake.rpcs).toEqual([{ name: "accept_waitlist_offer", args: { p_offer_id: "o1" } }]);
    expect(mocks.reloadClinic).toHaveBeenCalled();
  });

  it("shows the database error when an offer expired", async () => {
    tables({ waitlist: [entry], waitlist_offers: [offer()] });
    fake.onRpc(() => ({ error: { message: "This offer has expired." } }));
    renderInTheme(<PatientWaitlistPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("This offer has expired."));
    expect(mocks.reloadClinic).not.toHaveBeenCalled();
  });

  it("declines an offer and leaves the waitlist", async () => {
    tables({ waitlist: [entry], waitlist_offers: [offer()] });
    renderInTheme(<PatientWaitlistPanel />);

    await userEvent.click(await screen.findByRole("button", { name: "Decline" }));
    await waitFor(() => expect(fake.rpcs).toHaveLength(1));
    await userEvent.click(await screen.findByRole("button", { name: "Leave" }));
    await waitFor(() => expect(fake.rpcs).toHaveLength(2));

    expect(fake.rpcs.map((call) => call.name)).toEqual([
      "decline_waitlist_offer",
      "leave_waitlist",
    ]);
    expect(fake.rpcs[1]?.args).toEqual({ p_waitlist_id: "w1" });
  });
});

describe("ReceptionAutomationsPanel", () => {
  it("shows empty states", async () => {
    tables({});
    renderInTheme(<ReceptionAutomationsPanel />);
    expect(await screen.findByText("No open follow-ups.")).toBeInTheDocument();
    expect(screen.getByText("Nobody is waiting.")).toBeInTheDocument();
  });

  it("lists waitlist entries with their offers", async () => {
    tables({ waitlist: [{ ...entry, status: "offered" }], waitlist_offers: [offer()] });
    renderInTheme(<ReceptionAutomationsPanel />);
    expect(await screen.findByText("Offered 09:00 AM · expires in 15 min")).toBeInTheDocument();
    expect(screen.getByText("Waitlist (1)")).toBeInTheDocument();
  });

  it("runs automations now and reports the counts", async () => {
    tables({});
    fake.onRpc(() => ({
      data: {
        reminders: 2,
        no_shows: 1,
        offers_expired: 0,
        offers_made: 3,
        ran_at: "2026-09-29T10:00:00Z",
      },
    }));
    renderInTheme(<ReceptionAutomationsPanel />);

    await userEvent.click(screen.getByRole("button", { name: /Run now/ }));

    await waitFor(() =>
      expect(mocks.toast.success).toHaveBeenCalledWith("Automations ran", {
        description: "2 reminder(s), 1 no-show(s) flagged, 0 offer(s) expired, 3 new offer(s).",
      }),
    );
    expect(fake.rpcs[0]?.name).toBe("run_clinic_automations_now");
  });

  it("resolves a no-show follow-up with a note", async () => {
    let open = [
      {
        id: "f1",
        appointment_id: "a1",
        reason: "no_show",
        status: "open",
        note: "",
        resolved_at: null,
        created_at: "2026-09-29T10:00:00Z",
      },
    ];
    fake.onQuery((query) =>
      query.table === "appointment_followups" ? { data: open } : { data: [] },
    );
    fake.onRpc(() => {
      open = [];
      return { data: null };
    });
    renderInTheme(<ReceptionAutomationsPanel />);

    const item = (await screen.findByText("Sarah Jenkins")).closest("li")!;
    expect(within(item).getByText(/Dr. Marcus Vance · .* at 09:00 AM/)).toBeInTheDocument();
    await userEvent.type(
      within(item).getByPlaceholderText("Note, e.g. called, rebooked"),
      "Called, rebooked",
    );
    await userEvent.click(within(item).getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("Follow-up resolved"));
    expect(fake.rpcs[0]).toEqual({
      name: "resolve_followup",
      args: { p_followup_id: "f1", p_note: "Called, rebooked" },
    });
    expect(await screen.findByText("No open follow-ups.")).toBeInTheDocument();
  });
});
