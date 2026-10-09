# Running this, from nothing

Written for someone who has never opened this repository. Every command below was
run from a clean clone on 9 October 2026 and the output quoted is what it printed.

It sits in `evidence/` rather than at the root because the root files are not in
the set of files this pilot was given to change. Move it wherever you want it.

## What you have

```
starter-02/     the pilot package you supplied, with its own README
  source/       the app
  design/       the pinned frames
  SHA256SUMS.txt
evidence/       before and after screens, the forced states, commands and results
```

Read `starter-02/README.md` as well. It is yours, it is the authority on what is
editable, and nothing here replaces it.

## Run it

Node 22 and npm 10. This was run on Node v22.22.2, npm 10.9.7.

```
git clone --branch pilot/w1-commercial-control <repo> app
cd app/starter-02/source
cp .env.example .env
npm ci
npm run dev
```

**The `cp` is not optional.** The build refuses to start without
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, by your own design, so a clone
without it fails like this:

```
BinaTech is not configured.
Missing: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
```

The values in `.env.example` are deliberately unusable. The host is `.invalid`,
which can never resolve, `src/lib/supabase.js` is a synthetic in-memory client, and
the network guard and the page's Content Security Policy block outbound requests.
No account, no key and no backend is needed to run any of this. Never put a real
value in that file.

Then open `http://localhost:5173`.

## What you should see

**Client Invoices.** Commercial, then Client Invoices. The four cards read
SAR 61,950.50, SAR 13,700.00, SAR 48,250.50 and 1 / 3, and the rows beneath them
read 13,700.00, 48,250.50 and 0.00. The card and the row agree, which is the thing
that was wrong. Open SYN-INV-A-0001, then Edit, and the amount field holds
48,250.5. Save and reopen it and it still does.

**Commercial Control.** Commercial, then Commercial Control. At 1024 wide and up,
clicking a line opens a panel that stays beside the register rather than a dialog
over it, and focus stays on the row you opened. Press Escape and focus returns to
that same row. Below 1024 the shared drawer opens exactly as it always did.

**Report progress.** Narrow the window to a phone width, or open the dev server
from your phone with `npm run dev -- --host` and the Network address it prints.
Capture, then Report progress. Type something, pick a status, Review, then Send.
The receipt says "Received by the test service. Not delivered to the project team."
That sentence is the point: nothing here reaches a backend, and nothing claims to.

## Seeing the defects for yourself

One command. It reverts the two repaired view files to what you supplied, runs the
invoice tests, restores the repair and runs them again. It uses git only, refuses
to run on a dirty tree, and leaves nothing behind.

```
$ work/demo/red-green.sh

 BEFORE - the two files exactly as the starter shipped them
      Tests  29 failed | 5 passed (34)

 AFTER - the repair restored, nothing else changed
      Tests  34 passed (34)

Tree clean. Nothing left behind.
```

The composer repair is the same idea against one file:

```
$ git checkout 2899b58 -- src/components/capture/ProgressComposer.jsx
$ npx vitest run src/components/capture/
      Tests  4 failed | 80 passed (84)
$ git checkout HEAD -- src/components/capture/ProgressComposer.jsx
$ npx vitest run src/components/capture/
      Tests  84 passed (84)
```

## The whole suite and the build

```
$ npx vitest run
      Tests  813 passed (813)

$ npm run build
✓ 1855 modules transformed.
✓ built in 14.9s
```

You shipped 762 tests. One of them, "20,000,001 bytes to SOURCE_TOO_LARGE" in
`src/lib/evidenceImagePreparation.test.js`, allocates a 20 MB source against
vitest's default 5 second timeout and times out on a loaded machine. It failed on
roughly half the full runs here today, the clean clone among them. On its own that file
passes 68 of 68 every time. It is yours, it is untouched, and a one line
`testTimeout` settles it. An 812 of 813 is that, not something broken here.

## What is deliberately not here

No backend, no schema, no auth and no credentials. No deployment. No offline
storage or sync, no AI, no voice, no 360. No native build. No global theme or
navigation change. The shared Drawer, Modal and primitives are untouched. Below
1024 Commercial Control is still your drawer.

`evidence/offline/feasibility.md` records what the app does offline today and the
smallest safe next step, measured rather than estimated. It changes nothing.

## Where the work is

```
src/views/InvoicesView.jsx              the register, the summary, the detail
src/views/invoices/InvoiceForm.jsx      the edit lifecycle repair
src/views/CommercialHubView.jsx         the inspector panel
src/components/capture/ProgressComposer.jsx   the mobile composer
src/components/capture/CaptureSheet.jsx       its entry point, 4 changes
```

Tests sit beside what they cover. `evidence/commands.md` holds every command with
its output, and `evidence/rounding/worked-example.md` holds the rounding inputs,
the expected totals and the one derivation rule still open.
