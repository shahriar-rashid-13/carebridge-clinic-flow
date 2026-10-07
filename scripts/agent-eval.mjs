// Runs the labelled agent scenarios against carebridge-ai-v2 and carebridge-ai-v3.
//
// Usage: node scripts/agent-eval.mjs [--run <id>] [--only id1,id2] [--versions v2,v3]
//                                    [--delay <ms>] [--limit <n>]
//
// Signs in the E2E test users (credentials from .env.test), sends each scenario in a fresh
// conversation titled "[eval] ..." (left out of /metrics), reads the saved turn metadata, scores
// it, and appends one JSON line per scenario and version to eval/results/agent-eval-<run>.jsonl.
// Re-running with the same --run id skips finished pairs, so a run can resume after rate limits.
// Proposals are never confirmed, so clinic data does not change.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  VERSIONS,
  runFacts,
  scoreScenario,
  summarize,
  validateScenario,
} from "./agent-eval-score.mjs";

for (const file of [".env.local", ".env.test"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const args = parseArgs(process.argv.slice(2));
const runId = args.run ?? new Date().toISOString().slice(0, 10);
const versions = (args.versions ?? VERSIONS.join(",")).split(",");
const delayMs = Number(args.delay ?? 8000);
const only = args.only ? new Set(args.only.split(",")) : null;
const limit = args.limit ? Number(args.limit) : Infinity;
const MAX_ATTEMPTS = 3;
const STOP_AFTER_FAILURES = 3;

const url = requireEnv("VITE_SUPABASE_URL");
const anonKey = requireEnv("VITE_SUPABASE_PUBLISHABLE_KEY");
const credentials = {
  patient: [requireEnv("E2E_PATIENT_EMAIL"), requireEnv("E2E_PATIENT_PASSWORD")],
  doctor: [requireEnv("E2E_DOCTOR_EMAIL"), requireEnv("E2E_DOCTOR_PASSWORD")],
  receptionist: [requireEnv("E2E_RECEPTIONIST_EMAIL"), requireEnv("E2E_RECEPTIONIST_PASSWORD")],
};

const { scenarios } = JSON.parse(readFileSync("eval/agent-scenarios.json", "utf8"));
const problems = scenarios.flatMap(validateScenario);
if (problems.length) {
  console.error(`Invalid scenarios:\n${problems.join("\n")}`);
  process.exit(1);
}

mkdirSync("eval/results", { recursive: true });
const outFile = `eval/results/agent-eval-${runId}.jsonl`;
const done = new Set(readResults(outFile).map((row) => `${row.scenario_id}|${row.version}`));

const clients = {};
async function clientFor(role) {
  if (clients[role]) return clients[role];
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const [email, password] = credentials[role];
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Sign-in failed for the ${role} test user: ${error.message}`);
  clients[role] = client;
  return client;
}

async function sendTurn(client, version, conversationId, message) {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  for (let attempt = 1; ; attempt += 1) {
    const response = await fetch(`${url}/functions/v1/carebridge-ai-${version}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, conversation_id: conversationId }),
    });
    const body = await response.json().catch(() => ({}));
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) return { status: response.status, body };
    const wait = 15000 * attempt;
    console.log(`    ${response.status} ${body.error ?? ""}, retrying in ${wait / 1000} s`);
    await sleep(wait);
  }
}

async function runScenario(scenario, version) {
  const client = await clientFor(scenario.role);
  const { data: user } = await client.auth.getUser();
  const { data: conversation, error } = await client
    .from("ai_conversations")
    .insert({ user_id: user.user.id, title: `[eval] ${runId} ${scenario.id} ${version}` })
    .select("id")
    .single();
  if (error) throw new Error(`Could not create the conversation: ${error.message}`);

  const turns = [];
  for (const message of scenario.turns) {
    const { status, body } = await sendTurn(client, version, conversation.id, message);
    const turn = {
      message,
      status,
      text: body.text ?? null,
      error: body.error ?? null,
      proposals: body.proposals ?? [],
      metadata: null,
    };
    if (status === 200 && body.message_id) {
      const { data: saved } = await client
        .from("ai_messages")
        .select("metadata")
        .eq("id", body.message_id)
        .maybeSingle();
      turn.metadata = saved?.metadata ?? null;
    }
    turns.push(turn);
    if (status !== 200) break;
    await sleep(delayMs);
  }
  return { conversationId: conversation.id, turns };
}

const queue = scenarios
  .filter((scenario) => !only || only.has(scenario.id))
  .flatMap((scenario) => versions.map((version) => ({ scenario, version })))
  .filter(({ scenario, version }) => !done.has(`${scenario.id}|${version}`))
  .slice(0, limit);

console.log(`Run ${runId}: ${queue.length} scenario runs to do, ${done.size} already done.`);
let failuresInARow = 0;
for (const [index, { scenario, version }] of queue.entries()) {
  console.log(`[${index + 1}/${queue.length}] ${scenario.id} ${version}`);
  const { conversationId, turns } = await runScenario(scenario, version);
  const score = scoreScenario(scenario, version, turns);
  const row = {
    run_id: runId,
    scenario_id: scenario.id,
    category: scenario.category,
    role: scenario.role,
    version,
    conversation_id: conversationId,
    finished_at: new Date().toISOString(),
    score,
    facts: runFacts(turns),
    turns,
  };

  const infraFailure = turns.some((turn) => turn.status === 429 || turn.status >= 500);
  if (infraFailure) {
    failuresInARow += 1;
    console.log(`    not saved: ${turns.at(-1)?.status} ${turns.at(-1)?.error ?? ""}`);
    if (failuresInARow >= STOP_AFTER_FAILURES) {
      console.log("Stopping after repeated rate-limit or server errors. Re-run later to resume.");
      break;
    }
    continue;
  }
  failuresInARow = 0;
  appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  const failedChecks = score.checks.filter((check) => !check.ok);
  console.log(
    `    ${score.pass ? "PASS" : "FAIL"}${failedChecks.length ? `: ${failedChecks.map((c) => `${c.name} ${c.detail}`.trim()).join("; ")}` : ""}`,
  );
}

const summary = summarize(readResults(outFile));
for (const [version, totals] of Object.entries(summary)) {
  console.log(`${version}: ${totals.passed}/${totals.total} passed`);
  for (const [category, counts] of Object.entries(totals.categories)) {
    console.log(`  ${category}: ${counts.passed}/${counts.total}`);
  }
}

function readResults(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseArgs(list) {
  const parsed = {};
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].startsWith("--")) parsed[list[i].slice(2)] = list[i + 1];
  }
  return parsed;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Add it to .env.local or .env.test.`);
    process.exit(1);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
