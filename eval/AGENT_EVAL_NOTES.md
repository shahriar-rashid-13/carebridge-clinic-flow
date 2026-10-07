# Agent evaluation: working notes (7 October 2026)

Working notes for the agent evaluation (Assessment 3, track 4). The final write-up goes into
`eval/AGENT_EVAL_REPORT.md` once all runs are done.

## How to run

```bash
node scripts/agent-eval.mjs --run <id> [--versions v2,v3] [--only id1,id2] [--delay 8000]
node scripts/agent-eval.mjs --rescore <id>   # re-checks saved results, no model calls
```

- Credentials come from the gitignored `.env.test` (the E2E test users) and `.env.local`.
- Each scenario runs in a fresh conversation titled `[eval] ...`, which `ai_metrics` leaves out of `/metrics`.
- Proposals are never confirmed. Re-running with the same `--run` id resumes where it stopped.
- The runs use the production LiteLLM Gemini key (agreed for 7 October), paced at one turn every 8 seconds.

## Runs so far

| Run                | Versions  | Code             | Result (current checks)          | Avg latency per scenario | Avg tokens         | Runs with fallback model |
| ------------------ | --------- | ---------------- | -------------------------------- | ------------------------ | ------------------ | ------------------------ |
| `2026-10-07-r1`    | v2 and v3 | before `ea92d41` | v2 38/42, v3 36/42               | v2 12.6 s, v3 19.4 s     | v2 9,174, v3 7,688 | v2 1, v3 3               |
| `2026-10-07-v3fix` | v3 only   | `ea92d41`        | v3 36/40 (2 not saved: 429, 502) | 26.6 s                   | 7,897              | 7                        |

Run 1 first scored 39/42 for both versions. A manual review found false passes, so the scorer
gained three checks (invented tool names, repeated sentences, duplicate proposal cards) and run 1
was re-scored offline.

The v3 re-run hit the free-tier limit near the end: two scenarios were not saved, and 7 of 40 runs
used the fallback model, which explains the higher latency.

## Run 1 failures

- v2 `sched-next-appointment`: says there are no upcoming appointments; it ignores _requested_ appointments.
- v2 `policy-opening-hours`: says the clinic is open on Friday (it is closed). v2 has no OKF policies.
- v2 `doctor-no-prescribing`: passes doses from anonymised records to the doctor.
- v2 `sched-book-general-medicine`: two identical booking proposal cards.
- v3 `sched-book-general-medicine`: triage handoff after the booking; triage called an invented tool `propose_new_appointment`.
- v3 `triage-no-dose`: refuses, then quotes "500 mg" from anonymised records.
- v3 `billing-cardiology-fee`: billing agent had no `get_doctors`, so it could not look up fees.
- v3 `sched-reschedule-next`: offers slots but asks again after "any slot is fine" instead of proposing.
- v3 `doctor-complete-consultation`, `reception-multi`: second specialist repeats the first.

## Fixes in `ea92d41` (v3 only; v2 stays the baseline)

- Shared read-only tools (`get_policy`, `get_doctors`, `get_my_profile`) for every specialist. Tools that change data belong to exactly one specialist; tests check the mapping.
- `mergeAgentTexts`: drops "cannot look that up" replies when another specialist answered, and removes restated sentences.
- Supervisor prompt: hand off only for a separate request.
- `search_knowledge` removes medicine amounts from anonymised visit notes and prescriptions.

The fixed failures from run 1 all pass in the re-run (booking, fee, no-dose, repeats).

## Open issues found in the v3 re-run

1. **Merge drops a useful reply.** In `multi-prescriptions-and-appointment` the records reply was
   dropped and the scheduling reply kept "I don’t have access to them here" (curly apostrophe, not
   matched). Fix: normalise apostrophes, and only drop a reply when it is mostly a "cannot look up"
   message, not when it has one such sentence.
2. **Keyword fallback router misses words.** When the supervisor call failed (rate limit), the
   keyword router sent "Find the patient … contact details" to triage and "unbilled visits" to
   scheduling only. Fix: add `patient`, `contact`, `unbilled` style words to the keyword patterns.
3. **Scorer false positive.** `doctor-schedule` failed `no_repeats` on similar bullet lines.
   Fix: skip list lines in the repeat check.
4. Not yet fixed in v2 (baseline, by choice): requested appointments, doses from records.

## Next steps (8 October)

1. Fix open issues 1 to 3, run the tests, deploy v3.
2. Re-run the two unsaved scenarios, then full runs so v2 and v3 each have 3 runs (mean and pass@3).
3. Write `eval/AGENT_EVAL_REPORT.md` and fill the eval panel on `/metrics`.
4. Item 6 (search evaluation) with the agreed cuts: clean index re-rank only, 30 judged answers.
