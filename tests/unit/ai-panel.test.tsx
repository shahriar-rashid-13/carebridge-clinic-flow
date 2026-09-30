import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CareBridgeAiPanel } from "@/components/clinic/carebridge-ai-panel";
import { ThemeProvider } from "@/lib/theme/theme-context";

const { fake } = await vi.hoisted(async () => import("../helpers/supabase"));
const mocks = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  reloadClinic: vi.fn(async () => undefined),
  // The real auth store returns a stable object; a fresh one per render would reload forever.
  auth: { user: { id: "u1", name: "Sarah Jenkins", email: "sarah@example.com", role: "patient" } },
}));

vi.mock("@/lib/supabase/client", () => ({ supabase: fake.client }));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/auth/store", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/lib/clinic/store", () => ({ useClinic: () => ({ reload: mocks.reloadClinic }) }));

const inFuture = () => new Date(Date.now() + 10 * 60_000).toISOString();

const proposal = (overrides: Record<string, unknown> = {}) => ({
  id: "pa-1",
  action_type: "book_appointment",
  summary: "Book Dr. Marcus Vance on Mon 5 Oct at 09:00 AM",
  details: [
    { label: "Doctor", value: "Dr. Marcus Vance" },
    { label: "Time", value: "09:00 AM" },
  ],
  status: "pending",
  expires_at: inFuture(),
  ...overrides,
});

const reply = (overrides: Record<string, unknown> = {}) => ({
  text: "Here you go.",
  conversation_id: "c-new",
  user_message_id: "m-user",
  message_id: "m-assistant",
  ...overrides,
});

const seedConversation = (messages: unknown[], pendingStatuses: unknown[] = []) =>
  fake.onQuery((query) => {
    if (query.table === "ai_conversations")
      return { data: [{ id: "c1", title: "Booking", created_at: "2026-09-29" }] };
    if (query.table === "ai_messages") return { data: messages };
    if (query.table === "ai_pending_actions") return { data: pendingStatuses };
    return undefined;
  });

/**
 * Mimics the Edge Function saving the turn, because the panel re-reads the
 * conversation from the database once it learns the new conversation id.
 */
const saveTurn = (
  userText: string,
  answer: ReturnType<typeof reply> & { proposals?: unknown[] },
) => {
  const messages = [
    { id: answer.user_message_id, role: "user", content: userText, metadata: null },
    {
      id: answer.message_id,
      role: "assistant",
      content: answer.text,
      metadata: answer.proposals ? { proposals: answer.proposals } : null,
    },
  ];
  fake.onQuery((query) => {
    if (query.table === "ai_conversations")
      return { data: [{ id: answer.conversation_id, title: userText, created_at: "2026-09-29" }] };
    if (query.table === "ai_messages") return { data: messages };
    return { data: [] };
  });
  return { data: answer };
};

const renderPanel = () =>
  render(
    <ThemeProvider>
      <CareBridgeAiPanel />
    </ThemeProvider>,
  );

const send = async (text: string) => {
  await userEvent.type(screen.getByRole("textbox", { name: "Message CareBridge AI" }), text);
  await userEvent.click(screen.getByRole("button", { name: "Send message" }));
};

beforeEach(() => {
  fake.reset();
  fake.onQuery((query) => ({ data: query.table === "ai_conversations" ? [] : [] }));
  mocks.toast.success.mockClear();
  mocks.toast.error.mockClear();
  mocks.reloadClinic.mockClear();
});

describe("CareBridgeAiPanel", () => {
  it("greets the patient with starter prompts", async () => {
    renderPanel();
    expect(await screen.findByText("Hi Sarah. How can I help you today?")).toBeInTheDocument();
    expect(screen.getByText("Patient Assistant")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Who are the doctors at CareBridge?" }),
    ).toBeInTheDocument();
    expect(screen.getByText("No conversations yet")).toBeInTheDocument();
  });

  it("sends a new message to carebridge-ai-v2 and shows the reply", async () => {
    fake.onInvoke(() =>
      saveTurn("Who can I see on Monday?", reply({ text: "**Dr. Marcus Vance** is available." })),
    );
    renderPanel();
    await screen.findByText("Hi Sarah. How can I help you today?");

    await send("Who can I see on Monday?");

    expect(await screen.findByText("Dr. Marcus Vance")).toBeInTheDocument();
    expect(fake.client.functions.invoke).toHaveBeenCalledWith("carebridge-ai-v2", {
      body: { message: "Who can I see on Monday?" },
    });
    expect(screen.getByText("Who can I see on Monday?", { selector: "div" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Who can I see on Monday?" })).toBeInTheDocument();
  });

  it("continues the selected conversation", async () => {
    seedConversation([{ id: "m1", role: "assistant", content: "Earlier reply", metadata: null }]);
    fake.onInvoke(() => ({ data: reply({ conversation_id: "c1" }) }));
    renderPanel();
    expect(await screen.findByText("Earlier reply")).toBeInTheDocument();

    await send("Thanks");

    await screen.findByText("Here you go.");
    expect(fake.client.functions.invoke).toHaveBeenCalledWith("carebridge-ai-v2", {
      body: { message: "Thanks", conversation_id: "c1" },
    });
  });

  it("shows the server error, restores the draft and offers retry", async () => {
    fake.onInvoke(() => ({
      error: {
        context: new Response(JSON.stringify({ error: "You are sending messages too quickly." }), {
          status: 429,
        }),
      },
    }));
    renderPanel();
    await screen.findByText("Hi Sarah. How can I help you today?");

    await send("Hello");

    expect(await screen.findByText("You are sending messages too quickly.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Message CareBridge AI" })).toHaveValue("Hello");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("uses a generic error for a malformed reply", async () => {
    fake.onInvoke(() => ({ data: { text: "missing ids" } }));
    renderPanel();
    await screen.findByText("Hi Sarah. How can I help you today?");

    await send("Hello");

    expect(
      await screen.findByText("Unable to send your message. Please try again."),
    ).toBeInTheDocument();
  });

  it("confirms a proposal and reloads clinic data", async () => {
    fake.onInvoke((_name, { body }) =>
      (body as { action?: string }).action
        ? {
            data: {
              text: "Your appointment is booked.",
              user_text: "Confirm",
              conversation_id: "c-new",
              user_message_id: "m-user-2",
              message_id: "m-assistant-2",
              action: { id: "pa-1", status: "confirmed" },
            },
          }
        : saveTurn(
            "Book Marcus Monday 9am",
            reply({ text: "Please confirm.", proposals: [proposal()] }),
          ),
    );
    renderPanel();
    await screen.findByText("Hi Sarah. How can I help you today?");
    await send("Book Marcus Monday 9am");

    expect(
      await screen.findByText("Book Dr. Marcus Vance on Mon 5 Oct at 09:00 AM"),
    ).toBeInTheDocument();
    expect(screen.getByText("Doctor")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Your appointment is booked.")).toBeInTheDocument();
    expect(fake.client.functions.invoke).toHaveBeenLastCalledWith("carebridge-ai-v2", {
      body: { action: "confirm", pending_action_id: "pa-1", conversation_id: "c-new" },
    });
    expect(mocks.toast.success).toHaveBeenCalledWith("Done");
    expect(mocks.reloadClinic).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("reports a failed action", async () => {
    seedConversation([
      {
        id: "m1",
        role: "assistant",
        content: "Please confirm.",
        metadata: { proposals: [proposal()] },
      },
    ]);
    fake.onInvoke(() => ({
      data: {
        text: "That slot is no longer free.",
        user_text: "Confirm",
        conversation_id: "c1",
        user_message_id: null,
        message_id: null,
        action: { id: "pa-1", status: "failed" },
      },
    }));
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(mocks.toast.error).toHaveBeenCalledWith("The action could not be completed"),
    );
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(mocks.reloadClinic).not.toHaveBeenCalled();
  });

  it("cancels a proposal", async () => {
    seedConversation([
      {
        id: "m1",
        role: "assistant",
        content: "Please confirm.",
        metadata: { proposals: [proposal()] },
      },
    ]);
    fake.onInvoke(() => ({
      data: {
        text: "Okay, I cancelled that request.",
        user_text: "Cancel",
        conversation_id: "c1",
        user_message_id: "u2",
        message_id: "a2",
        action: { id: "pa-1", status: "cancelled" },
      },
    }));
    renderPanel();

    await userEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Cancelled")).toBeInTheDocument();
    expect(fake.client.functions.invoke).toHaveBeenCalledWith("carebridge-ai-v2", {
      body: { action: "cancel", pending_action_id: "pa-1", conversation_id: "c1" },
    });
  });

  it("uses the stored status for proposals loaded from history", async () => {
    seedConversation(
      [
        {
          id: "m1",
          role: "assistant",
          content: "Please confirm.",
          metadata: { proposals: [proposal()] },
        },
      ],
      [{ id: "pa-1", status: "confirmed" }],
    );
    renderPanel();

    expect(await screen.findByText("Done")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });

  it("marks a pending proposal past its expiry as expired", async () => {
    seedConversation([
      {
        id: "m1",
        role: "assistant",
        content: "Please confirm.",
        metadata: { proposals: [proposal({ expires_at: "2020-01-01T00:00:00Z" })] },
      },
    ]);
    renderPanel();

    expect(await screen.findByText("Expired")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
  });
});
