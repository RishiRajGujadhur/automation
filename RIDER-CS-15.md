# Advanced JetBrains Rider features for C# developers (RC1–RC15)

Fifteen Rider features after [DEBUG-20.md](DEBUG-20.md). The refactorings reuse the Roslyn providers the language
server already runs for Quick Actions (no second implementation); the rest add what Roslyn does not have headless.
Each is pushed on its own with a Settings ▸ Features switch, a native menu row and tests.

| # | Feature | From | Essential | Status |
| --- | --- | --- | --- | --- |
| RC1 | Refactor This | Rider | yes | ✅ 2026-10-20 |
| RC2 | Extract Method (Ctrl+Alt+M) | Rider | yes | ✅ 2026-10-20 |
| RC3 | Introduce Variable (Ctrl+Alt+V) | Rider | yes | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 RC1: Ctrl+Alt+Shift+T: only the refactorings at the caret or selection.
- 2026-10-20 RC2: Roslyn's Extract Method on the selection, applied directly.
- 2026-10-20 RC3: The selected expression into a new local.
