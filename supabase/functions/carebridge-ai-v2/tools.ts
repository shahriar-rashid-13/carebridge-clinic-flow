import { ToolInputError, type Role, type ToolContext, type ToolDefinition } from "./shared.ts";
import { getAvailableSlots, getDoctors } from "./tools-common.ts";
import { getMyAppointments, getMyBills, getMyPrescriptions, getMyProfile } from "./tools-patient.ts";
import { getMySchedule, getPatientHistory, getPatientSummary } from "./tools-doctor.ts";
import { getAppointments, getBills, getUnbilledVisits, searchPatients } from "./tools-receptionist.ts";
import type { ToolCall } from "./gateway.ts";

// Read-only tools. Write tools arrive with the confirmation framework (Phase E).
const REGISTRY: ToolDefinition[] = [
  getDoctors,
  getAvailableSlots,
  getMyProfile,
  getMyAppointments,
  getMyPrescriptions,
  getMyBills,
  getMySchedule,
  getPatientSummary,
  getPatientHistory,
  searchPatients,
  getAppointments,
  getUnbilledVisits,
  getBills,
];

const MAX_TOOL_RESULT_LENGTH = 12_000;

export function toolsForRole(role: Role): ToolDefinition[] {
  return REGISTRY.filter((tool) => tool.roles.includes(role));
}

export function toolSchemas(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function",
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }));
}

export type ToolTrace = { name: string; ok: boolean; ms: number; error?: string };

export async function executeToolCall(
  call: ToolCall,
  allowed: ToolDefinition[],
  ctx: ToolContext,
  requestId: string,
): Promise<{ content: string; trace: ToolTrace }> {
  const startedAt = Date.now();
  const name = call.function?.name ?? "";
  const finish = (result: Record<string, unknown>, ok: boolean, error?: string) => {
    let content = JSON.stringify(result);
    if (content.length > MAX_TOOL_RESULT_LENGTH) {
      content = JSON.stringify({
        ok: false,
        message: "The result was too large. Ask the user to narrow the request (for example a shorter date range).",
      });
    }
    return { content, trace: { name, ok, ms: Date.now() - startedAt, ...(error ? { error } : {}) } };
  };

  const tool = allowed.find((candidate) => candidate.name === name);
  if (!tool) return finish({ ok: false, message: "That action is not available." }, false, "not_allowed");

  let args: Record<string, unknown> = {};
  try {
    const parsed = call.function.arguments ? JSON.parse(call.function.arguments) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) args = parsed;
    else return finish({ ok: false, message: "Tool arguments must be a JSON object." }, false, "bad_arguments");
  } catch {
    return finish({ ok: false, message: "Tool arguments were not valid JSON." }, false, "bad_arguments");
  }

  try {
    const result = await tool.run(args, ctx);
    return finish(result, result["ok"] !== false);
  } catch (err) {
    if (err instanceof ToolInputError) {
      return finish({ ok: false, message: err.message }, false, "invalid_input");
    }
    console.error(
      JSON.stringify({
        request_id: requestId,
        tool: name,
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
    return finish({ ok: false, message: "The data could not be loaded right now." }, false, "tool_error");
  }
}
