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
| C4 | Project Properties: Code Analysis page | VS 2026 | yes | ✅ 2026-10-20 |
| C5 | Project Properties: effective values (SDK) | VS 2026 | yes | ✅ 2026-10-20 |
| C6 | Project Properties: per configuration | VS 2026 | yes | ✅ 2026-10-20 |
| C7 | Project Properties: Build Events | VS 2026 | yes | ✅ 2026-10-20 |
| C8 | Project Properties: Global Usings | VS 2026 | yes | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 C1: Property pages for a .csproj from the Explorer's project menu or Tools; changes previewed as a diff, then written.
- 2026-10-20 C2: Nullable, implicit usings, C# version, warnings as errors, NoWarn, symbols, optimise, platform, output path.
- 2026-10-20 C3: NuGet metadata: ID, version, authors, company, description, tags, repository, license, pack on build.
- 2026-10-20 C4: .NET analyzers, analysis level and mode, code style on build, documentation file.
- 2026-10-20 C5: Unset properties show the value the build uses, evaluated by dotnet msbuild -getProperty.
- 2026-10-20 C6: Debug / Release values written to a conditioned PropertyGroup; SDK evaluation runs without MSBuild node reuse.
- 2026-10-20 C7: Pre/post-build command lines as PreBuild / PostBuild targets.
- 2026-10-20 C8: Lists, adds and removes <Using> items (static too).
