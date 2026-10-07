// @vitest-environment node
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { toolsForRole } from "../../supabase/functions/carebridge-ai-v2/tools.ts";
import { agentsForRole, toolsForAgent } from "../../supabase/functions/carebridge-ai-v3/agents.ts";
import {
  detectEmergency,
  emergencyReply,
} from "../../supabase/functions/carebridge-ai-v3/emergency.ts";
import {
  findOkf,
  loadOkf,
  OkfParseError,
  parseOkf,
} from "../../supabase/functions/carebridge-ai-v3/okf.ts";
import { OKF_SOURCES } from "../../supabase/functions/carebridge-ai-v3/knowledge.gen.ts";
import { learnFromArgs } from "../../supabase/functions/carebridge-ai-v3/run-agent.ts";
import { keywordRoute } from "../../supabase/functions/carebridge-ai-v3/supervisor.ts";
import { createGetPolicy } from "../../supabase/functions/carebridge-ai-v3/tools-policy.ts";
import { edgeClinic } from "../helpers/edge";

const doc = (id: string, aliases: string, body = "Body text.") =>
  [
    "---",
    `id: ${id}`,
    "type: policy",
    `title: ${id} title`,
    "description: Test document.",
    "owner: Front desk",
    "tags: [test]",
    `aliases: [${aliases}]`,
    "timestamp: 2026-10-07",
    "---",
    "",
    body,
  ].join("\n");

const DOCS = loadOkf({
  "cancellation-policy.md": doc("cancellation-policy", "cancel appointment, cancellation fee"),
  "consultation-fees.md": doc("consultation-fees", "consultation fee, how much"),
  "emergency-guidance.md": doc(
    "emergency-guidance",
    "emergency",
    "# Emergencies\n\nCall 999 now.\n\nMore detail.",
  ),
});

describe("OKF parsing", () => {
  it("parses frontmatter and body", () => {
    const parsed = parseOkf(doc("opening-hours", "Opening Hours, when are you open"));
    expect(parsed).toMatchObject({
      id: "opening-hours",
      type: "policy",
      tags: ["test"],
      aliases: ["opening hours", "when are you open"],
      body: "Body text.",
    });
  });

  it("accepts Windows line endings", () => {
    expect(parseOkf(doc("privacy", "privacy").replace(/\n/g, "\r\n")).id).toBe("privacy");
  });

  it("rejects missing keys, bad ids, bad types, and empty bodies", () => {
    expect(() => parseOkf("no frontmatter")).toThrow(OkfParseError);
    expect(() => parseOkf(doc("x", "a").replace("owner: Front desk\n", ""))).toThrow(/owner/);
    expect(() => parseOkf(doc("Bad_Id", "a"))).toThrow(/Invalid id/);
    expect(() => parseOkf(doc("x", "a").replace("type: policy", "type: rumour"))).toThrow(
      /Invalid type/,
    );
    expect(() => parseOkf(doc("x", "a", ""))).toThrow(/Empty body/);
    expect(() => parseOkf(doc("x", "a").replace("tags: [test]", "tags: test"))).toThrow(
      /inline list/,
    );
  });

  it("drops owner review notes from the body", () => {
    expect(parseOkf(doc("x", "a", "Keep this.\n\n> REVIEW: confirm the fee.")).body).toBe(
      "Keep this.",
    );
  });

  it("rejects a file name that does not match the id and duplicate aliases", () => {
    expect(() => loadOkf({ "other.md": doc("privacy", "a") })).toThrow(/does not match/);
    expect(() =>
      loadOkf({ "a.md": doc("a", "same alias"), "b.md": doc("b", "same alias") }),
    ).toThrow(/Alias/);
  });

  it("finds documents by id, then by the longest alias in the question", () => {
    expect(findOkf(DOCS, "cancellation-policy")?.id).toBe("cancellation-policy");
    expect(findOkf(DOCS, "Is there a cancellation fee?")?.id).toBe("cancellation-policy");
    expect(findOkf(DOCS, "What is the consultation fee for cardiology?")?.id).toBe(
      "consultation-fees",
    );
    expect(findOkf(DOCS, "Do you sell vitamins?")).toBeNull();
  });

  it("ships a valid bundle that matches knowledge/*.md", () => {
    expect(() =>
      execFileSync("node", ["scripts/build-okf.mjs", "--check"], { stdio: "pipe" }),
    ).not.toThrow();
    const bundled = loadOkf();
    expect(bundled.length).toBeGreaterThanOrEqual(10);
    expect(bundled.map((item) => item.id)).toContain("emergency-guidance");
    expect(Object.values(OKF_SOURCES).filter((source) => source.includes("> REVIEW:"))).toEqual([]);
    expect(emergencyReply(bundled)).toMatch(/^If you have chest pain.*call 999 immediately/);
  });
});

describe("get_policy tool", () => {
  const tool = createGetPolicy(DOCS);
  const ctx = edgeClinic().ctx("patient");

  it("returns the policy text with a citation", async () => {
    await expect(tool.run({ query: "how do I cancel appointment" }, ctx)).resolves.toMatchObject({
      ok: true,
      found: true,
      id: "cancellation-policy",
      citation: "[OKF:cancellation-policy]",
      text: "Body text.",
    });
  });

  it("points to search_knowledge when nothing matches", async () => {
    await expect(tool.run({ query: "parking" }, ctx)).resolves.toMatchObject({
      ok: true,
      found: false,
    });
  });
});

describe("emergency gate", () => {
  it.each([
    "I have chest pain and my left arm hurts",
    "my father can't breathe",
    "there is heavy bleeding from the cut",
    "I think she is having a stroke, her face is drooping",
    "I want to kill myself",
    "he passed out and is not responding",
  ])("flags %s", (text) => {
    expect(detectEmergency(text).length).toBeGreaterThan(0);
  });

  it.each([
    "I want to book a cardiology appointment",
    "Please end my subscription to the newsletter",
    "What does a chest x-ray cost?",
  ])("does not flag %s", (text) => {
    expect(detectEmergency(text)).toEqual([]);
  });

  it("uses the first paragraph of the OKF emergency document", () => {
    expect(emergencyReply(DOCS)).toBe("Call 999 now.");
    expect(emergencyReply([])).toContain("call 999");
  });
});

describe("agents", () => {
  it("gives each role only the specialists it can use", () => {
    expect(agentsForRole("patient", toolsForRole("patient"))).toEqual([
      "triage",
      "scheduling",
      "billing",
      "records",
    ]);
    expect(agentsForRole("doctor", toolsForRole("doctor"))).toEqual([
      "triage",
      "scheduling",
      "records",
    ]);
    expect(agentsForRole("receptionist", toolsForRole("receptionist"))).toEqual([
      "triage",
      "scheduling",
      "billing",
      "records",
    ]);
  });

  it("limits each specialist to its own tools within the role", () => {
    const names = (agent: Parameters<typeof toolsForAgent>[0], role: "patient" | "receptionist") =>
      toolsForAgent(agent, toolsForRole(role)).map((tool) => tool.name);
    expect(names("billing", "patient")).toEqual(["get_my_bills", "search_knowledge"]);
    expect(names("scheduling", "patient")).toContain("propose_booking");
    expect(names("scheduling", "patient")).not.toContain("propose_confirm_appointment");
    expect(names("triage", "receptionist")).not.toContain("propose_create_bill");
  });

  it("learns doctor, date, specialization, and patient from tool arguments", () => {
    expect(
      learnFromArgs({
        doctor_id: "d",
        appointment_date: "2026-10-09",
        specialization: "Cardiology",
        reason: "x",
      }),
    ).toEqual({ doctor_id: "d", date: "2026-10-09", specialization: "Cardiology" });
  });
});

describe("keyword router", () => {
  const all = ["triage", "scheduling", "billing", "records"] as const;

  it("routes by the first matching area and queues the rest as handoffs", () => {
    expect(
      keywordRoute("Book cardiology on Monday and show my bill", [...all], DOCS),
    ).toMatchObject({
      agent: "scheduling",
      handoffs: ["billing"],
      source: "keywords",
    });
  });

  it("sends known policy questions to OKF", () => {
    expect(keywordRoute("Is there a cancellation fee?", [...all], DOCS)).toMatchObject({
      agent: "scheduling",
      knowledge: "okf",
      okf_id: "cancellation-policy",
    });
  });

  it("defaults to triage and ignores agents the role cannot use", () => {
    expect(keywordRoute("hello there", [...all], DOCS).agent).toBe("triage");
    expect(keywordRoute("show my bill", ["triage", "scheduling", "records"], DOCS).agent).toBe(
      "triage",
    );
  });
});
