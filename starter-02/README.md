# BinaTech v3 pilot — starter 02

**Design approved. The implementation is your deliverable.** This package supersedes starter 01.

It holds everything the pilot needs: the real BinaTech web application at one fixed commit (no
history), the approved design files, synthetic data, and a small **test service** that stands in for
the backend. Nothing in it connects to BinaTech, to a database or to anyone else. It runs on your own
machine with no account, key or internet service (except `npm ci` and the design viewers — see below).

```
ALGENE-PILOT-V3-STARTER-02/
  README.md          this guide
  design/            the approved design files (open in a desktop browser)
  source/            the runnable application, tooling, lockfile, test service, fixtures and tests
  SHA256SUMS.txt     SHA-256 of every file above
```

---

## 1. The pilot (accepted v3 scope)

Three pieces of work in the real application — no more, no less:

1. **Commercial Control UI/UX** (`src/views/CommercialHubView.jsx`) — page hierarchy, compact toolbar,
   table/list presentation, record selection and the contextual inspector layout. Keep every
   source-backed figure, filter, action and record identity. No new ledger, metric, calculation or
   relationship.
2. **Invoices UI/UX and the Invoice Edit lifecycle repair** (`src/views/InvoicesView.jsx`,
   `src/views/invoices/InvoiceForm.jsx`) — list and existing search/filter controls, rows, detail
   hierarchy and the Create/Edit form, with a consistent list → inspect → edit → return flow; and the
   repair of the existing Edit defect described in [section 6](#6-invoice-edit-reproduction).
   Keep the invoice API, financial behaviour and the accepted Drawer, confirmation and focus-return
   behaviour.
3. **A smaller mobile progress composer and in-place review**, opened from one additive action in the
   existing Capture sheet, sending only to the test service ([section 7](#7-test-controls-and-the-progress-report-test-service)).

Populated, loading, successful-empty and error states are part of the web work. The web pilot is
English-only; do not make application-wide language changes.

**Not in scope:** whole-app redesign, global navigation or theme rebuild, planning / My Day, a desktop
report inbox or review/clarification/history, document routing, report quantities or analytics,
Personalise or unrelated Field Home repairs, backend setup, schema/RLS/auth changes, real sync,
offline persistence, AI/voice/P6, native rewrite, app-store release, deployment.

## 2. How BinaTech is used (one-page orientation)

BinaTech joins site evidence to the commercial record of a construction project:

- **BoQ** (bill of quantities) lines describe the contracted work and its rates.
- **Field reporting** — people on site record progress and photos. A progress report is a site
  observation. It is not an inspection approval, a measurement, a certification or a payment
  decision, and it does not need a WIR.
- **WIR** (work inspection request) — an inspector accepts or rejects a piece of work. An approved
  WIR proves acceptance; it does not by itself establish a payable quantity.
- **NCR** (non-conformance report) — a recorded defect that can hold work back.
- **Commercial Control** — a read-only overview that shows the BoQ value, what inspection supports,
  what is blocked and why, and what has been certified in IPCs. It never certifies or pays.
- **IPC** (interim payment certificate) — the commercial decision on value for a period.
- **Invoices** — the client invoice register. An invoice should rest on certified value; ZATCA/Fatoora
  clearance is not connected in the app ("internal drafts"), and the screens say so.

Words matter here: *approved* (WIR), *certified* (IPC) and *paid* are different states. Do not merge
them, and do not invent compliance or payment claims in the UI.

## 3. Run it

Requirements: Node.js 20 or newer (the package was checked with Node 24 / npm 11) and a modern browser.

```bash
cd source
npm ci                      # installs exactly the pinned dependency versions from package-lock.json
cp .env.example .env        # non-secret placeholders; the upstream build refuses to start without them
npm run dev                 # http://localhost:5173 — opens on Invoices
npm test                    # all shipped tests (jsdom)
npm run build               # production build into dist/
npm run preview             # serves dist/ locally
```

`npm ci` downloads the dependencies from the public npm registry; the running app contacts nothing.
Never put a real URL, key or token in `.env`.

Useful pages (hash routes):

| Page | Route |
|---|---|
| Invoices (starts here) | `#/app/invoices` |
| Commercial Control | `#/app/commercialhub` |
| Field Home (phone/tablet width) | `#/app/quick` — Capture is the centre tab; "Record Site Progress" opens the same Capture sheet |
| Projects | `#/app/home` |

### Phone and tablet testing on your own device (private, local network only)

Reported test device (supplied by you, **not verified by BinaTech**): iPhone 13 Pro Max, iOS 18.7.8,
Safari, 428 px wide. Please also check 390 px and 768 px in a desktop browser's device mode.
A Galaxy S10+ is optional, not required.

1. Put the phone and the computer on the same private Wi-Fi.
2. Run `npm run dev -- --host` and note the "Network" address Vite prints (for example
   `http://192.168.1.20:5173`). Allow it through your computer's firewall if asked.
3. Open that address in Safari on the phone.
4. To add the synthetic test photos to the phone, open
   `http://<that address>/pilot-fixtures/synthetic-progress-1.jpg` (and `-2.jpg`, `-3.png`) and save them
   to Photos.

No public tunnel, hosted deployment or production access is needed or allowed. One limitation:
over plain `http://` on a LAN address, the phone browser is **not a secure context**, so
`crypto.randomUUID()` and `crypto.subtle` are unavailable there (they work on `localhost`). The
existing "Local draft" capture uses them and fails on the phone for that reason — an existing
limitation, not part of the pilot. Do not make the composer depend on them (for example, create the
`requestId` without `crypto.randomUUID()` or with a fallback). Nothing in this starter claims
physical-phone proof; that comes from your demonstration.

## 4. What is in `source/`

- **The real application at upstream commit `1955bf78152ae4e6f957985b2ad23dac3ee6ccaa`** (2026-09-30T15:08:00+03:00), restricted to the
  249 source files the signed-in application shell actually loads (computed from its
  import graph), plus 41 existing tests relevant to the pilot, the build/test
  configuration and the unchanged `package-lock.json`. The public marketing site, backend, scripts,
  deployment configuration, documentation, internal reports, unrelated public assets and brand font
  files are **not** included. There is no `.git` history.
- **Starter-only files** that isolate the app (listed with hashes in [section 10](#10-provenance)).
- **Packaging-only text changes** to some upstream files: real-organisation and demo names,
  tax-number-like values, internal service names and internal references were replaced with
  explicitly fictional text (listed in section 10). Application logic is unchanged.
  `CommercialHubView.jsx`, `InvoicesView.jsx` and `InvoiceForm.jsx` are byte-for-byte identical to the
  upstream commit.

### How isolation works

`index.html` loads `src/pilot/main.jsx`, which, in this order: creates the synthetic runtime, installs a
network guard, seeds the open project, mounts the test controls, and only then imports the real
providers and `AppShell`. `src/lib/supabase.js` — the app's single backend boundary — exports a strict
in-memory client instead of the real one; the real SDK is never imported. A Content-Security-Policy
(`vite.pilot-security.js`) only allows the page to talk to its own local server (hot reload: the exact
host that served the page). External requests are refused and logged, never sent.

## 5. Component map and what you may edit

| Area | File | Direct dependencies (read-only unless listed as editable) | External calls → starter boundary |
|---|---|---|---|
| Commercial Control | `src/views/CommercialHubView.jsx` — **editable** | `lib/useCommercialData.js`, `lib/controlRoom.js` (figures), `components/primitives.jsx`, `components/Drawer.jsx`, `lib/useIsMobile.js`, `lib/format.js`, `lib/theme.js` | reads via `useCommercialData`: BoQ, element links, WIRs, NCRs, IPCs, WIR evidence counts → synthetic reads |
| Invoices | `src/views/InvoicesView.jsx` — **editable** (presentation and the parent wiring the form lifecycle needs) | `components/{primitives,Drawer,Modal,ConfirmDialog,Toast,EmptyState,Attachments,InvoiceWirLinks}.jsx`, `api/invoices.js`, `api/ipcs.js`, `lib/auth.jsx`, `lib/excelExport.js` | list, Delete → synthetic invoices controller; IPCs; Export builds a local .xlsx |
| Invoice form | `src/views/invoices/InvoiceForm.jsx` — **editable** (lifecycle repair, Create/Edit layout) | `components/{Modal,primitives,StyledSelect,ElementPicker}.jsx`, `api/invoices.js` (`createInvoice`, `updateInvoice`), `api/wirs.js`, `lib/project.jsx`, `lib/elements.jsx`, `lib/invoiceExtract.js` | Save/Create → synthetic invoices controller; "Upload invoice / scan" (AI) → refused (no AI in the starter) |
| Mobile composer | **new** component file(s) in `src/components/capture/` — **editable** | existing image helper `lib/evidenceImagePreparation.js` (`prepareEvidenceImage`, read-only), `lib/currentProject.js` (`getCurrentProjectId`), `lib/auth.jsx` | send → `src/pilot/progressReports.js` (test service) |
| Composer entry | `src/components/capture/CaptureSheet.jsx` — **only the three additions below** | — | — |

### The Report progress entry (you build it)

`CaptureSheet.jsx` does not contain it yet. Add exactly one inert, additive entry — nothing else in the
sheet changes:

1. **Entry** — one "Report progress" action in the sheet's entry step, after the existing "Local
   draft" button (around line 305). It only sets a new step.
2. **Branch** — one render branch for that step next to the `'local'` branch (around line 310) that
   renders your composer.
3. **Title** — one title for the new step in the `headerTitle` map (around line 255).

Keep the existing flows exactly as they are: "Work progress" (WIR evidence), "Inspection request" and
"Local draft" keep their behaviour and their tests. Do not add a `data-capture-option` attribute or the
words "draft measurement" to the new action (existing tests pin both). **Do not carry the sheet's
selected WIR — or any other sheet state — into the composer**: the composer starts with Reference =
None, and only the reporter supplies a reference. Take the project id from `getCurrentProjectId()`
(`useProject().project` has no `id`). The sheet does not reset unknown steps on a project switch, so
give the composer its own lifetime and stale-result handling keyed on user and project. Duplicate-send
prevention, keeping edits on failure and ignoring late answers are part of your composer; the test
service does not do them for you.

**Read-only:** everything else — `AppShell.jsx`, navigation, shared `Drawer`/`Modal`/`ConfirmDialog`/
`primitives`, `api/*`, auth, roles/permissions, the existing image utilities and capture/offline
components (`LocalDraftCapture`, `localFieldDrafts`, `OfflineReferencePack`, `useWirEvidenceImage`),
`src/lib/supabase.js`, everything in `src/pilot/`, and the build/test configuration. If a change seems
to need one of these, raise it first.

**Tests:** add tests for your work; update an existing test only where it is directly about the files
you own (for example `src/views/commercialHubView.test.jsx`, `src/components/reviewReturn.test.jsx`,
`src/components/capture/*`). Do not weaken tests to get a green run.

## 6. Invoice Edit reproduction

Use a full page reload before each run (hot reload keeps component state).

1. `npm run dev`, open `http://localhost:5173` (it opens **Invoices** for *Synthetic Project P*).
2. Click **SYN-INV-A-0001** (or its "Open invoice" button). The drawer shows A: SAR 48,251, issued
   2026-08-10, Reported / Pending, linked to SYN-WIR-0002.
3. Click **Edit**. The modal is titled "Invoice SYN-INV-A-0001", but every field is empty or at its
   default (Invoice No. empty, Amount empty, ZATCA "Awaiting IPC", Payment "Not Issued").
4. Second example: reload; open A → Edit → type `STALE-1` into Invoice No. → **Cancel** → close the
   drawer (Escape) → open **SYN-INV-B-0002** → **Edit**. The title says B, but Invoice No. shows
   `STALE-1`.

Expected behaviour (from the accepted v3 brief): opening A shows A's existing values, including zero
and optional values (see **SYN-INV-Z-0003**: amount 0, no dates). Cancel sends no write and discards
abandoned edits; reopening shows the source values. Switching A to B shows B with its exact identity.
Ordinary re-renders do not overwrite typing. Save uses the existing caller with the correct id and
payload; failure keeps the edits and shows an error without claiming success; a repeated Save while
one is pending starts only one request; a late result for A cannot close, overwrite or mark B saved.
Create and the accepted opener/focus-return behaviour stay as they are.

The starter does **not** fix this. Its synthetic services do not add duplicate-click protection,
retries, stale-result guards or form-state handling. The test controls let you make Save fail or hold
it pending, so each case can be demonstrated.

**Known baseline behaviour (existing application, not starter faults):** the Edit defect above;
"New from IPC" does not pre-fill the amount (same cause); a save error can reappear on the next form;
"Link WIR" in the drawer reports that the link table is not set up (WIR links are not supported by
this isolated starter: it returns a simulated unavailable-table response, 42P01); evidence/attachment
upload, preview and download are unavailable (no storage); "Upload invoice / scan" is unavailable (no
AI service). At a 1280×860 window the Create/Edit modal is taller than the window, so its Save button
needs a scroll; at narrow widths the invoice table scrolls inside its own container. Both are the
existing layout, part of the UI work rather than starter faults.

## 7. Test controls and the progress-report test service

**Test controls.** A thin **STARTER** tab on the left edge (or Alt+Shift+P) opens a panel labelled as
test controls. It never edits application code. Choose how the synthetic services answer:

| Control | Options | Affects |
|---|---|---|
| Invoice reads | normal · error · hold | the invoice list read (Invoices page; also the form's duplicate check) |
| Commercial Control reads | normal · error · hold | the BoQ list read that drives Commercial Control |
| Invoice Save / Create | success · failure · hold | invoice update, create and delete |
| Progress-report test service | success · failure · hold | progress-report submissions |

"hold" keeps the operation pending until you press **success**/**failure** (or **answer**/**fail**) next
to it in the panel. Choices survive a reload (to see first-load states); data changes do not — fixtures
reset on every reload. The panel also shows counters and the latest calls (reads, writes with their
target id and payload, submissions, refused operations, blocked network attempts).
`globalThis.__pilotStarter.log.entries()` gives the full call log in the browser console. Pressing the
panel's buttons does not move keyboard focus out of the application, so focus-return behaviour can
still be checked; its scenario selects do take focus while you change them.

**Supported backend operations** (everything else is refused and logged — never answered with fake
empty data): the reads the real shell, Commercial Control, Invoices and the field screens make (see
`src/pilot/adapters/policy.js` for the exact table/filter/column list); invoice update, create and
delete through `src/pilot/adapters/controllers.js` (baseline-compatible CHECK/NOT NULL rules simulated;
changes are in memory only). Not available: storage, Edge Functions (AI, invites, model signing), RPC,
realtime, search, attachment writes, WIR-link writes, every other table. Sign-in is a labelled
synthetic session; "Log out" shows a small starter screen with a way back.

### The progress-report test service

`src/pilot/progressReports.js` (full contract and comments in `src/pilot/services/progressReportService.js`).
It is part of this starter, not a backend: nothing is delivered, uploaded or saved.

```js
import { submitProgressReport, FIELD_STATUS_LABELS } from '../../pilot/progressReports.js';

const receipt = await submitProgressReport({
  requestId,      // required — your identity for this request, used to match the answer to it
  projectId,      // required — getCurrentProjectId()
  reference,      // null, or { type: 'area' | 'work_item' | 'wir', id } with a fixture id of this project
  description,    // required — must contain text; sent exactly as typed (not trimmed)
  fieldStatus,    // required — 'in_progress' | 'blocked' | 'reported_complete'
  blockerNote,    // optional for every status (including 'blocked'); text or null
  photos,         // 0–3 items: the `candidate` objects from prepareEvidenceImage, unchanged
});
```

- **requestId** correlates the answer with the request. It is **not** an idempotency key: the test
  service does not de-duplicate, so the same `requestId` sent twice is two submissions. Preventing a
  second send while one is pending is the composer's job.
- **reference** is `null` (the default) or exactly `{ type, id }` — no label, no `null` id, no other
  fields. The id must be one of the fixture ids in [section 8](#8-synthetic-fixtures) **and** belong to
  `projectId`; anything else is refused. Show it as "Area · SYN-AREA-P-BAY-C", "Work item ·
  SYN-WI-0101" or "WIR · SYN-WIR-0003" — the label is derived at display time and never sent.
- **fieldStatus** is one of three values the reporter chooses explicitly (nothing pre-selected), shown
  as `FIELD_STATUS_LABELS`: In progress · Blocked · Reported complete. It is the reporter's statement,
  not an inspection result, measurement or approval.
- **photos** — pass exactly what the existing helper returns, with no second image pipeline:

  ```js
  import { prepareEvidenceImage } from '../../lib/evidenceImagePreparation.js';
  const prepared = await prepareEvidenceImage(file);           // file: the File the reporter picked
  if (prepared.ok) photos.push(prepared.candidate);            // else show prepared.error.code
  ```

  `prepared.candidate` is a `Blob`: the **very same `File` you passed in** when it is a JPEG or PNG of
  at most 3,000,000 bytes (its declared `type` may even be empty), or a new `File` with the same name
  and type `image/jpeg` / `image/png` when the helper had to re-encode a larger image. Its byte size is
  `candidate.size`, at most **3,000,000 bytes (inclusive)**. The test service checks the actual bytes
  (JPEG or PNG signature) and the actual size — not names or base64 strings. Do not send
  `{ name, bytes }` objects or data URLs.
- **Answers:**
  - success → `{ ok: true, simulated: true, requestId, projectId, reference, receipt: { id, receivedAt, photoCount, note } }`
    with `note` exactly **"Received by the test service. Not delivered to the project team."**
  - failure → rejects `SimulatedSubmissionError` (`requestId`, `projectId`, `code: 'SIMULATED_FAILURE'`)
  - invalid → rejects `ProgressReportContractError`
  - hold → stays pending until released in the test controls

Ready-made test contexts are exported as `PROGRESS_CONTEXTS`, and the valid reference ids as
`PROGRESS_REFERENCE_FIXTURES`.

## 8. Synthetic fixtures

All data is invented and labelled synthetic or fictional. Shapes and status values follow the
application's schema at the upstream commit (synthetic contracts, not proof of any live database state).

| Fixture | Key values |
|---|---|
| User | Pilot Reviewer (synthetic), `pilot.reviewer@example.invalid`, owner/admin of P, Q, E |
| Project P `11111111-…-111111111111` | Synthetic Project P — Pilot Warehouse (SYN-P): 6 BoQ lines + 1 heading, 6 WIRs (approved, pending, rejected, in progress), 1 open NCR, 2 IPCs (certified, draft), WIR evidence records |
| Invoice A | SYN-INV-A-0001 · SAR 48,250.50 · issued 2026-08-10 · due 2026-09-09 · Reported · Pending · WIR SYN-WIR-0002 · element syn-el-04 · IPC SYN-IPC-01 |
| Invoice B | SYN-INV-B-0002 · SAR 13,700 · issued 2026-09-01 · due 2026-10-01 · paid 2026-09-20 · Cleared · Paid · element syn-el-06 |
| Invoice Z | SYN-INV-Z-0003 · SAR 0 · no dates, WIR, element or IPC · Awaiting IPC · Not Issued |
| Project Q `22222222-…` (decoy) | SYN-INV-Q-0001 · SAR 99,999 · Rejected · Overdue; its own BoQ line, WIR and IPC — must never appear while P is open |
| Project E `33333333-…` (empty) | no invoices; BoQ rows are section headings only (Commercial Control shows its "no lines" state) |
| Progress references — Project P | area `SYN-AREA-P-BAY-C`, `SYN-AREA-P-ZONE-2-L1` · work item `SYN-WI-0101`, `SYN-WI-0102` · WIR `SYN-WIR-0001` … `SYN-WIR-0006` |
| Progress references — Project Q (decoy) | area `SYN-AREA-Q-01` · work item `SYN-WI-Q-0201` · WIR `SYN-WIR-Q-0001` — refused for a Project P report |
| Test photos | `synthetic-progress-1.jpg` (image/jpeg, 58,100 bytes, 1280×960, SHA-256 `3f9a8fd416a2ba8b89d6dc16ff33f3e7e837face6ca786fa6b84115725cca8eb`); `synthetic-progress-2.jpg` (image/jpeg, 58,906 bytes, 960×1280, SHA-256 `717d1853f5e8b52d7682054b4d8b08f5be8b0abb396c619ca61ee8ec03f1dcf2`); `synthetic-progress-3.png` (image/png, 17,628 bytes, 800×600, SHA-256 `25158cff0ccef78c74a932d8f78a361643acb820f46e100e0d7406d06b343445`) |

Switch projects with the project switcher at the top. The app's built-in sample project (fictional,
`SYN-SAMPLE`) is also listed there; it is not pilot data.

## 9. Designs — approved

The files in `design/` are the approved designs, byte-for-byte as exported:

| File | SHA-256 | What it is |
|---|---|---|
| `design/BinaTech Pilot Invoice Frames v1 Review.dc.html` | `db0858d0d9ecd06673f2239413c7b1a4e20cf9691bc525f6cb4706c2a9b66aba` | Approved Invoices frames (register, detail, Create/Edit, pending/error, states, 1440–768) |
| `design/BinaTech Pilot Progress Composer v1 Review.dc.html` | `adfdf88786d1b08b78649bcd1b3f5914c99cdfa29a5bc0f4d9ad7d00046a1a5e` | Approved mobile composer, review and test-service states (390/428/768) |
| `design/BinaTech Commercial Room v5.dc.html` | `1b163846106642fd8b46c22c85395190b102c14203cb1d6a1cb8fea13ab2b27d` | Commercial Control visual reference (apply to existing content only) |
| `design/support.js` | `8fe7df74405f3c55f49b7249c74ea1397e65d07dea2b1bd3b4a489bec2e28cbe` | Shared viewer runtime for the three boards (identical copy used by all) |

**Opening them.** Open a `.dc.html` file in a desktop browser **with an internet connection**. These are
design viewers, separate from the application: `support.js` loads React 18.3.1, ReactDOM 18.3.1 and
Babel standalone 7.29.0 from `unpkg.com`, and Commercial Room v5 also loads IBM Plex Sans/Mono from
Google Fonts. They are not offline or self-contained, and they are not covered by the app's network
guard. The application in `source/` stays isolated and loads none of them.

The boards still show their review-stage wording ("proposed, not approved", reviewer notes, a control
bar). The copies here are the versions the owner approved; that wording is not a status. Control bars,
reviewer notes, "Jump/Prefill" buttons, sample-photo buttons and the live payload preview are design
demonstrators, not app controls, and their sample names and data are fictional.

### Invoices — "Pilot Invoice Frames v1"

| Frame id | Viewport | Implements in source |
|---|---|---|
| `pilot-invoices-1280` / `-1440` | 1280, 1440 | `InvoicesView` register page: header actions Refresh · Export · New from IPC · New invoice; the four summary values with the existing formulas (Total invoiced = Σ amount; Paid = Σ amount where Paid; Outstanding = Σ amount where Pending or Overdue; ZATCA cleared = count Cleared) |
| `invoice-register` | ≥ 1024 | the eight columns: `invoice_number` · linked WIR (`wir_number`, else `element_guid`) · `issue_date` · `due_date` · `amount` · `zatca_status` · `payment_status` · `paid_date` |
| `invoice-register-stacked` | 768 | the same row data stacked with labels |
| `invoice-detail` | all | the existing 520 px `Drawer`: statuses, amount, dates, linked WIR, element, compliance rows, `InvoiceWirLinks`, `Attachments`, Edit and Delete (Delete keeps its confirmation) |
| `invoice-create` | all | `InvoiceForm` in the existing 600 px `Modal`, create mode: defaults Awaiting IPC / Not Issued; "Scan and pre-fill" disabled (no AI in the pilot) |
| `invoice-edit-a` | all | edit mode showing an invoice's own values (your lifecycle repair delivers this) |
| `invoice-edit-b` | all | edit mode with a zero amount and empty optional dates (see SYN-INV-Z-0003) |
| `invoice-form-pending` | all | "Saving…" with the footer buttons disabled while the save is pending |
| `invoice-form-save-error` | all | inline save error with every entry kept |
| `invoice-register-loading` · `-empty` · `-error` | all | the list's loading, genuinely empty and read-error (Try again) states |
| `pilot-invoices-1024` / `-768` | 1024, 768 | tablet layouts of the same web UI |

Fields are the existing ones only: `invoice_number` (required), contractor (read-only, from the
project), `element_guid`, `wir_number`, `amount` (zero is valid), `issue_date`, `due_date`, `paid_date`,
`zatca_status` (Awaiting IPC · Reported · Cleared · Rejected), `payment_status` (Not Issued · Pending ·
Paid · Overdue). **No persistent Notes:** invoices have no notes field, so saved invoices show no Notes
section. The note that "New from IPC" passes is an annotation for creation only, never a saved field.
The "invoiceable now" banner appears only when the existing calculation (certified or paid IPC net
total minus invoiced total, floored at zero) is positive.

### Mobile — "Pilot Progress Composer v1"

| Frame id | Viewport | Implements in source |
|---|---|---|
| `capture-sheet-reference` | 390, 428, 768 | the existing `CaptureSheet` unchanged, plus the one additive "Report progress" action ([section 5](#5-component-map-and-what-you-may-edit)) |
| `pilot-progress-compose` | 390, 428, 768 | your composer: project from context (not editable); Reference None / Area / Work item / WIR (default None); Description (required, kept as typed); Status (required, none pre-selected); Blocker note (optional); Photos 0–3 with Remove and inline size/count messages |
| `pilot-progress-review` | 390, 428, 768 | in-place review of exactly what will be sent; Send to test service / Back to edit |
| `pilot-progress-pending` | 390, 428, 768 | "Sending…": Send and Back to edit disabled until the test service answers |
| `pilot-progress-error` | 390, 428, 768 | not sent: everything kept; Retry sends the same report, Back to edit returns to the form |
| `pilot-progress-ack` | 390, 428, 768 | the fixed text "Received by the test service. Not delivered to the project team." and Done |

The payload is the contract in [section 7](#the-progress-report-test-service). The board's live payload
preview is a demonstrator (it shows photos as name/size and a short project id); send the real
`prepareEvidenceImage` candidates and the real `getCurrentProjectId()` value instead.

### Commercial Control — reference "Commercial Room v5"

Commercial Room v5 is the visual direction for `CommercialHubView`: a three-part layout (context on the
left, the register in the centre, a persistent inspector on the right), selecting a row opens its
detail in place, compact toolbar, density, typography and the colour rule (no green unless a
certificate exists). Apply it **only to what the screen already shows**:

- the summary strip: BoQ value · Inspection-approved (WIR) · Blocked · Certified in IPC (or "Not
  available" when no certificate records were returned);
- the section links: Certification Queue · Control Room · IPCs · Cash flow (existing routes only);
- "Needs attention": the derived blocker reasons with line count and value, each opening the
  Certification Queue filter it already uses;
- the BoQ lines register with its status filters (All · No blocker signal · Partly blocked · Blocked ·
  Review needed · No recorded activity) and search, columns BoQ · Description · Unit · BoQ value ·
  Inspection-approved (WIR) · Blocked · Status · Main blocker · WIRs;
- the line inspector (today the shared `Drawer`): value breakdown, open blockers, linked WIRs, "Open in
  Certification Queue";
- the existing loading, error (Retry), project and demo states.

**Excluded — mock content of the board that the source does not have:** saved/pinned views and scope
filters, the Table · 2D · 3D · Evidence modes and the model viewer, the Exec · Meas · Elig · Claim · Cert
ladder columns and ladder-gap figures, blocked value by package / age / four weeks, controlled actions,
audit records, internal comment threads, decision modals, role switching and any metric, action or
relationship not produced by `CommercialHubView` today. Do not add calculations or claims.

## 10. Provenance

- Upstream: BinaTech web application, commit `1955bf78152ae4e6f957985b2ad23dac3ee6ccaa` (2026-09-30T15:08:00+03:00), exported without
  history. Every file under `source/` not listed below is byte-identical to that commit.
- Starter 02 supersedes starter 01 (an internal preparation build). Changes from 01: the approved
  designs and this guide; the progress-report test service now follows the approved payload (exact
  status values, project-scoped fixture references, the actual image-helper output, the fixed
  acknowledgement text) with matching fixtures and tests.
- This package is a development baseline, not a security-approved hosted build. The scans run on it
  (credentials, endpoints, network calls, identifiers, symlinks) are checks, not a certification.

**Starter-only files (new or replacing an upstream file):**

| File | Change | SHA-256 |
|---|---|---|
| `.env.example` | replaces/changes upstream file | `972b9b5693b1632895858fdfd168e2cce87e051af2c11ef99d50afbd0232b073` |
| `.gitignore` | replaces/changes upstream file | `979042f5484e3a41d3fe91c85cabc1dbca6420c71f1e9d5ad828399435e43d7e` |
| `index.html` | replaces/changes upstream file | `501f5c7180e6c6a6cafa462b92ffa36d98fc63c8fbb540367ced1e5ab553ee05` |
| `package.json` | replaces/changes upstream file | `74e0f1cbfa0e88d6748e3e9d9d5b7041ed6a3b6426eec0ccc7d39e6b6c13d2b1` |
| `public/pilot-fixtures/synthetic-progress-1.jpg` | new | `3f9a8fd416a2ba8b89d6dc16ff33f3e7e837face6ca786fa6b84115725cca8eb` |
| `public/pilot-fixtures/synthetic-progress-2.jpg` | new | `717d1853f5e8b52d7682054b4d8b08f5be8b0abb396c619ca61ee8ec03f1dcf2` |
| `public/pilot-fixtures/synthetic-progress-3.png` | new | `25158cff0ccef78c74a932d8f78a361643acb820f46e100e0d7406d06b343445` |
| `src/lib/supabase.js` | replaces/changes upstream file | `8d0f38865e952fbb14c209a53b39dec25c025740325d42868e1dc8289f26a764` |
| `src/pilot/adapters/callLog.js` | new | `1e3c9883245c67758eb90399869d5e3aeba5866f37f73a43a8c3fef390a1f8a7` |
| `src/pilot/adapters/controllers.js` | new | `a32db091320c922ca6bbbbf4f8fb5d6b7764bb474c09c93f5de3a2796f847770` |
| `src/pilot/adapters/policy.js` | new | `78ed6506c2d8fbbc2301ef46ab7627f420e37eefd1822814d511034dcec63934` |
| `src/pilot/adapters/strictSupabase.js` | new | `af1d41942676008b22e57871c9433c06ab91f558d7dbacc5b935b5ab9ca51199` |
| `src/pilot/adapters/syntheticAuth.js` | new | `addbc1a6e647ac6a2808d7955a245d426dff47d5fc058c93213bd02cb716f948` |
| `src/pilot/browserState.js` | new | `b3fe71b362dc3d2116f5b3ed627c441c060788cebe4c7deabbc740a948281075` |
| `src/pilot/controls.js` | new | `316ba3cf865150872260e146622558c357f099afd35a5a3a913c7e5ba1f05920` |
| `src/pilot/fixtures/data.js` | new | `5f24f5a7557cc5a085ec75f28f0c8ee3d36985fe06fa3c696e03fecb8f8c54a1` |
| `src/pilot/fixtures/images.js` | new | `d70bf90fada9b0586c77a6060bead18d424e4812d98415fc945676fd1cb36c0d` |
| `src/pilot/fixturesAndServices.test.js` | new | `735ae021b6d576c3bf0e03fde5ec98d71110f6b1cd5b53d2bb08c51bfc20a1b6` |
| `src/pilot/main.jsx` | new | `cd6203bdaac9c201e7d148872a31d8ae506ce3334e2dacbdde632c8d29ccb96e` |
| `src/pilot/mountApp.jsx` | new | `237e2e36d1a23004c28a8196d9968d79ace525f6cc02a4248d3c3d8f0c9427d2` |
| `src/pilot/networkGuard.js` | new | `ef53dd4f877fc7ae40ddd73aa4cb4cdd93c6b68f76e46b9ed3831382277e1bc2` |
| `src/pilot/progressReports.js` | new | `a07a670d686e8b3fb6eaf5e4114617b2551d2180c0d93b49540399e17e00c4db` |
| `src/pilot/runtime.js` | new | `a96263ce5721c2031dca64f50d797d7d026798bf998571c89b19d03b21ef9de6` |
| `src/pilot/scenarios.js` | new | `ae4f7adaf7a455ae27f7b76e4c81fe5b6f13c722d9e3f8fdc12d26d3b139d7cf` |
| `src/pilot/services/progressReportService.js` | new | `df3b81d3c12c336af4198b74fe6db044a8180e58286a57af79a888bbe59f7c4c` |
| `src/pilot/starterIsolation.test.js` | new | `6af298c6ebcb2e6da8a8769f2c31a83e2c38830213e11217923f86425152fb57` |
| `vite.config.js` | replaces/changes upstream file | `bad653314e73e575a8084b7f57a4f9c64291f3ca9fe5cc466093dc6f57d666d2` |
| `vite.pilot-security.js` | new | `b52fd2b6e05edf12aacf23244802e936216b579d931b9a484ad0760f26368bea` |

**Upstream files with packaging-only text replacements** (fictional names, placeholders and comments;
no logic change):

| File | Replacements | Kind | SHA-256 upstream → package |
|---|---|---|---|
| `src/api/invites.js` | 1 | comment/placeholder rewrite | `d3bc145b8db561be…` → `5f95e48a1a9ed5cb…` |
| `src/api/projects.js` | 4 | names/placeholders | `4be91e0a38547600…` → `9402c1509b901d21…` |
| `src/components/MobileNav.jsx` | 1 | comment/placeholder rewrite | `45ac8186a83aaa13…` → `04b6f512a99fcbdc…` |
| `src/components/capture/captureSheetRender.test.jsx` | 2 | names/placeholders | `fafcb5ed31b69f5f…` → `a283d0bf11138a7b…` |
| `src/components/sidebarFocusIsolation.test.jsx` | 1 | names/placeholders | `136c323bc6603102…` → `083e03eac21aa65f…` |
| `src/components/sidebarInformationArchitecture.test.jsx` | 2 | comment/placeholder rewrite, names/placeholders | `dbfc98478a55b2a1…` → `f48257bc445b82c6…` |
| `src/data/documents.js` | 65 | names/placeholders | `30c80fe518dd7860…` → `57f6d779f135b550…` |
| `src/data/finance.js` | 92 | names/placeholders | `fc4c0424cc24f855…` → `6d69df9a7a42a6dd…` |
| `src/data/project.js` | 6 | names/placeholders | `19ad45ca0dde7f5f…` → `ba41c971f4f22ff8…` |
| `src/data/quality.js` | 85 | names/placeholders | `0ee7080141574332…` → `613d99a65c7a6311…` |
| `src/lib/config.js` | 5 | comment/placeholder rewrite, names/placeholders | `d907df43441b96a5…` → `b138665c46b23356…` |
| `src/lib/controlRoom.js` | 1 | names/placeholders | `41cbf9723aedfc41…` → `02642f6e470a115d…` |
| `src/lib/currentProject.js` | 4 | comment/placeholder rewrite, names/placeholders | `8dd7ca181d9dfc61…` → `8b095592d172bbab…` |
| `src/lib/evidenceImagePreparation.test.js` | 1 | comment/placeholder rewrite | `0362512de56e1ee6…` → `017a69e99854bfb7…` |
| `src/lib/evidencePacks.js` | 14 | names/placeholders | `522f46119c0162d1…` → `91bed60387204f97…` |
| `src/lib/fieldTokens.js` | 1 | comment/placeholder rewrite | `45851865cd18576e…` → `2b0cafe7dda9540f…` |
| `src/lib/guideTourContent.js` | 1 | comment/placeholder rewrite | `dabc3b61a0eb9bd1…` → `2ed6812fe74494d3…` |
| `src/lib/ipaReconciliationData.js` | 4 | comment/placeholder rewrite, names/placeholders | `fd4d5682bce1d328…` → `08a4f4dc8b22609c…` |
| `src/lib/ipcGate.js` | 1 | names/placeholders | `f17964e2b2871167…` → `fbd6cde7a65f1533…` |
| `src/lib/labels.js` | 2 | comment/placeholder rewrite | `415d13c5a134d26f…` → `588afadf2ecfdf1c…` |
| `src/lib/projectScope.test.js` | 2 | names/placeholders | `f437a343783c4eb8…` → `6dc42dc371d94858…` |
| `src/lib/r2.js` | 4 | comment/placeholder rewrite, names/placeholders | `368f30d85a154965…` → `ba7bdb57662e0e86…` |
| `src/lib/recoveryQueue.js` | 18 | names/placeholders | `3a2b333415409fda…` → `e0b0f7af59c3b9c2…` |
| `src/lib/wirMetadata.js` | 1 | names/placeholders | `c4769f2d68ae1522…` → `80c9ae1874cb0e2b…` |
| `src/views/ApprovalMatrixView.jsx` | 1 | comment/placeholder rewrite | `af12d28bcffdb053…` → `5e4e5b73195a2719…` |
| `src/views/commercialHubView.test.jsx` | 2 | comment/placeholder rewrite, names/placeholders | `f96111e26799a44c…` → `d2242bd2a21237eb…` |
| `src/views/dms/DocForm.jsx` | 1 | names/placeholders | `51b5c388c25088bd…` → `400dafcd7f9b84c8…` |
| `src/views/ncrs/NcrForm.jsx` | 1 | names/placeholders | `ce773451fa5d468a…` → `91e85a101427b93e…` |
| `src/views/pos/PoForm.jsx` | 3 | names/placeholders | `229c9468dd1b31a4…` → `ec492fb05b2c345e…` |
| `src/views/projects/ProjectsHome.jsx` | 2 | comment/placeholder rewrite | `71f5a32c615eec89…` → `e7e908cf615945d7…` |
| `src/views/qc/QcForm.jsx` | 1 | names/placeholders | `b9033d607f737030…` → `a7760b882963558c…` |
| `src/views/snagging/SnagForm.jsx` | 2 | names/placeholders | `03458a86ad5dc236…` → `cd3c7c1a77cd7440…` |
| `src/views/wirs/WirDetail.jsx` | 1 | names/placeholders | `68708ad2ef38b31d…` → `1b938f08c8af3954…` |
| `src/views/wirs/WirForm.jsx` | 1 | names/placeholders | `22b100abf9902cda…` → `5f3e77af24fac6e7…` |
| `src/views/wirs/useWirEvidenceImage.test.js` | 1 | comment/placeholder rewrite | `ca551fc7d1f9b2a6…` → `88d57a4d0d512a20…` |
| `vite.config.js` | 1 | names/placeholders | `4a844f8271c98e3e…` → `bad653314e73e575…` |

## 11. Third-party software

Dependencies are installed by `npm ci` from `package-lock.json` (unchanged); their own licence files
stay in `node_modules/` after installation. Runtime dependencies and the licences recorded in the
lockfile: react / react-dom (MIT), lucide-react (ISC), @supabase/supabase-js (MIT — installed but not
used by the starter), three (MIT), exceljs (MIT), xlsx 0.18.5 (Apache-2.0), @fontsource IBM Plex Sans /
Mono / Sans Arabic and Familjen Grotesk (SIL OFL 1.1, installed via npm), web-ifc 0.0.57 (no licence
field in the lockfile; see its package). No font files from any machine are included. Web fonts that
the app requests from Google Fonts are refused by the starter's security policy, so the browser uses
the npm-installed fonts and system fallbacks. The design viewers' public dependencies are listed in
[section 9](#9-designs--approved).

## 12. Delivery evidence and open decisions

Evidence expected at each checkpoint (from the accepted brief): actual source changes with exact
commits; before/after comparisons on the same synthetic records; tests that fail on the supplied
original Invoice defect and pass after the repair, plus mobile editor/review tests (identity,
Cancel/back, pending duplicate prevention, failure retention, late-response isolation); test and build
results; web review at 1280/1440 px with regression at 768/1024 px; mobile at 390/768 px plus one agreed
physical phone; run instructions and honest limitations. The test service is not real integration;
local success is not a deployment claim.

Still to be agreed separately (not decided by this package): the start date and the 30 October date;
whether consolidated feedback within two working days can be committed; any repository access (none is
needed to use this package).
