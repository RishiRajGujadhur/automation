using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CodeActions;
using Microsoft.CodeAnalysis.CodeFixes;
using Microsoft.CodeAnalysis.CodeRefactorings;
using Microsoft.CodeAnalysis.Completion;
using Microsoft.CodeAnalysis.Formatting;
using System.Collections.Immutable;
using System.Reflection;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Host.Mef;
using Microsoft.CodeAnalysis.QuickInfo;
using Microsoft.CodeAnalysis.Rename;
using Microsoft.CodeAnalysis.Text;

// C# language service: one JSON request per stdin line, one JSON response per stdout line.
// Requests: {id, op, file, source?, line?, column?, ...}. Positions are 1-based lines and columns.
LanguageService.Prewarm();
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
    // Roslyn's MEF composition (~1 s) does not depend on the folder: it starts when the process starts, in parallel
    // with whatever comes first, and is shared by every Init.
    static readonly Lazy<Task<MefHostServices>> Host = new(() => Task.Run(() => MefHostServices.Create(MefHostServices.DefaultAssemblies)));
    public static void Prewarm() => _ = Host.Value;
    string root = "";
    // Folders of solution projects outside the opened folder (they are indexed with it).
    List<string> extraRoots = new();

    public async Task<object?> Handle(JsonObject req)
    {
        var op = (string)req["op"]!;
        if (op == "init")
        {
            Init((string)req["root"]!, req["extra"]?.AsArray().Select(x => (string)x!).ToList() ?? new List<string>());
            var sol = workspace!.CurrentSolution;
            // Compile every project in the background so the first IntelliSense / hover / lens request is fast.
            _ = Task.Run(async () => { foreach (var p in sol.Projects) { try { var c = await p.GetCompilationAsync(); c?.GetDiagnostics(); } catch { } } });
            return new { files = sol.Projects.Sum(p => p.DocumentIds.Count), projects = sol.Projects.Select(p => new { name = p.Name, documents = p.DocumentIds.Count, references = p.ProjectReferences.Select(r => sol.GetProject(r.ProjectId)?.Name) }).ToList() };
        }
        if (workspace == null) throw new InvalidOperationException("Not initialised.");
        if (op == "update") { foreach (var f in req["files"]!.AsArray()) Refresh((string)f!); return true; }
        if (op == "tests") return await DiscoverTests();
        if (op == "symbols") return await Symbols((string)req["query"]!);
        var doc = Document((string)req["file"]!, (string?)req["source"]);
        int Pos(SourceText t) => t.Lines[Math.Clamp((int)req["line"]! - 1, 0, t.Lines.Count - 1)].Start + (int)req["column"]! - 1;
        var text = await doc.GetTextAsync();
        return op switch
        {
            "complete" => await Complete(doc, Math.Min(Pos(text), text.Length)),
            "hover" => await Hover(doc, Math.Min(Pos(text), text.Length)),
            "definition" => await Definition(doc, Math.Min(Pos(text), text.Length)),
            "references" => await References(doc, Math.Min(Pos(text), text.Length)),
            "implementations" => await Implementations(doc, Math.Min(Pos(text), text.Length)),
            "base" => await BaseOf(doc, Math.Min(Pos(text), text.Length)),
            "rename" => await Rename(doc, Math.Min(Pos(text), text.Length), (string)req["newName"]!),
            "organize" => await Organize(doc),
            "outline" => await Outline(doc),
            "referenceCounts" => await ReferenceCounts(doc),
            "inlayHints" => await InlayHints(doc),
            "signature" => await Signature(doc, Math.Min(Pos(text), text.Length)),
            "format" => await Format(doc, req),
            "actions" => await Actions(doc, Math.Min(Pos(text), text.Length), req["endLine"] is null ? null : text.Lines[Math.Clamp((int)req["endLine"]! - 1, 0, text.Lines.Count - 1)].Start + (int)req["endColumn"]! - 1),
            "applyAction" => await ApplyAction((string)req["actionId"]!),
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
    void Init(string folder, List<string> extra)
    {
        root = Path.GetFullPath(folder);
        extraRoots = extra.Select(Path.GetFullPath).Where(Directory.Exists).ToList();
        workspace = new AdhocWorkspace(Host.Value.Result);
        var framework = FrameworkReferences();
        var cache = Environment.GetEnvironmentVariable("NUGET_PACKAGES") ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".nuget", "packages");
        var csprojs = new[] { root }.Concat(extraRoots).SelectMany(r => Directory.EnumerateFiles(r, "*.csproj", SearchOption.AllDirectories)).Where(p => !IsIgnored(p)).Take(200).Select(Path.GetFullPath).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
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
            // Classic projects: assembly references with a HintPath (packages.config packages under packages/, local DLLs).
            foreach (var r in xml?.Descendants().Where(e => e.Name.LocalName == "Reference") ?? [])
            {
                var hint = r.Elements().FirstOrDefault(e => e.Name.LocalName == "HintPath")?.Value.Trim();
                if (string.IsNullOrEmpty(hint)) continue;
                var dll = Path.GetFullPath(Path.Combine(dir, hint.Replace('\\', Path.DirectorySeparatorChar)));
                if (File.Exists(dll) && !refs.ContainsKey(Path.GetFileName(dll)) && Load(dll) is { } hr) { refs[Path.GetFileName(dll)] = hr; allPackages.TryAdd(Path.GetFileName(dll), hr); }
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
            // .NET Framework projects (TargetFrameworkVersion v4.x) compile against that framework's reference assemblies.
            var tfv = xml?.Descendants().FirstOrDefault(e => e.Name.LocalName == "TargetFrameworkVersion")?.Value.Trim();
            var projectFramework = (tfv != null ? NetFrameworkReferences(tfv) : null) ?? framework;
            infos.Add(ProjectInfo.Create(ids[proj], VersionStamp.Create(), name, name, LanguageNames.CSharp, filePath: proj,
                compilationOptions: Options, parseOptions: Parse, metadataReferences: projectFramework.Concat(refs.Values), projectReferences: projectRefs));
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
        // .editorconfig files (repository root down to each project) drive formatting and code style, as in the build.
        foreach (var p in infos)
        {
            var dir = p.FilePath != null ? Path.GetDirectoryName(p.FilePath)! : root;
            for (var d = dir; d != null && d.StartsWith(root, StringComparison.OrdinalIgnoreCase); d = Path.GetDirectoryName(d))
            {
                var ec = Path.Combine(d, ".editorconfig");
                if (File.Exists(ec)) solution = solution.AddAnalyzerConfigDocument(DocumentId.CreateNewId(p.Id), ".editorconfig", SourceText.From(File.ReadAllText(ec)), filePath: ec);
                if (d.Equals(root, StringComparison.OrdinalIgnoreCase)) break;
            }
        }
        workspace.TryApplyChanges(solution);
    }

    ProjectId? Owner(string path) => owners.FirstOrDefault(o => path.StartsWith(o.Dir + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)).Id;

    IEnumerable<string> SourceFiles() =>
        new[] { root }.Concat(extraRoots).SelectMany(r => Directory.EnumerateFiles(r, "*.cs", SearchOption.AllDirectories)).Where(f => !IsIgnored(f)).Select(Path.GetFullPath).Distinct(StringComparer.OrdinalIgnoreCase).Take(20000);

    static MetadataReference? Load(string path) { try { return MetadataReference.CreateFromFile(path); } catch { return null; } }

    /// <summary>The running .NET runtime's assemblies (reference set for every project).</summary>
    static List<MetadataReference> FrameworkReferences() =>
        ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
            .Where(p => !Path.GetFileName(p).StartsWith("Microsoft.CodeAnalysis", StringComparison.OrdinalIgnoreCase))
            .Select(Load).OfType<MetadataReference>().ToList();

    static readonly Dictionary<string, List<MetadataReference>?> netFxCache = new(StringComparer.OrdinalIgnoreCase);
    /// <summary>
    /// .NET Framework reference assemblies (Developer Pack / Visual Studio): the requested version, else the nearest
    /// installed v4.x. Null when none is installed (the runtime's assemblies are used instead).
    /// </summary>
    static List<MetadataReference>? NetFrameworkReferences(string version)
    {
        if (netFxCache.TryGetValue(version, out var cached)) return cached;
        var baseDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Reference Assemblies", "Microsoft", "Framework", ".NETFramework");
        string? dir = null;
        if (Directory.Exists(baseDir))
        {
            var wanted = Path.Combine(baseDir, version.StartsWith("v") ? version : "v" + version);
            dir = Directory.Exists(wanted) && File.Exists(Path.Combine(wanted, "mscorlib.dll")) ? wanted
                : Directory.GetDirectories(baseDir, "v4*").Where(d => File.Exists(Path.Combine(d, "mscorlib.dll"))).OrderByDescending(d => d, StringComparer.OrdinalIgnoreCase).FirstOrDefault();
        }
        List<MetadataReference>? list = null;
        if (dir != null)
        {
            var files = Directory.EnumerateFiles(dir, "*.dll").Concat(Directory.Exists(Path.Combine(dir, "Facades")) ? Directory.EnumerateFiles(Path.Combine(dir, "Facades"), "*.dll") : []);
            list = files.Select(Load).OfType<MetadataReference>().ToList();
        }
        return netFxCache[version] = list;
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

    // ------------------------------------------------------------------ signature help, formatting, quick actions
    /// <summary>Parameter info while typing a call: the overloads of the method (or constructor) and the active parameter.</summary>
    async Task<object?> Signature(Document doc, int position)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var token = root.FindToken(Math.Max(0, position - 1));
        var args = token.Parent?.AncestorsAndSelf().OfType<BaseArgumentListSyntax>().FirstOrDefault(a => a.Span.Start < position && (Close(a).IsMissing || position <= Close(a).SpanStart));
        if (args == null) return null;
        var target = args.Parent switch
        {
            InvocationExpressionSyntax inv => (SyntaxNode)inv.Expression,
            BaseObjectCreationExpressionSyntax oc => oc,
            ConstructorInitializerSyntax ci => ci,
            ElementAccessExpressionSyntax ea => ea.Expression,
            _ => null,
        };
        if (target == null) return null;
        var info = model.GetSymbolInfo(target is BaseObjectCreationExpressionSyntax ? args.Parent! : target);
        var group = args.Parent is InvocationExpressionSyntax ? model.GetMemberGroup(target) : ImmutableArray<ISymbol>.Empty;
        var methods = group.OfType<IMethodSymbol>().Concat(info.CandidateSymbols.OfType<IMethodSymbol>());
        if (info.Symbol is IMethodSymbol chosen) methods = methods.Prepend(chosen);
        if (args.Parent is BaseObjectCreationExpressionSyntax && model.GetTypeInfo(args.Parent).Type is INamedTypeSymbol type) methods = methods.Concat(type.InstanceConstructors);
        var list = methods.Distinct<IMethodSymbol>(SymbolEqualityComparer.Default).Where(m => m.DeclaredAccessibility != Accessibility.Private || SymbolEqualityComparer.Default.Equals(m.ContainingType, model.GetEnclosingSymbol(position)?.ContainingType)).Take(20).ToList();
        if (list.Count == 0) return null;
        var active = args.Arguments.TakeWhile(a => a.FullSpan.End < position || (a.FullSpan.End == position && args.Arguments.GetSeparators().Any(s => s.SpanStart == position - 1))).Count();
        active = Math.Min(active, Math.Max(0, args.Arguments.SeparatorCount));
        var fmt = SymbolDisplayFormat.MinimallyQualifiedFormat;
        var signatures = list.Select(m => new
        {
            label = m.MethodKind == MethodKind.Constructor ? $"{m.ContainingType.Name}({string.Join(", ", m.Parameters.Select(p => p.ToDisplayString(fmt)))})" : $"{m.ReturnType.ToDisplayString(fmt)} {m.ContainingType.Name}.{m.Name}({string.Join(", ", m.Parameters.Select(p => p.ToDisplayString(fmt)))})",
            parameters = m.Parameters.Select(p => p.ToDisplayString(fmt)).ToList(),
            documentation = Summary(m),
        }).ToList();
        // The best overload: one that has enough parameters for the argument being typed.
        var best = list.FindIndex(m => m.Parameters.Length > active || m.Parameters.LastOrDefault()?.IsParams == true);
        return new { signatures, activeSignature = Math.Max(0, best), activeParameter = active };
    }
    /// <summary>Keeps a file's own line endings: Roslyn's formatter and fixes otherwise insert the platform's.</summary>
    static string MatchEol(string original, string result)
    {
        var crlf = original.Contains("\r\n");
        var lf = original.Replace("\r\n", "").Contains('\n');
        if (crlf && !lf) return Regex.Replace(result, "(?<!\r)\n", "\r\n");
        if (!crlf) return result.Replace("\r\n", "\n");
        return result;
    }
    static SyntaxToken Close(BaseArgumentListSyntax a) => a is ArgumentListSyntax l ? l.CloseParenToken : ((BracketedArgumentListSyntax)a).CloseBracketToken;
    static string? Summary(ISymbol s)
    {
        var xml = s.GetDocumentationCommentXml();
        if (string.IsNullOrWhiteSpace(xml)) return null;
        try { return XDocument.Parse(xml).Descendants("summary").FirstOrDefault()?.Value.Trim(); } catch { return null; }
    }

    /// <summary>Format Document (or a selection) with the project's .editorconfig.</summary>
    async Task<object> Format(Document doc, JsonObject req)
    {
        var text = await doc.GetTextAsync();
        Document formatted;
        if (req["selection"] is JsonObject sel)
        {
            int Off(int line, int col) => text.Lines[Math.Clamp(line - 1, 0, text.Lines.Count - 1)].Start + col - 1;
            var from = Off((int)sel["line"]!, (int)sel["column"]!);
            var to = Off((int)sel["endLine"]!, (int)sel["endColumn"]!);
            formatted = await Formatter.FormatAsync(doc, TextSpan.FromBounds(Math.Min(from, to), Math.Max(from, to)));
        }
        else formatted = await Formatter.FormatAsync(doc);
        return new { text = MatchEol(text.ToString(), (await formatted.GetTextAsync()).ToString()) };
    }

    // Roslyn's own code fix and refactoring providers (the ones Visual Studio loads), found by their export attributes.
    static List<CodeFixProvider>? fixers;
    static List<CodeRefactoringProvider>? refactorings;
    static IEnumerable<Type> Exported(Type attribute) =>
        AppDomain.CurrentDomain.GetAssemblies().Where(a => a.GetName().Name is "Microsoft.CodeAnalysis.CSharp.Features" or "Microsoft.CodeAnalysis.Features" or "Microsoft.CodeAnalysis.CSharp.Workspaces")
            .SelectMany(a => { try { return a.GetTypes(); } catch (ReflectionTypeLoadException e) { return e.Types.OfType<Type>(); } })
            .Where(t => !t.IsAbstract && t.GetCustomAttributes(attribute, false).Length > 0);
    static T? Create<T>(Type t) where T : class
    {
        try
        {
            var ctor = t.GetConstructors(BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance).OrderBy(c => c.GetParameters().Length).FirstOrDefault();
            if (ctor == null || ctor.GetParameters().Length > 0) return null;
            return ctor.Invoke([]) as T;
        }
        catch { return null; }
    }
    static void LoadProviders()
    {
        if (fixers != null) return;
        // Make sure the feature assemblies are loaded before scanning.
        _ = typeof(CompletionService).Assembly;
        _ = Type.GetType("Microsoft.CodeAnalysis.CSharp.Completion.Providers.KeywordCompletionProvider, Microsoft.CodeAnalysis.CSharp.Features");
        fixers = Exported(typeof(ExportCodeFixProviderAttribute)).Where(t => t.GetCustomAttributes(typeof(ExportCodeFixProviderAttribute), false).Cast<ExportCodeFixProviderAttribute>().Any(a => a.Languages.Contains(LanguageNames.CSharp))).Select(Create<CodeFixProvider>).OfType<CodeFixProvider>().ToList();
        refactorings = Exported(typeof(ExportCodeRefactoringProviderAttribute)).Where(t => t.GetCustomAttributes(typeof(ExportCodeRefactoringProviderAttribute), false).Cast<ExportCodeRefactoringProviderAttribute>().Any(a => a.Languages.Contains(LanguageNames.CSharp))).Select(Create<CodeRefactoringProvider>).OfType<CodeRefactoringProvider>().ToList();
    }
    readonly Dictionary<string, CodeAction> actions = [];

    static IEnumerable<CodeAction> Flatten(CodeAction a)
    {
        var nested = (ImmutableArray<CodeAction>?)typeof(CodeAction).GetProperty("NestedActions", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(a);
        return nested is { IsDefaultOrEmpty: false } n ? n.SelectMany(Flatten) : [a];
    }

    /// <summary>Quick Actions and Refactorings (Ctrl+.): fixes for diagnostics at the cursor, then refactorings for the selection.</summary>
    async Task<object> Actions(Document doc, int position, int? end)
    {
        LoadProviders();
        actions.Clear();
        var span = TextSpan.FromBounds(Math.Min(position, end ?? position), Math.Max(position, end ?? position));
        var model = (await doc.GetSemanticModelAsync())!;
        var line = (await doc.GetTextAsync()).Lines.GetLineFromPosition(position).Span;
        var diagnostics = model.GetDiagnostics().Where(d => d.Location.IsInSource && (d.Location.SourceSpan.IntersectsWith(span) || d.Location.SourceSpan.IntersectsWith(line)) && d.Severity != DiagnosticSeverity.Hidden || (d.Id == "CS8019" && d.Location.SourceSpan.IntersectsWith(line))).ToList();
        var found = new List<(CodeAction Action, string Kind)>();
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(8));
        foreach (var d in diagnostics)
            foreach (var f in fixers!.Where(f => f.FixableDiagnosticIds.Contains(d.Id)))
            {
                try { await f.RegisterCodeFixesAsync(new CodeFixContext(doc, d, (a, _) => found.Add((a, "fix")), cts.Token)); } catch { }
            }
        foreach (var r in refactorings!)
        {
            try { await r.ComputeRefactoringsAsync(new CodeRefactoringContext(doc, span, a => found.Add((a, "refactor")), cts.Token)); } catch { }
        }
        var list = new List<object>();
        foreach (var (action, kind) in found)
            foreach (var a in Flatten(action))
            {
                if (list.Count >= 60 || string.IsNullOrWhiteSpace(a.Title)) continue;
                var id = $"a{actions.Count}";
                actions[id] = a;
                list.Add(new { id, title = a.Title, kind });
            }
        // Same titles from several providers: keep the first.
        return list.GroupBy(x => ((dynamic)x).title as string).Select(g => g.First()).ToList();
    }

    async Task<object> ApplyAction(string id)
    {
        if (!actions.TryGetValue(id, out var action)) throw new InvalidOperationException("That action is no longer available. Press Ctrl+. again.");
        var solution = workspace!.CurrentSolution;
        var ops = await action.GetOperationsAsync(CancellationToken.None);
        var apply = ops.OfType<ApplyChangesOperation>().FirstOrDefault() ?? throw new InvalidOperationException("This action has no changes to apply here.");
        var changed = apply.ChangedSolution;
        var changes = new List<object>();
        foreach (var p in changed.GetChanges(solution).GetProjectChanges())
        {
            foreach (var docId in p.GetChangedDocuments().Concat(p.GetAddedDocuments()))
            {
                var d = changed.GetDocument(docId);
                if (d?.FilePath == null || d.FilePath.EndsWith("GlobalUsings.g.cs")) continue;
                var before = solution.GetDocument(docId) is { } old ? (await old.GetTextAsync()).ToString() : "\n";
                changes.Add(new { file = Rel(d.FilePath), text = MatchEol(before, (await d.GetTextAsync()).ToString()) });
            }
        }
        workspace.TryApplyChanges(changed);
        actions.Clear();
        return new { title = action.Title, changes };
    }

    /// <summary>Go to All (Ctrl+T): types and members declared in the solution, matched like Visual Studio (CamelHumps, substrings).</summary>
    async Task<object> Symbols(string query)
    {
        var found = await SymbolFinder.FindSourceDeclarationsWithPatternAsync(workspace!.CurrentSolution, query, SymbolFilter.TypeAndMember);
        return found
            .Where(s => s.Locations.Any(InRepo) && !s.IsImplicitlyDeclared && s is not IMethodSymbol { MethodKind: not (MethodKind.Ordinary or MethodKind.Constructor) })
            .Select(s => (Symbol: s, Loc: s.Locations.First(InRepo)))
            .OrderBy(x => x.Symbol.Name.Equals(query, StringComparison.OrdinalIgnoreCase) ? 0 : x.Symbol.Name.StartsWith(query, StringComparison.OrdinalIgnoreCase) ? 1 : 2)
            .ThenBy(x => x.Symbol.Name.Length)
            .Take(100)
            .Select(x =>
            {
                var span = x.Loc.GetLineSpan();
                return new
                {
                    name = x.Symbol.Name,
                    kind = x.Symbol is INamedTypeSymbol t ? t.TypeKind.ToString() : x.Symbol.Kind.ToString(),
                    container = x.Symbol.ContainingType?.ToDisplayString() ?? x.Symbol.ContainingNamespace?.ToDisplayString(),
                    file = Rel(span.Path),
                    line = span.StartLinePosition.Line + 1,
                    column = span.StartLinePosition.Character + 1,
                };
            })
            .ToList();
    }

    // ------------------------------------------------------------------ test discovery
    static readonly HashSet<string> TestAttributes = new(StringComparer.Ordinal) { "Test", "TestCase", "TestCaseSource", "Theory", "Fact", "TestMethod", "DataTestMethod", "SkippableFact", "SkippableTheory" };
    static string Framework(string attr) => attr is "Fact" or "Theory" or "SkippableFact" or "SkippableTheory" ? "xUnit" : attr is "TestMethod" or "DataTestMethod" ? "MSTest" : "NUnit";

    /// <summary>Test methods by attribute (NUnit, xUnit, MSTest), per project, from syntax only (no build needed). SpecFlow's generated *.feature.cs are left to the feature view.</summary>
    async Task<object> DiscoverTests()
    {
        var solution = workspace!.CurrentSolution;
        var result = new List<object>();
        foreach (var project in solution.Projects)
        {
            foreach (var doc in project.Documents)
            {
                if (doc.FilePath == null || doc.FilePath.EndsWith(".feature.cs", StringComparison.OrdinalIgnoreCase) || doc.FilePath.EndsWith("GlobalUsings.g.cs")) continue;
                var root = await doc.GetSyntaxRootAsync();
                if (root == null) continue;
                foreach (var m in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
                {
                    var attrs = m.AttributeLists.SelectMany(l => l.Attributes).Select(a => a.Name.ToString().Split('.').Last()).Select(n => n.EndsWith("Attribute") ? n[..^9] : n).ToList();
                    var attr = attrs.FirstOrDefault(TestAttributes.Contains);
                    if (attr == null || m.Parent is not ClassDeclarationSyntax cls) continue;
                    var ns = cls.Ancestors().OfType<BaseNamespaceDeclarationSyntax>().Select(n => n.Name.ToString()).Reverse().ToList();
                    var classes = cls.AncestorsAndSelf().OfType<ClassDeclarationSyntax>().Select(c => c.Identifier.Text).Reverse();
                    var className = string.Join(".", ns.Concat([string.Join("+", classes)]));
                    var line = m.Identifier.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                    result.Add(new { project = project.Name, projectFile = project.FilePath == null ? null : Rel(project.FilePath), className, method = m.Identifier.Text, file = Rel(doc.FilePath), line, framework = Framework(attr), cases = attrs.Count(a => a == "TestCase" || a == "InlineData" || a == "DataRow") });
                }
            }
        }
        return result;
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

    /// <summary>
    /// CodeLens reference counts: for every type and member declared in the document, how many references the
    /// solution has (Visual Studio's "3 references"). The lens sits on the declaration's first line (above attributes).
    /// </summary>
    async Task<object> InlayHints(Document doc)
    {
        // Inlay hints (Visual Studio's Alt+F1): parameter names before literal / null arguments, and the inferred type
        // after `var` and in lambda parameters without a type.
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var text = await doc.GetTextAsync();
        var hints = new List<object>();
        void Add(int pos, string label, string kind) { var p = text.Lines.GetLinePosition(pos); hints.Add(new { line = p.Line + 1, column = p.Character + 1, label, kind }); }
        foreach (var node in root.DescendantNodes())
        {
            if (hints.Count > 2000) break;
            if (node is ArgumentSyntax { NameColon: null } arg && arg.Parent is BaseArgumentListSyntax
                && arg.Expression is LiteralExpressionSyntax or PrefixUnaryExpressionSyntax { Operand: LiteralExpressionSyntax } or DefaultExpressionSyntax)
            {
                if (DetermineParameter(model, arg) is { } prm && prm.Name.Length > 1) Add(arg.SpanStart, prm.Name + ":", "parameter");
            }
            else if (node is VariableDeclarationSyntax { Type.IsVar: true } v && v.Variables.Count == 1)
            {
                var t = model.GetTypeInfo(v.Type).Type;
                if (t != null && t.TypeKind != TypeKind.Error && !t.IsAnonymousType) Add(v.Variables[0].Identifier.Span.End, ": " + t.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat), "type");
            }
            else if (node is ParameterSyntax { Type: null } lp && lp.Parent is ParameterListSyntax or SimpleLambdaExpressionSyntax && model.GetDeclaredSymbol(lp) is IParameterSymbol ps && ps.Type.TypeKind != TypeKind.Error)
                Add(lp.Identifier.SpanStart, ps.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat) + " ", "type");
        }
        return hints;
    }

    static IParameterSymbol? DetermineParameter(SemanticModel model, ArgumentSyntax arg)
    {
        if (arg.Parent is not BaseArgumentListSyntax list || list.Parent is null) return null;
        if (model.GetSymbolInfo(list.Parent).Symbol is not IMethodSymbol m) return null;
        var i = list.Arguments.IndexOf(arg);
        if (i < 0 || i >= m.Parameters.Length) return m.Parameters.LastOrDefault() is { IsParams: true } last ? last : null;
        return m.Parameters[i];
    }

    async Task<object> ReferenceCounts(Document doc)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var text = await doc.GetTextAsync();
        var solution = doc.Project.Solution;
        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        var decls = root.DescendantNodes().Where(n => n is BaseTypeDeclarationSyntax or MethodDeclarationSyntax or ConstructorDeclarationSyntax or PropertyDeclarationSyntax or EventDeclarationSyntax).Take(300).ToList();
        var result = new List<object>();
        foreach (var d in decls)
        {
            if (cts.IsCancellationRequested) break;
            var symbol = model.GetDeclaredSymbol(d);
            if (symbol == null) continue;
            var refs = await SymbolFinder.FindReferencesAsync(symbol, solution, cts.Token);
            var count = refs.Where(r => SymbolEqualityComparer.Default.Equals(r.Definition, symbol) || r.Definition.Kind == symbol.Kind).Sum(r => r.Locations.Count(l => !l.IsImplicit));
            // The declaration's first line: attributes included (the lens goes above them, as in Visual Studio).
            var line = text.Lines.GetLinePosition(d.SpanStart).Line + 1;
            var id = d switch { BaseTypeDeclarationSyntax t => t.Identifier, MethodDeclarationSyntax m => m.Identifier, ConstructorDeclarationSyntax c => c.Identifier, PropertyDeclarationSyntax p => p.Identifier, EventDeclarationSyntax e => e.Identifier, _ => default };
            var at = text.Lines.GetLinePosition(id.SpanStart);
            result.Add(new { line, symbolLine = at.Line + 1, symbolColumn = at.Character + 1, name = symbol.Name, count });
        }
        return result;
    }

    /// <summary>Navigation bar: the document's project, its types and their members, with line ranges (syntax only).</summary>
    async Task<object> Outline(Document doc)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var text = await doc.GetTextAsync();
        object Range(SyntaxNode n, SyntaxToken id) => new
        {
            line = text.Lines.GetLinePosition(id.SpanStart).Line + 1,
            column = text.Lines.GetLinePosition(id.SpanStart).Character + 1,
            start = text.Lines.GetLinePosition(n.SpanStart).Line + 1,
            end = text.Lines.GetLinePosition(n.Span.End).Line + 1,
        };
        string Kind(SyntaxNode n) => n switch
        {
            ClassDeclarationSyntax => "class", InterfaceDeclarationSyntax => "interface", StructDeclarationSyntax => "struct", RecordDeclarationSyntax => "record", EnumDeclarationSyntax => "enum",
            MethodDeclarationSyntax => "method", ConstructorDeclarationSyntax => "constructor", PropertyDeclarationSyntax => "property", FieldDeclarationSyntax => "field", EventFieldDeclarationSyntax or EventDeclarationSyntax => "event", _ => "member",
        };
        var types = root.DescendantNodes().OfType<BaseTypeDeclarationSyntax>().Select(t =>
        {
            var members = (t as TypeDeclarationSyntax)?.Members.SelectMany(m => m switch
            {
                MethodDeclarationSyntax x => new[] { (Name: $"{x.Identifier.Text}({string.Join(", ", x.ParameterList.Parameters.Select(p => p.Type?.ToString()))})", Node: (SyntaxNode)x, Id: x.Identifier) },
                ConstructorDeclarationSyntax x => [($"{x.Identifier.Text}({string.Join(", ", x.ParameterList.Parameters.Select(p => p.Type?.ToString()))})", x, x.Identifier)],
                PropertyDeclarationSyntax x => [(x.Identifier.Text, x, x.Identifier)],
                FieldDeclarationSyntax x => x.Declaration.Variables.Select(v => (v.Identifier.Text, (SyntaxNode)x, v.Identifier)).ToArray(),
                EventDeclarationSyntax x => [(x.Identifier.Text, x, x.Identifier)],
                _ => [],
            }).Select(m => new { name = m.Item1, kind = Kind(m.Item2), range = Range(m.Item2, m.Item3) }).ToList() ?? [];
            var name = string.Join(".", t.AncestorsAndSelf().OfType<BaseTypeDeclarationSyntax>().Select(x => x.Identifier.Text).Reverse());
            return new { name, kind = Kind(t), range = Range(t, t.Identifier), members };
        }).ToList();
        return new { project = doc.Project.Name, types };
    }

    /// <summary>Go To Implementation (Ctrl+F12): implementations of an interface / abstract / virtual member, or the classes derived from a type.</summary>
    async Task<object> Implementations(Document doc, int position)
    {
        var symbol = await SymbolAt(doc, position) ?? throw new InvalidOperationException("No symbol at the cursor.");
        var solution = doc.Project.Solution;
        IEnumerable<ISymbol> found = symbol switch
        {
            INamedTypeSymbol { TypeKind: TypeKind.Interface } t => await SymbolFinder.FindImplementationsAsync(t, solution),
            INamedTypeSymbol t => await SymbolFinder.FindDerivedClassesAsync(t, solution),
            IMethodSymbol or IPropertySymbol or IEventSymbol => (await SymbolFinder.FindImplementationsAsync(symbol, solution)).Concat(await SymbolFinder.FindOverridesAsync(symbol, solution)),
            _ => [],
        };
        var locations = found.SelectMany(s => s.Locations).Where(InRepo).Distinct().Select(Location).ToList();
        return new { name = symbol.ToDisplayString(), locations };
    }
    /// <summary>Go To Base: the member this one overrides / implements, or a type's base type and interfaces.</summary>
    async Task<object> BaseOf(Document doc, int position)
    {
        var symbol = await SymbolAt(doc, position) ?? throw new InvalidOperationException("No symbol at the cursor.");
        IEnumerable<ISymbol> found = symbol switch
        {
            INamedTypeSymbol t => new ISymbol?[] { t.BaseType }.OfType<ISymbol>().Concat(t.Interfaces),
            IMethodSymbol m => new ISymbol?[] { m.OverriddenMethod }.OfType<ISymbol>().Concat(m.ContainingType.AllInterfaces.SelectMany(i => i.GetMembers().OfType<IMethodSymbol>()).Where(i => SymbolEqualityComparer.Default.Equals(m.ContainingType.FindImplementationForInterfaceMember(i), m))),
            IPropertySymbol p => new ISymbol?[] { p.OverriddenProperty }.OfType<ISymbol>(),
            _ => [],
        };
        var list = found.ToList();
        var locations = list.SelectMany(s => s.Locations).Where(InRepo).Distinct().Select(Location).ToList();
        return new { name = symbol.ToDisplayString(), locations, external = locations.Count == 0 ? list.FirstOrDefault()?.ToDisplayString() : null };
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
