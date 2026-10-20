# Advanced Visual Studio 2026 and JetBrains Rider features (Z1–Z20)

Twenty larger features after the fourth batch ([IDE-FEATURES-4.md](IDE-FEATURES-4.md)), each pushed on its own, in the
web and desktop apps, each with a Settings ▸ Features switch and tests.

| # | Feature | From | Essential | Status |
| --- | --- | --- | --- | --- |
| Z1 | Inline Git blame (caret line) | VS 2026 | yes | ✅ 2026-10-20 |
| Z2 | Merge conflict actions | VS 2026 | yes | ✅ 2026-10-20 |
| Z3 | Stage Selected Lines | VS 2026 | yes | ✅ 2026-10-20 |
| Z4 | Postfix templates (C#) | Rider | no | ✅ 2026-10-20 |
| Z5 | Preview Expanded Outline | Rider | yes | ✅ 2026-10-20 |
| Z6 | Test history | VS 2026 | yes | ✅ 2026-10-20 |
| Z7 | Test Explorer: Run Repeatedly | Rider | no | ✅ 2026-10-20 |
| Z8 | Reformat feature files on save | Rider | no | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 Z1: Who last changed the caret's line, when and the commit summary, at its end.
- 2026-10-20 Z2: Conflict blocks coloured with Accept Current / Incoming / Both; Next Merge Conflict.
- 2026-10-20 Z3: Stages only the hunks on the selected lines (git apply --cached).
- 2026-10-20 Z4: expr.var / .if / .notnull / .foreach … then Tab rewrites the expression.
- 2026-10-20 Z5: The scenarios an outline runs, shown without changing the file.
- 2026-10-20 Z6: Details show a test's last 10 outcomes and its pass rate.
- 2026-10-20 Z7: Runs the selected tests n times; per-test pass counts flag flaky tests.
- 2026-10-20 Z8: Ctrl+S formats the feature (indentation, tables) before saving.
