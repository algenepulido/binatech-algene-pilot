# Commands and results

Review commit `185c585` on `pilot/w1-commercial-control`.
Run from `starter-02/source` with Node v22.22.2, npm 10.9.7, on 9 October 2026.

Every number below is the output of the command above it, not a summary of it.

## Install, exactly as shipped

```
$ npm ci

added 369 packages, and audited 370 packages in 5s
```

## The invoice work, against the source exactly as supplied

Reverts the two repaired view files to `origin/main`, runs the invoice tests,
restores the repair and runs them again. git only, so nothing is left behind. It
refuses to run on a dirty tree.

```
$ work/demo/red-green.sh

 BEFORE - the two files exactly as the starter shipped them
 2 files changed, 27 insertions(+), 138 deletions(-)
      Tests  29 failed | 5 passed (34)

 AFTER - the repair restored, nothing else changed
      Tests  34 passed (34)

Tree clean. Nothing left behind.
```

## The composer, against its state before the slot repair

Reverts `ProgressComposer.jsx` to `2899b58`, the commit before a photo was made to
take its slot at pick time, and runs the capture tests.

```
$ git checkout 2899b58 -- src/components/capture/ProgressComposer.jsx
$ npx vitest run src/components/capture/
      Tests  4 failed | 80 passed (84)

$ git checkout HEAD -- src/components/capture/ProgressComposer.jsx
$ npx vitest run src/components/capture/
      Tests  84 passed (84)
```

## The whole suite

```
$ npx vitest run
      Tests  813 passed (813)
   Duration  24.57s
```

The starter shipped 762. 

One caveat worth knowing before you run it. `src/lib/evidenceImagePreparation.test.js`
has a test, "20,000,001 bytes to SOURCE_TOO_LARGE", that allocates a 20 MB source
against vitest's default 5 second timeout. On a loaded machine the allocation alone
can pass it, and the run then reports 812 of 813. It failed on roughly half the
full runs here today, a clean clone among them, and passed on the run above. That
file on its own passes 68 of 68 every time:

```
$ npx vitest run src/lib/evidenceImagePreparation.test.js
      Tests  68 passed (68)
```

It came with Starter-02 in `31aafb8`, it is not in the files this pilot owns, and
it is not touched here. A one line `testTimeout` on that file settles it whenever
you want it settled.

## Build

```
$ npm run build
✓ 1855 modules transformed.
✓ built in 22.42s
```

## Nothing left behind

```
$ git status --porcelain
(no output)
```

## Widths, measured rather than eyeballed

`document.documentElement.scrollWidth` against `clientWidth` at each width, in a
real browser. Captures are in `evidence/after/`.

```
commercial-control  1440px  horizontalOverflow=false  (scroll 1440 vs client 1440)
commercial-control  1280px  horizontalOverflow=false  (scroll 1280 vs client 1280)
commercial-control  1024px  horizontalOverflow=false  (scroll 1024 vs client 1024)
commercial-control   768px  horizontalOverflow=false  (scroll  768 vs client  768)
invoices            1440px  horizontalOverflow=false  (scroll 1440 vs client 1440)
invoices            1280px  horizontalOverflow=false  (scroll 1280 vs client 1280)
invoices            1024px  horizontalOverflow=false  (scroll 1024 vs client 1024)
invoices             768px  horizontalOverflow=false  (scroll  768 vs client  768)
```

## The four states, forced through the starter's own controls

Each scenario is selected by its own key in the control panel, never by position:
Invoice reads and Commercial Control reads are separate scenarios, and setting the
wrong one leaves the screen looking normal. Captures are in `evidence/states/`.

```
state commercial error       alert=1 status=0 retry=1
state commercial loading     alert=0 status=1 retry=0
state commercial populated   alert=0 status=0 retry=0
state commercial empty       alert=0 status=0 retry=0
state invoices read error    alert=1 status=0 retry=1
state invoices loading       alert=0 status=1 retry=0
state invoices populated     alert=0 status=0 retry=0
```

A read failure carries an alert and a way back. A genuinely empty register carries
neither, so the two can never be mistaken for one another.
