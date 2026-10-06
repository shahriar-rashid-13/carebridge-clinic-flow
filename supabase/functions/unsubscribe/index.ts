// Records an email opt-out from a signed unsubscribe token. Called by the
// /unsubscribe page in the app (JSON body) and by mail clients through the
// List-Unsubscribe one-click POST (token in the query string). Deploy with
// --no-verify-jwt: the token is the security. Responses never reveal who the
// patient is.
import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyUnsubscribeToken } from "./token.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const reply = (body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: CORS });

export async function readRequest(
  req: Request,
): Promise<{ token: string; scope: "campaign" | "all" }> {
  const url = new URL(req.url);
  let token = url.searchParams.get("token") ?? "";
  let scope: "campaign" | "all" = "campaign";
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await req.json().catch(() => ({}))) as { token?: unknown; scope?: unknown };
    if (typeof body.token === "string") token = body.token;
    if (body.scope === "all") scope = "all";
  }
  return { token, scope };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return reply({ ok: false, error: "Method not allowed." }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secret = Deno.env.get("UNSUBSCRIBE_SECRET");
  if (!url || !serviceKey || !secret)
    return reply({ ok: false, error: "Unsubscribe is not available." }, 500);

  const { token, scope } = await readRequest(req);
  const payload = token ? await verifyUnsubscribeToken(secret, token) : null;
  if (!payload) return reply({ ok: false, error: "This link is invalid or has expired." }, 400);

  const db = createClient(url, serviceKey, { auth: { persistSession: false } });
  const column = scope === "all" ? "email_opt_out" : "campaign_opt_out";
  const { data: updated, error } = await db
    .from("profiles")
    .update({ [column]: true })
    .eq("id", payload.patientId)
    .eq(column, false)
    .select("id");
  if (error)
    return reply({ ok: false, error: "Could not save your choice. Please try again." }, 500);

  if (updated?.length) {
    const optOut = {
      patient_id: payload.patientId,
      scope,
      source: "unsubscribe_link",
      campaign_id: payload.campaignId,
    };
    const { error: logError } = await db.from("communication_opt_outs").insert(optOut);
    // The campaign may have been deleted since the email was sent.
    if (logError?.code === "23503")
      await db.from("communication_opt_outs").insert({ ...optOut, campaign_id: null });
  }
  return reply({ ok: true, scope });
}

Deno.serve(handler);
