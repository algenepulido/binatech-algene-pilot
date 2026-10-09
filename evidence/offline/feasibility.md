# Offline: what happens today, and the smallest safe next step

Measured, not estimated. Chromium at an iPhone sized viewport against this branch
on 9 October 2026, driving the app the way a field user does. Nothing was
implemented and nothing was changed to produce this note.

## What survives, and what does not

| Case | Result |
|---|---|
| Type a report, close the capture sheet, reopen it in the same session | The report is still there |
| Type a report, reload the page | **Gone.** The fields come back empty |
| No network, then open the app | **The app does not load at all.** `ERR_INTERNET_DISCONNECTED`, the browser's own error page |
| App already open, network lost, then report and send | Runs end to end and shows a receipt |

The last row is the one worth being careful about. It works because the pilot's
test service never touches the network, so losing the network changes nothing for
it. The receipt says so on its face: "Received by the test service. Not delivered
to the project team." That green result proves nothing about a real backend, and
nothing here should be read as the app already working offline.

## Why the app does not open offline

There is no service worker and no web app manifest, so nothing of the app is
cached on the device. Every load fetches the shell from the network. That is the
first wall, and it sits in front of everything else: a report queued on the device
would be unreachable, because the screen that holds it never opens.

## What the device does keep today

Only preferences, and nothing belonging to any record:

`bimqc.currentProjectId`, `bimqc.currentProjectMeta`, `bimqc.projects.cfg`,
`bimqc.projects.views`, the field quick actions, table column widths, the QS lock
and the getting-started dismissal. All localStorage.

No WIR, no invoice, no progress report and no photo is written to the device at
any point.

## One piece that already exists

`src/lib/offlineReferencePack.js` writes a reference pack to IndexedDB
(`bimqc-offline-reference`), scoped per user and per project, schema versioned,
with its own validation and error codes. It is mounted from `AppShell.jsx`.

It carries reference data down to the device. The direction that is missing is the
other one: work captured on the device, held, and sent later. The storage pattern,
the scoping and the schema discipline for that already exist in this file and would
be followed rather than invented.

## The smallest safe next step

**Make the draft survive, before anything is queued or synced.**

Persist the in-progress report to IndexedDB under the same user and project scoping
the reference pack already uses, restore it when the composer opens, and clear it
once a receipt is confirmed. No queue, no retry, no background sync, no service
worker, nothing shared touched.

It is small, it is contained inside the composer, and it answers the failure a site
engineer actually hits: a phone that dies, an app the OS discards, a tab closed by
accident after ten minutes of typing in the sun. Today all of that is lost.

Two things it does not do, on purpose:

- It does not make the app open offline. That needs a cached shell, which is a
  build level, app wide change and its own decision.
- It does not make anything send later. That needs the backend's contract for
  accepting a report twice without duplicating it.

If you want the full direction afterwards, the order that keeps each step
shippable on its own is: draft that survives, then a cached app shell, then an
outbox with idempotent retry. The composer already derives its request id from the
report's content, so an unchanged retry carries the same id and an edited one
carries a new one. That is the property an outbox needs, and it is already there.

## Two things to decide before any of it is built

**Photos.** Up to 3 per report, each from a source of up to 20 MB. IndexedDB holds
blobs, but on iOS the quota is not guaranteed and storage can be evicted. A draft
that silently loses its photos is worse than one that never claimed to hold them,
so the rule has to be chosen rather than discovered: hold the prepared image rather
than the camera original, and say plainly what is held.

**A held report must never look sent.** It is your own rule and it matters most
here, because the gap between "saved on this phone" and "the office has it" is
exactly where a site engineer stops checking.
