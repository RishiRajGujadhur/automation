using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.QuickInfo;
using Microsoft.CodeAnalysis.Rename;
using Microsoft.CodeAnalysis.Text;

// C# language service: one JSON request per stdin line, one JSON response per stdout line.
// Requests: {id, op, file, source?, line?, column?, ...}. Positions are 1-based lines and columns.
var service = new LanguageService();
var json = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
string? line;
while ((line = Console.ReadLine()) != null)
{
    JsonNode? id = null;
    try
    {
        var req = JsonNode.Parse(line)!.AsObject();
        id = req["id"]?.DeepClone();
        var result = await service.Handle(req);
        Console.WriteLine(new JsonObject { ["id"] = id, ["result"] = JsonSerializer.SerializeToNode(result, json) }.ToJsonString());
    }
    catch (Exception e)
    {
        Console.WriteLine(new JsonObject { ["id"] = id, ["error"] = e.Message }.ToJsonString());
    }
}

sealed class LanguageService
{
    static readonly string[] Ignored = ["bin", "obj", ".git", ".vs", "node_modules", "TestResults"];
    AdhocWorkspace? workspace;
    /// <summary>Roslyn project per .csproj (folder, id), deepest folder first; plus a project for files outside them.</summary>
    List<(string Dir, ProjectId Id)> owners = [];
    ProjectId? miscId;
    string root = "";

    public async Task<object?> Handle(JsonObject req)
    {
        var op = (string)req["op"]!;
        if (op == "init")
        {
            Init((string)req["root"]!);
            var sol = workspace!.CurrentSolution;
            return new { files = sol.Projects.Sum(p => p.DocumentIds.Count), projects = sol.Projects.Select(p => new { name = p.Name, documents = p.DocumentIds.Count, references = p.ProjectReferences.Select(r => sol.GetProject(r.ProjectId)?.Name) }).ToList() };
        }
        if (workspace == null) throw new InvalidOperationException("Not initialised.");
        if (op == "update") { foreach (var f in req["files"]!.AsArray()) Refresh((string)f!); return true; }
        var doc = Document((string)req["file"]!, (string?)req["source"]);
        int Pos(SourceText t) => t.Lines[Math.Clamp((int)req["line"]! - 1, 0, t.Lines.Count - 1)].Start + (int)req["column"]! - 1;
        var text = await doc.GetTextAsync();
        return op switch
        {
            "complete" => await Complete(doc, Math.Min(Pos(text), text.Length)),
            "hover" => await Hover(doc, Math.Min(Pos(text), text.Length)),
            "definition" => await Definition(doc, Math.Min(Pos(text), text.Length)),
            "references" => await References(doc, Math.Min(Pos(text), text.Length)),
            "rename" => await Rename(doc, Math.Min(Pos(text), text.Length), (string)req["newName"]!),
            "organize" => await Organize(doc),
            _ => throw new InvalidOperationException($"Unknown operation {op}."),
        };
    }

    // ------------------------------------------------------------------ workspace
    static readonly string ImplicitUsings = string.Join("\n", new[] { "System", "System.Collections.Generic", "System.IO", "System.Linq", "System.Net.Http", "System.Threading", "System.Threading.Tasks" }.Select(n => $"global using global::{n};"));
    static readonly CSharpCompilationOptions Options = new(OutputKind.DynamicallyLinkedLibrary, nullableContextOptions: NullableContextOptions.Enable);
    static readonly CSharpParseOptions Parse = new(LanguageVersion.Latest);

    bool IsIgnored(string path) => Path.GetRelativePath(root, path).Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(p => Ignored.Contains(p, StringComparer.OrdinalIgnoreCase));

    /// <summary>
    /// One Roslyn project per .csproj, like Visual Studio's solution: each with its own NuGet packages (and their
    /// dependencies), the .NET framework assemblies, and project references to the other projects it references.
    /// Files outside every project go to a "Miscellaneous Files" project that sees all of them.
    /// </summary>
    void Init(string folder)
    {
        root = Path.GetFullPath(folder);
        workspace = new AdhocWorkspace(MefHostServices.Create(MefHostServices.DefaultAssemblies));
        var framework = FrameworkReferences();
        var cache = Environment.GetEnvironmentVariable("NUGET_PACKAGES") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".nuget", "packages");
        var csprojs = Directory.EnumerateFiles(root, "*.csproj", SearchOption.AllDirectories).Where(p => !IsIgnored(p)).Take(200).Select(Path.GetFullPath).ToList();
        var ids = csprojs.ToDictionary(p => p, p => ProjectId.CreateNewId(Path.GetFileNameWithoutExtension(p)), StringComparer.OrdinalIgnoreCase);
        var infos = new List<ProjectInfo>();
        var allPackages = new Dictionary<string, MetadataReference>(StringComparer.OrdinalIgnoreCase);
        foreach (var proj in csprojs)
        {
            XDocument? xml = null;
            try { xml = XDocument.Load(proj); } catch { }
            var dir = Path.GetDirectoryName(proj)!;
            var refs = new Dictionary<string, MetadataReference>(StringComparer.OrdinalIgnoreCase);
            foreach (var pr in xml?.Descendants().Where(e => e.Name.LocalName == "PackageReference") ?? [])
            {
                var package = (string?)pr.Attribute("Include");
                var version = (string?)pr.Attribute("Version") ?? pr.Elements().FirstOrDefault(e => e.Name.LocalName == "Version")?.Value;
                if (package == null) continue;
                foreach (var dll in PackageAssemblies(cache, package, version, new HashSet<string>(StringComparer.OrdinalIgnoreCase)))
                    if (!refs.ContainsKey(Path.GetFileName(dll)) && Load(dll) is { } r) { refs[Path.GetFileName(dll)] = r; allPackages.TryAdd(Path.GetFileName(dll), r); }
            }
            // Built output of the project itself (dependencies of dependencies), when the repository has been built.
            foreach (var dll in Directory.EnumerateFiles(dir, "*.dll", SearchOption.AllDirectories).Where(f => f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}")).Take(300))
                if (!refs.ContainsKey(Path.GetFileName(dll)) && !ids.Keys.Any(k => Path.GetFileNameWithoutExtension(k).Equals(Path.GetFileNameWithoutExtension(dll), StringComparison.OrdinalIgnoreCase)) && Load(dll) is { } r) refs[Path.GetFileName(dll)] = r;
            var projectRefs = (xml?.Descendants().Where(e => e.Name.LocalName == "ProjectReference") ?? [])
                .Select(e => (string?)e.Attribute("Include")).OfType<string>()
                .Select(i => Path.GetFullPath(Path.Combine(dir, i.Replace('\\', Path.DirectorySeparatorChar))))
                .Where(ids.ContainsKey).Where(p => !p.Equals(proj, StringComparison.OrdinalIgnoreCase)).Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(p => new ProjectReference(ids[p])).ToList();
            var name = Path.GetFileNameWithoutExtension(proj);
            infos.Add(ProjectInfo.Create(ids[proj], VersionStamp.Create(), name, name, LanguageNames.CSharp, filePath: proj,
                compilationOptions: Options, parseOptions: Parse, metadataReferences: framework.Concat(refs.Values), projectReferences: projectRefs));
        }
        owners = csprojs.Select(p => (Path.GetDirectoryName(p)!, ids[p])).OrderByDescending(o => o.Item1.Length).ToList();
        var files = SourceFiles().ToList();
        miscId = null;
        if (owners.Count == 0 || files.Any(f => Owner(f) == null))
        {
            miscId = ProjectId.CreateNewId("Miscellaneous Files");
            infos.Add(ProjectInfo.Create(miscId, VersionStamp.Create(), owners.Count == 0 ? "Workspace" : "Miscellaneous Files", "Miscellaneous", LanguageNames.CSharp,
                compilationOptions: Options, parseOptions: Parse, metadataReferences: framework.Concat(allPackages.Values), projectReferences: ids.Values.Select(i => new ProjectReference(i))));
        }
        var solution = workspace.AddSolution(SolutionInfo.Create(SolutionId.CreateNewId(), VersionStamp.Create(), projects: infos));
        foreach (var file in files) solution = solution.AddDocument(DocumentId.CreateNewId(Owner(file) ?? miscId!), Path.GetFileName(file), SourceText.From(File.ReadAllText(file)), filePath: file);
        // Implicit usings of SDK-style projects (dotnet new), so `Task`, `List<>`… resolve as they do in the build.
        foreach (var p in infos) solution = solution.AddDocument(DocumentId.CreateNewId(p.Id), "GlobalUsings.g.cs", SourceText.From(ImplicitUsings));
        workspace.TryApplyChanges(solution);
    }

    ProjectId? Owner(string path) => owners.FirstOrDefault(o => path.StartsWith(o.Dir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)).Id;

    IEnumerable<string> SourceFiles() =>
        Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories).Where(f => !IsIgnored(f)).Select(Path.GetFullPath).Take(20000);

    static MetadataReference? Load(string path) { try { return MetadataReference.CreateFromFile(path); } catch { return null; } }

    /// <summary>The running .NET runtime's assemblies (reference set for every project).</summary>
    static List<MetadataReference> FrameworkReferences() =>
        ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Where(p => !Path.GetFileName(p).StartsWith("Microsoft.CodeAnalysis", StringComparison.OrdinalIgnoreCase))
            .Select(Load).OfType<MetadataReference>().ToList();

    /// <summary>A package's assemblies and, through its .nuspec dependencies, those of the packages it depends on.</summary>
    static IEnumerable<string> PackageAssemblies(string cache, string name, string? version, HashSet<string> visited)
    {
        if (!visited.Add(name)) return [];
        var dir = Path.Combine(cache, name.ToLowerInvariant());
        if (!Directory.Exists(dir)) return [];
        version = version?.Trim('[', ']', '(', ')', ' ').Split(',')[0].Trim();
        var versionDir = !string.IsNullOrEmpty(version) && Directory.Exists(Path.Combine(dir, version.ToLowerInvariant())) ? Path.Combine(dir, version.ToLowerInvariant())
            : Directory.GetDirectories(dir).OrderByDescending(d => d, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
        if (versionDir == null) return [];
        var result = new List<string>();
        var nuspec = Directory.GetFiles(versionDir, "*.nuspec").FirstOrDefault();
        if (nuspec != null)
        {
            try
            {
                foreach (var dep in XDocument.Load(nuspec).Descendants().Where(e => e.Name.LocalName == "dependency"))
                    if ((string?)dep.Attribute("id") is { } id) result.AddRange(PackageAssemblies(cache, id, (string?)dep.Attribute("version"), visited));
            }
            catch { }
        }
        result.AddRange(LibAssemblies(versionDir));
        return result;
    }
    static IEnumerable<string> LibAssemblies(string versionDir)
    {
        var lib = Path.Combine(versionDir, "lib");
        if (!Directory.Exists(lib)) return [];
        // Prefer the newest netX.Y, then netstandard2.1/2.0, then anything.
        var tfm = Directory.GetDirectories(lib).Select(Path.GetFileName).OfType<string>()
            .OrderByDescending(t => Regex.IsMatch(t, @"^net\d+\.\d+$") ? 3 : t.StartsWith("netstandard2") ? 2 : t.StartsWith("netcoreapp") ? 1 : 0)
            .ThenByDescending(t => t, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
        return tfm == null ? [] : Directory.GetFiles(Path.Combine(lib, tfm), "*.dll");
    }

    string Full(string file) => Path.GetFullPath(Path.Combine(root, file));
    string Rel(string path) => Path.GetRelativePath(root, path).Replace('\\', '/');

    /// <summary>The document for a repository file, with the editor's unsaved text when given.</summary>
    Document Document(string file, string? source)
    {
        var path = Full(file);
        var solution = workspace!.CurrentSolution;
        var id = solution.GetDocumentIdsWithFilePath(path).FirstOrDefault();
        var text = SourceText.From(source ?? (File.Exists(path) ? File.ReadAllText(path) : ""));
        if (id == null) { id = DocumentId.CreateNewId(Owner(path) ?? miscId ?? solution.ProjectIds[0]); solution = solution.AddDocument(id, Path.GetFileName(path), text, filePath: path); }
        else if (source != null) solution = solution.WithDocumentText(id, text);
        if (solution != workspace.CurrentSolution) workspace.TryApplyChanges(solution);
        return workspace.CurrentSolution.GetDocument(id)!;
    }
    /// <summary>Re-reads files changed on disk (or removes deleted ones).</summary>
    void Refresh(string file)
    {
        var path = Full(file);
        var solution = workspace!.CurrentSolution;
        var id = solution.GetDocumentIdsWithFilePath(path).FirstOrDefault();
        if (!File.Exists(path)) { if (id != null) solution = solution.RemoveDocument(id); }
        else if (id == null) solution = solution.AddDocument(DocumentId.CreateNewId(Owner(path) ?? miscId ?? solution.ProjectIds[0]), Path.GetFileName(path), SourceText.From(File.ReadAllText(path)), filePath: path);
        else solution = solution.WithDocumentText(id, SourceText.From(File.ReadAllText(path)));
        workspace.TryApplyChanges(solution);
    }

    // ------------------------------------------------------------------ features
    async Task<object> Complete(Document doc, int position)
    {
        var service = CompletionService.GetService(doc)!;
        var list = await service.GetCompletionsAsync(doc, position);
        var text = await doc.GetTextAsync();
        var span = list.Span;
        var items = list.ItemsList.Take(800).Select(i => new
        {
            label = i.DisplayTextPrefix + i.DisplayText + i.DisplayTextSuffix,
            insert = i.DisplayText,
            filter = i.FilterText,
            sort = i.SortText,
            kind = i.Tags.FirstOrDefault() ?? "Text",
            detail = i.InlineDescription,
            preselect = i.Rules.MatchPriority > 0,
        }).ToList();
        return new { from = Loc(text, span.Start), to = Loc(text, span.End), items };
    }

    async Task<object?> Hover(Document doc, int position)
    {
        var service = QuickInfoService.GetService(doc);
        var info = service == null ? null : await service.GetQuickInfoAsync(doc, position);
        if (info == null || info.Sections.IsEmpty) return null;
        return new { sections = info.Sections.Select(s => new { kind = s.Kind, text = s.Text }).ToList() };
    }

    static object Loc(SourceText text, int pos) { var l = text.Lines.GetLinePosition(pos); return new { line = l.Line + 1, column = l.Character + 1 }; }
    object Location(Location loc)
    {
        var span = loc.GetLineSpan();
        return new { file = Rel(span.Path), line = span.StartLinePosition.Line + 1, column = span.StartLinePosition.Character + 1, endLine = span.EndLinePosition.Line + 1, endColumn = span.EndLinePosition.Character + 1 };
    }
    bool InRepo(Location l) => l.IsInSource && l.SourceTree?.FilePath is { } p && Path.GetFullPath(p).StartsWith(root, StringComparison.OrdinalIgnoreCase) && !p.EndsWith("GlobalUsings.g.cs");

    async Task<ISymbol?> SymbolAt(Document doc, int position)
    {
        var symbol = await SymbolFinder.FindSymbolAtPositionAsync(doc, position);
        if (symbol == null && position > 0) symbol = await SymbolFinder.FindSymbolAtPositionAsync(doc, position - 1);
        return symbol;
    }

    async Task<object> Definition(Document doc, int position)
    {
        var symbol = await SymbolAt(doc, position) ?? throw new InvalidOperationException("No symbol at the cursor.");
        var source = await SymbolFinder.FindSourceDefinitionAsync(symbol, doc.Project.Solution) ?? symbol;
        var locations = source.Locations.Where(InRepo).Select(Location).ToList();
        return new { name = symbol.ToDisplayString(), kind = symbol.Kind.ToString(), locations, external = locations.Count == 0 ? symbol.ContainingAssembly?.Name : null };
    }

    async Task<object> References(Document doc, int position)
    {
        var symbol = await SymbolAt(doc, position) ?? throw new InvalidOperationException("No symbol at the cursor.");
        var refs = await SymbolFinder.FindReferencesAsync(symbol, doc.Project.Solution);
        var locations = refs.SelectMany(r => r.Locations.Select(l => l.Location).Concat(r.Definition.Locations)).Where(InRepo).Distinct().Select(Location).ToList();
        return new { name = symbol.ToDisplayString(), locations };
    }

    /// <summary>Renames the symbol at the cursor and every reference to it, like Visual Studio's Rename (F2).</summary>
    async Task<object> Rename(Document doc, int position, string newName)
    {
        if (!SyntaxFacts.IsValidIdentifier(newName)) throw new InvalidOperationException($"'{newName}' is not a valid C# identifier.");
        var symbol = await SymbolAt(doc, position) ?? throw new InvalidOperationException("No symbol at the cursor.");
        if (!symbol.Locations.Any(InRepo)) throw new InvalidOperationException($"{symbol.Name} is defined outside the repository and cannot be renamed.");
        var solution = doc.Project.Solution;
        var renamed = await Renamer.RenameSymbolAsync(solution, symbol, new SymbolRenameOptions(RenameOverloads: false, RenameInStrings: false, RenameInComments: false), newName);
        var changes = new List<object>();
        foreach (var id in renamed.GetChanges(solution).GetProjectChanges().SelectMany(p => p.GetChangedDocuments()))
        {
            var d = renamed.GetDocument(id)!;
            if (d.FilePath == null || d.FilePath.EndsWith("GlobalUsings.g.cs")) continue;
            var before = await solution.GetDocument(id)!.GetTextAsync();
            var after = await d.GetTextAsync();
            changes.Add(new { file = Rel(d.FilePath), text = after.ToString(), edits = after.GetChangeRanges(before).Count });
        }
        workspace!.TryApplyChanges(renamed);
        return new { name = symbol.Name, newName, changes };
    }

    /// <summary>Organize usings: remove unnecessary ones (CS8019) and sort, System namespaces first.</summary>
    async Task<object> Organize(Document doc)
    {
        var model = (await doc.GetSemanticModelAsync())!;
        var root = (CompilationUnitSyntax)(await doc.GetSyntaxRootAsync())!;
        var unused = model.GetDiagnostics().Where(d => d.Id == "CS8019").Select(d => d.Location.SourceSpan).ToHashSet();
        // Only usings whose namespace resolves can be called unnecessary: when a package is missing (not restored),
        // its usings look unused because nothing in them resolves, and removing them would break the build.
        bool Resolves(UsingDirectiveSyntax u) => u.Alias != null || u.StaticKeyword.IsKind(SyntaxKind.StaticKeyword) || model.GetSymbolInfo(u.NamespaceOrType).Symbol is INamespaceSymbol { ConstituentNamespaces.Length: > 0 } ns && ns.ConstituentNamespaces.Any(c => c.ContainingAssembly != null || c.GetMembers().Any());
        // If names in the file do not resolve (a package not restored or not found), only System usings are removed:
        // any other "unused" using might be the one that would supply the missing names.
        var unresolved = model.GetDiagnostics().Any(d => d.Id is "CS0246" or "CS0103" or "CS0234" or "CS0305" or "CS0616" or "CS1061");
        static bool IsSystem(UsingDirectiveSyntax u) => u.Name?.ToString() is { } n && (n == "System" || n.StartsWith("System."));
        var keep = root.Usings.Where(u => !Resolves(u) || (unresolved && !IsSystem(u)) || !unused.Any(s => s.Contains(u.Span) || u.Span.Contains(s))).ToList();
        var removed = root.Usings.Count - keep.Count;
        var leading = root.Usings.FirstOrDefault()?.GetLeadingTrivia() ?? default;
        static int Group(UsingDirectiveSyntax u) => u.GlobalKeyword.IsKind(SyntaxKind.GlobalKeyword) ? 0 : u.Alias != null ? 4 : u.StaticKeyword.IsKind(SyntaxKind.StaticKeyword) ? 3 : u.Name!.ToString() is var n && (n == "System" || n.StartsWith("System.")) ? 1 : 2;
        var sorted = keep.OrderBy(Group).ThenBy(u => u.Name?.ToString() ?? u.NamespaceOrType.ToString(), StringComparer.Ordinal)
            .Select((u, i) => u.WithLeadingTrivia(i == 0 ? leading : default).WithTrailingTrivia(SyntaxFactory.ElasticCarriageReturnLineFeed)).ToList();
        var newRoot = root.WithUsings(SyntaxFactory.List(sorted));
        var text = newRoot.ToFullString().Replace("\r\n", (await doc.GetTextAsync()).ToString().Contains("\r\n") ? "\r\n" : "\n");
        return new { text, removed };
    }
}
