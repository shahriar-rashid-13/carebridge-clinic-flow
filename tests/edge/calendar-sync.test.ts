// @vitest-environment node
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_ATTEMPTS,
  buildEvent,
  clearTokenCache,
  deleteEvent,
  eventId,
  getAccessToken,
  parseServiceAccount,
  processJob,
  signJwt,
  slotTo24h,
  upsertEvent,
  type Appointment,
  type CalendarJob,
  type ServiceAccount,
} from "../../supabase/functions/calendar-sync/google.ts";

const fetchMock = vi.fn<typeof fetch>();
const NOW = new Date("2026-10-06T06:00:00Z");
const CALENDAR = "clinic@group.calendar.google.com";
const APPT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const appointment = (overrides: Partial<Appointment> = {}): Appointment => ({
  id: APPT_ID,
  status: "confirmed",
  appointment_date: "2026-10-18",
  time_slot: "02:30 PM",
  reason: "Chest pain follow-up",
  doctor_name: "Dr Karim",
  specialization: "Cardiology",
  patient_name: "Rahim Uddin",
  room: "Room 201",
  ...overrides,
});

const job = (overrides: Partial<CalendarJob> = {}): CalendarJob => ({
  id: "job-1",
  appointment_id: APPT_ID,
  action: "upsert",
  attempts: 1,
  ...overrides,
});

const reply = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValueOnce(
    new Response(status === 204 ? null : JSON.stringify(body), { status }),
  );

let account: ServiceAccount;
let publicKey: CryptoKey;

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, "$1\n");
  account = {
    client_email: "sync@test.iam.gserviceaccount.com",
    private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
  };
  publicKey = pair.publicKey;
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  clearTokenCache();
});

afterEach(() => vi.unstubAllGlobals());

describe("helpers", () => {
  it("converts 12-hour slots", () => {
    expect(slotTo24h("09:00 AM")).toBe("09:00");
    expect(slotTo24h("12:30 PM")).toBe("12:30");
    expect(slotTo24h("12:00 AM")).toBe("00:00");
    expect(slotTo24h("02:30 PM")).toBe("14:30");
    expect(slotTo24h("14:30")).toBeNull();
  });

  it("derives a valid Google event id from the appointment id", () => {
    expect(eventId(APPT_ID)).toBe("0f8fad5bd9cb469fa16570867728950e");
    expect(eventId(APPT_ID)).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("reads only well-formed service account JSON", () => {
    expect(
      parseServiceAccount(JSON.stringify({ client_email: "a", private_key: "b", extra: 1 })),
    ).toEqual({
      client_email: "a",
      private_key: "b",
    });
    expect(parseServiceAccount("{not json")).toBeNull();
    expect(parseServiceAccount(JSON.stringify({ client_email: "a" }))).toBeNull();
    expect(parseServiceAccount(undefined)).toBeNull();
  });
});

describe("buildEvent", () => {
  it("builds a 30-minute Dhaka-time event titled with doctor, patient and specialty", () => {
    expect(buildEvent(appointment())).toMatchObject({
      id: "0f8fad5bd9cb469fa16570867728950e",
      status: "confirmed",
      summary: "Dr Karim – Rahim Uddin (Cardiology)",
      location: "Room 201",
      start: { dateTime: "2026-10-18T14:30:00", timeZone: "Asia/Dhaka" },
      end: { dateTime: "2026-10-18T15:00:00", timeZone: "Asia/Dhaka" },
    });
  });

  it("rolls the end time past midnight", () => {
    expect(buildEvent(appointment({ time_slot: "11:45 PM" })).end.dateTime).toBe(
      "2026-10-19T00:15:00",
    );
  });

  it("rejects an unknown slot format", () => {
    expect(() => buildEvent(appointment({ time_slot: "noon" }))).toThrow("unknown time slot");
  });
});

describe("Google auth", () => {
  it("signs a verifiable RS256 JWT for the calendar scope", async () => {
    const jwt = await signJwt(account, 1_000);
    const [header, claims, signature] = jwt.split(".") as [string, string, string];
    const decode = (part: string) => JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toMatchObject({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/calendar.events",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_000,
      exp: 4_600,
    });
    const sig = Uint8Array.from(atob(signature.replace(/-/g, "+").replace(/_/g, "/")), (c) =>
      c.charCodeAt(0),
    );
    const valid = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      sig,
      new TextEncoder().encode(`${header}.${claims}`),
    );
    expect(valid).toBe(true);
  });

  it("caches the access token until shortly before it expires", async () => {
    reply(200, { access_token: "tok-1", expires_in: 3600 });
    expect(await getAccessToken(account, NOW.getTime())).toBe("tok-1");
    expect(await getAccessToken(account, NOW.getTime() + 30 * 60_000)).toBe("tok-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    reply(200, { access_token: "tok-2", expires_in: 3600 });
    expect(await getAccessToken(account, NOW.getTime() + 59.5 * 60_000)).toBe("tok-2");
  });

  it("throws Google's error description when sign-in fails", async () => {
    reply(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." });
    await expect(getAccessToken(account, NOW.getTime())).rejects.toThrow(
      "google token 400: Invalid JWT Signature.",
    );
  });
});

describe("event calls", () => {
  it("updates the event in place when it exists", async () => {
    reply(200, { id: eventId(APPT_ID) });
    expect(await upsertEvent(CALENDAR, appointment(), "tok")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR)}/events/${eventId(APPT_ID)}`,
    );
    expect(init!.method).toBe("PUT");
    expect((init!.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
  });

  it("inserts the event with its fixed id when it does not exist yet", async () => {
    reply(404, { error: { message: "Not Found" } });
    reply(200, { id: eventId(APPT_ID) });
    expect(await upsertEvent(CALENDAR, appointment(), "tok")).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toMatch(/\/events$/);
    expect(init!.method).toBe("POST");
    expect(JSON.parse(init!.body as string).id).toBe(eventId(APPT_ID));
  });

  it("treats an already deleted event as done", async () => {
    reply(410, { error: { message: "Resource has been deleted" } });
    expect(await deleteEvent(CALENDAR, APPT_ID, "tok")).toEqual({ ok: true });
  });
});

describe("processJob", () => {
  it("marks a successful upsert done", async () => {
    reply(200);
    expect(await processJob(job(), appointment(), CALENDAR, "tok", NOW)).toEqual({
      status: "done",
      last_error: null,
    });
  });

  it("skips an upsert when the appointment is no longer confirmed", async () => {
    const update = await processJob(
      job(),
      appointment({ status: "cancelled" }),
      CALENDAR,
      "tok",
      NOW,
    );
    expect(update.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes without loading the appointment", async () => {
    reply(204);
    const update = await processJob(job({ action: "delete" }), null, CALENDAR, "tok", NOW);
    expect(update.status).toBe("done");
    expect(fetchMock.mock.calls[0]![1]!.method).toBe("DELETE");
  });

  it("requeues rate limits with backoff", async () => {
    reply(429, { error: { message: "Rate Limit Exceeded" } });
    const update = await processJob(job({ attempts: 2 }), appointment(), CALENDAR, "tok", NOW);
    expect(update).toMatchObject({
      status: "queued",
      next_attempt_at: new Date(NOW.getTime() + 5 * 60_000).toISOString(),
    });
  });

  it("fails at once on a permission error", async () => {
    reply(403, { error: { message: "You need to have writer access to this calendar." } });
    const update = await processJob(job(), appointment(), CALENDAR, "tok", NOW);
    expect(update).toEqual({
      status: "failed",
      last_error: "google 403: You need to have writer access to this calendar.",
    });
  });

  it("fails after the last attempt", async () => {
    reply(503);
    const update = await processJob(
      job({ attempts: MAX_ATTEMPTS }),
      appointment(),
      CALENDAR,
      "tok",
      NOW,
    );
    expect(update.status).toBe("failed");
  });

  it("fails a bad time slot without calling Google", async () => {
    const update = await processJob(
      job(),
      appointment({ time_slot: "noon" }),
      CALENDAR,
      "tok",
      NOW,
    );
    expect(update.status).toBe("failed");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
