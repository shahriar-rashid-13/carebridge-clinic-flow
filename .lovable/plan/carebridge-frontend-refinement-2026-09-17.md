# CareBridge frontend refinement

## Goal
Turn the current demo dashboard into a complete public-to-private prototype while preserving every role, mock record, route, and reactive clinic workflow. Authentication remains simulated and local; profile persistence is deferred for a later backend phase.

## Public experience and simulated access
- Make `/` a calm editorial landing page using the reference images only as visual direction: generous ivory space, strong serif headline, fine outlined sections, restrained sage and terracotta accents, and no copied artwork.
- Add the requested navigation, exact CareBridge headline, primary “Get started” action, and concise three-step workflow.
- Add `/signup` with full name, email, password, confirmation, demo-mode notice, Sarah Jenkins quick fill, validation, success feedback, and “Continue to login”.
- Add `/login` with email/password fields, simulated Google action, and one-click demo identities for Sarah Jenkins, Dr. Marcus Vance, and Clara Morgan.
- Move the existing role-aware dashboard from `/` to `/dashboard`; update all dashboard links while leaving every other route unchanged.
- Add route-specific page titles and sharing descriptions for `/`, `/signup`, `/login`, and `/dashboard`.

## Centralized simulated auth
- Extend the existing clinic store with `isAuthenticated`, `currentUser`, `login`, demo-account creation feedback, and `logout`.
- Map each demo identity to its matching clinic role and doctor selection so login opens the correct dashboard immediately.
- Keep the existing role switcher active after login and synchronize its displayed user with the selected demo role.
- Show the public frame on landing, signup, and login; show the existing app sidebar/mobile header only for authenticated app screens.
- Redirect signed-out access to clinic screens back to login, and make sign out clear the simulated session and return to `/`.
- Keep this frontend-only: no real accounts, database, or stored profiles are added now.

## Patient dashboard and appointment calendar
- Keep Upcoming Visits as the first major dashboard section.
- Add a compact monthly appointment calendar driven directly by the store’s patient appointments, with previous/next month controls and clear appointment-day dots.
- Clicking any day opens an adjacent compact popover. Appointment days list every visit with date, time, doctor, specialty, reason/notes, and status; empty days show “No appointments scheduled.”
- Reorganize the lower dashboard into equal-weight Recent Prescriptions and Health Summary columns with aligned tops on desktop and a clean stacked layout on mobile.
- Ensure calendar markers and popover content update immediately after booking, confirmation, rescheduling, or completion.

## Visual refinements
- Strengthen the semantic primary button treatment through the shared button variant and design tokens so all key actions consistently use a solid deep forest/sage surface, crisp border, and high-contrast label.
- Keep secondary actions outlined and refine status pills with stronger borders and tactile soft fills.
- Add a reusable `DoctorNote` editorial block with a dark forest/olive surface, uppercase label, and accessible high-contrast content.
- Use `DoctorNote` for prescription notes, completed-consultation notes, and the consultation notes workspace without changing the underlying data.

## Workflow verification
- Exercise the complete shared-state loop in the running preview: sign in as patient, book; switch to reception, confirm; switch to doctor, complete and prescribe; switch to patient, verify notes; switch to reception, invoice and mark paid.
- Check landing, access forms, dashboard, calendar popover, sidebar, and workflow controls at desktop and mobile widths.
- Confirm all routes render, interactions update without reloads, metadata remains unique, and no browser errors appear.

## Technical details
- Reuse TanStack Router, the existing store/provider, shadcn controls, `react-day-picker`, and semantic Tailwind v4 tokens.
- Add focused reusable pieces for the public header, auth forms, appointment calendar, and doctor note rather than duplicating markup.
- Do not add Lovable Cloud or a profiles table in this phase; the store boundary remains ready for that later migration.
