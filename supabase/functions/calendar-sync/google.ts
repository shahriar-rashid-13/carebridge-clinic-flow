// Google Calendar client for a service account: signs an RS256 JWT, swaps it
// for an access token and creates, moves or deletes appointment events.

export const MAX_ATTEMPTS = 5;
export const SLOT_MINUTES = 30;
export const TIME_ZONE = "Asia/Dhaka";
const RETRY_MINUTES = [1, 5, 15, 60];
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/calendar.events";
const API = "https://www.googleapis.com/calendar/v3";

export type ServiceAccount = { client_email: string; private_key: string };

export type Appointment = {
  id: string;
  status: string;
  appointment_date: string;
  time_slot: string;
  reason: string | null;
  doctor_name: string;
  specialization: string;
  patient_name: string;
  room: string | null;
};

export type CalendarJob = {
  id: string;
  appointment_id: string;
  action: "upsert" | "delete";
  attempts: number;
};

export type JobUpdate = Record<string, unknown> & { status: string };

export type CallResult = { ok: true } | { ok: false; retryable: boolean; error: string };

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string")
      return null;
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  } catch {
    return null;
  }
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export async function signJwt(account: ServiceAccount, nowSeconds: number): Promise<string> {
  const header = encodeJson({ alg: "RS256", typ: "JWT" });
  const claims = encodeJson({
    iss: account.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  });
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function clearTokenCache() {
  cachedToken = null;
}

export async function getAccessToken(account: ServiceAccount, now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > now + 60_000) return cachedToken.value;
  const assertion = await signJwt(account, Math.floor(now / 1000));
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await response.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  };
  if (!response.ok || !data.access_token) {
    throw new Error(
      `google token ${response.status}: ${String(data.error_description ?? "").slice(0, 200)}`,
    );
  }
  cachedToken = { value: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

// Google event ids allow 0-9 and a-v, so the hex appointment uuid works as is.
export const eventId = (appointmentId: string) => appointmentId.replace(/-/g, "").toLowerCase();

// "02:30 PM" to "14:30".
export function slotTo24h(slot: string): string | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(slot.trim());
  if (!match) return null;
  let hour = Number(match[1]) % 12;
  if (match[3]!.toUpperCase() === "PM") hour += 12;
  return `${String(hour).padStart(2, "0")}:${match[2]}`;
}

function addMinutes(date: string, time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number) as [number, number];
  const total = h * 60 + m + minutes;
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + Math.floor(total / 1440));
  const rest = total % 1440;
  const hh = String(Math.floor(rest / 60)).padStart(2, "0");
  const mm = String(rest % 60).padStart(2, "0");
  return `${day.toISOString().slice(0, 10)}T${hh}:${mm}:00`;
}

export function buildEvent(appointment: Appointment) {
  const start = slotTo24h(appointment.time_slot);
  if (!start) throw new Error(`unknown time slot "${appointment.time_slot}"`);
  return {
    id: eventId(appointment.id),
    status: "confirmed",
    summary: `${appointment.doctor_name} – ${appointment.patient_name} (${appointment.specialization})`,
    description: [
      appointment.reason ? `Reason: ${appointment.reason}` : "",
      `CareBridge appointment ${appointment.id}`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: appointment.room || undefined,
    start: { dateTime: `${appointment.appointment_date}T${start}:00`, timeZone: TIME_ZONE },
    end: {
      dateTime: addMinutes(appointment.appointment_date, start, SLOT_MINUTES),
      timeZone: TIME_ZONE,
    },
  };
}

async function call(url: string, init: RequestInit, token: string): Promise<Response | CallResult> {
  try {
    return await fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    return { ok: false, retryable: true, error: `network: ${String(error).slice(0, 200)}` };
  }
}

async function failure(response: Response): Promise<CallResult> {
  const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
  return {
    ok: false,
    retryable: response.status === 429 || response.status >= 500,
    error: `google ${response.status}: ${String(data.error?.message ?? "").slice(0, 200)}`,
  };
}

// PUT updates the event, including one cancelled earlier; a 404 means it was
// never created, so insert it with the fixed id.
export async function upsertEvent(
  calendarId: string,
  appointment: Appointment,
  token: string,
): Promise<CallResult> {
  const event = buildEvent(appointment);
  const base = `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
  const put = await call(
    `${base}/${event.id}`,
    { method: "PUT", body: JSON.stringify(event) },
    token,
  );
  if (!(put instanceof Response)) return put;
  if (put.ok) return { ok: true };
  if (put.status !== 404) return failure(put);

  const insert = await call(base, { method: "POST", body: JSON.stringify(event) }, token);
  if (!(insert instanceof Response)) return insert;
  return insert.ok ? { ok: true } : failure(insert);
}

export async function deleteEvent(
  calendarId: string,
  appointmentId: string,
  token: string,
): Promise<CallResult> {
  const url = `${API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId(appointmentId)}`;
  const response = await call(url, { method: "DELETE" }, token);
  if (!(response instanceof Response)) return response;
  if (response.ok || response.status === 404 || response.status === 410) return { ok: true };
  return failure(response);
}

export function retryDelayMinutes(attempts: number): number {
  return RETRY_MINUTES[Math.min(Math.max(attempts, 1), RETRY_MINUTES.length) - 1]!;
}

// Runs one claimed job and returns the columns to update. job.attempts
// already counts this attempt. A missing appointment, or an upsert for one
// that is no longer confirmed or completed, is skipped.
export async function processJob(
  job: CalendarJob,
  appointment: Appointment | null,
  calendarId: string,
  token: string,
  now = new Date(),
): Promise<JobUpdate> {
  let result: CallResult;
  if (job.action === "delete") {
    result = await deleteEvent(calendarId, job.appointment_id, token);
  } else {
    if (!appointment || !["confirmed", "completed"].includes(appointment.status)) {
      return { status: "skipped", last_error: "appointment is not confirmed" };
    }
    try {
      result = await upsertEvent(calendarId, appointment, token);
    } catch (error) {
      result = { ok: false, retryable: false, error: String(error).slice(0, 200) };
    }
  }

  if (result.ok) return { status: "done", last_error: null };
  if (!result.retryable || job.attempts >= MAX_ATTEMPTS)
    return { status: "failed", last_error: result.error };
  const next = new Date(now.getTime() + retryDelayMinutes(job.attempts) * 60_000);
  return { status: "queued", next_attempt_at: next.toISOString(), last_error: result.error };
}
