# Geeta Krishna Physiotherapy CRM: what was built, and what is verified

Working branch: `claude/adoring-darwin-9py5im`, which contains `claude/vibrant-ptolemy-9nynv9` (the real FlowHQ implementation) merged in. `main` has no FlowHQ code (its history holds only an orphan zip commit). Work is done in place in `flowhq/`; nothing under `n8n/`, `docker-compose*.yml`, `Caddyfile` or `grist/schema.md` was changed.

## Architecture (as found)
React 18 + Vite + Tailwind + TanStack Query front end → one Hono "BFF" Node process → Grist REST with a server-side API key. n8n (W1–W13) is a separate writer to the same Grist doc and is **not** in the CRM page data path. Clinic lookup goes through the Agency Registry doc. Auth = scrypt users, signed cookie, CSRF header, roles `admin`/`staff`.
Consequence: the new patient/prescription/invoice operations live in the BFF (which already holds the Grist key and enforces auth), so **no n8n workflow, webhook or credential was touched**.

## What changed
| Area | Change |
|---|---|
| Theme | Existing CSS tokens re-pointed to the clinic palette (light default, dark kept); GK monogram brand (`src/core/brand.ts`); orange only on primary buttons. Two deliberate deviations for WCAG AA: button fill `#C93F08` (white text 5.0:1; `#F4510B` is 3.5:1) and secondary text `#5F6A65` (`#78817C` is 3.7:1 on cream). |
| Data | Additive tables in the **existing clinic doc** (not a separate doc: smaller change, no registry edit): `Patients, Prescriptions, Rx_Images, Invoices, Invoice_Lines, Payments, Visits, Audit_Log`. Spec: `grist/clinic-records-schema.md`. Created by `npm run provision-records` (dry run by default, additive only). |
| API | `src/server/records/` (service + routes) mounted under `/api/w/:ws`, behind the existing auth/CSRF/workspace checks. `GristClient` gained attachments + schema calls; existing methods untouched. |
| UI | `src/web/clinical/`: register + patient record, prescriptions, invoices/payments, attendance, A4 print views. Registered through the existing module registry/routing; modules appear only if the clinic doc has all the tables. |
| Naming | The physiotherapy profile now calls leads **Enquiries** (leads ≠ patients). Two existing tests were pointed at the generic `clinic` profile accordingly. |
| Guard test | `web-words.test.ts` still bans industry words everywhere except `src/web/clinical/`. The "only `/api` network calls" rule still covers every file. |

Files edited outside the new code: `core/domain.ts` (module keys), `core/registry.ts`, `core/industries/index.ts`, `server/grist.ts` (additive), `server/app.ts` (mount + error extras), `server/index.ts`, `server/config.ts`, `adapters/types.ts` + `adapters/autopilot/index.ts` (records hook), `web/App.tsx`, `Shell.tsx`, `primitives.tsx`, `lib/api.ts`, `lib/theme.tsx`, `lib/icons.ts`, `styles.css`, `tailwind.config.js`, `index.html`, `deploy/docker-compose.flowhq.yml` (mount clinic.json), `.env.example`, `README.md` (section L).

## Verification status (what was actually run)
| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` (vitest) | **149 tests pass** (82 existing + money 29 + records service 25 + records API 8 + provisioning 5; 2 existing tests re-pointed) |
| `npm run build` | OK |
| `node n8n/tests/run-all.js` | **47 / 47 pass**, unchanged |
| Real browser (Chromium), `npm run test:e2e:clinical`, FlowHQ demo server | register → duplicate warning → refresh → search → prescription + photo → save → refresh → reopen → version 2 → print view → invoice (double-click = 1 invoice) → overpayment refused → payment → balance → register totals → attendance; no console errors on any existing page. |
| Print | Prescription (with photo) = **1 A4 page**; invoice = 1 A4 page; both rendered to PDF in Chromium; no nav/sidebar/buttons in print. |
| Phone width (390 px) | no sideways page scroll on any clinical page |

**Not verified:** the live n8n, WhatsApp, Cal.com, and the clinic's own production Grist and users. The vitest suites and the browser run use the in-memory Grist fake (it rejects unknown columns but is not Grist). The browser run (UI) was **not** repeated against a real Grist. The existing Playwright suite (`npm run test:e2e`) was not run.

## Real Grist (grist-core built from source, temporary local instance, synthetic data): 27/27 checks pass
Run through the real `provision-records` tool and the real FlowHQ API (login, CSRF, routes) against a real Grist server:
- provisioning: dry run changes nothing; `--apply` creates all 8 tables; the second `--apply` is a no-op; `Rx_Images.File` is a real `Attachments` column, dates are real `Date` columns
- a patient, prescription and photo saved through FlowHQ: the attachment in Grist is **byte-identical** to the upload; the photo is served back byte-identical to a signed-in user and refused (401) without a session
- two simultaneous submits of one invoice form = one invoice + 2 lines in Grist; totals stored as integer paise (305050 / 100000 / 205050); overpayment refused; final payment → paid; attendance and audit rows written
- **persistence**: a brand-new FlowHQ instance (nothing in memory) shows the same register totals, the patient record (prescription, photo, invoice, 2 payments, visit) and the photo
- no Grist doc id in any response
Setup notes learned: Grist needs `GRIST_IN_SERVICE=true` and a login method (production already has Google login); the FlowHQ API key's Grist user needs edit rights on the clinic doc. Not covered: Grist access rules (ACLs), Google login, upgrades of an existing live doc.

## Decisions made (defaults; easy to change)
Records in the existing clinic doc · both roles can create invoices/payments, only admins void · no tax unless `config/clinic.json` has a real rate · photos in Grist attachments · invoice numbers `GK-<year>-<6 digits>` restarting each year · leads relabelled Enquiries · split clinic hours left alone (Settings holds one window, so W13 could offer 1–4 PM slots; separate fix).

## Known limits / pending
Single FLOW HQ process assumed (locks are in-process). The register loads whole tables per request. No signature capture. No compliance claim: a privacy review is needed before real patient data. Not deployed.
