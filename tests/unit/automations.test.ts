import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptWaitlistOffer,
  announceAutomation,
  AUTOMATION_EVENT,
  declineWaitlistOffer,
  joinWaitlist,
  leaveWaitlist,
  resolveFollowup,
  runAutomationsNow,
  useAutomationRefresh,
  useNotifications,
} from "@/lib/clinic/automations";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));

const notification = (id: string, readAt: string | null = null) => ({
  id,
  kind: "reminder_24h",
  title: `Title ${id}`,
  body: "Body",
  appointment_id: null,
  offer_id: null,
  read_at: readAt,
  created_at: "2026-09-29T10:00:00.000Z",
});

beforeEach(() => {
  fake.reset();
});

describe("automation RPC wrappers", () => {
  it.each([
    [
      () => joinWaitlist("d1", "2026-10-05", null, "Any"),
      "join_waitlist",
      { p_doctor_id: "d1", p_date: "2026-10-05", p_slot: null, p_reason: "Any" },
    ],
    [() => leaveWaitlist("w1"), "leave_waitlist", { p_waitlist_id: "w1" }],
    [() => acceptWaitlistOffer("o1"), "accept_waitlist_offer", { p_offer_id: "o1" }],
    [() => declineWaitlistOffer("o1"), "decline_waitlist_offer", { p_offer_id: "o1" }],
    [
      () => resolveFollowup("f1", "Called patient"),
      "resolve_followup",
      { p_followup_id: "f1", p_note: "Called patient" },
    ],
    [() => runAutomationsNow(), "run_clinic_automations_now", {}],
  ])("calls %#", async (call, name, args) => {
    await call();
    expect(fake.rpcs).toEqual([{ name, args }]);
  });

  it("returns RPC data", async () => {
    fake.onRpc(() => ({ data: "waitlist-id" }));
    await expect(joinWaitlist("d1", "2026-10-05", "09:00 AM", "x")).resolves.toBe("waitlist-id");
  });

  it("throws the database error message", async () => {
    fake.onRpc(() => ({ error: { message: "This offer has expired." } }));
    await expect(acceptWaitlistOffer("o1")).rejects.toThrow("This offer has expired.");
  });

  it("uses a generic message when the error has none", async () => {
    fake.onRpc(() => ({ error: { message: "" } }));
    await expect(leaveWaitlist("w1")).rejects.toThrow("Something went wrong. Please try again.");
  });
});

describe("automation events", () => {
  it("useAutomationRefresh reacts to announceAutomation", () => {
    const refresh = vi.fn();
    const { unmount } = renderHook(() => useAutomationRefresh(refresh));

    act(() => announceAutomation("no_show"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((refresh.mock.calls[0]![0] as CustomEvent).type).toBe(AUTOMATION_EVENT);

    unmount();
    announceAutomation();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("useNotifications", () => {
  it("does nothing without a user", () => {
    renderHook(() => useNotifications(undefined));
    expect(fake.client.from).not.toHaveBeenCalled();
    expect(fake.client.channel).not.toHaveBeenCalled();
  });

  it("loads notifications and counts unread", async () => {
    fake.onQuery(() => ({
      data: [notification("n1"), notification("n2", "2026-09-29T11:00:00Z")],
    }));
    const { result } = renderHook(() => useNotifications("u1"));

    await waitFor(() => expect(result.current.items).toHaveLength(2));
    expect(result.current.unread).toBe(1);
    expect(fake.queries[0]?.filters).toContainEqual({ method: "limit", args: [30] });
  });

  it("subscribes to the user's realtime inserts and announces them", async () => {
    fake.onQuery(() => ({ data: [] }));
    const announced = vi.fn();
    window.addEventListener(AUTOMATION_EVENT, announced);
    const { result, unmount } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(fake.listeners).toHaveLength(1));

    expect(fake.client.channel).toHaveBeenCalledWith("notifications:u1");
    expect(fake.listeners[0]?.filter).toMatchObject({
      event: "INSERT",
      table: "notifications",
      filter: "recipient_id=eq.u1",
    });

    act(() => fake.emit("notifications", notification("n9")));
    expect(result.current.items[0]?.id).toBe("n9");
    expect(result.current.latest?.id).toBe("n9");
    expect(announced).toHaveBeenCalled();

    unmount();
    expect(fake.client.removeChannel).toHaveBeenCalled();
    window.removeEventListener(AUTOMATION_EVENT, announced);
  });

  it("markAllRead updates only unread rows", async () => {
    fake.onQuery((query) =>
      query.op === "select"
        ? {
            data: [
              notification("n1"),
              notification("n2", "2026-09-29T11:00:00Z"),
              notification("n3"),
            ],
          }
        : undefined,
    );
    const { result } = renderHook(() => useNotifications("u1"));
    await waitFor(() => expect(result.current.unread).toBe(2));

    await act(() => result.current.markAllRead());

    expect(result.current.unread).toBe(0);
    const update = fake.queries.find((query) => query.op === "update");
    expect(update?.filters).toContainEqual({ method: "in", args: ["id", ["n1", "n3"]] });
    expect(update?.payload).toHaveProperty("read_at");
  });
});
