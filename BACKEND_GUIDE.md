# CareBridge Backend Guide

This document explains the CareBridge frontend well enough for a beginner to design and implement a backend without changing the current clinic workflow.

CareBridge is currently a frontend-only clinic prototype. It uses React, TypeScript, Vite, TanStack Router, React Query dependencies, and a local `ClinicProvider` with in-memory mock data. There is no backend, database, persistent authentication, or server-side session yet.

The goal of a future backend is to replace the local data service while preserving the existing screens, roles, fields, statuses, and workflow.

## 1. Start Here

### Run the frontend

From the repository root:

```bash
npm install
npm run dev
```

Useful scripts:

```bash
npm run build   # production build
npm run lint    # ESLint
npm run format  # Prettier
```

The app is configured through [vite.config.ts](vite.config.ts) and uses the `@` path alias for `src` imports.

### Important files

| File | Responsibility |
| --- | --- |
| [src/lib/clinic/types.ts](src/lib/clinic/types.ts) | Domain types and status unions |
| [src/lib/clinic/data.ts](src/lib/clinic/data.ts) | Seed doctors, patients, appointments, prescriptions, and invoices |
| [src/lib/clinic/store.tsx](src/lib/clinic/store.tsx) | Current local data service and all clinic mutations |
| [src/lib/auth/store.ts](src/lib/auth/store.ts) | In-memory simulated authentication |
| [src/routes/__root.tsx](src/routes/__root.tsx) | Root auth guard, providers, and app shell selection |
| [src/routes/_authenticated.tsx](src/routes/_authenticated.tsx) | Authenticated layout and role synchronization |
| [src/components/clinic/app-shell.tsx](src/components/clinic/app-shell.tsx) | Role switcher, navigation, and sign-out |
| [src/routes/_authenticated](src/routes/_authenticated) | Protected dashboard and feature pages |
| [src/routeTree.gen.ts](src/routeTree.gen.ts) | Generated route tree; do not hand-edit |

## 2. Frontend Architecture

The current request path is:

```text
Browser
  -> TanStack Router route
  -> Root auth guard
  -> QueryClientProvider
  -> ClinicProvider
  -> AppShell for protected routes
  -> Page component
  -> useClinic() mutation
  -> local React state update
```

`ClinicProvider` is mounted once in [src/routes/__root.tsx](src/routes/__root.tsx). Do not introduce a second clinic provider when adding a backend. The backend adapter should hydrate or update this provider, or the provider should call an API service while retaining its public interface.

The provider currently keeps these collections in memory:

- `doctors`
- `patients`
- `appointments`
- `prescriptions`
- `invoices`

It also keeps UI context:

- active display `role`
- selected `currentDoctorId`
- fixed demo patient `currentPatientId` (`p1`)

The role is presentation/demo context today. A production backend must never trust a role selected in the browser for authorization.

## 3. Domain Model

The source of truth for frontend shapes is [src/lib/clinic/types.ts](src/lib/clinic/types.ts).

### Roles

```text
patient | doctor | receptionist
```

### Doctor

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Public identifier |
| `name` | string | Display name |
| `specialty` | string | Medical specialty |
| `fee` | number | Consultation fee in dollars in the prototype |
| `days` | string[] | Working weekdays such as `Mon`, `Tue` |
| `slots` | string[] | Display slots such as `09:45 AM` |
| `active` | boolean | Whether patients can book this doctor |
| `bio` | string | Profile description |
| `room` | string | Clinic room or suite |

For a real backend, separate the doctor profile from recurring availability when calendar requirements grow. Initially, the API can generate the current `days` and `slots` response shape.

### Patient

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Public identifier |
| `name` | string | Full name |
| `email` | string | Contact/login email depending on product decision |
| `phone` | string | Contact number |
| `dob` | ISO date string | Date of birth |
| `gender` | string | Current free-text value |
| `bloodType` | string | Blood type |
| `allergies` | string[] | Known allergies |
| `conditions` | string[] | Known conditions |
| `address` | string | Address |
| `emergency` | object | `{ name, relation, phone }` |

Medical data is sensitive. A production backend needs audit logging, least-privilege access, encryption at rest, secure transport, and a retention policy before real patient data is used.

### Appointment

```json
{
  "id": "a1",
  "patientId": "p1",
  "doctorId": "d1",
  "date": "2026-09-17",
  "slot": "09:45 AM",
  "reason": "Blood pressure follow-up",
  "notes": "Readings have been higher in the mornings.",
  "status": "Confirmed",
  "createdAt": "2026-09-12"
}
```

The frontend currently uses `YYYY-MM-DD` date strings and display time strings. A backend should store canonical timestamps plus timezone information, then return compatible display fields through an adapter.

### Appointment statuses

```text
Requested -> Confirmed -> Completed
Requested -> Cancelled
Confirmed -> Cancelled
Requested -> Confirmed       # reschedule also sets Confirmed
```

The type also includes `Cancelled`. The backend should reject invalid transitions and record who performed each transition and when.

### Prescription

```json
{
  "id": "rx1",
  "appointmentId": "a7",
  "patientId": "p1",
  "doctorId": "d1",
  "date": "2026-09-03",
  "diagnosis": "Exertional hypertension, no ischemic findings",
  "medications": [
    {
      "name": "Amlodipine",
      "dosage": "5 mg",
      "frequency": "Once daily, morning",
      "duration": "30 days"
    }
  ],
  "notes": "Log blood pressure twice daily."
}
```

A prescription belongs to one appointment, patient, and doctor. It is created when the doctor completes a consultation.

### Invoice

```json
{
  "id": "INV-1041",
  "appointmentId": "a7",
  "patientId": "p1",
  "doctorId": "d1",
  "items": [
    { "label": "Cardiology consultation", "amount": 180 },
    { "label": "ECG", "amount": 60 }
  ],
  "total": 240,
  "status": "Unpaid",
  "issuedAt": "2026-09-17"
}
```

Invoice status is `Unpaid` or `Paid`. The server must calculate `total` from invoice items. Never trust a browser-supplied total.

## 4. Seed Data

The current records are in [src/lib/clinic/data.ts](src/lib/clinic/data.ts).

The seed includes:

- 4 doctors (`d1` through `d4`), with specialties, fees, rooms, active flags, workdays, and slots
- 5 patients (`p1` through `p5`), including medical history and emergency contacts
- 12 appointments with mixed statuses and dates relative to the current day
- 4 prescriptions with nested medication arrays
- invoices with line items and payment status

The current demo identities are in [src/lib/auth/store.ts](src/lib/auth/store.ts):

| Name | Email | Role | ID |
| --- | --- | --- | --- |
| Sarah Jenkins | `sarah@example.com` | `patient` | `p1` |
| Dr. Marcus Vance | `marcus@example.com` | `doctor` | `d1` |
| Clara Morgan | `clara@example.com` | `receptionist` | `r1` |

When creating a backend seed, preserve these IDs initially. Existing UI records refer to them.

## 5. Authentication Contract

The auth store is deliberately an in-memory simulated session. It has no localStorage, sessionStorage, Zustand, Supabase, or real OAuth.

Its public API is:

```ts
interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, role: Role) => Promise<void>;
  logout: () => void;
  signup: (email: string, name: string, role: Role) => Promise<void>;
  setUserRole: (role: Role) => void;
}
```

The login form is permissive for the prototype: any password is accepted, and an email/role combination resolves to a demo user or a generated demo user. A real backend must replace this with validated credentials, password hashing, rate limiting, and a secure session design.

The current route behavior is:

1. [src/routes/__root.tsx](src/routes/__root.tsx) allows `/`, `/login`, and `/signup` without authentication.
2. Other paths check `useAuth.getState().isAuthenticated`.
3. Unauthenticated users redirect to `/login` with the requested URL.
4. [src/routes/_authenticated.tsx](src/routes/_authenticated.tsx) performs a second authenticated-layout check.
5. Sign out clears the in-memory user and navigates to `/`.

When adding a backend, preserve the route behavior but make the server authoritative. A client-side role switcher may remain as a demo convenience, but it must not grant access to another user’s data.

## 6. Clinic State and Mutation Contract

[ClinicProvider](src/lib/clinic/store.tsx) is the current local data service. Its public operations are:

| Current method | Meaning |
| --- | --- |
| `bookAppointment(input)` | Create a new appointment with status `Requested` |
| `setAppointmentStatus(id, status)` | Change an appointment status |
| `rescheduleAppointment(id, date, slot)` | Change date/slot and set status `Confirmed` |
| `completeConsultation(input)` | Create prescription and set appointment `Completed` |
| `upsertDoctor(doc)` | Create or update a doctor |
| `toggleDoctorActive(id)` | Enable or disable booking for a doctor |
| `createInvoice(appointmentId, items)` | Create an `Unpaid` invoice for a completed visit |
| `markInvoicePaid(id, method)` | Set invoice `Paid` and record payment method/date |
| `isSlotTaken(doctorId, date, slot)` | Check active appointment collision |

The current appointment creation input is:

```ts
{
  patientId: string;
  doctorId: string;
  date: string;
  slot: string;
  reason: string;
  notes: string;
}
```

The current consultation input is:

```ts
{
  appointmentId: string;
  diagnosis: string;
  medications: Medication[];
  notes: string;
}
```

The current invoice input is an appointment ID plus:

```ts
{ label: string; amount: number }[]
```

Do not reproduce these as independent state systems. A backend adapter should call the server and update the one existing provider from the canonical response.

## 7. Role Synchronization

There are two related role values:

- Auth role: `useAuth().user?.role`
- Clinic display role: `useClinic().role`

The authenticated layout synchronizes the auth role into the clinic role. The role switcher in [src/components/clinic/app-shell.tsx](src/components/clinic/app-shell.tsx) updates both values, so the dashboard and sidebar change together.

Changing the role does not recreate `ClinicProvider`; appointments, prescriptions, doctors, patients, and invoices remain in the same provider instance.

For a backend, derive identity and permissions from the authenticated server session. Keep `role` in responses for rendering, but enforce authorization in every API handler.

## 8. Route Map

All routes below are protected except `/`, `/login`, and `/signup`.

| Path | Main audience | Purpose |
| --- | --- | --- |
| `/` | Public | Landing page |
| `/login` | Public | Demo login |
| `/signup` | Public | Demo signup |
| `/dashboard` | All roles | Role-specific dashboard |
| `/book` | Patient | Request an appointment |
| `/appointments` | All roles | Patient, doctor, or reception appointment view |
| `/consult/$id` | Doctor | Complete a confirmed consultation |
| `/prescriptions` | Patient | Read prescriptions and notes |
| `/billing` | Receptionist | Create invoices and record payments |
| `/doctors` | Receptionist | Manage doctors |
| `/patients` | Receptionist | Patient directory |
| `/reports` | Receptionist | Clinic metrics |
| `/schedule` | Doctor | Doctor schedule |
| `/records` | Doctor | Patient records |
| `/profile` | Patient | Patient profile |

These are frontend paths, not a requirement for identical backend paths. REST, RPC, or GraphQL can work if the frontend adapter exposes equivalent operations.

## 9. Suggested REST API

### Session

```text
POST /api/auth/login
POST /api/auth/signup
POST /api/auth/logout
GET  /api/auth/me
```

Example login request:

```json
{ "email": "sarah@example.com", "password": "..." }
```

Example response:

```json
{
  "user": {
    "id": "p1",
    "name": "Sarah Jenkins",
    "email": "sarah@example.com",
    "role": "patient"
  }
}
```

Do not accept a requested role as proof of authorization. If the UI needs a demo-only role switch, keep it behind an explicit development/demo flag.

### Reference data

```text
GET   /api/doctors
GET   /api/doctors/:doctorId
POST  /api/doctors                 # receptionist
PATCH /api/doctors/:doctorId       # receptionist
GET   /api/patients                # receptionist/doctor with scope rules
GET   /api/patients/:patientId
```

### Appointments

```text
GET   /api/appointments
POST  /api/appointments
GET   /api/appointments/:appointmentId
POST  /api/appointments/:appointmentId/confirm
POST  /api/appointments/:appointmentId/reschedule
POST  /api/appointments/:appointmentId/cancel
```

Create request:

```json
{
  "doctorId": "d1",
  "date": "2026-09-18",
  "slot": "09:45 AM",
  "reason": "Blood pressure follow-up",
  "notes": "Readings have been higher in the mornings."
}
```

The patient ID should come from the authenticated user, not the request body. Reception can confirm, reschedule, or cancel. Doctors should see appointments assigned to them. Patients should see their own appointments.

Reschedule request:

```json
{ "date": "2026-09-19", "slot": "10:30 AM" }
```

The server must atomically check slot availability for the doctor before confirming the new time.

### Consultations and prescriptions

```text
POST /api/appointments/:appointmentId/complete
GET  /api/prescriptions
GET  /api/prescriptions/:prescriptionId
```

Complete consultation request:

```json
{
  "diagnosis": "Exertional hypertension, no ischemic findings",
  "medications": [
    {
      "name": "Amlodipine",
      "dosage": "5 mg",
      "frequency": "Once daily, morning",
      "duration": "30 days"
    }
  ],
  "notes": "Log blood pressure twice daily."
}
```

This must be a transaction:

1. Verify the caller is the assigned doctor.
2. Verify the appointment exists and is `Confirmed`.
3. Insert one prescription.
4. Change the appointment to `Completed`.
5. Commit both changes together.

Do not allow a second prescription for the same appointment unless amendments or refills are explicitly supported.

### Billing

```text
GET  /api/invoices
POST /api/invoices
POST /api/invoices/:invoiceId/pay
GET  /api/invoices/:invoiceId
```

Create invoice request:

```json
{
  "appointmentId": "a7",
  "items": [
    { "label": "Cardiology consultation", "amount": 180 },
    { "label": "ECG", "amount": 60 }
  ]
}
```

Rules:

- Only reception can create and pay invoices.
- The appointment must be `Completed` before invoice creation.
- Only one invoice should be created for an appointment unless split billing is introduced.
- The server calculates and stores the total.
- Payment records method and timestamp.
- Paying an already-paid invoice should be idempotent.

## 10. Required Database Schema (Assignment-aligned)

This project is a clinic workflow assignment, so the backend should follow the schema described in [project_description.md](project_description.md) unless the brief changes. That means the canonical tables for this repo are the assignment-required ones below, not a more advanced production schema that diverges from the brief.

Use lower_case, plural, snake_case table names and snake_case column names. This keeps the database structure consistent with the assignment and with the frontend’s mock data model.

### profiles

```text
profiles
  id uuid primary key
  full_name text not null
  email text unique not null
  role text check (role in ('patient', 'doctor', 'receptionist')) not null
  phone text
  gender text
  date_of_birth date
  created_at timestamptz not null default now()
```

This is the project’s required user/profile table. The `id` is the auth user id, and the role is stored here.

### doctors

```text
doctors
  id uuid primary key
  user_id uuid unique references profiles(id)
  specialization text
  consultation_fee numeric
  available_days text[] default '{}'
  status text check (status in ('active', 'inactive')) default 'active'
  created_at timestamptz not null default now()
```

This matches the assignment requirement that each doctor has a specialization, fee, available days, and active/inactive status.

### appointments

```text
appointments
  id uuid primary key
  patient_id uuid references profiles(id)
  doctor_id uuid references doctors(id)
  appointment_date date not null
  time_slot text not null
  reason text not null
  status text check (status in ('requested', 'confirmed', 'completed', 'cancelled')) not null default 'requested'
  created_at timestamptz not null default now()
```

This is the required appointment model from the assignment. The frontend mock data uses `date` and `slot`, but the database should use the assignment’s clearer naming: `appointment_date` and `time_slot`.

### prescriptions

```text
prescriptions
  id uuid primary key
  appointment_id uuid unique references appointments(id)
  patient_id uuid references profiles(id)
  doctor_id uuid references doctors(id)
  notes text
  medicines text not null
  created_at timestamptz not null default now()
```

This matches the assignment requirement that the doctor writes notes and medicines, and the prescription belongs to one appointment.

### bills

```text
bills
  id uuid primary key
  appointment_id uuid references appointments(id)
  patient_id uuid references profiles(id)
  amount numeric not null
  status text check (status in ('unpaid', 'paid')) not null default 'unpaid'
  created_at timestamptz not null default now()
```

This matches the project brief exactly. The assignment requires `bills`, not a separate `invoices` + `invoice_items` + `payments` design.

### Important note

A more normalized design with separate invoice tables, payment tables, and doctor availability tables may be a nice long-term architecture. However, that is not the assignment’s required schema and it introduces needless architecture drift. For this project, keep the schema aligned to the specification and only add extra tables if they are explicitly needed by the assigned UI workflow.

## 11. Authorization Matrix

Authorization belongs on the backend even though the current frontend switches role locally.

| Operation | Patient | Doctor | Receptionist |
| --- | --- | --- | --- |
| Read own profile | Own only | No | No |
| Read appointments | Own only | Assigned only | All clinic appointments |
| Create appointment request | Yes, for self | No | Optional administrative booking |
| Confirm appointment | No | No | Yes |
| Reschedule appointment | No or request-only | No | Yes |
| Cancel appointment | Own active appointment | Assigned appointment if allowed | Yes |
| Complete consultation | No | Assigned confirmed appointment | No |
| Read prescriptions | Own only | Assigned patient context | Usually no clinical details |
| Create invoice | No | No | Yes |
| Mark invoice paid | No | No | Yes |
| Manage doctors | No | No | Yes |
| Read patient directory | No | Scoped clinical access | Yes |
| Read reports | No | Limited personal metrics | Yes |

Return `401` for missing/invalid authentication and `403` for authenticated users without permission. Do not hide authorization failures by returning empty arrays.

## 12. Business Rules to Enforce Server-Side

1. A patient can create appointments only for themselves.
2. Only active doctors can receive new appointment requests.
3. The requested weekday must match doctor availability.
4. A doctor/time slot cannot be double-booked while an appointment is `Requested` or `Confirmed`.
5. Confirming or rescheduling re-checks availability inside a transaction.
6. Only the assigned doctor can complete a consultation.
7. A consultation must be `Confirmed` before completion.
8. Completion creates a prescription and marks the appointment `Completed` atomically.
9. Only reception can invoice a completed appointment.
10. An appointment should not receive duplicate invoices.
11. Invoice totals are calculated server-side.
12. Payment changes an invoice to `Paid` and records method/time atomically.
13. Status changes should have an audit record in production.
14. Patient and clinical data must be scoped by authenticated identity and role.

## 13. Replacing the Mock Provider

### Phase A: Backend foundation

1. Choose a backend runtime and database.
2. Add environment-based API and database configuration.
3. Add migrations for `profiles`, `doctors`, `appointments`, `prescriptions`, and `bills` in the exact assignment-aligned schema.
4. Seed the current demo records from [src/lib/clinic/data.ts](src/lib/clinic/data.ts), preserving the demo IDs (`p1`, `d1`, `r1`) used by the frontend.
5. Add health and migration commands.

### Phase B: Authentication

1. Implement login, signup, logout, and current-user endpoints.
2. Decide cookie session versus token authentication before wiring the frontend.
3. Keep the current `User` response shape initially.
4. Replace simulated auth only after the server contract is tested.
5. Remove permissive password behavior before production.

### Phase C: Read operations

1. Add doctors and patients queries.
2. Add appointment, prescription, and invoice queries with role scopes.
3. Add loading and error states to the frontend adapter.
4. Hydrate the existing `ClinicProvider` from API responses.

### Phase D: Mutations

Implement one mutation at a time, matching the current provider methods:

| Current method | Backend operation |
| --- | --- |
| `bookAppointment(input)` | `POST /api/appointments` |
| `setAppointmentStatus(id, status)` | Explicit status action endpoint |
| `rescheduleAppointment(id, date, slot)` | `POST /api/appointments/:id/reschedule` |
| `completeConsultation(input)` | `POST /api/appointments/:id/complete` |
| `upsertDoctor(doc)` | `POST` or `PATCH /api/doctors` |
| `toggleDoctorActive(id)` | `PATCH /api/doctors/:id` |
| `createInvoice(id, items)` | `POST /api/invoices` |
| `markInvoicePaid(id, method)` | `POST /api/invoices/:id/pay` |
| `isSlotTaken(...)` | Server availability query/validation |

After each replacement, verify the complete workflow rather than only one request.

## 14. Frontend Integration Shape

A small API client can preserve the current UI-facing provider API:

```ts
export interface ClinicApi {
  listDoctors(): Promise<Doctor[]>;
  listPatients(): Promise<Patient[]>;
  listAppointments(): Promise<Appointment[]>;
  listPrescriptions(): Promise<Prescription[]>;
  listInvoices(): Promise<Invoice[]>;
  createAppointment(input: CreateAppointmentInput): Promise<Appointment>;
  confirmAppointment(id: string): Promise<Appointment>;
  rescheduleAppointment(id: string, input: RescheduleInput): Promise<Appointment>;
  completeConsultation(id: string, input: CompleteConsultationInput): Promise<Prescription>;
  createInvoice(input: CreateInvoiceInput): Promise<Invoice>;
  payInvoice(id: string, method: string): Promise<Invoice>;
}
```

The provider can call this client and update local React state from the canonical server response. Avoid optimistic updates until the basic flow is correct.

React Query is already a dependency and can manage caching and invalidation. Example query keys:

```text
['doctors']
['patients']
['appointments', filters]
['prescriptions', currentUser.id]
['invoices', filters]
```

After a mutation, invalidate the affected queries or update them from the response.

## 15. Validation and Errors

Validate every request server-side:

- required IDs and ownership
- ISO dates and clinic timezone
- doctor availability
- appointment status transitions
- non-empty reason and diagnosis
- medication fields
- invoice labels and non-negative amounts
- payment methods from an allowlist

Suggested error format:

```json
{
  "error": {
    "code": "APPOINTMENT_SLOT_TAKEN",
    "message": "That doctor is no longer available at the selected time.",
    "fields": { "slot": "Choose another time." }
  }
}
```

Use consistent HTTP status codes:

```text
400 invalid input
401 unauthenticated
403 unauthorized
404 missing resource
409 conflict, such as a taken slot or duplicate invoice
422 semantically invalid request
500 unexpected server error
```

The frontend should display safe messages and log a request ID for support. Never return stack traces or database details to the browser.

## 16. Testing Checklist

### Unit tests

- appointment status transition rules
- availability and slot conflict detection
- invoice total calculation
- role authorization helpers
- patient ownership checks
- prescription medication validation

### Integration tests

- patient creates an appointment request
- receptionist confirms it
- receptionist reschedules it without a collision
- doctor completes it and a prescription is created
- receptionist invoices it
- receptionist marks invoice paid
- duplicate completion is rejected
- duplicate invoice is rejected
- unauthorized role receives `403`
- unauthenticated request receives `401`

### End-to-end workflow

```text
Patient books
  -> Requested
Reception confirms or reschedules
  -> Confirmed
Doctor consults and writes prescription
  -> Completed
Patient sees prescription and notes
Reception creates invoice
  -> Unpaid
Reception records payment
  -> Paid
```

Also verify that changing the visible role does not delete or reset appointments, prescriptions, doctors, patients, or invoices. With a backend, switching views should change the authorized query scope, not create separate data stores.

## 17. Security and Production Readiness

Before connecting real users or patient data:

- use HTTPS everywhere
- hash passwords with a current password hashing algorithm
- use secure, HttpOnly, SameSite session cookies when appropriate
- protect sensitive mutations against CSRF as applicable
- rate-limit login and password-related endpoints
- validate and sanitize all input server-side
- use parameterized queries or a safe ORM
- add audit logs for clinical and billing changes
- enforce role and ownership checks on every resource endpoint
- keep secrets in environment variables or a secret manager
- encrypt backups and sensitive fields where required
- define data retention and deletion policies
- avoid logging diagnosis, notes, medications, or identifying data
- review healthcare/privacy obligations for the deployment region

The current Google button is explicitly demo-only and is not an OAuth implementation. Do not treat it as a working authentication path until a real OAuth design, callback validation, account-linking policy, and security review exist.

## 18. Common Mistakes to Avoid

### Trusting the selected role

The role switcher is a frontend convenience, not authorization. Always derive permissions from the server session.

### Recreating `ClinicProvider`

The current provider owns the shared workflow. Adding another provider can create two competing appointment lists. Keep one provider and replace its data source deliberately.

### Using display strings as canonical data

`09:45 AM`, `Mon`, and dollar-formatted values are presentation-friendly. Store canonical timestamps, weekday numbers, timezone information, and integer cents on the server.

### Updating related records separately

Completing a consultation and creating its prescription, or paying an invoice and recording its payment, should be transactional.

### Returning unrestricted lists

A patient must not receive every patient, appointment, prescription, or invoice merely because the frontend can render different roles.

### Hand-editing generated routes

TanStack route files generate [src/routeTree.gen.ts](src/routeTree.gen.ts). Add or change route source files according to the project conventions, then run the normal generator/build workflow.

## 19. Definition of Done

The first backend version is ready for frontend integration when:

- the database can be migrated from an empty environment
- the current seed data can be loaded
- login and logout work with a real server session
- each role receives only permitted records
- all provider mutations have API equivalents
- appointment conflict checks are transactional
- consultation completion creates a prescription and completes the appointment atomically
- invoice totals are server-calculated
- payment is idempotent
- API errors have stable codes
- automated tests cover the complete clinic workflow
- the frontend can replace mock calls without changing route behavior or the clinic workflow

Keep this document updated when the domain model, role permissions, statuses, or API contract changes.
