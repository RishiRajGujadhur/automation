using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Text.RegularExpressions;
// Cucumber expressions (SpecFlow 4 / Reqnroll) are converted to regex; classic regex patterns pass through.
// Detection follows Reqnroll: ^…$ → regex; {placeholders} → Cucumber; regex syntax (.*, \d, [..], quantifiers) → regex;
// anything else (plain text, optional "(s)", alternatives "a/b") → Cucumber. ExpressionType on the attribute wins.
static bool IsCucumber(string p)
{
    if (p.StartsWith("^") || p.EndsWith("$")) return false;
    if (Regex.IsMatch(p, @"\{[A-Za-z_][\w.]*\}|\{\}")) return true;
    if (Regex.IsMatch(p, @"\\[dDwWsSbB.()\[\]{}|*+?^$/]|\(\.\*\)|\(\.\+\)|[\[\]]|\([^()]*[*+?|][^()]*\)|[*+?]\)|\(\?")) return false;
    return true;
}
static string ToRegex(string p, bool cucumber)
{
    if (!cucumber) return p;
    var sb = new System.Text.StringBuilder();
    // Tokens: escaped char, {param}, (optional), word/word alternatives, other text.
    foreach (Match t in Regex.Matches(p, @"\\.|\{[^{}]*\}|\([^()]*\)|[^\s/{}()\\]+(?:/[^\s/{}()\\]+)+|[\s\S]"))
    {
        var x = t.Value;
        sb.Append(x switch
        {
            _ when x.Length == 2 && x[0] == '\\' => Regex.Escape(x[1].ToString()),
            "{int}" or "{long}" or "{byte}" or "{short}" or "{sbyte}" or "{biginteger}" => @"(-?\d+)",
            "{float}" or "{double}" or "{decimal}" => @"(-?\d*[.,]?\d+(?:[eE][-+]?\d+)?)",
            "{word}" => @"([^\s]+)",
            "{string}" => "(?:\"([^\"]*)\"|'([^']*)')",
            _ when x.StartsWith("{") => "(.*)",
            _ when x.StartsWith("(") => "(?:" + Regex.Escape(x[1..^1]) + ")?",
            _ when x.Contains('/') => "(?:" + string.Join("|", x.Split('/').Select(Regex.Escape)) + ")",
            _ => Regex.Escape(x),
        });
    }
    return sb.ToString();
}
// How specific a binding's scope is for this step (Reqnroll: scoped beats unscoped; more restrictions win). -1 = out of scope.
static int ScopeRank(JsonElement binding, JsonElement step)
{
    if (!binding.TryGetProperty("scopes", out var scopes) || scopes.GetArrayLength() == 0) return 0;
    var tags = step.TryGetProperty("tags", out var t) ? t.EnumerateArray().Select(x => x.GetString()!.TrimStart('@')).ToHashSet() : new HashSet<string>();
    string Prop(JsonElement e, string n) => e.TryGetProperty(n, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString()! : "";
    var best = -1;
    foreach (var s in scopes.EnumerateArray())
    {
        var ok = (Prop(s, "tag") == "" || tags.Contains(Prop(s, "tag").TrimStart('@'))) &&
            (Prop(s, "feature") == "" || Prop(s, "feature") == Prop(step, "feature")) &&
            (Prop(s, "scenario") == "" || Prop(s, "scenario") == Prop(step, "scenario"));
        if (ok) best = Math.Max(best, new[] { "tag", "feature", "scenario" }.Count(n => Prop(s, n) != ""));
    }
    return best;
}
if (args.Contains("--match"))
{
    using var document = JsonDocument.Parse(Console.In.ReadToEnd());
    var definitions = document.RootElement.GetProperty("bindings").EnumerateArray().ToArray();
    var results = new List<object>(); var diagnostics = new HashSet<string>();
    foreach (var step in document.RootElement.GetProperty("steps").EnumerateArray())
    {
        var matched = new List<(string Id, int Rank)>();
        foreach (var binding in definitions)
        {
            var kw = binding.GetProperty("keyword").GetString();
            if (kw != "StepDefinition" && kw != step.GetProperty("keyword").GetString()) continue;
            var rank = ScopeRank(binding, step);
            if (rank < 0) continue;
            try
            {
                var raw = binding.GetProperty("pattern").GetString()!;
                var cucumber = binding.TryGetProperty("expression", out var ex) ? ex.GetString() == "Cucumber" : IsCucumber(raw);
                var pattern = ToRegex(raw, cucumber);
                // Keep leading .NET inline option groups at the beginning of the expression.
                var options = Regex.Match(pattern, @"^\(\?[imsnx-]+\)");
                var expression = options.Value + "\\A(?:" + pattern[options.Length..] + ")\\z";
                if (Regex.IsMatch(step.GetProperty("text").GetString()!, expression, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))) matched.Add((binding.GetProperty("id").GetString()!, rank));
            }
            catch (Exception e) when (e is ArgumentException || e is RegexMatchTimeoutException) { diagnostics.Add(binding.GetProperty("id").GetString() + ": " + e.GetType().Name); }
        }
        // Scoped bindings win over unscoped ones; among scoped, the most specific scope wins (ties stay ambiguous).
        var top = matched.Count == 0 ? 0 : matched.Max(m => m.Rank);
        var candidates = matched.Where(m => m.Rank == top).Select(m => m.Id).Distinct().ToList();
        results.Add(new { candidates, status = candidates.Count == 1 ? "Matched" : candidates.Count > 1 ? "Ambiguous" : "Unmatched" });
    }
    Console.Write(JsonSerializer.Serialize(new { results, diagnostics })); return;
}
if (args.Contains("--diagnostics"))
{
    // Editor diagnostics for one C# file: Roslyn syntax errors plus step-binding checks
    // (parameter count vs. pattern placeholders, duplicate patterns). Input: { "source": "...", "path": "..." }.
    using var document = JsonDocument.Parse(Console.In.ReadToEnd());
    var source = document.RootElement.GetProperty("source").GetString() ?? "";
    var path = document.RootElement.TryGetProperty("path", out var p) ? p.GetString() ?? "" : "";
    var tree = CSharpSyntaxTree.ParseText(source, path: path);
    var items = new List<object>();
    void Add(Location location, string severity, string id, string message)
    {
        var span = location.GetLineSpan();
        items.Add(new { line = span.StartLinePosition.Line + 1, column = span.StartLinePosition.Character + 1, endLine = span.EndLinePosition.Line + 1, endColumn = span.EndLinePosition.Character + 1, severity, id, message });
    }
    foreach (var d in tree.GetDiagnostics())
        Add(d.Location, d.Severity == DiagnosticSeverity.Error ? "error" : "warning", d.Id, d.GetMessage());
    var seen = new Dictionary<string, int>();
    foreach (var method in tree.GetRoot().DescendantNodes().OfType<MethodDeclarationSyntax>())
    {
        foreach (var attribute in method.AttributeLists.SelectMany(a => a.Attributes))
        {
            var name = attribute.Name.ToString().Split('.').Last().Replace("Attribute", "");
            if (name is not ("Given" or "When" or "Then" or "StepDefinition")) continue;
            if (attribute.ArgumentList?.Arguments.FirstOrDefault()?.Expression is not LiteralExpressionSyntax literal) continue;
            var pattern = literal.Token.ValueText;
            var key = name + " " + pattern;
            if (seen.TryGetValue(key, out var firstLine))
                Add(attribute.GetLocation(), "warning", "TAS002", $"Duplicate [{name}] pattern; the same pattern is bound on line {firstLine}. SpecFlow reports this step as ambiguous.");
            else seen[key] = attribute.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
            int groups;
            var cuke = IsCucumber(pattern);
            try { groups = new Regex(ToRegex(pattern, cuke)).GetGroupNumbers().Length - 1; }
            catch (ArgumentException e) { Add(literal.GetLocation(), "error", "TAS003", "Invalid step pattern: " + e.Message); continue; }
            if (cuke) groups = Regex.Matches(pattern, @"(?<!\\)\{[^{}]*\}").Count; // {string} expands to two alternatives
            var parameters = method.ParameterList.Parameters;
            // A trailing Table or DocString argument is allowed on top of the pattern's captures.
            var extra = parameters.Count > 0 && parameters.Last().Type?.ToString() is "Table" or "DataTable" or "string" && parameters.Count == groups + 1 ? 1 : 0;
            if (parameters.Count - extra != groups)
                Add(method.ParameterList.GetLocation(), "error", "TAS001", $"The pattern has {groups} placeholder{(groups == 1 ? "" : "s")} but the method takes {parameters.Count} parameter{(parameters.Count == 1 ? "" : "s")}.");
        }
    }
    Console.Write(JsonSerializer.Serialize(items)); return;
}
var input = JsonSerializer.Deserialize<string[]>(Console.In.ReadToEnd())!;
var trees = input.Select(f => CSharpSyntaxTree.ParseText(File.ReadAllText(f), path: f)).ToArray();
var compilation = CSharpCompilation.Create("StaticIndex", trees, new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });
var hooks = new List<object>();
var bindings = new List<object>(); var selectors = new List<object>(); var methods = new List<object>(); var edges = new List<object>();
foreach (var tree in trees)
{
    var model = compilation.GetSemanticModel(tree); var root = tree.GetRoot();
    int Line(SyntaxNode n) => n.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
    string Id(IMethodSymbol s) => s.OriginalDefinition.ToDisplayString();
    IEnumerable<object> Scopes(SyntaxList<AttributeListSyntax> lists) => lists.SelectMany(x => x.Attributes)
        .Where(a => a.Name.ToString().Split('.').Last().Replace("Attribute", "") == "Scope")
        .Select(a =>
        {
            string Arg(string n) { var e = a.ArgumentList?.Arguments.FirstOrDefault(x => x.NameEquals?.Name.Identifier.Text == n)?.Expression; var v = e is null ? default : model.GetConstantValue(e); return v.HasValue ? v.Value as string ?? "" : ""; }
            return new { tag = Arg("Tag"), feature = Arg("Feature"), scenario = Arg("Scenario") };
        });
    foreach (var m in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
    {
        var symbol = model.GetDeclaredSymbol(m)!; var id = Id(symbol); var owner = symbol.ContainingType.Name;
        methods.Add(new { id, owner, name = m.Identifier.Text, file = tree.FilePath, line = Line(m) });
        foreach (var a in m.AttributeLists.SelectMany(x => x.Attributes))
        {
            var keyword = a.Name.ToString().Split('.').Last().Replace("Attribute", "");
            if (!new[] { "Given", "When", "Then", "StepDefinition" }.Contains(keyword)) continue;
            var expr = a.ArgumentList?.Arguments.FirstOrDefault()?.Expression;
            var value = expr is null ? default : model.GetConstantValue(expr);
            if (!value.HasValue || value.Value is not string pattern) continue;
            // ExpressionType = ExpressionType.CucumberExpression / RegularExpression overrides detection.
            var et = a.ArgumentList?.Arguments.FirstOrDefault(x => x.NameEquals?.Name.Identifier.Text == "ExpressionType")?.Expression.ToString() ?? "";
            var cucumberExpr = et.EndsWith("CucumberExpression") ? true : et.EndsWith("RegularExpression") ? false : IsCucumber(pattern);
            bindings.Add(new { id = id + ":" + Line(a) + ":" + keyword, keyword, pattern, expression = cucumberExpr ? "Cucumber" : "Regex", scopes = Scopes(m.AttributeLists).Concat(Scopes((m.Parent as ClassDeclarationSyntax)?.AttributeLists ?? default)).ToArray(), className = owner, method = id, parameters = m.ParameterList.Parameters.Select(p => new { name = p.Identifier.Text, type = p.Type?.ToString() ?? "unknown" }), file = tree.FilePath, line = Line(a) });
        }
        // Hooks (Reqnroll / SpecFlow): kind, Order, tag filter (positional strings or `tags:`), and [Scope] on method or class.
        foreach (var a in m.AttributeLists.SelectMany(x => x.Attributes))
        {
            var name = a.Name.ToString().Split('.').Last().Replace("Attribute", "");
            var kind = name switch { "Before" => "BeforeScenario", "After" => "AfterScenario", _ => name };
            if (kind is not ("BeforeTestRun" or "AfterTestRun" or "BeforeFeature" or "AfterFeature" or "BeforeScenario" or "AfterScenario" or "BeforeScenarioBlock" or "AfterScenarioBlock" or "BeforeStep" or "AfterStep")) continue;
            var hookArgs = a.ArgumentList?.Arguments ?? default;
            int? order = null; var tags = new List<string>();
            foreach (var arg in hookArgs)
            {
                var n = arg.NameEquals?.Name.Identifier.Text ?? arg.NameColon?.Name.Identifier.Text;
                if (n == "Order") { var v = model.GetConstantValue(arg.Expression); if (v.HasValue && v.Value is int o) order = o; continue; }
                IEnumerable<ExpressionSyntax> items = arg.Expression switch
                {
                    ImplicitArrayCreationExpressionSyntax ia => ia.Initializer.Expressions,
                    ArrayCreationExpressionSyntax ac when ac.Initializer != null => ac.Initializer.Expressions,
                    CollectionExpressionSyntax ce => ce.Elements.OfType<ExpressionElementSyntax>().Select(e => e.Expression),
                    _ => new[] { arg.Expression },
                };
                foreach (var it in items) { var v = model.GetConstantValue(it); if (v.HasValue && v.Value is string t && t.Length > 0) tags.Add(t.TrimStart('@')); }
            }
            hooks.Add(new { kind, order = order ?? 10000, tags, scopes = Scopes(m.AttributeLists).Concat(Scopes((m.Parent as ClassDeclarationSyntax)?.AttributeLists ?? default)).ToArray(), className = owner, method = m.Identifier.Text, file = tree.FilePath, line = Line(m) });
        }
        foreach (var inv in m.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            var resolved = model.GetSymbolInfo(inv).Symbol as IMethodSymbol;
            edges.Add(new { from = id, to = resolved is null ? inv.Expression.ToString() : Id(resolved), resolution = resolved is null ? "Unresolved" : "Resolved" });
        }
        foreach (var expr in m.DescendantNodes().OfType<IdentifierNameSyntax>())
        {
            if (model.GetSymbolInfo(expr).Symbol is IPropertySymbol prop && prop.DeclaringSyntaxReferences.Length > 0)
                edges.Add(new { from = id, to = prop.ToDisplayString(), resolution = "Resolved" });
        }
    }
    foreach (var inv in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
    {
        var name = inv.Expression is MemberAccessExpressionSyntax ma ? ma.Name.Identifier.Text : inv.Expression.ToString();
        if (!new[] { "GetByTestId", "GetByRole", "GetByLabel", "GetByText", "Locator" }.Contains(name)) continue;
        var arg = inv.ArgumentList.Arguments.FirstOrDefault()?.Expression;
        var constant = arg is null ? default : model.GetConstantValue(arg);
        var role = arg?.ToString().StartsWith("AriaRole.") == true;
        var member = inv.Ancestors().FirstOrDefault(n => n is MethodDeclarationSyntax || n is PropertyDeclarationSyntax);
        var selectorId = tree.FilePath + ":" + Line(inv);
        if (member is PropertyDeclarationSyntax property) edges.Add(new { from = model.GetDeclaredSymbol(property)!.ToDisplayString(), to = selectorId, resolution = "Resolved" });
        if (member is MethodDeclarationSyntax method) edges.Add(new { from = Id(model.GetDeclaredSymbol(method)!), to = selectorId, resolution = "Resolved" });
        var dynamicOption = inv.ArgumentList.Arguments.Skip(1).SelectMany(a => a.DescendantNodes().OfType<AssignmentExpressionSyntax>()).Any(a => !model.GetConstantValue(a.Right).HasValue);
        selectors.Add(new { id = selectorId, owner = inv.Ancestors().OfType<ClassDeclarationSyntax>().FirstOrDefault()?.Identifier.Text ?? "", member = member is MethodDeclarationSyntax mm ? mm.Identifier.Text : (member as PropertyDeclarationSyntax)?.Identifier.Text ?? "", type = name, value = inv.ToString(), resolution = (constant.HasValue || role) && !dynamicOption ? "Static" : "Unresolved", file = tree.FilePath, line = Line(inv) });
    }
}
Console.Write(JsonSerializer.Serialize(new { stepDefinitions = bindings, hooks, selectors, methods, callEdges = edges }));
