# CareBridge demo accounts

Synthetic test users for local, E2E, and live demo on  
https://carebridge-clinic-flow.vercel.app  

All patient/clinic data is synthetic. These accounts are not real people.

---

## 1. Primary demo triad (use these for Assessment demos)

Defined in app login chips (`src/lib/auth/store.ts`), Playwright `.env.test`, and assessment reports.

| Role | Name | Email | Password |
|---|---|---|---|
| Patient | Sarah Jenkins | `sarah@example.com` | `123456` |
| Doctor | Dr. Marcus Vance | `marcus@example.com` | `123456` |
| Receptionist | Clara Morgan | `clara@example.com` | `123456` |

**Where this lives**

| Location | What it stores |
|---|---|
| [`src/lib/auth/store.ts`](../src/lib/auth/store.ts) | Demo email chips on the login page (one click fills email) |
| [`.env.test`](../.env.test) | `E2E_*_EMAIL` / `E2E_*_PASSWORD` for Playwright |
| [`docs/assessment-2/ASSESSMENT_2_REPORT.md`](assessment-2/ASSESSMENT_2_REPORT.md) §8 | Same triad + passwords (public in repo) |
| [`docs/FINAL_PROJECT_REPORT.md`](FINAL_PROJECT_REPORT.md) §25 | Emails only (passwords omitted there on purpose) |
| Dev Control Tower handoff | Same credentials for reviewers |

Marcus is the **hand-picked demo doctor** for the doctor portal (schedule / consult). He is separate from the catalog seed doctors below.

---

## 2. Catalog seed doctors (36 accounts)

Created by `carebridge-rag` script:

```bat
cd carebridge-rag
node scripts/seed-doctors.mjs            rem dry run
node scripts/seed-doctors.mjs --apply    rem create/sync
```

**Email pattern:** `doc-NNN@example.com` from catalog ref `DOC-NNN`  
(see `carebridge-rag/scripts/catalog.mjs`).

**Password:** value of `SEED_DOCTOR_PASSWORD` in `carebridge-rag/.env` (minimum 8 characters).  
That secret is **not** committed. It is **not** the same as the triad password `123456` unless you set it that way on purpose.

### Useful General Medicine logins (examples)

| Catalog | Name | Email | Works (typical) |
|---|---|---|---|
| DOC-001 | Dr. Farhana Kabir | `doc-001@example.com` | Sat, Mon, Wed |
| DOC-002 | Dr. Tanvir Ahmed | `doc-002@example.com` | Sun, Tue, Thu |
| DOC-003 | Dr. Nusrat Jahan | `doc-003@example.com` | Sat–Wed |

Full list: `DOC-001` … `DOC-036` → `doc-001@example.com` … `doc-036@example.com`.

---

## 3. Other patients

Extra fixture patients may exist in tests (for example `tom@example.com`). They are not required for the Assessment 4 demo path. Prefer Sarah for patient flows.

New self-signups always start as **patient**. Reception (or AI proposal) can promote to doctor/receptionist.

---

## 4. Quick tips

1. Login page → click a demo chip → password `123456` for Sarah / Marcus / Clara.
2. Book Saturday General Medicine as a patient → expect Farhana / Nusrat among workers that day (not Tanvir).
3. To log in as Farhana: email `doc-001@example.com`, password = `SEED_DOCTOR_PASSWORD` from local `carebridge-rag/.env`.
4. Never put real secrets or production passwords in this file. Keep `SEED_DOCTOR_PASSWORD` in `.env` only.
