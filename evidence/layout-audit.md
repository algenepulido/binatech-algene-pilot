# Layout audit: clipped controls, overlapping content, keyboard, scrolling

Your four, checked on the two screens this pilot owns, at seven widths, in a real
browser. Measured rather than looked at, so you can repeat any line of it.

## Method

For every `button`, `a[href]`, `select`, `input`, `textarea` and `[role=button]`
on the page:

- **Clipped**: the control's own rectangle against the viewport. Anything with an
  edge outside it is reported.
- **Overlapping**: `document.elementFromPoint` at the centre of each control. If
  the point belongs to something that is neither the control nor inside it, the
  control is covered and a click would land somewhere else.
- **Horizontal scrolling**: `document.documentElement.scrollWidth` against
  `clientWidth`. Any difference is a page that scrolls sideways.

Widths: 1440, 1280, 1024, 900, 768, 428, 390.

## Result

| Screen | 1440 | 1280 | 1024 | 900 | 768 | 428 | 390 |
|---|---|---|---|---|---|---|---|
| Commercial Control | clean | clean | clean | clean | clean | clean | clean |
| Invoices | clean | clean | clean | clean | clean | clean | clean |

No clipped control, no covered control and no horizontal page scroll at any width
on either screen.

## Four candidates that were not defects

The first pass raised four. Each one is written down with what it actually was,
because a measurement that is wrong in your favour is worth no more than one that
is wrong against you.

1. **A 16 px control on the invoice rows.** The invoice reference is a 16 px text
   button, but it sits in a row that is itself the click target, 41 px tall, and
   the stacked card below 1024 behaves the same way. The target is the row, not
   the text.
2. **Section links running past the edge at 390 and 428.** They sit in a
   deliberately scrollable strip, `overflow-x-auto`, 503 px of content in 358 px
   of space. That is a scrolling row, not a clipped one, and the page itself does
   not scroll sideways.
3. **An invoice card reported as covered by the field navigation at 390.** An
   artifact of the probe clamping its sample point into the viewport for a card
   that was below the fold. There is no fixed bottom navigation on that route and
   nothing covers the card.
4. **The sidebar's Demo item reported as covered at 1024.** The item had scrolled
   out of the sidebar's own scroll container, so the sample point belonged to what
   was behind it. Confirmed by eye at 1024: Reports, Procurement, Settings and the
   footer all sit clear of one another.

## Keyboard

Covered by tests rather than by this sweep, and they run with the suite:

- Opening a line with Enter leaves focus on the row rather than pulling it into
  the inspector.
- Escape and Close return focus to the exact row that opened it, and B after A
  returns to B.
- Tabbing past the inspector's last control leaves it rather than being trapped,
  because a panel that never closes must not hold a keyboard user.
- The register's filter and scroll position survive the round trip.

## Not covered here

A physical phone. Emulation at 390 and 428, and WebKit at the iPhone frame, are
reported separately and are not offered as a substitute.
