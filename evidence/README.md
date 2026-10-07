# Evidence

Captured on the synthetic records the starter ships with, so a before and an after
are the same records in both.

| Folder | What |
|---|---|
| `before/` | Commercial Control and Invoices at 1440, 1280, 1024 and 768, with the three view files reverted to the source as supplied |
| `after/` | the same screens, same widths, with this branch |
| `composer/` | the progress composer at 390 and 768: compose, review, not sent, receipt |
| `states/` | the states forced through the starter's own test controls: loading, read error, genuinely empty |
| `commands.md` | every command run and what it printed |

## What these are not

These are browser viewports. **None of them is a device check.** The agreed check on
a physical iPhone 13 Pro Max in Safari has not been done, and the composer frames
here do not stand in for it.

The composer has also been driven over a LAN origin rather than localhost, where
`isSecureContext` is false and `crypto.randomUUID` is absent, which is the phone's
condition and the reason the request id is not built with that API. That is still
not a device check.
