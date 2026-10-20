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
| C9 | Project Properties: Project References | VS 2026 | yes | ✅ 2026-10-20 |
| C10 | Upgrade Target Framework | VS 2026 | yes | ✅ 2026-10-20 |
| C11 | File Properties: Build Action / Copy to Output | VS 2026 | yes | ✅ 2026-10-20 |
| C12 | Exclude From Project | VS 2026 | yes | ✅ 2026-10-20 |
| C13 | Error List: Suppress in Project File | VS 2026 | yes | ✅ 2026-10-20 |
| C14 | Project Properties: Debug (launch profiles) | VS 2026 | yes | ✅ 2026-10-20 |
| C15 | Manage User Secrets | VS 2026 | yes | ✅ 2026-10-20 |
| C16 | EditorConfig designer | VS 2026 | yes | ✅ 2026-10-20 |
| C17 | Tidy Project File | Rider | no | ✅ 2026-10-20 |
| C18 | Project file value completions | VS 2026 | yes | ✅ 2026-10-20 |
| C19 | Open Directory.Build.props | VS 2026 | yes | ✅ 2026-10-20 |

## Progress log
- 2026-10-20 C1: Property pages for a .csproj from the Explorer's project menu or Tools; changes previewed as a diff, then written.
- 2026-10-20 C2: Nullable, implicit usings, C# version, warnings as errors, NoWarn, symbols, optimise, platform, output path.
- 2026-10-20 C3: NuGet metadata: ID, version, authors, company, description, tags, repository, license, pack on build.
- 2026-10-20 C4: .NET analyzers, analysis level and mode, code style on build, documentation file.
- 2026-10-20 C5: Unset properties show the value the build uses, evaluated by dotnet msbuild -getProperty.
- 2026-10-20 C6: Debug / Release values written to a conditioned PropertyGroup; SDK evaluation runs without MSBuild node reuse.
- 2026-10-20 C7: Pre/post-build command lines as PreBuild / PostBuild targets.
- 2026-10-20 C8: Lists, adds and removes <Using> items (static too).
- 2026-10-20 C9: Adds or removes references to the solution's other projects.
- 2026-10-20 C10: One previewed diff per project whose TargetFramework differs.
- 2026-10-20 C11: Build Action and Copy to Output Directory written to the project file.
- 2026-10-20 C12: A Remove item keeps the file on disk but out of the build; File Properties includes it again.
- 2026-10-20 C13: Adds the code to the project's NoWarn (previewed).
- 2026-10-20 C14: Launch profiles in Properties/launchSettings.json: kind, args, working dir, environment.
- 2026-10-20 C15: secrets.json in the user profile; a UserSecretsId is added (previewed) first.
- 2026-10-20 C16: Whitespace / C# code style options and rule severities in .editorconfig (previewed).
- 2026-10-20 C17: Sorts references and usings, removes empty groups and stray blank lines.
- 2026-10-20 C18: Valid values inside <TargetFramework>, <Nullable>… from the Project Properties lists.
- 2026-10-20 C19: Opens the nearest Directory.Build.props, or previews a new one at the root.
