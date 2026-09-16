# CareBridge Portal

Build CareBridge — Clinic Appointment & Patient Management, a complete frontend prototype with mock data and local reactive state (modular data service ready for Supabase later).

Design philosophy adapted from the attached fisfis.cc references:
- Editorial, calm, refined aesthetic: warm ivory/linen neutral background (#FBF9F5 / stone-50), crisp subtle borders (subtle clean borders, distinct outlines), elegant serif headings paired with clean legible modern sans body, restrained clinical accents (calm sage/forest greens, warm terracotta/sand badges, soft slate), generous whitespace, restrained shadows. No generic template clutter, no excessive neon gradients.

Role Switcher:
- A prominent floating or top-bar role selector allowing instant switching between:
  1. Patient (e.g. Sarah Jenkins)
  2. Doctor (e.g. Dr. Marcus Vance, Cardiologist / Dr. Elena Rostova, General Physician)
  3. Receptionist (e.g. Clara Gomez)

Three distinct role layouts & sidebars:
- Patient:
  * Dashboard (upcoming visits, recent prescriptions, quick book action, health summary cards)
  * Book Appointment (select doctor with specialty, view doctor available days/time slots, choose reason/notes, submit -> status 'Requested')
  * My Appointments (view Requested, Confirmed, Completed, Cancelled with status badges and detail sheet/dialog)
  * My Prescriptions (list completed prescriptions with medications, dosage, instructions, doctor notes, printable/downloadable format)
  * My Profile (patient details, medical history, emergency contact)
- Doctor:
  * Doctor Dashboard (today's schedule summary, patient queue, quick stats)
  * My Schedule (weekly/daily view with confirmed appointments and availability toggle)
  * My Appointments (filter by status, search patients)
  * Patient Records (patient directory, medical history, past visits)
  * Write Prescription / Consultation View (open a confirmed appointment, see patient details, add diagnosis, write medication items with dosage/freq/duration, add doctor notes, save prescription and mark appointment completed)
- Receptionist:
  * Reception Dashboard (appointment volume, today's arrivals, pending requests alert, revenue summary)
  * Manage Doctors (doctor list, working days, time slots, consultation fees, active status)
  * Appointments (comprehensive schedule view, incoming 'Requested' appointments with Confirm, Reschedule, or Cancel actions)
  * Patients (directory of registered patients with contact info and appointment counts)
  * Billing (generate bill for completed appointments with consultation + service fees, view invoice details, mark as Paid with payment method)
  * Reports (clinic metrics: visits by specialty, revenue breakdown, appointment status overview)

Interactive workflow simulation (Local state store):
1. Receptionist adds/configures doctor working schedules & slots.
2. Patient books an appointment with selected doctor & slot -> creates 'Requested' appointment.
3. Receptionist confirms the requested appointment -> changes status to 'Confirmed'.
4. Confirmed appointment shows in Doctor's schedule and appointments.
5. Doctor opens the appointment, fills out diagnosis + medications, issues prescription, and completes the appointment.
6. Prescription immediately reflects in Patient's 'My Prescriptions' view.
7. Receptionist creates an invoice/bill for the completed visit and marks it 'Paid'.

Include realistic mock records, empty states, search & filter bars, status badges, toast notifications for actions, and confirmation modals for cancellations. Fully responsive on desktop and mobile.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f16717f9-449b-4583-b0a1-5909a58c64a0).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
