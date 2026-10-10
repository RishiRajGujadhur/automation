using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using System.Text.RegularExpressions;
if (args.Contains("--match"))
{
    using var document = JsonDocument.Parse(Console.In.ReadToEnd());
    var definitions = document.RootElement.GetProperty("bindings").EnumerateArray().ToArray();
    var results = new List<object>(); var diagnostics = new HashSet<string>();
    foreach (var step in document.RootElement.GetProperty("steps").EnumerateArray())
    {
        var candidates = new List<string>();
        foreach (var binding in definitions)
        {
            if (binding.GetProperty("keyword").GetString() != step.GetProperty("keyword").GetString()) continue;
            try
            {
                var pattern = binding.GetProperty("pattern").GetString()!;
                // Keep leading .NET inline option groups at the beginning of the expression.
                var options = Regex.Match(pattern, @"^\(\?[imsnx-]+\)");
                var expression = options.Value + "\\A(?:" + pattern[options.Length..] + ")\\z";
                if (Regex.IsMatch(step.GetProperty("text").GetString()!, expression, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(100))) candidates.Add(binding.GetProperty("id").GetString()!);
            }
            catch (Exception e) when (e is ArgumentException || e is RegexMatchTimeoutException) { diagnostics.Add(binding.GetProperty("id").GetString() + ": " + e.GetType().Name); }
        }
        results.Add(new { candidates, status = candidates.Count == 1 ? "Matched" : candidates.Count > 1 ? "Ambiguous" : "Unmatched" });
    }
    Console.Write(JsonSerializer.Serialize(new { results, diagnostics })); return;
}
var input = JsonSerializer.Deserialize<string[]>(Console.In.ReadToEnd())!;
var trees = input.Select(f => CSharpSyntaxTree.ParseText(File.ReadAllText(f), path: f)).ToArray();
var compilation = CSharpCompilation.Create("StaticIndex", trees, new[] { MetadataReference.CreateFromFile(typeof(object).Assembly.Location) });
var bindings = new List<object>(); var selectors = new List<object>(); var methods = new List<object>(); var edges = new List<object>();
foreach (var tree in trees)
{
    var model = compilation.GetSemanticModel(tree); var root = tree.GetRoot();
    int Line(SyntaxNode n) => n.GetLocation().GetLineSpan().StartLinePosition.Line + 1;
    string Id(IMethodSymbol s) => s.OriginalDefinition.ToDisplayString();
    foreach (var m in root.DescendantNodes().OfType<MethodDeclarationSyntax>())
    {
        var symbol = model.GetDeclaredSymbol(m)!; var id = Id(symbol); var owner = symbol.ContainingType.Name;
        methods.Add(new { id, owner, name = m.Identifier.Text, file = tree.FilePath, line = Line(m) });
        foreach (var a in m.AttributeLists.SelectMany(x => x.Attributes))
        {
            var keyword = a.Name.ToString().Split('.').Last().Replace("Attribute", "");
            if (!new[] { "Given", "When", "Then" }.Contains(keyword)) continue;
            var expr = a.ArgumentList?.Arguments.FirstOrDefault()?.Expression;
            var value = expr is null ? default : model.GetConstantValue(expr);
            if (!value.HasValue || value.Value is not string pattern) continue;
            bindings.Add(new { id = id + ":" + Line(a) + ":" + keyword, keyword, pattern, className = owner, method = id, parameters = m.ParameterList.Parameters.Select(p => new { name = p.Identifier.Text, type = p.Type?.ToString() ?? "unknown" }), file = tree.FilePath, line = Line(a) });
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
Console.Write(JsonSerializer.Serialize(new { stepDefinitions = bindings, selectors, methods, callEdges = edges }));
