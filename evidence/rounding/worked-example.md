# Invoice rounding: worked example

Recorded before changing anything, as you asked. Inputs, what the screen showed,
what it should show, and the one rule I still need from you.

## Inputs

Project SYN-P, the invoice fixtures shipped in Starter-02
(`starter-02/source/src/pilot/fixtures/data.js`).

| Invoice | Stored amount | Payment status |
|---|---|---|
| SYN-INV-A-0001 | 48250.5 | Pending |
| SYN-INV-B-0002 | 13700 | Paid |
| SYN-INV-Z-0003 | 0 | Not Issued |

Certified IPC SYN-IPC-01, net payable 186300.

## Expected totals

| Figure | How it is reached | Expected |
|---|---|---|
| Total Invoiced | 48250.5 + 13700 + 0 | SAR 61,950.50 |
| Paid | 13700 | SAR 13,700.00 |
| Outstanding | 48250.5 + 0 | SAR 48,250.50 |
| Invoiceable now | 186300 - 61950.5 | SAR 124,349.50 |

## What the screen showed

Read out of a real browser at 1440 wide, not out of a test.

| Figure | Before | After |
|---|---|---|
| Total Invoiced | SAR 61,951 | SAR 61,950.50 |
| Paid | SAR 13,700 | SAR 13,700.00 |
| Outstanding | SAR 48,251 | SAR 48,250.50 |
| Invoiceable now | SAR 124,350 | SAR 124,349.50 |
| Row for SYN-INV-A-0001 | 48,250.50 | 48,250.50 |

The last two rows are the point. The Outstanding card said SAR 48,251 directly
above a row that said 48,250.50. One screen, two answers, one invoice.

`before-1440.png` and `after-1440.png` in this folder are those two screens.

## The cause

The cards, the invoiceable banner and the certified IPC picker read the app's
shared `fmt` helper in `src/lib/format.js`, which rounds to the whole riyal. The
rows read a two decimal formatter. Same stored values, two formatters.

The stored value was never wrong. The edit form already carried 48,250.5, and a
save already sent 48250.5 to the service. Nothing was being written rounded, so
this is a reporting defect and not a data defect.

## What changed

Only the figures on the Invoices screen. `fmt` itself is untouched, because every
other screen in the app reads from it and the summary cards elsewhere are meant to
read at a glance.

Four regression tests cover it in `src/views/invoices/invoiceRegisterStates.test.jsx`.
They fail on the previous code and pass on this one.

One existing test was also corrected rather than added to. The Invoice Edit
lifecycle file was using 48251 as invoice A's stored amount instead of the real
48250.5. A fixture already rounded to the riyal cannot fail on a rounding defect,
so that file was not covering the decimal path at all. It now carries 48250.5, and
a new test follows the half riyal from the field, through the save, to a reopen.

## The rule I still need from you

On the call you raised a second thing, and it is not the same question as the
decimals: the amount coming off the WIR and the BOQ item, "if 10% is approved, an
item worth 100,000, we're going to be paid 10,000".

Today an invoice amount is typed and stored. The WIR and BOQ links evidence it.
They do not compute it. Making them compute it is a different change, and three
answers decide what it would do:

1. Does the invoice amount become a computed figure from the certified percentage
   of each linked BOQ item, or stay a typed figure that the links only evidence?
2. If computed, is each line rounded and then summed, or summed and then rounded,
   and to how many decimals is each held?
3. Does VAT at 15% apply to the rounded total or the unrounded one?

Worked through your own example, an item of 100,000 at 10% is 10,000.00 either
way. It only separates once a BOQ rate carries halalas, which is where the
difference between the three answers starts to show on a certificate.

Give me 1, 2 and 3 and I will build to them. Until then nothing about the
derivation is being changed.
