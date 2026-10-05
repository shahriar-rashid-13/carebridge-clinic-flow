import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText } from "@/lib/sentry";

describe("Sentry scrubbing (browser)", () => {
  it("masks emails, phone numbers, and ids", () => {
    expect(
      scrubText("rahim@example.com +880 1711-223344 for 0f8fad5b-d9cb-469f-a165-70867728950e"),
    ).toBe("[email] [phone] for [id]");
  });

  it("drops user, request body, cookies, headers, and query strings", () => {
    const event = scrubEvent({
      user: { id: "u1", email: "a@b.co" },
      message: "Booking failed for a@b.co",
      request: {
        url: "https://app.test/book?doctor=1&name=Rahim",
        data: { reason: "chest pain" },
        cookies: { sb: "token" },
        headers: { authorization: "Bearer x" },
        query_string: "name=Rahim",
      },
      exception: { values: [{ type: "Error", value: "Patient 0f8fad5b-d9cb-469f-a165-70867728950e not found" }] },
    });
    expect(event.user).toBeUndefined();
    expect(event.request).toEqual({ url: "https://app.test/book" });
    expect(event.message).toBe("Booking failed for [email]");
    expect(event.exception?.values?.[0]?.value).toBe("Patient [id] not found");
  });

  it("drops console and input breadcrumbs and keeps only url, method, and status for requests", () => {
    expect(scrubBreadcrumb({ category: "console", message: "chat text" })).toBeNull();
    expect(scrubBreadcrumb({ category: "ui.input", message: "typed" })).toBeNull();
    expect(
      scrubBreadcrumb({
        category: "fetch",
        data: { url: "https://db.test/rest/v1/profiles?email=eq.a@b.co", method: "GET", status_code: 200, body: "x" },
      }),
    ).toEqual({ category: "fetch", data: { url: "https://db.test/rest/v1/profiles", method: "GET", status_code: 200 } });
  });
});
