# WIR and BOQ: one worked example

Separate from the decimal formatting, as you asked. Nothing here is built and no
business rule is changed. Input quantities, the rate, what the app does today and
what I propose, so you can say yes or correct it in one reply.

All figures are Project SYN-P from the starter fixtures
(`starter-02/source/src/pilot/fixtures/data.js`), so you can check every line.

## Inputs

| BOQ | Description | Unit | Qty | Rate | Line value | Approved (WIR) |
|---|---|---|---|---|---|---|
| SYN-01.010 | Blinding concrete C15 | m3 | 120 | 310.00 | 37,200.00 | 120 |
| SYN-01.020 | Raft concrete C40 | m3 | 640 | 520.00 | 332,800.00 | 300 |
| SYN-01.030 | Reinforcement B500B | t | 85 | 3,900.00 | 331,500.00 | 40 |
| SYN-02.010 | Precast columns 500x500 | nr | 48 | 7,200.00 | 345,600.00 | 12 |
| SYN-02.020 | Roof membrane | m2 | 2,400 | 95.00 | 228,000.00 | 0 |
| SYN-02.030 | Cladding panels | m2 | 1,800 | 240.00 | 432,000.00 | 600 |

## Current result

**The invoice amount is typed. It is not derived from anything.**

`SYN-INV-A-0001` stores **48,250.50**. It carries a link to `SYN-WIR-0002`, and
that WIR records 300 m3 of SYN-01.020 approved, at a rate of 520.00, which is
**156,000.00** of work.

Nothing in the app connects those two numbers. The WIR link is evidence sitting
beside the amount, not the source of it. That is the whole question, and it is why
it is not a formatting matter.

## Proposed result

Take the amount from what the WIR actually approved:

**approved quantity x rate, held to 2 decimals per line, summed, then VAT on the sum.**

| BOQ | Approved x rate | Amount |
|---|---|---|
| SYN-01.010 | 120 x 310.00 | 37,200.00 |
| SYN-01.020 | 300 x 520.00 | 156,000.00 |
| SYN-01.030 | 40 x 3,900.00 | 156,000.00 |
| SYN-02.010 | 12 x 7,200.00 | 86,400.00 |
| SYN-02.020 | 0 x 95.00 | 0.00 |
| SYN-02.030 | 600 x 240.00 | 144,000.00 |
| | **Net** | **579,600.00** |
| | VAT at 15% | 86,940.00 |
| | **Total** | **666,540.00** |

## Why it has to be the quantity and not the percentage

On the call you described it as a percentage: 10% approved on an item worth
100,000 is 10,000. That is true, and at 10% of 100,000 both methods give exactly
10,000.00, which is why the choice looks like it does not matter.

It starts to matter as soon as a percentage does not land on two decimals. Take
the same six lines and work from a percentage rounded to 2 decimals instead:

| BOQ | Percentage | Percentage x line value | Against quantity x rate |
|---|---|---|---|
| SYN-01.020 | 46.88% | 156,016.64 | +16.64 |
| SYN-01.030 | 47.06% | 156,003.90 | +3.90 |
| SYN-02.030 | 33.33% | 143,985.60 | -14.40 |
| | **Net** | **579,606.14** | **+6.14** |
| | Total with VAT | 666,547.06 | **+7.06** |

Two defensible readings of the same certified work, 7.06 apart on one
certificate. On a real BOQ with hundreds of lines that becomes the number your
client's QS disputes.

The quantity is the measured fact the WIR records. The percentage is a reading of
it. Deriving money from the reading rather than the fact is where the difference
comes from, so the proposal takes the quantity and shows the percentage for
information only.

## What I need from you

One line back:

1. **Yes to the proposal**, or tell me the rule you use instead.
2. If the invoice amount becomes derived, does the user still get to override it,
   and does an override have to be visible as an override?
3. VAT on the summed net, as above, or per line?

Until you answer, nothing about this changes. The invoice amount stays typed and
the WIR and BOQ links stay evidence, exactly as they are today. It does not hold
up the UI, the tests or the phone evidence.
