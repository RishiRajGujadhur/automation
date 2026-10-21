using System.Text.Json;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

/// <summary>Solution-wide analyses of RIDER-VSCODE-FEATURES.md: duplicates, dependency cycles, layer rules, public API.</summary>
sealed partial class LanguageService
{
    IEnumerable<Document> RepoDocuments() => workspace!.CurrentSolution.Projects.SelectMany(p => p.Documents)
        .Where(d => d.FilePath != null && Path.GetFullPath(d.FilePath).StartsWith(root, StringComparison.OrdinalIgnoreCase) && !d.FilePath.EndsWith(".g.cs") && !d.FilePath.EndsWith(".feature.cs") && !d.FilePath.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}"));

    // ------------------------------------------------------------------ duplicate code (119)
    /// <summary>
    /// Code that appears more than once (Rider's duplicate finder): token sequences with identifiers and literals
    /// normalised, at least `minTokens` long, in methods and constructors. Groups of the places that repeat.
    /// </summary>
    async Task<object> Duplicates(int minTokens)
    {
        minTokens = Math.Clamp(minTokens, 20, 500);
        var units = new List<(string File, SyntaxToken[] Tokens, string[] Shape)>();
        foreach (var d in RepoDocuments())
        {
            var rootNode = await d.GetSyntaxRootAsync();
            if (rootNode == null) continue;
            foreach (var body in rootNode.DescendantNodes().Where(n => n is BlockSyntax { Parent: BaseMethodDeclarationSyntax or AccessorDeclarationSyntax or LocalFunctionStatementSyntax }))
            {
                var tokens = body.DescendantTokens().ToArray();
                if (tokens.Length < minTokens) continue;
                var shape = tokens.Select(t => t.Kind() switch { SyntaxKind.IdentifierToken => "ID", SyntaxKind.NumericLiteralToken or SyntaxKind.StringLiteralToken or SyntaxKind.CharacterLiteralToken or SyntaxKind.InterpolatedStringTextToken => "LIT", _ => t.Text }).ToArray();
                units.Add((Rel(d.FilePath!), tokens, shape));
            }
        }
        // Windows of minTokens tokens hashed; equal windows in two places are a duplicate, grown as far as they stay equal.
        var index = new Dictionary<string, List<(int Unit, int Start)>>();
        for (var u = 0; u < units.Count; u++)
            for (var s = 0; s + minTokens <= units[u].Shape.Length; s += Math.Max(1, minTokens / 4))
            {
                var key = string.Join(" ", units[u].Shape, s, minTokens);
                if (!index.TryGetValue(key, out var l)) index[key] = l = [];
                l.Add((u, s));
            }
        var groups = new List<(int Length, List<(int Unit, int Start)> Places)>();
        var covered = new HashSet<(int, int)>();
        foreach (var places in index.Values.Where(v => v.Select(p => p.Unit).Distinct().Count() > 1 || v.Count > 1 && v.Max(p => p.Start) - v.Min(p => p.Start) >= minTokens))
        {
            if (places.All(p => covered.Contains((p.Unit, p.Start)))) continue;
            // Grow the match while every place keeps the same token shape.
            var len = minTokens;
            while (places.All(p => p.Start + len < units[p.Unit].Shape.Length) && places.Select(p => units[p.Unit].Shape[p.Start + len]).Distinct().Count() == 1) len++;
            foreach (var p in places) for (var k = p.Start; k < p.Start + len; k += Math.Max(1, minTokens / 4)) covered.Add((p.Unit, k - (k - p.Start) % Math.Max(1, minTokens / 4)));
            groups.Add((len, places));
        }
        return groups.OrderByDescending(g => g.Length).Take(60).Select(g => new
        {
            tokens = g.Length,
            places = g.Places.Select(p =>
            {
                var (file, tokens, _) = units[p.Unit];
                var first = tokens[p.Start].GetLocation().GetLineSpan();
                var last = tokens[Math.Min(tokens.Length - 1, p.Start + g.Length - 1)].GetLocation().GetLineSpan();
                return new { file, line = first.StartLinePosition.Line + 1, endLine = last.EndLinePosition.Line + 1 };
            }).GroupBy(x => (x.file, x.line)).Select(x => x.First()).ToList(),
        }).Where(g => g.places.Count > 1).ToList();
    }

    // ------------------------------------------------------------------ dependency cycles (121) and layer rules (122)
    /// <summary>Which namespaces each namespace uses (by the types its code refers to), with one place per edge.</summary>
    async Task<Dictionary<string, Dictionary<string, (string File, int Line)>>> NamespaceGraph()
    {
        var graph = new Dictionary<string, Dictionary<string, (string, int)>>();
        foreach (var d in RepoDocuments())
        {
            var model = await d.GetSemanticModelAsync();
            var rootNode = await d.GetSyntaxRootAsync();
            if (model == null || rootNode == null) continue;
            foreach (var typeDecl in rootNode.DescendantNodes().OfType<BaseTypeDeclarationSyntax>())
            {
                var from = model.GetDeclaredSymbol(typeDecl)?.ContainingNamespace?.ToDisplayString();
                if (string.IsNullOrEmpty(from) || from == "<global namespace>") continue;
                foreach (var name in typeDecl.DescendantNodes().OfType<SimpleNameSyntax>())
                {
                    if (model.GetSymbolInfo(name).Symbol is not { } s) continue;
                    var t = s as INamedTypeSymbol ?? s.ContainingType;
                    if (t == null || !t.Locations.Any(InRepo)) continue;
                    var to = t.ContainingNamespace?.ToDisplayString();
                    if (string.IsNullOrEmpty(to) || to == from || to == "<global namespace>") continue;
                    if (!graph.TryGetValue(from, out var edges)) graph[from] = edges = [];
                    if (!edges.ContainsKey(to)) edges[to] = (Rel(d.FilePath!), name.GetLocation().GetLineSpan().StartLinePosition.Line + 1);
                }
            }
        }
        return graph;
    }
    /// <summary>Cycles between namespaces (strongly connected components) and between projects (ProjectReference).</summary>
    async Task<object> DependencyCycles()
    {
        var graph = await NamespaceGraph();
        var cycles = new List<object>();
        foreach (var scc in Components(graph.ToDictionary(k => k.Key, v => v.Value.Keys.ToList())).Where(c => c.Count > 1))
        {
            var set = scc.ToHashSet();
            var edges = scc.SelectMany(a => graph.GetValueOrDefault(a)?.Where(e => set.Contains(e.Key)).Select(e => new { from = a, to = e.Key, file = e.Value.File, line = e.Value.Line }) ?? []).ToList();
            cycles.Add(new { kind = "namespace", members = scc.OrderBy(x => x).ToList(), edges });
        }
        // Projects: references read from the .csproj files.
        var projects = new Dictionary<string, List<string>>();
        foreach (var p in workspace!.CurrentSolution.Projects.Where(p => p.FilePath != null && File.Exists(p.FilePath)))
        {
            try
            {
                var dir = Path.GetDirectoryName(p.FilePath)!;
                projects[Path.GetFileNameWithoutExtension(p.FilePath!)] = XDocument.Load(p.FilePath!).Descendants().Where(e => e.Name.LocalName == "ProjectReference").Select(e => (string?)e.Attribute("Include")).OfType<string>().Select(i => Path.GetFileNameWithoutExtension(i.Replace('\\', Path.DirectorySeparatorChar))).ToList();
            }
            catch { }
        }
        foreach (var scc in Components(projects).Where(c => c.Count > 1)) cycles.Add(new { kind = "project", members = scc.OrderBy(x => x).ToList(), edges = new List<object>() });
        return new { cycles, namespaces = graph.Count };
    }
    /// <summary>Tarjan's strongly connected components.</summary>
    static List<List<string>> Components(Dictionary<string, List<string>> g)
    {
        var index = new Dictionary<string, int>(); var low = new Dictionary<string, int>(); var stack = new Stack<string>(); var on = new HashSet<string>(); var result = new List<List<string>>(); var i = 0;
        void Visit(string v)
        {
            index[v] = low[v] = i++; stack.Push(v); on.Add(v);
            foreach (var w in g.GetValueOrDefault(v) ?? [])
            {
                if (!index.ContainsKey(w)) { Visit(w); low[v] = Math.Min(low[v], low[w]); }
                else if (on.Contains(w)) low[v] = Math.Min(low[v], index[w]);
            }
            if (low[v] != index[v]) return;
            var c = new List<string>();
            string x;
            do { x = stack.Pop(); on.Remove(x); c.Add(x); } while (x != v);
            result.Add(c);
        }
        foreach (var v in g.Keys.Concat(g.Values.SelectMany(x => x)).Distinct().ToList()) if (!index.ContainsKey(v)) Visit(v);
        return result;
    }
    /// <summary>
    /// Layer rules from layers.json at the repository root: `{ "layers": [{ "name": "Steps", "namespaces": ["*.Steps*"] }],
    /// "rules": [{ "from": "Pages", "notTo": "Steps" }] }`. Every reference that breaks a rule, with its place.
    /// </summary>
    async Task<object> LayerViolations()
    {
        var file = Path.Combine(root, "layers.json");
        if (!File.Exists(file)) return new { configured = false, violations = new List<object>(), layers = new List<string>() };
        using var json = JsonDocument.Parse(File.ReadAllText(file), new JsonDocumentOptions { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        var layers = json.RootElement.GetProperty("layers").EnumerateArray().Select(l => (Name: l.GetProperty("name").GetString()!, Patterns: l.GetProperty("namespaces").EnumerateArray().Select(x => x.GetString()!).ToList())).ToList();
        var rules = json.RootElement.TryGetProperty("rules", out var r) ? r.EnumerateArray().Select(x => (From: x.GetProperty("from").GetString()!, NotTo: x.GetProperty("notTo").GetString()!)).ToList() : [];
        System.Text.RegularExpressions.Regex Glob(string g) => new("^" + System.Text.RegularExpressions.Regex.Escape(g).Replace(@"\*", ".*") + "$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        string? LayerOf(string ns) => layers.FirstOrDefault(l => l.Patterns.Any(p => Glob(p).IsMatch(ns))).Name;
        var violations = new List<object>();
        foreach (var d in RepoDocuments())
        {
            var model = await d.GetSemanticModelAsync();
            var rootNode = await d.GetSyntaxRootAsync();
            if (model == null || rootNode == null) continue;
            foreach (var typeDecl in rootNode.DescendantNodes().OfType<BaseTypeDeclarationSyntax>())
            {
                var fromNs = model.GetDeclaredSymbol(typeDecl)?.ContainingNamespace?.ToDisplayString() ?? "";
                var from = LayerOf(fromNs);
                if (from == null) continue;
                var seen = new HashSet<string>();
                foreach (var name in typeDecl.DescendantNodes().OfType<SimpleNameSyntax>())
                {
                    var t = model.GetSymbolInfo(name).Symbol switch { INamedTypeSymbol nt => nt, { ContainingType: { } ct } => ct, _ => null };
                    if (t == null || !t.Locations.Any(InRepo)) continue;
                    var to = LayerOf(t.ContainingNamespace?.ToDisplayString() ?? "");
                    if (to == null || to == from || !rules.Any(x => x.From == from && x.NotTo == to)) continue;
                    var line = name.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
                    if (!seen.Add($"{t.Name}:{line}")) continue;
                    violations.Add(new { from, to, type = t.Name, file = Rel(d.FilePath!), line, message = $"{from} must not use {to}: {typeDecl.Identifier.Text} uses {t.Name}" });
                }
            }
        }
        return new { configured = true, layers = layers.Select(l => l.Name).ToList(), violations };
    }

    // ------------------------------------------------------------------ public API (124, 125)
    /// <summary>The public API of each project, one signature per line (sorted), as a PublicAPI.Shipped.txt baseline.</summary>
    async Task<object> PublicApi()
    {
        var fmt = new SymbolDisplayFormat(globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted, typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameAndContainingTypesAndNamespaces,
            genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters, memberOptions: SymbolDisplayMemberOptions.IncludeContainingType | SymbolDisplayMemberOptions.IncludeParameters | SymbolDisplayMemberOptions.IncludeType | SymbolDisplayMemberOptions.IncludeModifiers | SymbolDisplayMemberOptions.IncludeExplicitInterface,
            parameterOptions: SymbolDisplayParameterOptions.IncludeType | SymbolDisplayParameterOptions.IncludeParamsRefOut | SymbolDisplayParameterOptions.IncludeDefaultValue | SymbolDisplayParameterOptions.IncludeOptionalBrackets,
            propertyStyle: SymbolDisplayPropertyStyle.ShowReadWriteDescriptor, kindOptions: SymbolDisplayKindOptions.IncludeTypeKeyword,
            miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);
        var result = new List<object>();
        foreach (var p in workspace!.CurrentSolution.Projects.Where(p => p.FilePath != null))
        {
            var c = await p.GetCompilationAsync();
            if (c == null) continue;
            var lines = new SortedSet<string>(StringComparer.Ordinal);
            void Walk(INamespaceOrTypeSymbol n)
            {
                foreach (var m in n.GetMembers())
                {
                    if (m is INamespaceSymbol ns) { Walk(ns); continue; }
                    if (!m.Locations.Any(InRepo) || m.IsImplicitlyDeclared) continue;
                    if (m.DeclaredAccessibility is not (Accessibility.Public or Accessibility.Protected or Accessibility.ProtectedOrInternal)) continue;
                    if (m.ContainingType != null && m.ContainingType.DeclaredAccessibility != Accessibility.Public) continue;
                    if (m is IMethodSymbol { MethodKind: MethodKind.PropertyGet or MethodKind.PropertySet or MethodKind.EventAdd or MethodKind.EventRemove }) continue;
                    lines.Add(m.ToDisplayString(fmt));
                    if (m is INamedTypeSymbol t) Walk(t);
                }
            }
            Walk(c.Assembly.GlobalNamespace);
            var dir = Path.GetDirectoryName(p.FilePath!)!;
            var baselineFile = Path.Combine(dir, "PublicAPI.Shipped.txt");
            var baseline = File.Exists(baselineFile) ? File.ReadAllLines(baselineFile).Select(l => l.Trim()).Where(l => l.Length > 0 && !l.StartsWith("#")).ToList() : null;
            result.Add(new { project = p.Name, baselineFile = Rel(baselineFile), hasBaseline = baseline != null, api = lines.ToList(), baseline });
        }
        return result;
    }
}
