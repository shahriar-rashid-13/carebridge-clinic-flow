import * as React from "react";
import { ListPlus, LoaderCircle, MessageSquarePlus, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/store";
import type { Role } from "@/lib/clinic/types";
import { cn } from "@/lib/utils";

type Message = { id: string; role: "user" | "assistant"; text: string };
type Conversation = { id: string; title: string | null; created_at: string };

const ASSISTANT_LABEL: Record<Role, string> = {
  patient: "Patient Assistant",
  doctor: "Clinical Assistant",
  receptionist: "Front Desk Assistant",
};
const PATIENT_PROMPTS = [
  "Who are the doctors at CareBridge?",
  "What appointments do I have?",
  "Help me book an appointment",
];
const PATIENT_ACTIONS = [
  ["Find a doctor", "Show me the doctors at CareBridge."],
  ["Check available slots", "Help me find an available appointment slot."],
  ["My appointments", "What appointments do I have?"],
  ["My prescriptions", "Show me my prescriptions."],
  ["My profile", "Show me my profile."],
  ["Book an appointment", "Help me book an appointment."],
  ["Cancel an appointment", "Help me cancel an appointment."],
  ["Reschedule an appointment", "Help me reschedule an appointment."],
] as const;
const titleFor = (message: string) =>
  message.trim().replace(/\s+/g, " ").slice(0, 60) || "New conversation";

function AssistantMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h3 className="mb-2 text-base font-semibold leading-6">{children}</h3>
        ),
        h2: ({ children }) => <h4 className="mb-2 font-semibold leading-6">{children}</h4>,
        h3: ({ children }) => <h5 className="mb-2 font-medium leading-6">{children}</h5>,
        p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
        ol: ({ children }) => (
          <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

export function CareBridgeAiPanel() {
  const { user } = useAuth();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const role = user?.role ?? "patient";
  const firstName = user?.name?.replace(/^Dr\.\s+/i, "").split(" ")[0] || "there";

  const loadMessages = React.useCallback(async (conversationId: string) => {
    setIsLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("ai_messages")
      .select("id, role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setIsLoading(false);
    if (loadError || !data) return setError("Unable to load this conversation. Please try again.");
    setMessages(
      data.map((message) => ({
        id: message.id,
        role: message.role as Message["role"],
        text: message.content,
      })),
    );
  }, []);

  const loadConversations = React.useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("ai_conversations")
      .select("id, title, created_at")
      .order("updated_at", { ascending: false });
    if (loadError || !data) {
      setIsLoading(false);
      return setError("Unable to load your conversations. Please try again.");
    }
    setConversations(data);
    const conversationId = data.some(({ id }) => id === selectedId)
      ? selectedId
      : (data[0]?.id ?? null);
    setSelectedId(conversationId);
    if (conversationId) await loadMessages(conversationId);
    else {
      setMessages([]);
      setIsLoading(false);
    }
  }, [loadMessages, selectedId, user]);

  React.useEffect(() => {
    void loadConversations();
  }, [loadConversations]);
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [error, isLoading, isSending, messages]);

  const selectConversation = async (conversationId: string) => {
    setSelectedId(conversationId);
    await loadMessages(conversationId);
  };
  const startConversation = async () => {
    if (!user || isSending) return;
    setError(null);
    const { data, error: createError } = await supabase
      .from("ai_conversations")
      .insert({ user_id: user.id, title: "New conversation" })
      .select("id, title, created_at")
      .single();
    if (createError || !data)
      return setError("Unable to start a new conversation. Please try again.");
    setConversations((current) => [data, ...current]);
    setSelectedId(data.id);
    setMessages([]);
  };

  const sendMessage = async (messageToSend = draft) => {
    const text = messageToSend.trim();
    if (!text || !user || isSending || isLoading) return;
    setDraft("");
    setError(null);
    setIsSending(true);
    try {
      let conversationId = selectedId;
      if (!conversationId) {
        const { data, error: createError } = await supabase
          .from("ai_conversations")
          .insert({ user_id: user.id, title: titleFor(text) })
          .select("id, title, created_at")
          .single();
        if (createError || !data) throw new Error("conversation_create_failed");
        conversationId = data.id;
        setConversations((current) => [data, ...current]);
        setSelectedId(data.id);
      }
      if (messages.length === 0) {
        const title = titleFor(text);
        const { error: titleError } = await supabase
          .from("ai_conversations")
          .update({ title, updated_at: new Date().toISOString() })
          .eq("id", conversationId);
        if (titleError) throw new Error("conversation_title_update_failed");
        setConversations((current) =>
          current.map((conversation) =>
            conversation.id === conversationId ? { ...conversation, title } : conversation,
          ),
        );
      }
      const { data: savedUser, error: userSaveError } = await supabase
        .from("ai_messages")
        .insert({ conversation_id: conversationId, user_id: user.id, role: "user", content: text })
        .select("id, role, content")
        .single();
      if (userSaveError || !savedUser) throw new Error("user_message_save_failed");
      const userMessage: Message = { id: savedUser.id, role: "user", text: savedUser.content };
      const history = [...messages, userMessage]
        .slice(-16)
        .map(({ role: historyRole, text: content }) => ({ role: historyRole, content }));
      setMessages((current) => [...current, userMessage]);
      const { data, error: invokeError } = await supabase.functions.invoke("carebridge-ai", {
        body: { message: text, messages: history },
      });
      const responseText =
        data && typeof data === "object" ? (data as { text?: unknown }).text : null;
      if (invokeError || typeof responseText !== "string" || !responseText.trim())
        throw new Error("ai_response_unavailable");
      const { data: savedAssistant, error: assistantSaveError } = await supabase
        .from("ai_messages")
        .insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: responseText.trim(),
        })
        .select("id, role, content")
        .single();
      if (assistantSaveError || !savedAssistant)
        return setError("Your reply was received but could not be saved. Please try again.");
      setMessages((current) => [
        ...current,
        { id: savedAssistant.id, role: "assistant", text: savedAssistant.content },
      ]);
      const { error: touchError } = await supabase
        .from("ai_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversationId);
      if (!touchError)
        setConversations((current) => {
          const conversation = current.find(({ id }) => id === conversationId);
          return conversation
            ? [{ ...conversation }, ...current.filter(({ id }) => id !== conversationId)]
            : current;
        });
    } catch {
      setError("Unable to save or send your message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <header className="border-b border-border px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <h1 className="font-display text-xl">CareBridge AI</h1>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{ASSISTANT_LABEL[role]}</p>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-36 shrink-0 flex-col border-r border-border bg-linen/30 p-2 sm:w-44">
          <Button
            size="sm"
            className="mb-2 w-full justify-start"
            onClick={() => void startConversation()}
            disabled={isSending}
          >
            <MessageSquarePlus className="size-4" /> New chat
          </Button>
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <Button
                key={conversation.id}
                variant={conversation.id === selectedId ? "secondary" : "ghost"}
                className="h-auto w-full justify-start whitespace-normal px-2 py-2 text-left text-xs leading-4"
                onClick={() => void selectConversation(conversation.id)}
                disabled={isSending}
              >
                <span className="line-clamp-2">{conversation.title || "New conversation"}</span>
              </Button>
            ))}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-5">
            {isLoading ? (
              <div className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Loading conversation…
              </div>
            ) : messages.length === 0 ? (
              <div className="m-auto w-full max-w-sm text-center">
                <span className="mx-auto grid size-11 place-items-center rounded-full bg-sage text-sage-foreground">
                  <Sparkles className="size-5" />
                </span>
                <p className="font-display mt-4 text-xl">
                  Hi {firstName}. How can I help you today?
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  I can help you find your way around CareBridge.
                </p>
                {role === "patient" && (
                  <div className="mt-5 flex flex-col items-stretch gap-2 text-left">
                    {PATIENT_PROMPTS.map((prompt) => (
                      <Button
                        key={prompt}
                        variant="outline"
                        className="h-auto justify-start whitespace-normal px-3 py-2.5 text-left text-xs leading-5"
                        onClick={() => void sendMessage(prompt)}
                        disabled={isSending}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[92%] rounded-[12px] px-3.5 py-3 text-sm leading-6",
                      message.role === "user"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "border border-border bg-card text-foreground",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <AssistantMessage text={message.text} />
                    ) : (
                      message.text
                    )}
                  </div>
                ))}
                {isSending && (
                  <div className="flex w-fit items-center gap-2 rounded-[12px] border border-border bg-card px-3.5 py-3 text-sm text-muted-foreground">
                    <LoaderCircle className="size-4 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
            )}
            {error && (
              <p className="mt-4 rounded-md border border-rose/70 bg-rose/50 px-3 py-2 text-sm text-rose-foreground">
                {error}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
          <form
            className="border-t border-border bg-linen/50 p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="flex items-end gap-2">
              {role === "patient" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="CareBridge AI actions"
                      disabled={isSending || isLoading}
                    >
                      <ListPlus />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="top" className="w-56">
                    <DropdownMenuLabel>CareBridge actions</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {PATIENT_ACTIONS.map(([label, prompt]) => (
                      <DropdownMenuItem key={label} onSelect={() => void sendMessage(prompt)}>
                        {label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage();
                  }
                }}
                placeholder="Ask CareBridge AI…"
                aria-label="Message CareBridge AI"
                className="min-h-11 max-h-32 resize-y bg-background"
                disabled={isSending || isLoading}
              />
              <Button
                type="submit"
                size="icon"
                aria-label="Send message"
                disabled={isSending || isLoading || !draft.trim()}
              >
                {isSending ? <LoaderCircle className="animate-spin" /> : <Send />}
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Enter to send · Shift+Enter for a new line
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
