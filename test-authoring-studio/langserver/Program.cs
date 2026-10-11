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
    ProjectId? projectId;
    string root = "";

    public async Task<object?> Handle(JsonObject req)
    {
        var op = (string)req["op"]!;
        if (op == "init") { Init((string)req["root"]!); return new { files = workspace!.CurrentSolution.GetProject(projectId!)!.DocumentIds.Count }; }
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
    void Init(string folder)
    {
        root = Path.GetFullPath(folder);
        var host = MefHostServices.Create(MefHostServices.DefaultAssemblies);
        workspace = new AdhocWorkspace(host);
        var info = ProjectInfo.Create(ProjectId.CreateNewId(), VersionStamp.Create(), "Workspace", "Workspace", LanguageNames.CSharp,
            compilationOptions: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary, nullableContextOptions: NullableContextOptions.Enable),
            parseOptions: new CSharpParseOptions(LanguageVersion.Latest),
            metadataReferences: References());
        var project = workspace.AddProject(info);
        projectId = project.Id;
        var solution = workspace.CurrentSolution;
        foreach (var file in SourceFiles()) solution = solution.AddDocument(DocumentId.CreateNewId(projectId), Path.GetFileName(file), SourceText.From(File.ReadAllText(file)), filePath: file);
        // Implicit usings of SDK-style projects (dotnet new), so `Task`, `List<>`… resolve as they do in the build.
        solution = solution.AddDocument(DocumentId.CreateNewId(projectId), "GlobalUsings.g.cs", SourceText.From(string.Join("\n", new[] { "System", "System.Collections.Generic", "System.IO", "System.Linq", "System.Net.Http", "System.Threading", "System.Threading.Tasks" }.Select(n => $"global using global::{n};"))));
        workspace.TryApplyChanges(solution);
    }

    IEnumerable<string> SourceFiles() =>
        Directory.EnumerateFiles(root, "*.cs", SearchOption.AllDirectories)
            .Where(f => !Path.GetRelativePath(root, f).Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar).Any(p => Ignored.Contains(p, StringComparer.OrdinalIgnoreCase)))
            .Take(20000);

    /// <summary>The running .NET runtime's assemblies plus the NuGet packages the repository's projects reference (from the local package cache).</summary>
    IEnumerable<MetadataReference> References()
    {
        var paths = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
            if (!Path.GetFileName(p).StartsWith("Microsoft.CodeAnalysis", StringComparison.OrdinalIgnoreCase)) paths[Path.GetFileName(p)] = p;
        var cache = Environment.GetEnvironmentVariable("NUGET_PACKAGES") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".nuget", "packages");
        var visited = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var proj in Directory.EnumerateFiles(root, "*.csproj", SearchOption.AllDirectories).Take(50))
        {
            XDocument xml;
            try { xml = XDocument.Load(proj); } catch { continue; }
            foreach (var pr in xml.Descendants().Where(e => e.Name.LocalName == "PackageReference"))
            {
                var name = (string?)pr.Attribute("Include");
                var version = (string?)pr.Attribute("Version") ?? pr.Elements().FirstOrDefault(e => e.Name.LocalName == "Version")?.Value;
                if (name == null) continue;
                foreach (var dll in PackageAssemblies(cache, name, version, visited)) paths.TryAdd(Path.GetFileName(dll), dll);
            }
        }
        // Built output next to the projects (dependencies of dependencies), when the repository has been built.
        foreach (var dll in Directory.EnumerateFiles(root, "*.dll", SearchOption.AllDirectories).Where(f => f.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}")).Take(500))
            paths.TryAdd(Path.GetFileName(dll), dll);
        foreach (var p in paths.Values)
        {
            MetadataReference? r = null;
            try { r = MetadataReference.CreateFromFile(p); } catch { }
            if (r != null) yield return r;
        }
    }

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
        if (id == null) { id = DocumentId.CreateNewId(projectId!); solution = solution.AddDocument(id, Path.GetFileName(path), text, filePath: path); }
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
        else if (id == null) solution = solution.AddDocument(DocumentId.CreateNewId(projectId!), Path.GetFileName(path), SourceText.From(File.ReadAllText(path)), filePath: path);
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
