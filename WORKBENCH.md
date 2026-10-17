# Workbench: Visual Studio 2026 / JetBrains Rider 2026 features — progress

Status: ✅ done · 🟡 in progress · ⬜ to do

| # | Feature | Status |
| --- | --- | --- |
| K1 | Open Project/Solution by browsing: native file dialog on desktop (every entry point), a folder / solution browser in the web dialog (drives, up, double-click a .sln / .slnx / .csproj) | ✅ |
| K2 | Output window (Visual Studio): one Output tab in the bottom panel with **Show output from** Build / Tests / Debug / Language service / Studio, clear, word wrap, auto-scroll | ✅ |
| R1 | Search Everywhere (Rider): Shift twice opens Go to All, which shows recent files with an empty query and finds actions (every command palette entry) besides files, types, members and features | ✅ |
| R2 | Recent Files (Ctrl+E) and Recent Locations (Ctrl+Shift+E, with the code line), Ctrl+E toggles between them | ✅ |
| R3 | Navigate Back / Forward (Rider Ctrl+Alt+← / →, Visual Studio Ctrl+- / Ctrl+Shift+-) across files, to the exact line, feature files included | ✅ |
| R4 | Bookmarks: toggle (Ctrl+K Ctrl+K), list and jump | ⬜ |
| R5 | Local History: a snapshot on every save, diff and revert (independent of Git) | ⬜ |
| R6 | TODO window: TODO / FIXME / HACK comments across the solution | ⬜ |

## Progress log
- 2026-10-17 — **Open by browsing (K1).** Desktop: the Start Window, command palette and menu all open the native Open Project/Solution dialog (`window.desktop.openSolution`, IPC to the main process's existing picker, which opens the solution). Web: `/api/fs/browse` lists folders and solution / project files (drives on Windows, parent folder); the Open Project/Solution dialog shows them with Up, a drive list, click to enter a folder or pick a file, double-click to open, and Open this folder. Test: `tests/e2e/solution-open.spec.ts` (browse and double-click).
- 2026-10-17 — **Output window (K2).** View ▸ Output (Build menu on the web, View menu on desktop, Ctrl+Alt+O, command palette, bindable): a third tab of the bottom panel next to Build and Debug, docked at the bottom or on the right. **Show output from:** Build, Tests, Debug, C# language service (new server log: start, ready time with projects and documents, stderr, exit), Studio (every notice, timestamped). Clear all (per source), word wrap, copy, scroll to end; auto-scroll pauses while you read earlier lines. Test: `tests/e2e/vscode.spec.ts`.
- 2026-10-17 — **Rider navigation (R1–R3).** `src/navHistory.ts` records cursor jumps (another file or more than 10 lines) from both editors (with the line's code) and active tabs; Back / Forward reopen the file and put the cursor on the line through a reveal event the C# and Gherkin editors both handle. `RecentPopup` lists recent files / locations with filtering and keyboard navigation. Search Everywhere: a double Shift (no other key in between) opens Go to All with recent files first and an Actions group. Test: `tests/e2e/vscode.spec.ts`.
