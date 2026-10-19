# Desktop quality-of-life improvement backlog

Reviewed 2026-10-18 against source revision `f61994c`. Implementation started 2026-10-19. The progress log below records verified deliveries; unlisted items remain proposals. Priorities are recommendations: P1 protects work or removes recurring friction; P2 improves everyday workflows; P3 is optional polish. Each row defines a user outcome and a checkable completion condition. Source references identify the implementation area, not proof that every proposed interaction has been exhaustively tested.

## Implementation progress

| Item | Status | Implementation and verification |
| --- | --- | --- |
| DQ22 | Done — 2026-10-19 | Desktop state is flushed to a temporary file and atomically renamed, retaining a valid `.bak`. Startup recovers from malformed primary JSON; reset also clears the fallback. Verified: interrupted replacement/corruption regression, packaged recovery of zoom and watcher preferences, both TypeScript checks. |
| DQ33 | Done — 2026-10-19 | Pending rescan timers are cancelled on workspace replacement, stop, disable and watcher errors. Generation checks ignore late callbacks/errors from old watchers. Verified: four deterministic unit regressions, desktop typecheck, rebuilt packaged app and a real-filesystem disable/re-enable test. |
| Settings interface (additional user request) | Done — 2026-10-19 | VS Code-style settings workbench with a full-width search header, categories, User scope, Workspace shortcut, vertically arranged controls, multi-keyword search, results count, clear action and Ctrl+F. Escape clears a search before closing. Verified: four web settings scenarios, production build and 31 packaged desktop tests (two opt-in screenshot tests skipped); desktop screenshot visually inspected. This does not complete DQ24's desktop-only preference controls. |

## How the app works

The Windows Electron shell serves the shared React studio and runs its Express API inside the main process. The preload exposes a restricted desktop bridge. Self-contained Roslyn helpers provide scanning and language services; netcoredbg provides debugging. Running a user's tests still requires a compatible .NET SDK. Workspace settings and desktop state live in the OS user-data directory.

The shell owns native menus, windows, tray integration, recent repositories, notifications, deep links, browser installation and diagnostics. Authoring, test discovery, recording, Spy, Git and terminal panels are shared with the web app. Shared UI improvements should therefore remain available in both hosts; Windows integration belongs in the desktop shell.

Already present: persisted window bounds and zoom, recent/pinned repositories, last-page restoration, auto-rescan, background notifications and Do Not Disturb, startup retry, crash dialogs, settings import/export, autosave and recovery drafts, test playlists and Run Failed, terminal tabs, and extensive Rider-style navigation. This backlog extends these capabilities rather than treating them as missing. See [the existing desktop plan](test-authoring-desktop/PLAN.md), [completed workflow work](QOL-PROGRESS.md) and [Rider features](RIDER.md).

## 1. Startup and prerequisites

Source: [startup](test-authoring-desktop/src/main/main.ts), [browser installation](test-authoring-desktop/src/main/browsers.ts), [diagnostics](test-authoring-desktop/src/main/diagnostics.ts).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ01 | P1 | Add a prerequisite checklist before the first test run: distinguish bundled scanning tools from the SDK required to execute tests. | A machine without an SDK can index a repository; Run explains the missing SDK with a recheck action before starting a doomed run. |
| DQ02 | P2 | Show elapsed time and the active project during startup/indexing, extending the existing stage labels. | A long scan displays its current stage and elapsed time without inventing a percentage. |
| DQ03 | P1 | Offer a recovery launch that skips reopening the last workspace. | A broken or unavailable saved repository can be bypassed to reach the Start Window without editing configuration files. |
| DQ04 | P2 | Give Chromium installation an in-app progress panel with cancellation and retry. | Users can inspect download output, cancel the child process and retry from the same panel. |
| DQ05 | P2 | Show the expected browser version, cache location and usable installation state. | A missing executable is distinguished from a usable install, and the displayed cache folder can be opened. |
| DQ06 | P2 | Explain startup failures with a concise diagnosis and expandable technical details. | Port, permission and missing-resource failures each offer a relevant next action while retaining Copy details and Open log. |

## 2. Workspace switching and recents

Source: [workspace handling](test-authoring-desktop/src/main/workspace.ts), [desktop store](test-authoring-desktop/src/main/store.ts), [Start Window](test-authoring-studio/src/StartWindow.tsx).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ07 | P1 | Unify the Start Window and native menu recent lists. | Opening, pinning or removing a solution in one surface immediately updates the other after restart as well. |
| DQ08 | P2 | Keep unavailable recent locations visible with Locate and Remove actions. | A disconnected drive does not silently hide its entry; locating a moved repository updates that entry. |
| DQ09 | P2 | Add optional workspace nicknames and show the full path on demand. | Two repositories with the same folder name can be distinguished in recents and the title. |
| DQ10 | P1 | Offer Save All, Keep Drafts and Cancel before switching repositories. | Switching with dirty buffers preserves them or saves them successfully before changing the active workspace. |
| DQ11 | P2 | Make multi-window workspace sharing explicit. | A second window identifies the shared workspace, and a repository switch updates all window titles and content consistently. |
| DQ12 | P2 | Scope restored pages to the selected solution as well as its directory. | Two solution files in one directory each restore their own last page. |

## 3. Drafts and safe recovery

Source: [autosave and draft keys](test-authoring-studio/src/editor/autosave.ts), [window lifecycle](test-authoring-desktop/src/main/main.ts), [settings reset and restart](test-authoring-desktop/src/main/settingsIO.ts).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ13 | P1 | Include workspace identity in draft and session-edit keys, which currently use the file string. | Editing the same relative file path in two repositories never offers the other repository's draft. |
| DQ14 | P1 | Add a recovery inbox listing all retained drafts. | After a crash, users can preview, restore, export or discard each draft without reopening files one by one. |
| DQ15 | P1 | Make draft-storage failures visible. | Simulated full or blocked storage produces a persistent recovery warning and an Export buffer action instead of silently losing the safety copy. |
| DQ16 | P1 | Provide a three-way merge for external save conflicts. | Users can compare the loaded base, disk version and current buffer, resolve changes and save using the latest disk hash. |
| DQ17 | P1 | Route Restart through the same save and active-task checks as normal quit. | Restart from settings cannot bypass a dirty-buffer decision or abandon a recording without a clear choice. |
| DQ18 | P1 | Offer draft export before clearing web data. | The clear-data dialog shows the number of affected drafts and lets users export them before confirming removal. |

## 4. Settings that are easier to move and trust

Source: [settings import/export](test-authoring-desktop/src/main/settingsIO.ts), [JSON store](test-authoring-desktop/src/main/store.ts), [native preferences menu](test-authoring-desktop/src/main/menu.ts).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ19 | P1 | Validate imported setting types and format versions before applying them. | Unsupported versions and invalid values produce readable field errors and leave the current settings intact. |
| DQ20 | P2 | Preview an import and choose desktop, studio and workspace sections separately. | Users can import appearance preferences without replacing their current repository configuration. |
| DQ21 | P1 | Back up settings before import/reset and offer one-step restoration. | A failed or regretted import can restore the previous valid configuration after restart. |
| DQ22 | P1 | Save desktop state atomically with a last-known-good fallback. | An interrupted write does not turn a valid preferences file into an empty configuration on the next launch. |
| DQ23 | P2 | Offer a portable export that omits machine-specific paths and recents. | The export preview names the omitted fields and can be used on another computer without referencing the original user's folders. |
| DQ24 | P2 | Add searchable desktop preferences with restart-required badges. | Searching for hardware acceleration, tray or notifications reveals the setting and whether its change has taken effect. |

## 5. Background work and notifications

Source: [status polling](test-authoring-desktop/src/main/status.ts), [notifications](test-authoring-desktop/src/main/notify.ts), [browser install notifications](test-authoring-desktop/src/main/browsers.ts), [watcher](test-authoring-desktop/src/main/watcher.ts).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ25 | P2 | Add an in-app notification history for messages missed while away. | Completion and failure messages remain reviewable with timestamps and their original destination. |
| DQ26 | P2 | Support notification preferences by event type and temporary snooze. | Users can suppress successful runs for an hour while retaining failure notifications, then automatically restore their preferences. |
| DQ27 | P1 | Route browser-install notifications through the shared Do Not Disturb policy. | Installing Chromium with Do Not Disturb enabled creates no OS notification but retains an in-app result. |
| DQ28 | P2 | Link test completion notifications directly to the corresponding run. | Clicking an older notification opens that run's results rather than merely focusing whichever page is active. |
| DQ29 | P1 | Bound status requests and prevent overlapping polling. | An unresponsive API creates one offline transition and no accumulating requests; recovery clears the stale state. |
| DQ30 | P2 | Coordinate taskbar progress across simultaneous work. | A browser download finishing does not erase the progress of an ongoing scan or test run; the selected task is named in-app. |

## 6. Indexing and resource use

Source: [repository watcher](test-authoring-desktop/src/main/watcher.ts), [startup/workspace scan](test-authoring-desktop/src/main/workspace.ts), [diagnostics](test-authoring-desktop/src/main/diagnostics.ts).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ31 | P1 | Show when automatic watching fails and offer manual refresh or retry. | A watcher error leaves a visible stale-index indicator with an actionable recovery control. |
| DQ32 | P2 | Allow workspace-specific watcher exclusions. | A generated source folder can be excluded without disabling changes from the rest of the repository. |
| DQ33 | P1 | Cancel pending rescan timers when changing workspace or stopping the watcher. | An event from repository A cannot trigger a delayed refresh after repository B becomes active. |
| DQ34 | P2 | Detect solution and build-configuration changes beyond the current four watched extensions. | Editing a `.slnx`, `.props` or `.targets` file schedules the appropriate project refresh once. |
| DQ35 | P2 | Expose a pause-and-resume indexing control with accumulated-change status. | Bulk generation can pause rescans, show that changes are pending and perform one refresh on resume. |
| DQ36 | P2 | Calculate diagnostic folder sizes asynchronously and cache the result. | Opening System Information remains responsive with a large traces folder and labels an incomplete size calculation. |

## 7. Windows, navigation and external tools

Source: [window bounds](test-authoring-desktop/src/main/windowState.ts), [windows](test-authoring-desktop/src/main/main.ts), [deep links](test-authoring-desktop/src/main/protocol.ts), [external tools](test-authoring-desktop/src/main/tools.ts).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ37 | P2 | Clamp restored window size as well as position to the current display. | Moving from a large monitor to a smaller one keeps the title bar and resize controls reachable. |
| DQ38 | P2 | Restore secondary-window layout independently. | Closing and reopening a two-window session restores both bounds and pages without overwriting the primary window state. |
| DQ39 | P2 | Extend copy-link navigation to a repository, file and line. | Opening a copied link selects the intended workspace/file/line, with a useful message when the local path is unavailable. |
| DQ40 | P1 | Queue cold-start links until the renderer is ready instead of relying on an 800 ms delay. | A slow startup still opens the requested destination exactly once. |
| DQ41 | P2 | Report invalid deep links and include newer destinations such as Spy. | Copying a supported current page yields a round-trippable link; malformed links show an explanation without crashing. |
| DQ42 | P2 | Detect external editors and let users browse to their executable. | A missing preferred editor produces a clear fallback notice; a configured executable works even when it is absent from PATH. |

## 8. Testing and debugging workflow

Source: [Test Explorer](test-authoring-studio/src/testing/TestExplorer.tsx), [test state](test-authoring-studio/src/testing/store.ts), [debug panel](test-authoring-studio/src/debug/DebugPanel.tsx).

Existing discovery, outcome icons, durations, cancellation, playlists and Run Failed form the baseline here. These proposals add context and persistence around them.

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ43 | P2 | Add a persistent run timeline with repository and revision labels. | Relaunching retains recent run summaries and makes results from an older revision distinguishable. |
| DQ44 | P2 | Compare two runs to highlight new failures, recovered tests and duration changes. | Selecting two recorded runs produces a per-test comparison, including added and removed tests. |
| DQ45 | P2 | Save named run profiles for project, filter, environment and run settings. | A profile can be selected and reviewed before execution without re-entering its options. |
| DQ46 | P2 | Explain discovery failures beside the empty test tree. | A failed discovery shows the relevant command/error and Retry; a successful discovery with no tests has different guidance. |
| DQ47 | P2 | Show why a breakpoint is unbound and provide the relevant recovery action. | Missing symbols, a stale build and a line without executable code are distinguishable when the debugger supplies that information. |
| DQ48 | P2 | Bundle a selected test's diagnostic artifacts for handoff. | Users can preview and export its output, stack trace and available trace attachments without searching several folders. |

## 9. Recording and Spy

Source: [recorder UI](test-authoring-studio/src/GeneratorRecorder.tsx), [Spy UI](test-authoring-studio/src/SpyView.tsx), [existing recorder improvements](QOL-PROGRESS.md).

Recording already matches steps and previews feature/dictionary generation; Spy already offers element inspection, selector verification and snapshots. Preserve those review steps while extending the workflow.

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ49 | P1 | Recover an interrupted recording as a draft action list. | After restarting the app, previously captured actions can be reviewed and saved without pretending the old browser session is still connected. |
| DQ50 | P2 | Add named recording profiles for starting URL, viewport and browser options. | Starting a new recording from a profile shows the effective configuration and permits a one-time override. |
| DQ51 | P2 | Explain low-confidence step matches and allow per-action alternatives. | Each unresolved action shows candidate scores/reasons and its selected binding before generation is approved. |
| DQ52 | P1 | Add a final sensitive-value review before saving generated recording artifacts. | Users can replace detected sensitive literals with environment references and verify the final diff contains no replaced value. |
| DQ53 | P2 | Distinguish selector uniqueness from long-term robustness. | Spy explains brittle attributes or positional selectors even when the current match count is one. |
| DQ54 | P2 | Compare two Spy snapshots to investigate selector drift. | A comparison identifies changed attributes and missing elements and clearly labels results as offline observations. |

## 10. Terminal, support and distribution

Source: [terminal](test-authoring-studio/src/rider/TerminalPanel.tsx), [diagnostics](test-authoring-desktop/src/main/diagnostics.ts), [logs/settings](test-authoring-desktop/src/main/settingsIO.ts), [packaging](test-authoring-desktop/package.json), [documented limits](test-authoring-desktop/README.md#limits).

| ID | Priority | Improvement and user benefit | Acceptance criterion |
| --- | --- | --- | --- |
| DQ55 | P2 | Persist an opt-in, workspace-scoped terminal command history. | Restarting preserves approved history, includes Clear history, and avoids storing commands the user marks private. |
| DQ56 | P2 | Add terminal output search with next/previous match navigation. | Users can find an error in retained output, see the match count and clear the search without changing the running command. |
| DQ57 | P1 | Warn before closing a terminal tab with a running command. | Users can keep the tab or explicitly stop the process; closing cannot silently orphan the operation. |
| DQ58 | P2 | Add a support-bundle preview with path redaction. | Users choose logs and environment details, inspect the exact export and remove personal paths before sharing it. |
| DQ59 | P2 | Rotate logs during long-running sessions and expose retention controls. | A session exceeding the configured log limit stays bounded without needing an app restart; users can open retained logs. |
| DQ60 | P3 | Provide an opt-in update check with release notes and a verified installer path. | Users see installed/available versions, can defer a release, and receive a clear verification failure rather than running an unverified installer. |

## Suggested delivery order

1. Protect work: DQ10, DQ13–19, DQ21–22 and DQ49. Establish recovery behavior before adding more persistence.
2. Make background behavior dependable: DQ27, DQ29, DQ31, DQ33 and DQ40. Exercise workspace switching, API outages and slow startup.
3. Reduce daily friction: DQ01, DQ07–09, DQ24, DQ28, DQ39 and DQ42, then the testing/recording improvements.
4. Add optional polish and distribution conveniences after the underlying flows are stable.

For each implemented item, test its acceptance criterion in the packaged Windows app. Test shared UI changes in the web host too. Recovery work needs interruption/conflict tests; navigation work needs slow-start and multi-window checks. Update this backlog's status only when implementation and verification are complete.
