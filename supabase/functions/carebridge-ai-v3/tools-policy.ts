import { textArg, type ToolDefinition } from "../carebridge-ai-v2/shared.ts";
import { findOkf, okfCitation } from "./okf.ts";
import type { OkfDoc } from "./types.ts";

export function createGetPolicy(docs: OkfDoc[]): ToolDefinition {
  return {
    name: "get_policy",
    description:
      "Read an approved CareBridge clinic policy (cancellation, refunds, opening hours, payments, fees, booking rules, waitlist, reminders, privacy, prescriptions, no-shows, accounts). Pass the policy id if known, or the question in plain words. Prefer this over search_knowledge for clinic rules.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: `A policy id (${docs.map((doc) => doc.id).join(", ")}) or the question in plain words.`,
        },
      },
      required: ["query"],
    },
    roles: ["patient", "doctor", "receptionist"],
    async run(args) {
      const query = textArg(args, "query", 300);
      const doc = findOkf(docs, query);
      if (!doc) {
        return {
          ok: true,
          found: false,
          message: "No approved policy matches. Use search_knowledge, or say you do not know.",
        };
      }
      return {
        ok: true,
        found: true,
        id: doc.id,
        title: doc.title,
        citation: okfCitation(doc),
        updated: doc.timestamp,
        text: doc.body,
      };
    },
  };
}
