# CareBridge Implementation Plan

**Last reviewed:** 2026-09-18  
**Purpose:** canonical implementation status for the academic clinic workflow. This document reflects the checked-out source and the supplied Supabase context. It supersedes stale descriptions of the provider as an in-memory mock store in `BACKEND_GUIDE.md`.

## Scope and non-negotiable constraints

CareBridge has three roles: patient, doctor, and receptionist. The required production-like workflow is:

```text
Receptionist manages doctors
  -> Patient requests an available appointment
  -> Receptionist confirms or reschedules it
  -> Doctor completes the consultation and prescription
  -> Patient views the prescription
  -> Receptionist creates and pays the bill
```

Supabase is the source of truth. Browser code must use only the publishable key and authenticated user session. Do not expose a service-role key, weaken RLS, invent clinic records, or reintroduce mock-data fallback. Preserve the existing `ClinicProvider` contract and adapter/provider boundary.

## Current architecture

- React + TypeScript + TanStack Start/Router + Tailwind.
- `src/lib/auth/store.ts` owns Supabase session restoration, password login/signup, and profile-role lookup.
- `src/lib/clinic/store.tsx` is the single `ClinicProvider`; it loads Supabase `profiles`, `doctors`, `appointments`, `prescriptions`, and `bills`, then exposes mapped view models and asynchronous mutations.
- `src/lib/clinic/adapters.ts` maps snake_case database rows to the existing UI types.
- `src/lib/clinic/data.ts` still contains historic seed/reference data and date/format helpers, but the provider does not import seed collections.
- The database schema and RLS policies are out of scope for casual frontend changes.

## Status

### COMPLETED

- [x] Real Supabase email/password authentication, session restoration, sign-out, and profile role lookup.
- [x] Signup sends a full-name metadata value and relies on the database trigger to create a patient profile.
- [x] Authenticated routes block unauthenticated users and show a clear profile-initialization failure state.
- [x] `ClinicProvider` has been migrated from seeded collections to Supabase-backed loading; it exposes loading/error/retry state and does not silently revert to seed data.
- [x] Adapter layer maps profiles, doctors, appointments, prescriptions, bills, medication JSON, and status casing into the existing UI contract.
- [x] Authenticated patient identity comes from `auth.uid()` / the loaded profile, and doctor identity is resolved by `doctors.user_id`.
- [x] Implemented asynchronous provider mutations: book, confirm/cancel, reschedule, complete consultation, edit doctor details/availability, create a bill, and record payment. The affected screens catch and show mutation failures.
- [x] The doctor query asks for its related profile (`profiles!doctors_user_id_fkey`) so a doctor display name does not depend on the standalone profiles query being permitted by RLS.
- [x] Historic mock identifiers remain limited to the obsolete seed/reference data and demo-login presentation data; provider identity logic no longer uses `p1`/`d1` or a first-doctor fallback.

### IN PROGRESS

- [ ] Runtime verification of the doctor-name join and the complete real-data workflow is outstanding. The immediate check is Sarah's Book Appointment page showing **Dr. Marcus Vance**, not “Unnamed Doctor”.
- [ ] The uncommitted Supabase migration currently spans the provider, adapters, types, and core workflow screens. It must remain internally consistent and be tested before any further feature work.

### KNOWN BUG

- [ ] The previously observed patient doctor-name bug occurred because a standalone `profiles` query did not expose Marcus under Sarah's RLS scope. Source code now includes a relationship join, but no runtime result has yet verified that the deployed foreign-key relation name and RLS policy return `profile.full_name`.

### BLOCKED

- [ ] Receptionist “Add Doctor” cannot safely create a brand-new authenticated doctor. The UI correctly rejects a doctor without an existing auth/profile row. Completing this requirement needs an explicitly designed server-side endpoint or Supabase Edge Function using privileged credentials only on the server, with receptionist authorization and validation. It must not be implemented in browser code.
- [ ] Atomic workflow operations are not guaranteed by the current browser-side multi-write implementation. In particular, completing a consultation writes a prescription before updating its appointment, and billing calculates the total in the browser. A secure server-side RPC/Edge Function (or a reviewed database function) is needed for transactional enforcement if the assignment requires robust concurrency and tamper resistance.

### NOT STARTED

- [ ] Patient profile editing for contact details, medical history, and emergency contact using the existing self-update RLS policy.
- [ ] Formal automated integration coverage for all three authenticated roles and refresh persistence.
- [ ] Validation of receptionist and doctor data visibility against actual RLS policy behavior, including patient directory/records/report data.
- [ ] Data-level guards for allowed appointment status transitions, duplicate invoices, duplicate prescriptions, and slot conflicts under concurrent requests.
- [ ] Documentation refresh for `BACKEND_GUIDE.md` so it accurately describes the completed Supabase migration rather than the old mock-provider architecture.

### DEFERRED

- [ ] Google OAuth configuration.
- [ ] Broader production hardening such as auditing, richer availability/calendar modeling, pagination, and server-side reporting.
- [ ] UI redesign or unrelated refactoring.

## Remaining feature acceptance criteria

### 1. Runtime end-to-end workflow

- Sarah can sign in, see **Dr. Marcus Vance** with the correct specialty on Book Appointment, and create a requested slot.
- After a browser refresh, Sarah sees that requested appointment.
- Clara can sign in, see the request, confirm or reschedule it, and the confirmed state survives refresh.
- Marcus can sign in, see the confirmed appointment assigned through `doctors.user_id`, complete it with diagnosis, notes, and at least one medicine, and the appointment becomes completed after refresh.
- Sarah can see the persisted prescription after refresh.
- Clara can create one unpaid bill for the completed appointment, mark it paid, and see the persisted paid state after refresh.
- No test step relies solely on in-memory React state; every material mutation is verified after a refresh.

### 2. Doctor name under patient RLS

- The doctors relationship query succeeds for Sarah without requiring a broad profiles policy.
- The rendered doctor card uses the related profile's `full_name` and displays “Dr. Marcus Vance”.
- A failed relationship query gives a clear data-load error; it must not hide the issue by using a seed doctor or an arbitrary fallback.

### 3. Patient profile editing

- A patient can edit all supported profile fields: phone, gender, date of birth, blood type, allergies, conditions, address, and emergency-contact name/relation/phone.
- Save updates only the authenticated patient's row and reports Supabase failures.
- Refresh displays the persisted values.
- Other users cannot update the profile through the client under RLS.

### 4. Secure receptionist doctor creation

- The receptionist can create a doctor user/profile/doctor row through a reviewed server-side workflow.
- Privileged credentials never appear in browser bundles, environment variables exposed to Vite, logs, or source control.
- The operation validates receptionist authorization, input, duplicate email handling, and rolls back or cleanly reports partial failures.
- The new doctor can authenticate, resolves to `doctors.user_id`, and appears to patients according to existing RLS.

### 5. Mutation integrity and authorization

- Roles are enforced by RLS and/or a reviewed server-side operation, not only by route/UI conditions.
- Slot creation/rescheduling cannot double-book an active request or confirmed appointment under concurrent requests.
- Completion creates exactly one prescription and changes only the assigned confirmed appointment; the operation is atomic.
- Billing allows one bill per completed appointment, calculates the stored amount server-side, and payment is idempotent.
- All errors are surfaced to the screen and persisted state remains coherent after refresh.

### 6. Reporting and role-scoped data

- Reception reports compute from real records visible under RLS and show valid empty states when no records exist.
- Reception patient directory and doctor records show only information allowed by the final policy.
- Empty dashboards are treated as valid when no real records exist; no mock records are fabricated.

## Recommended implementation order

1. Run the runtime doctor-name check, then execute the full three-role workflow with refreshes and record any RLS failures precisely.
2. Fix only verified runtime defects in the existing provider/adapters/screens.
3. Add patient profile editing using the existing self-update policy.
4. Design and review a secure server-side doctor-creation and transactional mutation approach before implementing either.
5. Add automated coverage and update the stale backend guide once the runtime behavior is established.

## Architectural risks to watch

- `BACKEND_GUIDE.md` still says the provider is mock/in-memory and contains obsolete API proposals; it is useful background, not current status.
- The `profiles!doctors_user_id_fkey` relationship label assumes the actual database foreign-key constraint has that name. Runtime verification is essential.
- Current browser-side sequences can leave partial data if a later write fails; frontend checks are not a transaction or authorization boundary.
- UI role checks use synchronized client state for presentation. RLS/server authorization must remain the security boundary.
- Broad list queries depend on the actual RLS policy scope. A screen that is empty may be correctly reflecting permission limits, so visibility must be validated using real accounts instead of seed expectations.
