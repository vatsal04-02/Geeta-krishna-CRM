# Geeta Krishna Physiotherapy CRM — Implementation Plan

Status: **Phase 1 (inspect and isolate) is done. Nothing in Phases 2–6 is built yet.**
Per `CLAUDE.md` rule 1, build work starts only after this plan is approved.

---

## 1. Repository verification (what is really here)

| Question | Finding |
|---|---|
| What is at the repo root? | The **Clinic Autopilot starter kit**: Docker Compose (Caddy + n8n + Grist), `grist/schema.md` (3.5 KB), `n8n/snippets/normalize-phone.js` + test, setup scripts. **No frontend, no n8n workflow JSON, no FlowHQ code.** |
| Where is the FlowHQ demo CRM? | Only inside a zip committed in `a323ac8` (`clinic-autopilot-starter_free-claude-vibrant-ptolemy-9nynv9.zip`) and deleted in `ce7aa92`. It is recoverable from git history, and is not in the working tree. |
| What does the zip contain? | The full starter **plus** `flowhq/` (the CRM), the integrated n8n workflows W1–W13 with 47 test files, the newer 11 KB `grist/schema.md`, and `privacy-policy.html`. Root files (`docker-compose*.yml`, `Caddyfile`, `.env.example`, `CLAUDE.md`, `README.md`) are byte-identical to the repo root; only `grist/schema.md` differs. |
| New project folder | `geeta-krishna-physio-crm/`: an exact copy of that zip snapshot, so it is self-contained and runnable (the FlowHQ Dockerfile builds from a root that also holds `n8n/snippets`). |
| Original untouched? | Yes. No file at the repo root was modified, and the zip in history is untouched. `git status` shows only the new folder. |

> The prompt describes the demo as an existing, runnable app in this repo. It was not. Recovering it from history is the assumption I made. If a different copy of FlowHQ exists elsewhere (another repo or a deployed instance), tell me and I will diff against it.

### Baseline (run on the untouched copy, before any change)
| Check | Result |
|---|---|
| `npm ci` (flowhq) | OK |
| `npm run typecheck` | clean |
| `npm test` (vitest) | **82 / 82 pass** (core 22, adapter 19, web-words 29, api 12) |
| `npm run build` | OK (web + BFF bundle) |
| `node n8n/tests/run-all.js` | **47 / 47 test files pass** |
| Not run | `npm run test:e2e` (Playwright e2e): not run yet. |

---

## 2. Current architecture (inspected, not assumed)

**FlowHQ** = React 18 + Vite + Tailwind 3 + TanStack Query + React Router 6 + lucide icons, served by **one Node process (Hono BFF)** that also serves the built web app. TypeScript strict, Zod validation, vitest.

```
Browser ──/api (cookie + CSRF header)──▶ Hono BFF ──Grist REST, server-side API key──▶ Grist (per-clinic doc)
                                                                                         ▲
n8n W1–W13 (webhooks: /webhook/website-lead, /cal, /whatsapp-inbound; schedules) ───────┘ (separate writer)
```

- **Routes** (`src/web/App.tsx`): built from the workspace's enabled **modules**; a disabled module has no route. Pages: Dashboard, Inbox, Contacts, Bookings, Automations, Tasks, Reports, Activity, AI, Settings, Login.
- **Backend contract**: `WorkspaceBackend` interface in `src/server/adapters/types.ts`; one implementation, `adapters/autopilot/`. Clinic lookup goes through the **Agency Registry** Grist doc (`Clinics` table: slug → `Grist_Doc_ID`); doc ids are never sent to the browser.
- **Grist client** (`src/server/grist.ts`): *records API only*: `records()`, `add()`, `update()`. 15 s timeout, key redacted from logs. No delete, no table/column creation, no attachments. `memoryGrist()` is an in-memory fake used by demo mode and all tests.
- **Auth**: scrypt password users from `config/users.json`, HMAC-signed HttpOnly cookie (12 h), roles `admin` / `staff`, per-workspace access list, login rate limit, CSRF header `x-flowhq-csrf: 1` on every write.
- **CSP** (`server/index.ts`): `default-src 'self'; img-src 'self' data: https:` — same-origin images from our own `/api` will load.
- **Theme**: CSS variables in `src/web/styles.css` (dark default, light variant), Tailwind points at them (`blue` = primary, ~184 usages in 17 files). Fonts: Inter.
- **Env** (`flowhq/.env.example`): `GRIST_BASE_URL`, `GRIST_API_KEY`, `GRIST_REGISTRY_DOC_ID`, `GRIST_LEADS_TABLE`, `FLOWHQ_SESSION_SECRET`, `FLOWHQ_USERS_FILE`, `FLOWHQ_WORKSPACES_FILE`, `FLOWHQ_DEMO`, etc. `FLOWHQ_DEMO=true` runs the real adapter on in-memory data with fictional businesses.
- **Grist tables today**: `LEADS` (live name; `Lead_id`), `Appointments` (Cal.com bookings, `Fee_INR` hidden from front desk), `Conversations`, `Messages`, `Settings`, `Knowledge`, `Run_Log`, plus the registry's `Clinics`. **There is no patient, prescription, invoice, payment or attendance table.**
- **n8n**: 323-node master workflow (`n8n/integrated/clinic-autopilot-master-ai.json`). Webhooks: `POST website-lead` (W1), `POST cal` (W4), `whatsapp-inbound` (W2 verify + inbound). Schedules for W3, W5–W10, W13. n8n reads/writes Grist **directly** and is *not* in the CRM page data path.
- **Existing print / invoice / export / attachment features**: **none** (no `@media print`, no `window.print`, no multipart or attachment handling). Money formatting (`lib/format.ts → money`) rounds to whole rupees.
- **Run commands**: `npm run dev` (BFF :8787 + Vite :5173), `npm run build && npm start`, `FLOWHQ_DEMO=true` for no-backend mode.

### Findings that shape the design
1. **n8n is not the secure layer for CRM data here; the BFF is.** It already holds the Grist key and enforces auth, roles and CSRF. So patient / prescription / invoice / payment / visit operations belong in the **BFF → Grist** path, the existing pattern. **No n8n workflow needs to change**, so the 47 n8n tests and the live webhook contracts stay as they are. (I will not add duplicate n8n workflows for CRUD.)
2. **In FlowHQ, "contact" = a marketing lead (`LEADS`)**, and the `physiotherapy` profile *labels* leads as "Patients". You asked not to equate the two. Fix: override terminology for this workspace (existing `config/workspaces.json` mechanism, no code change) so leads read "Enquiries", and add a **new** `Patients` module for the register. A lead can later be linked to a patient (`Source_Lead_ID`), never merged automatically.
3. **`tests/web-words.test.ts` bans industry words** (`patient`, `physio`, `clinic`, `treatment`, …) and Grist/n8n names from all of `src/web`, to keep the UI universal. The clinical screens need those words. Proposed minimal change: exempt only a new `src/web/clinical/` folder; the guard keeps protecting everything else. Clinic identity (name, address, clinicians, registration numbers, hours) is **not** hard-coded in `src/web`; it comes from a server config file `config/clinic.json` (public business info, no secrets).
4. **Grist does have an attachments API** (multipart upload to a doc, download by id), so photos need no second storage system. Storage is the doc's data volume (`grist_data`), already in the backup scope. Photos are served only through an authenticated BFF route, never as public URLs. *Unverified until tested against a real Grist* (size cap, exact endpoint behaviour on the pinned version).
5. **No transactions or auto-increment in the Grist REST API.** Patient IDs, invoice numbers and serials are generated in the BFF behind a per-workspace in-process lock, verified after write, with duplicate-submission protection (idempotency key per financial write). This is sound for the current one-process deployment; running two BFF replicas would need a different scheme (documented limit).
6. **Clinic hours are a single window** in `Settings` (`open_time`/`close_time`) and `clinic-hours.js` has no split-hours support. Geeta Krishna is 9–1 and 4–8. With one window `09:00–20:00`, W13 could offer 1–4 PM slots. **Out of scope, not touched,** but worth a decision from you.

---

## 3. Proposed design (smallest set of changes)

### 3.1 Data: a separate, additive "records" Grist doc (recommended)
- New Grist doc **"GK Clinic Records"**, registered by one **additive** registry column `Records_Doc_ID`. If it is empty, the clinical modules do not appear (same "only what the backend supports" rule the app already uses).
- Why separate: clinical notes, photos and money get their own access rules; zero chance of disturbing `LEADS`/`Appointments` that n8n workflows depend on; trivial to back up or restore on its own. Alternative (new tables in the existing clinic doc) is simpler but mixes data. **Your call (Q1).**
- Tables (stable text IDs, explicit references, **no row-number IDs**, money as **integer paise**):

| Table | Key columns |
|---|---|
| `Patients` | `Patient_ID` (`GK-P-000001`), `Serial_No`, `Name`, `Phone` (+91 normalised), `Address`, `Age` / `DOB`, `Sex`, `Referred_By`, `Occupation`, `Main_Complaint`, `Registered_On`, `Status`, `Follow_Up_On`, `Source_Lead_ID` (optional), `Notes` |
| `Prescriptions` | `Rx_ID`, `Patient_ID`, `Date`, `Treating_Physio`, `BP`, `Other_Vitals`, `History`, `Examination`, `Diagnosis`, `Treatment_Plan`, `Exercises`, `Advice`, `Follow_Up_On`, `Version`, `Created_By/At`, `Updated_By/At` |
| `Rx_Images` | `Rx_ID`, `Patient_ID`, `Attachment` (Grist attachment id), `Caption`, `Mime`, `Bytes` |
| `Invoices` | `Invoice_No` (`GK-2026-000001`), `Patient_ID`, `Date`, `Status` (draft / issued / void), `Subtotal_Paise`, `Discount_Paise`, `Tax_Paise`, `Total_Paise`, `Notes`, `Void_Reason` |
| `Invoice_Lines` | `Invoice_No`, `Description`, `Qty`, `Unit_Price_Paise`, `Line_Total_Paise` |
| `Payments` | `Payment_ID`, `Invoice_No`, `Patient_ID`, `Date`, `Amount_Paise`, `Method`, `Reference`, `Voided`, `Void_Reason` (append-only) |
| `Visits` | `Patient_ID`, `Visit_Date`, `Status` (attended / missed / cancelled), `Notes`, `Recorded_By`, optional `Appointment_UID` |
| `Audit_Log` | `At`, `User`, `Action`, `Table`, `Record`, `Summary` (no clinical text, no image data) |

- Patient totals (billed / paid / outstanding) are **derived** from invoices and payments in the BFF, never stored on the patient row.
- Tables are created by an explicit, additive script (`scripts/provision-records.mjs`) that you run; it never renames or drops anything. The adapter reports "table X missing" instead of failing silently.
- Per `CLAUDE.md` rule 3, these tables are written into a new `grist/clinic-records-schema.md` **first**; code and the provisioning script must match it exactly. The existing `grist/schema.md` is not edited.
- No signature collection in v1 (optional later; not mandatory for registration).

### 3.2 BFF
New routes under `/api/w/:ws/` (all behind existing auth, CSRF and workspace scope), implemented in a new `adapters/autopilot/records.ts` (+ small `GristClient` additions: attachment upload/download, table creation for provisioning, delete **not** added):
`patients` (list / create / get / patch, duplicate check), `prescriptions` (+ `/images`), `invoices` (+ `/payments`, void), `visits` (+ week view), `clinic` (letterhead config).
Every write: Zod validation, loading/error states in the UI, success shown **only after Grist confirms**, 15 s timeout (existing), idempotency key on invoice/payment creation.

### 3.3 Invoices and money
- Calculation in integer paise on the **server** (the UI previews, the server decides): `Total = Subtotal − Discount + Tax`; `Balance = Total − Σ non-void Payments`.
- Negative quantity or price, discount greater than subtotal, and overpayment are rejected. **Tax is off by default**: no GST rate is invented; a tax line exists only if you configure one in `config/clinic.json` (Q3).
- **Issued invoices are immutable.** Corrections = void (reason required) and re-issue; payments are append-only with void rows. Draft invoices are editable. `Audit_Log` records each change.
- Amount in words (Indian numbering: lakh / crore) built and unit-tested; falls back to omitted if the amount is out of range, rather than printing a wrong sentence.

### 3.4 Frontend
- New folder `src/web/clinical/`: Patients (register table + profile drawer), Prescriptions (list + editor), Invoices & Payments (list + editor), Visits (list + Mon–Sun week grid), reusable `PrescriptionDocument` and `InvoiceDocument` print components.
- **Register**: compact spreadsheet-style table, server-side search (name / phone / ID), sort, filters (status, follow-up due, outstanding), pagination, add/edit, CSV export, print. Serial number auto-generated. Duplicate warning (same normalised phone, or similar name) on create/edit, never auto-merge.
- **Prescription**: quick form, nothing mandatory except patient. **Photo**: JPEG/PNG only (checked by file signature on the server, not just extension), 5 MB cap, preview / replace / remove before save; the browser downscales and re-encodes via canvas before upload (also strips EXIF/GPS) so **no new dependency** is needed.
- **Print**: `window.print()` + `@media print` on a dedicated route, A4, `@page` margins, `break-inside: avoid` for sections, black-and-white safe, hides nav/sidebar/buttons. Letterhead mirrors the paper sheet (name, consultants with reg. numbers, address, timings). Treating physio signature line. Typographic "GK" brand mark (no logo file exists in the repo, and I will not invent an official logo).
- **Theme**: re-point existing tokens in `styles.css` (no new UI framework): light theme as the default for this project, palette from your brief (`#0D4038`, `#124D45`, `#F8F5EC`, `#EDE5D1`, `#DCE9E2`, accent `#F4510B`, text `#263431` / `#78817C`, borders `#E5E0D5`). Deep green drives brand/active states; **orange only for primary buttons and key highlights**, which needs one new `accent` token and a one-line change to the primary `Button` variant. Dark mode stays available. Contrast will be checked (WCAG AA) before I call it done.
- **Navigation**: Dashboard · Inbox · Enquiries (existing leads) · **Patients** · **Prescriptions** · **Invoices & Payments** · **Visits** · Appointments (Cal.com) · Automations · Tasks · Reports · Activity · AI · Settings. Registered as new module keys in `core/registry.ts` so they follow the existing routing and module-gating pattern.
- `lib/format.ts` gets a paise-aware `rupees()` (2 decimals); the existing `money()` is untouched.

### 3.5 What stays untouched (in the new folder)
`src/server/auth.ts`, `grist.ts` existing methods, `adapters/autopilot/index.ts` existing behaviour (only a new composition hook), all of `n8n/` (workflows, snippets, tests), Docker/Caddy files, existing pages' logic. Existing files edited, minimal and listed in each phase's diff: `core/registry.ts`, `core/domain.ts` (module keys), `types.ts` (optional records interface), `app.ts` (mount routes), `styles.css`, `tailwind.config.js`, `primitives.tsx` (Button accent), `App.tsx`, `Shell.tsx` (brand/logo text), `web-words.test.ts` (scoped exemption), `.env.example` / README (docs only).

---

## 4. Order of work and verification

Dependency order is **Patients → Prescriptions → Invoices** (both later features link by `Patient_ID`). Your brief lists the prescription first in one place and the register first in another; I will follow the dependency order.

| Phase | Deliverable | How it will be verified |
|---|---|---|
| 2 | Theme, branding, navigation, `config/clinic.json` | typecheck, vitest, build, screenshots in Chromium at desktop and phone width, contrast check |
| 3 | Records doc provisioning, Patients register + profile | unit tests against `memoryGrist`; duplicate / ID-uniqueness tests; BFF API tests |
| 4 | Prescriptions + photo + A4 print | upload validation tests (type, size, spoofed extension); print-to-PDF via Chromium, with and without image |
| 5 | Invoices, payments, A4 print | calculation tests (rounding, discount, overpayment, double-submit, failed backend, void); print-to-PDF |
| 6 | End-to-end | the 16-step flow from your brief; existing 82 vitest + 47 n8n tests still green |

**Honest limits of verification:** automated tests run against the in-memory Grist. Proving persistence, attachments and refresh-survival on a *real* Grist needs a running Grist (Docker is installed in this sandbox, so I will try a local `gristlabs/grist` container with synthetic data; if that is blocked I will say so, and ship `scripts/verify-records.mjs` for you to run against your instance). I will not report any feature as working end-to-end until it has actually been run.

---

## 5. Decisions needed from you (defaults in bold)

1. **Records storage**: **separate "GK Clinic Records" Grist doc + `Records_Doc_ID` registry column**, or new tables inside the existing clinic doc?
2. **Front-desk permissions**: **both roles can create invoices and record payments; only admins see aggregate revenue and can void**. Or admin-only invoicing?
3. **Tax**: **none** (no GST line unless you give me the registration and rate to configure).
4. **Photo storage**: **Grist attachments in the records doc** (backed up with the Grist volume). OK for patient photos on your server?
5. **Invoice numbering**: **`GK-<year>-<6 digits>`**, restarting each calendar year, or a single running sequence?
6. **Existing leads**: **relabel to "Enquiries"** (leads ≠ patients), as described above?
7. **Split clinic hours** (finding 6): leave for later, or fix W13/`clinic-hours.js` separately?

## 6. Risks / pending
- Real-Grist behaviour for attachments and table creation is **unverified** until tested against a live instance.
- Single-process lock for ID generation (see finding 5).
- Patient photos and notes are sensitive. This project makes **no compliance claim**; a privacy review is needed before real patient data goes in. Only synthetic data is used in tests, and `.gitignore` already excludes `.env`, `*.grist`, `backups/`.
- Repo size: the copy adds ~13 MB (mostly the n8n workflow JSON exports) to the repository.
