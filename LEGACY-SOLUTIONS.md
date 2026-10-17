# Opening solutions and projects like Visual Studio 2026 — progress

Goal: open any `.sln` / `.slnx` / `.csproj` the way Visual Studio does, including classic Visual Studio solutions
(.NET Framework, non-SDK `.csproj`, `packages.config` with a local `packages/` folder) such as
`SpecFlow-Selenium-Sample-master` (SpecFlow 3.1 + NUnit + Selenium, .NET Framework 4.7.2).

What the example showed before this work: no framework / packages / references (only SDK-style `PackageReference`
was read), every file of the folder in the Explorer (355, the whole `packages/` folder included), and a 15 s scan that
walked `packages/` and reported its XML files as broken dictionaries.

Status: ✅ done · 🟡 in progress · ⬜ to do

| # | Item | Status |
| --- | --- | --- |
| L1 | Classic projects as Visual Studio reads them: `TargetFrameworkVersion` (v4.7.2 → net472), `packages.config` packages, assembly `Reference`s with `HintPath`, project references; Explorer shows **References** and only the files the project lists (Compile / None / Content / EmbeddedResource / Page, matched case-insensitively; SpecFlow code-behind follows its feature); **Show All Files** shows the rest | ✅ |
| L2 | Scanning: a NuGet `packages/` folder (holding `.nupkg` files), `.vs`, `TestResults`, `bin`, `obj` are always skipped (also for workspaces saved with an older ignore list); non-dictionary XML is not reported | ✅ |
| L3 | Language service for classic projects: `HintPath` assemblies and packages.config packages from the local `packages/` folder, .NET Framework reference assemblies | ⬜ |
| L4 | Build / test: Visual Studio or Build Tools MSBuild (vswhere) for classic projects; a clear explanation when it is not installed; .NET Framework debugging explained | ⬜ |

## Progress log
- 2026-10-17 — **Classic projects and faster scans (L1, L2).** `server/solution.ts` `projectInfo` reads classic `.csproj` files (`legacy`, `frameworks`, packages from `packages.config`, `assemblies` with `HintPath`, `items` resolved to the names on disk); the Explorer names the node **References**, lists assemblies, and filters classic projects to their listed files unless Show All Files is on. `core.ignoredDirsFor` adds the built-in skips and the NuGet `packages/` folder to every walker (scan, project model, search, validation, solution discovery). On the example: scan 14.7 s → 1.0 s, 9 listed files (the feature listed as `ToDoApp.feature` found as `TodoApp.feature`), net472, 36 packages, 25 assemblies, all 7 steps bound. Test: `tests/e2e/legacy-solution.spec.ts`.
