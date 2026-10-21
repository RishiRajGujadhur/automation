# GUI ease of use (Visual Studio 2026 and VS Code style)

Workbench improvements that make the studio feel like VS Code and Visual Studio 2026. Each one has an e2e test in
`test-authoring-studio/tests/e2e/gui-qol.spec.ts` and works in the web app and the desktop app.

| # | Status | Improvement | Like |
| --- | --- | --- | --- |
| G1 | [x] | Resize the panel with a sash (drag, arrow keys); the size is remembered; double-click or Enter resets it; the editors make room | VS Code sash |
| G2 | [x] | Maximize Panel Size / Restore Panel Size button in the panel bar | VS Code |
| G3 | [x] | Layout controls in the title bar: Toggle Primary Side Bar, Toggle Panel, Toggle Secondary Side Bar | VS Code title bar |
| G4 | [x] | Activity bar badges: pending Git changes, failed tests | VS Code |
| G5 | [ ] | Index status in the status bar (rescan on click); the Explorer gets the full height | VS Code / Visual Studio background tasks |
| G6 | [ ] | Back and Forward buttons beside the search box | VS Code command center |
| G7 | [ ] | Double-click an editor tab to maximize the editor (side bar and panel hidden); again to restore | VS Code |

## Progress log
- 2026-10-21: G1, G2.
- 2026-10-21: G3. Toggle Panel hides the panel without stopping its tool windows (a terminal keeps its shell). Fixed on the way: a terminal whose page closed without stopping it kept its PowerShell running (and its folder locked) until eight more were opened; the server now stops it 15 s after the last listener leaves.
- 2026-10-21: G4. The Git status poll moved into a shared store (`src/git/statusStore.ts`): the status bar and the badge use one poll.
