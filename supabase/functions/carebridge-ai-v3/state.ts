import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isIsoDate, isUuid } from "../carebridge-ai-v2/shared.ts";
import { AGENTS, type AgentName, type ConversationState, type KnownAppointment } from "./types.ts";

export const STATE_TTL_HOURS = 24;

const MAX_TEXT = 120;
const MAX_PENDING_INTENTS = 3;
export const MAX_KNOWN_APPOINTMENTS = 5;
const TEXT_KEYS = ["specialization", "doctor_name", "patient_name"] as const;
const NEW_PATIENT_CLEARS = [
  "doctor_id",
  "doctor_name",
  "date",
  "patient_name",
  "appointments",
] as const;

const isAgent = (value: unknown): value is AgentName =>
  typeof value === "string" && AGENTS.includes(value as AgentName);

const cleanText = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, MAX_TEXT).trim() : "";

function sanitizeAppointments(raw: unknown): KnownAppointment[] {
  if (!Array.isArray(raw)) return [];
  const list: KnownAppointment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (!isUuid(entry.appointment_id) || !isIsoDate(entry.date)) continue;
    list.push({
      appointment_id: entry.appointment_id,
      date: entry.date,
      time_slot: cleanText(entry.time_slot),
      doctor_name: cleanText(entry.doctor_name),
    });
    if (list.length === MAX_KNOWN_APPOINTMENTS) break;
  }
  return list;
}

export function emptyState(): ConversationState {
  return {};
}

export function sanitizeState(raw: unknown): ConversationState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyState();
  const input = raw as Record<string, unknown>;
  const state: ConversationState = {};

  for (const key of TEXT_KEYS) {
    const value = cleanText(input[key]);
    if (value) state[key] = value;
  }
  if (isUuid(input.doctor_id)) state.doctor_id = input.doctor_id;
  if (isUuid(input.patient_id)) state.patient_id = input.patient_id;
  if (isIsoDate(input.date)) state.date = input.date;
  if (isAgent(input.last_agent)) state.last_agent = input.last_agent;
  if (Array.isArray(input.pending_intents)) {
    const intents = [...new Set(input.pending_intents.filter(isAgent))].slice(
      0,
      MAX_PENDING_INTENTS,
    );
    if (intents.length) state.pending_intents = intents;
  }
  const appointments = sanitizeAppointments(input.appointments);
  if (appointments.length) state.appointments = appointments;
  return state;
}

export function mergeState(
  previous: ConversationState,
  patch: { [K in keyof ConversationState]?: ConversationState[K] | null },
): ConversationState {
  const merged: Record<string, unknown> = { ...previous };
  if (previous.patient_id && isUuid(patch.patient_id) && patch.patient_id !== previous.patient_id) {
    for (const key of NEW_PATIENT_CLEARS) delete merged[key];
  }
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else if (value !== undefined) merged[key] = value;
  }
  return sanitizeState(merged);
}

export async function loadState(
  db: SupabaseClient,
  conversationId: string | null,
  now: Date = new Date(),
): Promise<ConversationState> {
  if (!conversationId) return emptyState();
  try {
    const { data, error } = await db
      .from("ai_conversation_state")
      .select("state, updated_at")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (error) {
      console.warn(`ai_conversation_state load failed: ${error.message}`);
      return emptyState();
    }
    if (!data) return emptyState();
    const updatedAt = Date.parse(data.updated_at);
    if (!Number.isFinite(updatedAt)) return emptyState();
    if (now.getTime() - updatedAt > STATE_TTL_HOURS * 3_600_000) return emptyState();
    return sanitizeState(data.state);
  } catch (error) {
    console.warn(`ai_conversation_state load failed: ${(error as Error).message}`);
    return emptyState();
  }
}

export async function saveState(
  db: SupabaseClient,
  conversationId: string,
  state: ConversationState,
): Promise<boolean> {
  try {
    const { error } = await db
      .from("ai_conversation_state")
      .upsert(
        { conversation_id: conversationId, state: sanitizeState(state) },
        { onConflict: "conversation_id" },
      );
    if (error) {
      console.warn(`ai_conversation_state save failed: ${error.message}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`ai_conversation_state save failed: ${(error as Error).message}`);
    return false;
  }
}

export function describeState(state: ConversationState): string {
  const parts = [
    state.specialization && `specialization ${state.specialization}`,
    state.doctor_name && `doctor ${state.doctor_name}`,
    state.patient_name && `patient ${state.patient_name}`,
    state.date && `date ${state.date}`,
    state.pending_intents?.length && `pending ${state.pending_intents.join(", ")}`,
  ].filter(Boolean);
  return parts.length ? `Known context: ${parts.join("; ")}.` : "";
}
