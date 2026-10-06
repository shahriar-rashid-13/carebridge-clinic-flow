# Supabase advisor findings

## Before (5 Oct 2026, project pfvmpvbwdavusvwbddrd)

Security (all WARN):

| Lint | Count | Objects |
|---|---|---|
| function_search_path_mutable | 2 | guard_profile_role_change, guard_appointment_update |
| anon_security_definer_function_executable | 5 | get_user_role, handle_new_user, promote_patient_to_doctor, promote_patient_to_receptionist, rls_auto_enable |
| authenticated_security_definer_function_executable | 19 | accept/decline_waitlist_offer, ai_cancel/claim/create/finish_pending_action, complete_consultation, get_taken_slots (2 overloads), get_user_role, handle_new_user, join/leave_waitlist, patient_reschedule_appointment, promote_patient_to_doctor, promote_patient_to_receptionist, resolve_followup, rls_auto_enable, run_clinic_automations_now |
| auth_leaked_password_protection | 1 | Auth setting (dashboard only) |

Performance:

| Lint | Level | Count | Objects |
|---|---|---|---|
| auth_rls_initplan | WARN | 11 | policies on ai_conversations (4), ai_messages (2), ai_pending_actions, notifications (2), waitlist, waitlist_offers |
| multiple_permissive_policies | WARN | 7 | appointments (SELECT, UPDATE), bills, doctors, prescriptions, profiles (SELECT, UPDATE) |
| duplicate_index | WARN | 2 | bills_appointment_id_key/unique, prescriptions_appointment_id_key/unique |
| unindexed_foreign_keys | INFO | 5 | appointment_followups.resolved_by, notifications.appointment_id, waitlist_offers.appointment_id/patient_id/waitlist_id |
| unused_index | INFO | 8 | appointments/prescriptions/bills patient and doctor indexes, waitlist_lookup, rag_documents_embedding_idx, rag_documents_source_doc_id_idx |

## Changes (migration `20261005020000_advisor_fixes.sql`)

- Fixed `search_path` on the two trigger functions.
- Revoked anonymous `EXECUTE` on all five SECURITY DEFINER functions callable without signing in.
- Revoked all API `EXECUTE` on `handle_new_user` (auth.users trigger) and `rls_auto_enable` (event trigger).
- Rewrote 11 policies to use `(select auth.uid())` and `(select public.get_user_role())`, so they are evaluated once per query instead of once per row. Access rules are unchanged.
- Dropped the duplicate `bills_appointment_id_unique` and `prescriptions_appointment_id_unique` indexes; the constraint-backed `*_key` indexes remain.
- Added indexes for the five unindexed foreign keys.

## After

Security: 27 findings down to 18.

| Lint | Count | Why it stays |
|---|---|---|
| authenticated_security_definer_function_executable | 17 | These are the app's RPCs (booking, waitlist, consultation, AI pending actions, role promotion, taken slots, automations). They must be callable by signed-in users, run as SECURITY DEFINER to change rows the caller cannot write directly, and check the caller's role and ownership inside the function. `get_user_role` must stay executable because 17 RLS policies call it. |
| auth_leaked_password_protection | 1 | Dashboard setting (Authentication, then Passwords); not changeable through SQL. |

Performance: 33 findings down to 20, and no WARN-level finding is left except the one below.

| Lint | Level | Count | Why it stays |
|---|---|---|---|
| multiple_permissive_policies | WARN | 7 | One policy per role (patient, doctor, receptionist) keeps each access rule readable and testable. Merging them into one OR policy per action would change nothing for access but risks mistakes; the tables are small. |
| unused_index | INFO | 13 | Includes the five new foreign key indexes, which have not been used yet. The app has little traffic, so usage statistics are not meaningful; the indexes stay. |

## Day 2 additions (email outbox and recall segments)

Security: 18 findings to 21, all expected.

| Lint | Count | Why |
|---|---|---|
| authenticated_security_definer_function_executable | +2 | `recall_segment_members` and `recall_segment_counts` are receptionist RPCs. They raise `42501` for any other role (checked with a patient session). |
| rls_enabled_no_policy | 1 | `message_events` is written and read only by the `resend-webhook` Edge Function with the service role. No API role needs access, so it has RLS on and no policy on purpose. |

The outbox helpers `claim_outbox_batch` and `dispatcher_token_ok` are executable by `service_role` only, so they add no finding.

## Day 2 additions (recall campaigns)

Security: 21 findings to 24, all expected.

| Lint | Count | Why |
|---|---|---|
| authenticated_security_definer_function_executable | +3 | `preview_campaign`, `send_campaign` and `campaign_results` are receptionist RPCs. Each calls `require_receptionist()` first and raises `42501` for any other role. |

The internal helpers `campaign_audience`, `email_quota_left` and `require_receptionist` are revoked from `anon` and `authenticated`, so they add no finding. The new tables `campaigns`, `campaign_recipients` and `communication_opt_outs` have RLS on with receptionist-only read policies; all writes go through the RPCs or the `unsubscribe` Edge Function.

## Day 2 additions (Google Calendar sync)

Security: 24 findings, unchanged. `enqueue_calendar_job`, `on_appointment_calendar_change` and `claim_calendar_jobs` are revoked from `anon` and `authenticated` (`claim_calendar_jobs` is granted to `service_role` only). `calendar_jobs` has RLS on with a receptionist-only read policy.

## Accepted finding: leaked password protection

`auth_leaked_password_protection` stays open. Checking passwords against HaveIBeenPwned is only available on the Supabase Pro plan, and this demo project runs on the free plan with synthetic patient data only. On a paid production project this setting should be turned on.

