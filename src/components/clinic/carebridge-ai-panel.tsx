import * as React from "react";
import { History, ListPlus, LoaderCircle, MessageSquarePlus, Send, Sparkles, MoreHorizontal, Edit2, Trash2, Check, X } from "lucide-react";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/store";
import { useClinic } from "@/lib/clinic/store";
import { useTheme } from "@/lib/theme/theme-context";
import type { Role } from "@/lib/clinic/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Proposal = {
  id: string;
  action_type: string;
  summary: string;
  details: { label: string; value: string }[];
  status: string;
  expires_at: string;
};
type Message = { id: string; role: "user" | "assistant"; text: string; proposals?: Proposal[] | undefined };
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

const PROMPT_COLORS = ["3d-sage", "3d-mist", "3d-rose"] as const;

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

const AI_FUNCTION = import.meta.env["VITE_AI_FUNCTION"] || "carebridge-ai";
const USE_AI_V2 = AI_FUNCTION === "carebridge-ai-v2";

type AiV2Response = {
  text: string;
  conversation_id: string;
  user_message_id: string;
  message_id: string;
  proposals?: Proposal[];
};

type AiV2ActionResponse = {
  text: string;
  user_text: string;
  conversation_id: string | null;
  user_message_id: string | null;
  message_id: string | null;
  action: { id: string; status: string };
};

function proposalsFrom(metadata: unknown): Proposal[] | undefined {
  const proposals = (metadata as { proposals?: unknown } | null)?.proposals;
  return Array.isArray(proposals) && proposals.length > 0 ? (proposals as Proposal[]) : undefined;
}

const PROPOSAL_STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for your confirmation",
  executing: "Working…",
  confirmed: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
  expired: "Expired",
};

async function invokeErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown })?.context;
  if (!(context instanceof Response)) return null;
  try {
    const body: unknown = await context.clone().json();
    const message = (body as { error?: unknown })?.error;
    return typeof message === "string" ? message : null;
  } catch {
    return null;
  }
}

const titleFor = (message: string) =>
  message.trim().replace(/\s+/g, " ").slice(0, 60) || "New conversation";

function AssistantMessage({ text }: { text: string }) {
  const { theme } = useTheme();
  
  return (
    <ReactMarkdown
      components={{
        h1: ({ children }) => (
          <h3 className={cn(
            "mb-2 text-base font-semibold leading-6",
            theme === "calm" ? "text-[#172a25]" : "text-[#1a1a2e]"
          )}>
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h4 className={cn(
            "mb-2 font-semibold leading-6",
            theme === "calm" ? "text-[#172a25]" : "text-[#1a1a2e]"
          )}>
            {children}
          </h4>
        ),
        h3: ({ children }) => (
          <h5 className={cn(
            "mb-2 font-medium leading-6",
            theme === "calm" ? "text-[#172a25]" : "text-[#1a1a2e]"
          )}>
            {children}
          </h5>
        ),
        p: ({ children }) => (
          <p className={cn(
            "mb-3 last:mb-0",
            theme === "calm" ? "text-[#5f6b66]" : "text-[#666666]"
          )}>
            {children}
          </p>
        ),
        ol: ({ children }) => (
          <ol className={cn(
            "mb-3 list-decimal space-y-1 pl-5 last:mb-0",
            theme === "calm" ? "text-[#5f6b66]" : "text-[#666666]"
          )}>
            {children}
          </ol>
        ),
        ul: ({ children }) => (
          <ul className={cn(
            "mb-3 list-disc space-y-1 pl-5 last:mb-0",
            theme === "calm" ? "text-[#5f6b66]" : "text-[#666666]"
          )}>
            {children}
          </ul>
        ),
        li: ({ children }) => <li>{children}</li>,
        strong: ({ children }) => (
          <strong className={cn(
            "font-semibold",
            theme === "calm" ? "text-[#172a25]" : "text-[#1a1a2e]"
          )}>
            {children}
          </strong>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}

function ProposalCard({
  proposal,
  status,
  busy,
  disabled,
  onResolve,
}: {
  proposal: Proposal;
  status: string;
  busy: boolean;
  disabled: boolean;
  onResolve: (action: "confirm" | "cancel") => void;
}) {
  const { theme } = useTheme();
  const shownStatus =
    status === "pending" && new Date(proposal.expires_at).getTime() < Date.now() ? "expired" : status;

  return (
    <div
      className={cn(
        "mt-3 border bg-white p-3",
        theme === "calm" ? "border-[rgba(23,42,37,0.15)]" : "border-[rgba(26,26,46,0.15)]",
      )}
    >
      <p className="font-semibold">{proposal.summary}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {proposal.details.map((detail) => (
          <React.Fragment key={detail.label}>
            <dt className="text-muted-foreground">{detail.label}</dt>
            <dd className="break-words">{detail.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="mt-3 flex items-center gap-2">
        {shownStatus === "pending" ? (
          <>
            <Button
              type="button"
              size="sm"
              className={cn(theme === "calm" ? "bg-[#123f35] text-white hover:bg-[#0b2e27]" : "")}
              variant={theme === "vibrant" ? "3d-primary" : undefined}
              disabled={busy || disabled}
              onClick={() => onResolve("confirm")}
            >
              {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || disabled}
              onClick={() => onResolve("cancel")}
            >
              <X className="size-4" /> Cancel
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {PROPOSAL_STATUS_LABEL[shownStatus] ?? shownStatus}
          </span>
        )}
      </div>
    </div>
  );
}

function ConversationItem({ 
  conversation, 
  isSelected, 
  onSelect, 
  onRename, 
  onDelete,
  isEditing,
  editTitle,
  setEditTitle,
  onSaveEdit,
  onCancelEdit
}: { 
  conversation: Conversation;
  isSelected: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
  isEditing: boolean;
  editTitle: string;
  setEditTitle: (title: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const { theme } = useTheme();
  
  if (isEditing) {
    return (
      <div className={cn(
        "flex items-center gap-2 rounded-[10px] px-3 py-2.5",
        theme === "calm" ? "bg-[#f1eee6]" : "bg-[#f5f0e8]"
      )}>
        <Input
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          className="h-8 flex-1 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveEdit();
            if (e.key === "Escape") onCancelEdit();
          }}
        />
        <Button size="icon" variant="ghost" onClick={onSaveEdit} className="h-6 w-6">
          <Check className="size-3" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onCancelEdit} className="h-6 w-6">
          <X className="size-3" />
        </Button>
      </div>
    );
  }
  
  return (
    <div className={cn(
      "group flex items-center gap-2 rounded-[10px] px-3 py-2.5 transition-colors",
      isSelected
        ? theme === "calm" 
          ? "bg-[#123f35] text-white" 
          : "bg-[#2d5a3d] text-white"
        : theme === "calm"
          ? "text-[#5f6b66] hover:bg-[#f1eee6] hover:text-[#172a25]"
          : "text-[#666666] hover:bg-[#f5f0e8] hover:text-[#1a1a2e]"
    )}>
      <button
        onClick={onSelect}
        className="flex-1 truncate text-left text-sm"
      >
        {conversation.title || "New conversation"}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className={cn(
              "h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
              isSelected && "opacity-100"
            )}
          >
            <MoreHorizontal className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onRename}>
            <Edit2 className="mr-2 size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onDelete} className="text-red-600">
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function CareBridgeAiPanel() {
  const { user } = useAuth();
  const { reload: reloadClinic } = useClinic();
  const { theme } = useTheme();
  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [failedMessage, setFailedMessage] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [editTitle, setEditTitle] = React.useState("");
  const [actionStatus, setActionStatus] = React.useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const role = user?.role ?? "patient";
  const firstName = user?.name?.replace(/^Dr\.\s+/i, "").split(" ")[0] || "there";

  const refreshActionStatus = React.useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    const { data } = await supabase.from("ai_pending_actions").select("id, status").in("id", ids);
    if (data)
      setActionStatus((current) => ({
        ...current,
        ...Object.fromEntries(data.map((row) => [row.id, row.status])),
      }));
  }, []);

  const loadMessages = React.useCallback(async (conversationId: string) => {
    setIsLoading(true);
    setError(null);
    const { data, error: loadError } = await supabase
      .from("ai_messages")
      .select(USE_AI_V2 ? "id, role, content, metadata" : "id, role, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    setIsLoading(false);
    if (loadError || !data) return setError("Unable to load this conversation. Please try again.");
    const rows = data as unknown as { id: string; role: string; content: string; metadata?: unknown }[];
    const loaded: Message[] = rows.map((message) => ({
      id: message.id,
      role: message.role as Message["role"],
      text: message.content,
      proposals: proposalsFrom(message.metadata),
    }));
    setMessages(loaded);
    void refreshActionStatus(loaded.flatMap(({ proposals }) => proposals?.map(({ id }) => id) ?? []));
  }, [refreshActionStatus]);

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

  const renameConversation = async (conversationId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    
    const { error: updateError } = await supabase
      .from("ai_conversations")
      .update({ title: newTitle.trim(), updated_at: new Date().toISOString() })
      .eq("id", conversationId);
      
    if (updateError) {
      toast.error("Failed to rename conversation");
      return;
    }
    
    setConversations((current) =>
      current.map((conv) =>
        conv.id === conversationId ? { ...conv, title: newTitle.trim() } : conv
      )
    );
    
    setEditingId(null);
    toast.success("Conversation renamed");
  };

  const deleteConversation = async (conversationId: string) => {
    const { error: deleteError } = await supabase
      .from("ai_conversations")
      .delete()
      .eq("id", conversationId);
      
    if (deleteError) {
      toast.error("Failed to delete conversation");
      return;
    }
    
    setConversations((current) => current.filter((conv) => conv.id !== conversationId));
    
    if (selectedId === conversationId) {
      const remaining = conversations.filter((conv) => conv.id !== conversationId);
      const next = remaining[0];
      if (next) {
        setSelectedId(next.id);
        await loadMessages(next.id);
      } else {
        setSelectedId(null);
        setMessages([]);
      }
    }
    
    toast.success("Conversation deleted");
  };

  const sendMessageV2 = async (text: string) => {
    if (!user) return;
    setDraft("");
    setError(null);
    setFailedMessage(null);
    setIsSending(true);
    const conversationId = selectedId;
    const wasEmpty = messages.length === 0;
    const pendingId = `pending-${Date.now()}`;
    setMessages((current) => [...current, { id: pendingId, role: "user", text }]);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(AI_FUNCTION, {
        body: { message: text, ...(conversationId ? { conversation_id: conversationId } : {}) },
      });
      if (invokeError) throw new Error((await invokeErrorMessage(invokeError)) ?? "");
      const reply = data as Partial<AiV2Response> | null;
      if (
        !reply ||
        typeof reply.text !== "string" ||
        typeof reply.conversation_id !== "string" ||
        typeof reply.user_message_id !== "string" ||
        typeof reply.message_id !== "string"
      )
        throw new Error("");
      const { text: replyText, conversation_id: savedConversationId } = reply;
      setMessages((current) => [
        ...current.map((message) =>
          message.id === pendingId ? { ...message, id: reply.user_message_id! } : message,
        ),
        { id: reply.message_id!, role: "assistant", text: replyText, proposals: proposalsFrom(reply) },
      ]);
      setSelectedId(savedConversationId);
      setConversations((current) => {
        const existing = current.find(({ id }) => id === savedConversationId);
        const updated: Conversation = existing
          ? { ...existing, title: wasEmpty ? titleFor(text) : existing.title }
          : { id: savedConversationId, title: titleFor(text), created_at: new Date().toISOString() };
        return [updated, ...current.filter(({ id }) => id !== savedConversationId)];
      });
    } catch (sendError) {
      setMessages((current) => current.filter(({ id }) => id !== pendingId));
      setDraft(text);
      setFailedMessage(text);
      const serverMessage = sendError instanceof Error ? sendError.message : "";
      setError(serverMessage || "Unable to send your message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const resolveProposal = async (proposal: Proposal, action: "confirm" | "cancel") => {
    if (resolvingId) return;
    setResolvingId(proposal.id);
    setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(AI_FUNCTION, {
        body: {
          action,
          pending_action_id: proposal.id,
          ...(selectedId ? { conversation_id: selectedId } : {}),
        },
      });
      if (invokeError) throw new Error((await invokeErrorMessage(invokeError)) ?? "");
      const reply = data as Partial<AiV2ActionResponse> | null;
      if (!reply || typeof reply.text !== "string" || !reply.action) throw new Error("");
      const { status } = reply.action;
      setActionStatus((current) => ({ ...current, [proposal.id]: status }));
      const stamp = Date.now();
      setMessages((current) => [
        ...current,
        { id: reply.user_message_id ?? `action-user-${stamp}`, role: "user", text: reply.user_text ?? "" },
        { id: reply.message_id ?? `action-reply-${stamp}`, role: "assistant", text: reply.text! },
      ]);
      if (status === "confirmed") {
        toast.success("Done");
        void reloadClinic();
      } else if (status === "failed") {
        toast.error("The action could not be completed");
      }
    } catch (resolveError) {
      const serverMessage = resolveError instanceof Error ? resolveError.message : "";
      toast.error(serverMessage || "Unable to update this proposal. Please try again.");
      void refreshActionStatus([proposal.id]);
    } finally {
      setResolvingId(null);
    }
  };

  const sendMessage = async (messageToSend = draft) => {
    const text = messageToSend.trim();
    if (!text || !user || isSending || isLoading) return;
    if (USE_AI_V2) return sendMessageV2(text);
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
      const { data, error: invokeError } = await supabase.functions.invoke(AI_FUNCTION, {
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

  const conversationList = (onPicked?: () => void) => (
    <>
      <Button
        size="sm"
        variant={theme === "vibrant" ? "3d-primary" : undefined}
        className={cn(
          "mb-4 w-full justify-start",
          theme === "calm" ? "bg-[#123f35] text-white hover:bg-[#0b2e27]" : ""
        )}
        onClick={() => {
          void startConversation();
          onPicked?.();
        }}
        disabled={isSending}
      >
        <MessageSquarePlus className="size-4" /> New chat
      </Button>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className={cn(
            "rounded-[10px] border border-dashed p-4 text-center text-sm",
            theme === "calm" 
              ? "border-[rgba(23,42,37,0.15)] text-[#5f6b66]" 
              : "border-[rgba(26,26,46,0.15)] text-[#666666]"
          )}>
            No conversations yet
          </div>
        ) : (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={conversation.id === selectedId}
              onSelect={() => {
                void selectConversation(conversation.id);
                onPicked?.();
              }}
              onRename={() => {
                setEditingId(conversation.id);
                setEditTitle(conversation.title || "");
              }}
              onDelete={() => void deleteConversation(conversation.id)}
              isEditing={editingId === conversation.id}
              editTitle={editTitle}
              setEditTitle={setEditTitle}
              onSaveEdit={() => void renameConversation(conversation.id, editTitle)}
              onCancelEdit={() => {
                setEditingId(null);
                setEditTitle("");
              }}
            />
          ))
        )}
      </div>
    </>
  );

  return (
    <section className={cn(
      "flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-white",
      theme === "calm" 
        ? "border-[rgba(23,42,37,0.08)]" 
        : "border-[rgba(26,26,46,0.1)]"
    )}>
      <header className={cn(
        "flex items-center justify-between border-b px-4 py-3 sm:px-5 sm:py-5",
        theme === "calm" 
          ? "border-[rgba(23,42,37,0.08)]" 
          : "border-[rgba(26,26,46,0.1)]"
      )}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "grid size-8 shrink-0 place-items-center rounded-md text-white",
              theme === "calm" ? "bg-[#123f35]" : "bg-[#2d5a3d]"
            )}>
              <Sparkles className="size-4" />
            </span>
            <h1 className="truncate font-display text-lg sm:text-xl">CareBridge AI</h1>
          </div>
          <p className={cn(
            "mt-1 text-xs sm:text-sm",
            theme === "calm" ? "text-[#5f6b66]" : "text-[#666666]"
          )}>
            {ASSISTANT_LABEL[role]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:hidden">
          <Button
            type="button"
            size="icon"
            variant={theme === "vibrant" ? "3d-primary" : undefined}
            className={cn(
              "size-9",
              theme === "calm" ? "bg-[#123f35] text-white hover:bg-[#0b2e27]" : ""
            )}
            aria-label="Show chat history"
            onClick={() => setHistoryOpen(true)}
          >
            <History />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={theme === "vibrant" ? "3d-primary" : undefined}
            className={cn(
              "size-9",
              theme === "calm" ? "bg-[#123f35] text-white hover:bg-[#0b2e27]" : ""
            )}
            aria-label="Start new chat"
            onClick={() => void startConversation()}
            disabled={isSending}
          >
            <MessageSquarePlus />
          </Button>
        </div>
      </header>

      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="left" className="flex w-[280px] flex-col bg-[#f5f0e8] p-4">
          <SheetTitle className="mb-4 font-display text-lg">Chats</SheetTitle>
          {conversationList(() => setHistoryOpen(false))}
        </SheetContent>
      </Sheet>
      
      <div className="flex min-h-0 flex-1">
        <aside className={cn(
          "hidden w-64 shrink-0 flex-col border-r p-4 md:flex",
          theme === "calm" 
            ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
            : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
        )}>
          {conversationList()}
        </aside>
        
        {/* Main Chat Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-4 sm:py-5">
            {isLoading ? (
              <div className="m-auto flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" /> Loading conversation…
              </div>
            ) : messages.length === 0 ? (
              <div className="m-auto w-full max-w-sm text-center">
                <span className={cn(
                  "mx-auto grid size-11 place-items-center rounded-full",
                  theme === "calm" 
                    ? "bg-[#dce8e1] text-[#234d43]" 
                    : "bg-[#a8e6cf] text-[#1e5e4e]"
                )}>
                  <Sparkles className="size-5" />
                </span>
                <p className={cn(
                  "font-display mt-4 text-xl",
                  theme === "calm" ? "text-[#172a25]" : "text-[#1a1a2e]"
                )}>
                  Hi {firstName}. How can I help you today?
                </p>
                <p className={cn(
                  "mt-2 text-sm leading-6",
                  theme === "calm" ? "text-[#5f6b66]" : "text-[#666666]"
                )}>
                  I can help you find your way around CareBridge.
                </p>
                {role === "patient" && (
                  <div className="mt-5 flex flex-col items-stretch gap-2 text-left">
                    {PATIENT_PROMPTS.map((prompt, index) => (
                      <Button
                        key={prompt}
                        variant={theme === "vibrant" ? PROMPT_COLORS[index % PROMPT_COLORS.length] : "outline"}
                        className={cn(
                          "h-auto justify-start whitespace-normal px-3 py-2.5 text-left text-xs leading-5",
                          theme === "calm" 
                            ? "border-[rgba(23,42,37,0.15)] text-[#172a25] hover:bg-[#f1eee6]" 
                            : ""
                        )}
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
                        ? theme === "calm"
                          ? "ml-auto bg-[#123f35] text-white"
                          : "ml-auto bg-[#2d5a3d] text-white"
                        : theme === "calm"
                          ? "border border-[rgba(23,42,37,0.08)] bg-[#f7f2e9] text-[#172a25]"
                          : "border border-[rgba(26,26,46,0.1)] bg-[#faf6f0] text-[#1a1a2e]"
                    )}
                  >
                    {message.role === "assistant" ? (
                      <AssistantMessage text={message.text} />
                    ) : (
                      message.text
                    )}
                    {message.proposals?.map((proposal) => (
                      <ProposalCard
                        key={proposal.id}
                        proposal={proposal}
                        status={actionStatus[proposal.id] ?? proposal.status}
                        busy={resolvingId === proposal.id}
                        disabled={isSending || resolvingId !== null}
                        onResolve={(action) => void resolveProposal(proposal, action)}
                      />
                    ))}
                  </div>
                ))}
                {isSending && (
                  <div className={cn(
                    "flex w-fit items-center gap-2 rounded-[12px] border px-3.5 py-3 text-sm",
                    theme === "calm" 
                      ? "border-[rgba(23,42,37,0.08)] bg-[#f7f2e9] text-[#5f6b66]" 
                      : "border-[rgba(26,26,46,0.1)] bg-[#faf6f0] text-[#666666]"
                  )}>
                    <LoaderCircle className="size-4 animate-spin" /> Thinking…
                  </div>
                )}
              </div>
            )}
            {error && (
              <p className={cn(
                "mt-4 rounded-md border px-3 py-2 text-sm",
                theme === "calm" 
                  ? "border-[#f4dddd] bg-[#f4dddd] text-[#7b3d44]" 
                  : "border-[#ffb6c1] bg-[#ffb6c1] text-[#c2185b]"
              )}>
                {error}
                {failedMessage && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="ml-3 h-7"
                    disabled={isSending}
                    onClick={() => void sendMessage(failedMessage)}
                  >
                    Retry
                  </Button>
                )}
              </p>
            )}
            <div ref={bottomRef} />
          </div>
          
          {/* Composer */}
          <form
            className={cn(
              "border-t p-2.5 sm:p-4",
              theme === "calm" 
                ? "border-[rgba(23,42,37,0.08)] bg-[#f1eee6]" 
                : "border-[rgba(26,26,46,0.1)] bg-[#f5f0e8]"
            )}
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
          >
            <div className="flex min-w-0 items-end gap-2">
              {role === "patient" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="CareBridge AI actions"
                      disabled={isSending || isLoading}
                      className={cn(
                        theme === "calm" 
                          ? "border-[rgba(23,42,37,0.15)]" 
                          : "border-[rgba(26,26,46,0.15)]"
                      )}
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
                className={cn(
                  "min-h-11 min-w-0 flex-1 max-h-32 resize-y",
                  theme === "calm" 
                    ? "border-[rgba(23,42,37,0.15)] bg-white text-[#172a25] placeholder:text-[#5f6b66] focus:border-[#123f35] focus:ring-1 focus:ring-[#123f35]" 
                    : "border-[rgba(26,26,46,0.15)] bg-white text-[#1a1a2e] placeholder:text-[#666666] focus:border-[#2d5a3d] focus:ring-1 focus:ring-[#2d5a3d]"
                )}
                disabled={isSending || isLoading}
              />
              <Button
                type="submit"
                size="icon"
                variant={theme === "vibrant" ? "3d-primary" : undefined}
                aria-label="Send message"
                disabled={isSending || isLoading || !draft.trim()}
                className={cn(
                  theme === "calm" 
                    ? "bg-[#123f35] text-white hover:bg-[#0b2e27]" 
                    : ""
                )}
              >
                {isSending ? <LoaderCircle className="animate-spin" /> : <Send />}
              </Button>
            </div>
            <p className={cn(
              "mt-2 text-xs",
              theme === "calm" ? "text-[#5f6b66]" : "text-[#666666]"
            )}>
              Enter to send · Shift+Enter for a new line
            </p>
          </form>
        </div>
      </div>
    </section>
  );
}
