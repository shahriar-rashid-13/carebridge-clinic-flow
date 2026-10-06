import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEMPLATES,
  SEGMENTS,
  bookingRate,
  fetchCampaignResults,
  fetchSegmentCounts,
  previewCampaign,
  sendCampaign,
  unsubscribe,
} from "@/lib/clinic/campaigns";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));

beforeEach(() => {
  fake.reset();
});

describe("campaign RPC wrappers", () => {
  it.each([
    [() => fetchSegmentCounts(), "recall_segment_counts", {}],
    [() => previewCampaign("missed_visit"), "preview_campaign", { p_segment: "missed_visit" }],
    [
      () => sendCampaign("Check-ups", "checkup_overdue", "Subject", "Body"),
      "send_campaign",
      { p_name: "Check-ups", p_segment: "checkup_overdue", p_subject: "Subject", p_body: "Body" },
    ],
    [() => fetchCampaignResults(), "campaign_results", {}],
  ])("calls %#", async (call, name, args) => {
    await call();
    expect(fake.rpcs).toEqual([{ name, args }]);
  });

  it("throws the database error message", async () => {
    fake.onRpc(() => ({ error: { message: "Only receptionists can manage campaigns." } }));
    await expect(previewCampaign("followup_due")).rejects.toThrow(
      "Only receptionists can manage campaigns.",
    );
  });
});

describe("templates", () => {
  it("has a default template with the {name} placeholder for every segment", () => {
    for (const segment of SEGMENTS) {
      const template = DEFAULT_TEMPLATES[segment.id];
      expect(template.body).toContain("{name}");
      expect(template.subject.length).toBeLessThanOrEqual(150);
    }
  });
});

describe("bookingRate", () => {
  it("rounds to a whole percentage", () => {
    expect(bookingRate({ recipients: 10, booked_14d: 2 })).toBe("20%");
    expect(bookingRate({ recipients: 3, booked_14d: 1 })).toBe("33%");
  });

  it("shows a dash when nobody was emailed", () => {
    expect(bookingRate({ recipients: 0, booked_14d: 0 })).toBe("—");
  });
});

describe("unsubscribe", () => {
  it("posts the token and scope to the unsubscribe function", async () => {
    fake.onInvoke(() => ({ data: { ok: true, scope: "all" } }));
    await unsubscribe("token-1", "all");
    expect(fake.client.functions.invoke).toHaveBeenCalledWith("unsubscribe", {
      body: { token: "token-1", scope: "all" },
    });
  });

  it("throws a generic message when the token is rejected", async () => {
    fake.onInvoke(() => ({ error: { message: "Edge Function returned a non-2xx status code" } }));
    await expect(unsubscribe("bad", "campaign")).rejects.toThrow(
      "This link is invalid or has expired.",
    );
  });
});
