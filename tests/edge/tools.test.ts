// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  ToolInputError,
  type ToolDefinition,
} from "../../supabase/functions/carebridge-ai-v2/shared.ts";
import {
  executeToolCall,
  toolSchemas,
  toolsForRole,
} from "../../supabase/functions/carebridge-ai-v2/tools.ts";
import { edgeClinic } from "../helpers/edge";

const names = (role: "patient" | "doctor" | "receptionist") =>
  toolsForRole(role).map((tool) => tool.name);

const toolCall = (name: string, args: string) => ({
  id: "call-1",
  type: "function" as const,
  function: { name, arguments: args },
});

const fakeTool = (run: ToolDefinition["run"]): ToolDefinition => ({
  name: "fake_tool",
  description: "test",
  parameters: { type: "object", properties: {} },
  roles: ["patient"],
  run,
});

describe("toolsForRole", () => {
  it("gives patients only their own tools", () => {
    const patient = names("patient");
    expect(patient).toEqual(
      expect.arrayContaining([
        "get_doctors",
        "get_available_slots",
        "get_my_appointments",
        "propose_booking",
        "propose_join_waitlist",
      ]),
    );
    expect(patient).not.toContain("propose_confirm_appointment");
    expect(patient).not.toContain("search_patients");
    expect(patient).not.toContain("propose_complete_consultation");
  });

  it("gives doctors consultation tools but no front desk tools", () => {
    const doctor = names("doctor");
    expect(doctor).toEqual(
      expect.arrayContaining(["get_my_schedule", "propose_complete_consultation"]),
    );
    expect(doctor).not.toContain("propose_booking");
    expect(doctor).not.toContain("propose_create_bill");
  });

  it("gives receptionists front desk tools", () => {
    const receptionist = names("receptionist");
    expect(receptionist).toEqual(
      expect.arrayContaining([
        "propose_confirm_appointment",
        "propose_cancel_appointment",
        "propose_create_bill",
        "propose_mark_bill_paid",
        "propose_promote_to_doctor",
        "get_followups",
      ]),
    );
    expect(receptionist).not.toContain("get_my_appointments");
  });

  it("builds OpenAI-style function schemas", () => {
    const [schema] = toolSchemas(toolsForRole("patient").slice(0, 1));
    expect(schema).toMatchObject({
      type: "function",
      function: { name: expect.any(String), parameters: { type: "object" } },
    });
  });
});

describe("executeToolCall", () => {
  const ctx = () => edgeClinic().ctx("patient");

  it("refuses tools outside the allowed list", async () => {
    const result = await executeToolCall(
      toolCall("propose_confirm_appointment", "{}"),
      toolsForRole("patient"),
      ctx(),
      "req",
    );
    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      message: "That action is not available.",
    });
    expect(result.trace).toMatchObject({
      name: "propose_confirm_appointment",
      ok: false,
      error: "not_allowed",
    });
  });

  it.each([
    ["{oops", "Tool arguments were not valid JSON."],
    ["[1,2]", "Tool arguments must be a JSON object."],
  ])("rejects bad arguments %s", async (args, message) => {
    const run = vi.fn();
    const result = await executeToolCall(
      toolCall("fake_tool", args),
      [fakeTool(run)],
      ctx(),
      "req",
    );
    expect(JSON.parse(result.content)).toEqual({ ok: false, message });
    expect(result.trace.error).toBe("bad_arguments");
    expect(run).not.toHaveBeenCalled();
  });

  it("treats empty arguments as an empty object", async () => {
    const run = vi.fn(async () => ({ ok: true }));
    await executeToolCall(toolCall("fake_tool", ""), [fakeTool(run)], ctx(), "req");
    expect(run).toHaveBeenCalledWith({}, expect.anything());
  });

  it("returns input errors to the model", async () => {
    const tool = fakeTool(async () => {
      throw new ToolInputError("doctor_id is required.");
    });
    const result = await executeToolCall(toolCall("fake_tool", "{}"), [tool], ctx(), "req");
    expect(JSON.parse(result.content)).toEqual({ ok: false, message: "doctor_id is required." });
    expect(result.trace.error).toBe("invalid_input: doctor_id is required.");
  });

  it("records ok:false tool results as failures", async () => {
    const tool = fakeTool(async () => ({ ok: false, message: "That date is in the past." }));
    const result = await executeToolCall(toolCall("fake_tool", "{}"), [tool], ctx(), "req");
    expect(result.trace).toMatchObject({ ok: false, error: "That date is in the past." });
  });

  it("hides unexpected errors from the model", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tool = fakeTool(async () => {
      throw new Error("relation does not exist");
    });
    const result = await executeToolCall(toolCall("fake_tool", "{}"), [tool], ctx(), "req");
    expect(JSON.parse(result.content)).toEqual({
      ok: false,
      message: "The data could not be loaded right now.",
    });
    expect(result.content).not.toContain("relation");
    expect(result.trace.error).toBe("tool_error");
  });

  it("replaces oversized results", async () => {
    const tool = fakeTool(async () => ({ ok: true, blob: "x".repeat(13_000) }));
    const result = await executeToolCall(toolCall("fake_tool", "{}"), [tool], ctx(), "req");
    expect(JSON.parse(result.content)).toMatchObject({ ok: false });
    expect(result.content.length).toBeLessThan(12_000);
  });
});
