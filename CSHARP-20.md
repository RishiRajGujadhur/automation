# Visual Studio 2026 features for C# developers (C1–C20)

Twenty features around C# projects, centred on a Visual Studio–style **Project Properties** window and editing of
`.csproj` files. Evaluated values come from the .NET SDK (`dotnet msbuild -getProperty`), project references from
`dotnet add / remove reference`; every write to a project file goes through the diff preview and approval.
Earlier batches: [ADVANCED-20.md](ADVANCED-20.md), [IDE-FEATURES-4.md](IDE-FEATURES-4.md).

| # | Feature | From | Essential | Status |
| --- | --- | --- | --- | --- |
| C1 | Project Properties (Application page) | VS 2026 | yes | ✅ 2026-10-20 |
| C2 | Project Properties: Build page | VS 2026 | yes | ✅ 2026-10-20 |
| C3 | Project Properties: Package page | VS 2026 | yes | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 C1: Property pages for a .csproj from the Explorer's project menu or Tools; changes previewed as a diff, then written.
- 2026-10-20 C2: Nullable, implicit usings, C# version, warnings as errors, NoWarn, symbols, optimise, platform, output path.
- 2026-10-20 C3: NuGet metadata: ID, version, authors, company, description, tags, repository, license, pack on build.
