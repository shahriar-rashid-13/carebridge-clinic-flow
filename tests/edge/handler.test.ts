// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { denoEnv, denoServe } from "../helpers/deno";
import { edgeClinic, ID } from "../helpers/edge";

const state = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => state.client) }));

const { handler, safeHandler } = await import("../../supabase/functions/carebridge-ai-v2/index.ts");
// Read at import time; mock call history is cleared before tests run.
const servedHandler = denoServe.mock.calls[0]?.[0];

type Role = "patient" | "doctor" | "receptionist";
const USER: Record<Role, string> = {
  patient: ID.sarah,
  doctor: ID.marcusUser,
  receptionist: ID.clara,
};
const CONVERSATION = "00000000-0000-4000-8000-000000000700";
const PENDING = "00000000-0000-4000-8000-000000000800";

let clinic: ReturnType<typeof edgeClinic>;
const fetchMock = vi.fn<typeof fetch>();

const signIn = (role: Role) => {
  clinic.fake.client.auth.getUser.mockResolvedValue({
    data: { user: { id: USER[role] } },
    error: null,
  } as never);
};

const post = (
  body: unknown,
  headers: Record<string, string> = { Authorization: "Bearer user-jwt" },
) =>
  handler(
    new Request("https://edge.test/functions/v1/carebridge-ai-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );

const llmReply = (message: Record<string, unknown>, headers: Record<string, string> = {}) =>
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ model: "gemini/gemini-3.1-flash-lite", choices: [{ message }] }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...headers },
      },
    ),
  );

const toolCallReply = (
  name: string,
  args: Record<string, unknown>,
  headers: Record<string, string> = {},
) =>
  llmReply(
    {
      content: null,
      tool_calls: [
        {
          id: `call-${name}`,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    },
    headers,
  );

const llmRequest = (index: number) => JSON.parse(String(fetchMock.mock.calls[index]![1]?.body));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T04:00:00Z"));
  Object.assign(denoEnv, {
    SUPABASE_URL: "https://project.supabase.test",
    SUPABASE_ANON_KEY: "anon",
    LITELLM_BASE_URL: "https://litellm.test",
    LITELLM_API_KEY: "sk-test",
    CLINIC_TIMEZONE: "Asia/Dhaka",
  });
  clinic = edgeClinic();
  state.client = clinic.fake.client;
  clinic.rpcResult("ai_append_turn", {
    data: {
      conversation_id: CONVERSATION,
      user_message_id: "m-user",
      assistant_message_id: "m-assistant",
    },
  });
  signIn("patient");
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("registers the error-reporting wrapper with Deno.serve", () => {
  expect(servedHandler).toBe(safeHandler);
  expect(typeof handler).toBe("function");
});

describe("request checks", () => {
  it("answers CORS preflight", async () => {
    const response = await handler(new Request("https://edge.test", { method: "OPTIONS" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("rejects other methods", async () => {
    const response = await handler(new Request("https://edge.test", { method: "GET" }));
    expect(response.status).toBe(405);
  });

  it("requires a bearer token", async () => {
    const response = await post({ message: "hi" }, {});
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Missing or invalid authorization." });
  });

  it("rejects an invalid session", async () => {
    clinic.fake.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "bad jwt" },
    } as never);
    const response = await post({ message: "hi" });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "Invalid or expired session." });
  });

  it("rejects users without a clinic role", async () => {
    clinic.fake.client.auth.getUser.mockResolvedValue({
      data: { user: { id: ID.missing } },
      error: null,
    } as never);
    const response = await post({ message: "hi" });
    expect(response.status).toBe(403);
  });

  it.each([
    [{ message: "   " }, "message is required."],
    [{ message: "x".repeat(4001) }, "message exceeds 4000 characters."],
    [{ message: "hi", conversation_id: "abc" }, "conversation_id must be a UUID."],
    [{ action: "delete", pending_action_id: PENDING }, "action must be confirm or cancel."],
    [{ action: "confirm", pending_action_id: "abc" }, "pending_action_id must be a UUID."],
  ])("validates the body %#", async (body, error) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const response = await post("{not json");
    expect(response.status).toBe(400);
  });

  it("returns 404 for a conversation the user cannot see", async () => {
    const response = await post({ message: "hi", conversation_id: CONVERSATION });
    expect(response.status).toBe(404);
  });

  it("rate limits before calling the model", async () => {
    clinic.fake.onQuery((query) =>
      query.table === "ai_messages" ? { count: 30 } : clinic.answer(query),
    );
    const response = await post({ message: "hi" });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      error: "You are sending messages too quickly. Please wait a minute.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("chat turns", () => {
  it("answers and saves the turn", async () => {
    llmReply({ content: "Hello Sarah!" });

    const response = await post({ message: "Hi" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      text: "Hello Sarah!",
      conversation_id: CONVERSATION,
      user_message_id: "m-user",
      message_id: "m-assistant",
      proposals: [],
    });
    const request = llmRequest(0);
    expect(request.model).toBe("carebridge-agent");
    expect(request.messages[0].content).toContain("The signed-in user is a patient.");
    expect(request.messages[0].content).toContain("Today is 2026-10-01");
    expect(request.messages.at(-1)).toEqual({ role: "user", content: "Hi" });
    expect(clinic.rpcCalls("ai_append_turn")[0]?.args).toMatchObject({
      p_conversation_id: null,
      p_user_text: "Hi",
      p_assistant_text: "Hello Sarah!",
    });
  });

  it("offers each role only its own tools", async () => {
    llmReply({ content: "ok" });
    await post({ message: "Hi" });
    const toolNames = (llmRequest(0).tools as { function: { name: string } }[]).map(
      (tool) => tool.function.name,
    );
    expect(toolNames).toContain("propose_booking");
    expect(toolNames).not.toContain("propose_confirm_appointment");
    expect(toolNames).not.toContain("search_patients");
  });

  it("runs a propose tool and returns the proposal card", async () => {
    toolCallReply("propose_booking", {
      doctor_id: ID.marcus,
      appointment_date: "2026-10-05",
      time_slot: "10:00 AM",
      reason: "Chest pain",
    });
    llmReply({ content: "Please review the card and press Confirm." });

    const response = await post({ message: "Book Marcus Monday 10am for chest pain" });
    const body = await response.json();

    expect(body.proposals).toHaveLength(1);
    expect(body.proposals[0]).toMatchObject({ action_type: "book_appointment", status: "pending" });
    expect(clinic.writes()).toEqual([]);
    const toolMessage = llmRequest(1).messages.at(-1);
    expect(toolMessage).toMatchObject({ role: "tool", tool_call_id: "call-propose_booking" });
    expect(JSON.parse(toolMessage.content)).toMatchObject({
      ok: true,
      status: "awaiting_user_confirmation",
    });
    expect(clinic.rpcCalls("ai_append_turn")[0]?.args["p_metadata"]).toMatchObject({
      tools: [{ name: "propose_booking", ok: true }],
      proposals: body.proposals,
    });
  });

  it("does not run tools outside the user's role", async () => {
    toolCallReply("propose_confirm_appointment", { appointment_id: ID.requested });
    llmReply({ content: "I cannot do that." });

    await post({ message: "Confirm my appointment yourself" });

    expect(JSON.parse(llmRequest(1).messages.at(-1).content)).toEqual({
      ok: false,
      message: "That action is not available.",
    });
    expect(clinic.rpcCalls("ai_create_pending_action")).toEqual([]);
  });

  it("stays on the fallback model after a fallback", async () => {
    toolCallReply("get_doctors", {}, { "x-litellm-attempted-fallbacks": "1" });
    llmReply({ content: "Dr. Marcus Vance is available." });

    const response = await post({ message: "Who are the doctors?" });

    expect(response.status).toBe(200);
    expect(llmRequest(1).model).toBe("carebridge-agent-fallback");
    expect(clinic.rpcCalls("ai_append_turn")[0]?.args["p_metadata"]).toMatchObject({
      fallback_calls: 1,
    });
  });

  it("replaces a tool call printed as text", async () => {
    llmReply({
      content:
        "<tool_call><function=propose_booking><parameter=doctor_id>x</parameter></function></tool_call>",
    });

    const body = await (await post({ message: "Book it" })).json();

    expect(body.text).toBe(
      "Sorry, I could not prepare that request. Please send your last message again.",
    );
  });

  it("maps gateway failures to a clear error", async () => {
    fetchMock.mockResolvedValueOnce(new Response("both providers down", { status: 503 }));
    const response = await post({ message: "Hi" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "AI service is unavailable." });
    expect(clinic.rpcCalls("ai_append_turn")).toEqual([]);
  });

  it("fails when the model returns nothing", async () => {
    llmReply({ content: "   " });
    const response = await post({ message: "Hi" });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: "AI service returned an empty reply." });
  });
});

describe("confirm and cancel", () => {
  const claimed = (role: Role, actionType: string, payload: Record<string, unknown>) =>
    clinic.rpcResult("ai_claim_pending_action", {
      data: {
        id: PENDING,
        action_type: actionType,
        role,
        payload,
        summary: "Confirm Sarah's appointment",
      },
    });

  it("executes a claimed action and records the result", async () => {
    signIn("receptionist");
    claimed("receptionist", "confirm_appointment", { appointment_id: ID.requested });

    const response = await post({
      action: "confirm",
      pending_action_id: PENDING,
      conversation_id: CONVERSATION,
    });
    const body = await response.json();

    expect(body).toMatchObject({
      text: "The appointment is confirmed.",
      user_text: "Confirm: Confirm Sarah's appointment",
      action: { id: PENDING, status: "confirmed" },
      message_id: "m-assistant",
    });
    expect(
      clinic.tables["appointments"]!.find((row) => row["id"] === ID.requested)?.["status"],
    ).toBe("confirmed");
    expect(clinic.rpcCalls("ai_finish_pending_action")[0]?.args).toEqual({
      p_id: PENDING,
      p_status: "confirmed",
      p_result: { ok: true, message: "The appointment is confirmed." },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a proposal created for another role", async () => {
    signIn("patient");
    claimed("receptionist", "confirm_appointment", { appointment_id: ID.requested });

    const body = await (await post({ action: "confirm", pending_action_id: PENDING })).json();

    expect(body).toMatchObject({
      text: "I could not complete that: This action is not allowed for your account.",
      action: { status: "failed" },
    });
    expect(clinic.writes()).toEqual([]);
  });

  it("returns 404 when the proposal cannot be claimed", async () => {
    clinic.rpcResult("ai_claim_pending_action", { error: { code: "P0002", message: "not found" } });
    const response = await post({ action: "confirm", pending_action_id: PENDING });
    expect(response.status).toBe(404);
  });

  it("returns 409 for an expired or already used proposal", async () => {
    clinic.rpcResult("ai_claim_pending_action", {
      error: { code: "22023", message: "This proposal has expired." },
    });
    const response = await post({ action: "confirm", pending_action_id: PENDING });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "This proposal has expired." });
  });

  it("hides unexpected action errors", async () => {
    signIn("receptionist");
    claimed("receptionist", "confirm_appointment", { appointment_id: ID.requested });
    clinic.fake.onQuery((query) =>
      query.table === "appointments"
        ? { error: { message: "connection reset" } }
        : clinic.answer(query),
    );

    const body = await (await post({ action: "confirm", pending_action_id: PENDING })).json();

    expect(body.text).toBe(
      "I could not complete that: The action could not be completed. Nothing was changed.",
    );
    expect(body.action.status).toBe("failed");
  });

  it("cancels a proposal without running it", async () => {
    clinic.tables["ai_pending_actions"] = [{ id: PENDING, summary: "Book Dr. Marcus Vance" }];

    const body = await (await post({ action: "cancel", pending_action_id: PENDING })).json();

    expect(body).toMatchObject({
      text: "Okay, I cancelled that proposal. Nothing was changed.",
      user_text: "Cancel: Book Dr. Marcus Vance",
      action: { status: "cancelled" },
      conversation_id: null,
    });
    expect(clinic.rpcCalls("ai_cancel_pending_action")[0]?.args).toEqual({ p_id: PENDING });
    expect(clinic.rpcCalls("ai_claim_pending_action")).toEqual([]);
  });
});
