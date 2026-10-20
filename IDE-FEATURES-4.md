# Visual Studio 2026 and JetBrains Rider features: fourth batch (Y1–Y100)

Goal: 100 more IDE features that none of the earlier batches has, each pushed on its own, in the web and desktop apps.
Earlier batches: [RIDER.md](RIDER.md) (J1–J62), [VS2026-PARITY.md](VS2026-PARITY.md), [IDE-FEATURES.md](IDE-FEATURES.md)
(X1–X200) and the quality-of-life list [QOL-50.md](QOL-50.md) (QL1–QL100).

Every feature gets a switch under **Settings ▸ Features** (`src/features.ts`). **Essential** means Visual Studio 2026
has it on by default, so the desktop app starts with it on. The others start off on the desktop and on in the web app.

| # | Feature | From | Essential | Status |
| --- | --- | --- | --- | --- |
| Y1 | URL Encode / Decode (Edit ▸ Convert) | Rider | no | ✅ 2026-10-20 |
| Y2 | Base64 Encode / Decode (Edit ▸ Convert) | Rider | no | ✅ 2026-10-20 |
| Y3 | Escape / Unescape C# String | Rider | no | ✅ 2026-10-20 |
| Y4 | HTML Encode / Decode | Rider | no | ✅ 2026-10-20 |
| Y5 | Increment / Decrement Number | Rider | no | ✅ 2026-10-20 |
| Y6 | Insert Sequence at carets | Rider | no | ✅ 2026-10-20 |
| Y7 | Toggle Quotes | Rider | no | ✅ 2026-10-20 |
| Y8 | Join Lines with Separator… | Rider | no | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 Y1: Percent-encodes the selection (or line) and decodes it.
- 2026-10-20 Y2: UTF-8 Base64 of the selection, and back.
- 2026-10-20 Y3: Escapes quotes, backslashes and control characters for a C# literal, and back.
- 2026-10-20 Y4: Entities for < > & and quotes, and numeric entities when decoding.
- 2026-10-20 Y5: The number at each caret changes by one; zero padding kept.
- 2026-10-20 Y6: 1, 2, 3… at several carets, or counting on from a selected number.
- 2026-10-20 Y7: The string at the caret switches between double and single quotes.
- 2026-10-20 Y8: The selected lines joined with a separator you choose.
