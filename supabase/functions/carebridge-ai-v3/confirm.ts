import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { executeAction, type ActionResult } from "../carebridge-ai-v2/actions.ts";
import type { ToolContext } from "../carebridge-ai-v2/shared.ts";

export type ConfirmOutcome =
  | { ok: true; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; detail?: string };

/** Confirm or cancel a proposal card. Uses no model, same as v2. */
export async function confirmOrCancel(options: {
  db: SupabaseClient;
  ctx: ToolContext;
  action: "confirm" | "cancel";
  pendingId: string;
  conversationId: string | null;
  requestId: string;
}): Promise<ConfirmOutcome> {
  const { db, ctx, action, pendingId, conversationId, requestId } = options;
  let summary: string;
  let result: ActionResult;
  let status: string;

  if (action === "cancel") {
    const { data: row, error } = await db
      .from("ai_pending_actions")
      .select("summary")
      .eq("id", pendingId)
      .maybeSingle();
    if (error)
      return {
        ok: false,
        status: 500,
        error: "Could not load the proposal.",
        detail: error.message,
      };
    if (!row) return { ok: false, status: 404, error: "Proposal not found." };
    const { error: cancelError } = await db.rpc("ai_cancel_pending_action", { p_id: pendingId });
    if (cancelError) return { ok: false, status: 409, error: cancelError.message };
    summary = row.summary;
    result = { ok: true, message: "Okay, I cancelled that proposal. Nothing was changed." };
    status = "cancelled";
  } else {
    const { data: row, error: claimError } = await db.rpc("ai_claim_pending_action", {
      p_id: pendingId,
    });
    if (claimError) {
      if (claimError.code === "P0002")
        return { ok: false, status: 404, error: "Proposal not found." };
      if (claimError.code === "22023") return { ok: false, status: 409, error: claimError.message };
      return {
        ok: false,
        status: 500,
        error: "Could not load the proposal.",
        detail: claimError.message,
      };
    }
    summary = row.summary;
    try {
      result = await executeAction(row, ctx);
    } catch (err) {
      console.error(
        JSON.stringify({
          request_id: requestId,
          action: row.action_type,
          detail: err instanceof Error ? err.message : String(err),
        }),
      );
      result = { ok: false, message: "The action could not be completed. Nothing was changed." };
    }
    status = result.ok ? "confirmed" : "failed";
    const { error: finishError } = await db.rpc("ai_finish_pending_action", {
      p_id: pendingId,
      p_status: status,
      p_result: result,
    });
    if (finishError)
      console.error(JSON.stringify({ request_id: requestId, detail: finishError.message }));
  }

  const userText = `${action === "confirm" ? "Confirm" : "Cancel"}: ${summary}`;
  const text = result.ok ? result.message : `I could not complete that: ${result.message}`;
  let saved: {
    conversation_id: string;
    user_message_id: string;
    assistant_message_id: string;
  } | null = null;
  if (conversationId) {
    const { data, error } = await db.rpc("ai_append_turn", {
      p_conversation_id: conversationId,
      p_user_text: userText,
      p_assistant_text: text,
      p_metadata: {
        request_id: requestId,
        function_version: "v3",
        action: { id: pendingId, status },
      },
    });
    if (error)
      console.error(
        JSON.stringify({
          request_id: requestId,
          detail: `action turn not saved: ${error.message}`,
        }),
      );
    else saved = data;
  }

  return {
    ok: true,
    body: {
      text,
      user_text: userText,
      request_id: requestId,
      conversation_id: saved?.conversation_id ?? conversationId,
      user_message_id: saved?.user_message_id ?? null,
      message_id: saved?.assistant_message_id ?? null,
      action: { id: pendingId, status },
    },
  };
}
