# Billington demo assets

These are real, unmodified Billington app screenshots copied from the existing local Billington project on 2026-09-05. No source project files were changed. Each copied file was verified byte-for-byte against its original using SHA-256.

| Demo file | Original source path | Dimensions |
| --- | --- | --- |
| `home.png` | `screenshots/raw/iphone_6_9/01_landing.png` | 1320 × 2868 |
| `split.png` | `screenshots/raw/iphone_6_9/02_participants_recents.png` | 1320 × 2868 |
| `receipt.png` | `screenshots/raw/iphone_6_9/04_bill_entry_empty.png` | 1320 × 2868 |
| `items.png` | `screenshots/raw/iphone_6_9/07_custom_split.png` | 1320 × 2868 |
| `share.png` | `screenshots/raw/iphone_6_9/08_bill_summary.png` | 1320 × 2868 |

Source paths are relative to the [Billington repository](https://github.com/LLRHook/checksinmyhead).

## Visible content and recommended copy

- `home.png`: Billington landing screen with Quick Split, Tabs, and Recent Bills. Recommended headline: **Good times. Fair shares.** Supporting copy: **Split bills with friends, without creating accounts.**
- `split.png`: Four named participants (Victor, Alice, Bob, Charlie), recent people, and a continue action. Recommended headline: **Bring your people.** Supporting copy: **Add your crew and get straight to the split.**
- `receipt.png`: Bill-entry screen showing Scan Receipt, subtotal, tax, and tip controls. It is an empty entry screen, not a successful OCR result or a receipt photograph. Recommended headline: **Let the receipt do the typing.** Supporting copy: **Scan a receipt to fill in the details, or enter them yourself.**
- `items.png`: Real custom-split dialog with percentage sliders for a Pasta item. Recommended headline: **Your share. Your way.** Supporting copy: **Split evenly or choose a custom percentage for each person.**
- `share.png`: Itemized $79.38 Bill Summary with tax, 18% tip, individual shares, and Share action. Recommended headline: **Know who owes what.** Supporting copy: **See each person's total and share the breakdown.**

## Feature evidence

The source project's `README.md` describes account-free group bill splitting, shared links, tabs for multiple bills, receipt OCR, per-person totals, and settlements. `docs/technical-overview.md` describes receipt image capture and parsing of items, prices, tax, tip, and totals. The screenshots directly demonstrate participants, receipt entry, custom percentages, tax and tip, and individual shares.

Do not claim instant or perfect OCR, payment processing, automatic transfers, bank integrations, usage counts, ratings, or App Store availability based on these assets. Billington displays payment methods and links; the assets do not establish that it moves money itself.

## Source quality notes

All five included images are 1320 × 2868. Their original iOS status bars and Dynamic Island remain intact. The source folder also contains `05_bill_entry_filled.png` and `06_item_assignment.png` at only 368 × 800; those were intentionally excluded from the large-format demo. Empty tab/history screens were also excluded. The old `screenshots/final` images already include promotional treatments and should not be used as raw phone-screen assets.
