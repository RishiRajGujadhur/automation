# Advanced Visual Studio 2026 debugging features for C# (DB1–DB20)

Twenty debugger features after [CSHARP-20.md](CSHARP-20.md), on the studio's netcoredbg (Debug Adapter Protocol)
session: breakpoint management, execution control, variable inspection and visualizers. Each is pushed on its own, with
a Settings ▸ Features switch and tests that drive a real debugging session of `samples/Calculator`.

| # | Feature | From | Essential | Status |
| --- | --- | --- | --- | --- |
| DB1 | Breakpoints window: search | VS 2026 | yes | ✅ 2026-10-20 |
| DB2 | Breakpoint labels | VS 2026 | yes | ✅ 2026-10-20 |
| DB3 | Breakpoints window: hit counts | VS 2026 | yes | ✅ 2026-10-20 |
| DB4 | Disable breakpoint once hit | VS 2026 | yes | ✅ 2026-10-20 |
| DB5 | Dependent breakpoints | VS 2026 | yes | ✅ 2026-10-20 |
| DB6 | Conditional breakpoints: when changed | VS 2026 | yes | ✅ 2026-10-20 |
| DB7 | Force Run to Cursor | VS 2026 | yes | ✅ 2026-10-20 |
| DB8 | Call Stack: Step Out to Here | VS 2026 | yes | ✅ 2026-10-20 |
| DB9 | Function breakpoints | VS 2026 | yes | ✅ 2026-10-20 |
| DB10 | Just My Code | VS 2026 | yes | ✅ 2026-10-20 |
| DB11 | Edit values while debugging | VS 2026 | yes | ✅ 2026-10-20 |
| DB12 | Search in Locals | VS 2026 | yes | ✅ 2026-10-20 |
| DB13 | Text / JSON / XML visualizers | VS 2026 | yes | ✅ 2026-10-20 |
| DB14 | IEnumerable visualizer (table) | VS 2026 | yes | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 DB1: Filters breakpoints by file, line, condition, log message or label.
- 2026-10-20 DB2: Labels in Breakpoint Settings, shown as chips and searchable.
- 2026-10-20 DB3: How many times each breakpoint was hit in the session.
- 2026-10-20 DB4: The breakpoint unchecks itself after its first hit.
- 2026-10-20 DB5: Only enabled after another breakpoint is hit; re-armed for the next session.
- 2026-10-20 DB6: Stops only when the condition's value differs from the previous hit.
- 2026-10-20 DB7: Ctrl+Shift+F10 runs to the caret without stopping at breakpoints.
- 2026-10-20 DB8: Steps out until the chosen frame is on top.
- 2026-10-20 DB9: Stops in a method by name (setFunctionBreakpoints).
- 2026-10-20 DB10: Toolbar switch for the next session's justMyCode.
- 2026-10-20 DB11: Double-click a Locals value to set it (DAP setVariable).
- 2026-10-20 DB12: Filters Locals by name, value or type.
- 2026-10-20 DB13: String values opened as text, formatted JSON or indented XML.
- 2026-10-20 DB14: A collection's items as rows and their members as columns.
