using System.Text.Json.Nodes;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Editing;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Formatting;
using Microsoft.CodeAnalysis.Rename;
using Microsoft.CodeAnalysis.Text;
using static Microsoft.CodeAnalysis.CSharp.SyntaxFactory;

/// <summary>
/// Refactorings of RIDER-VSCODE-FEATURES.md that Roslyn has no headless provider for: change signature, LINQ to loops,
/// method to local function, introduce field / property, inline field, pull up / push down, extract superclass,
/// move static members, factory methods. Each returns the files it changes; nothing is written here.
/// </summary>
sealed partial class LanguageService
{
    async Task<object> Refactor(Document doc, int position, int end, JsonObject req)
    {
        var kind = (string)req["kind"]!;
        var before = doc.Project.Solution;
        var (title, after) = kind switch
        {
            "signatureInfo" => throw new InvalidOperationException("internal"),
            "changeSignature" => await ChangeSignature(doc, position, req["parameters"]!.AsArray().Select(p => ((int)p!["index"]!, (string?)p["name"])).ToList()),
            "removeUnusedParameters" => await RemoveUnusedParameters(doc, position),
            "linqToLoop" => await LinqToLoop(doc, position),
            "toLocalFunction" => await ToLocalFunction(doc, position),
            "introduceField" => await IntroduceMember(doc, position, end, property: false, (string?)req["name"]),
            "introduceProperty" => await IntroduceMember(doc, position, end, property: true, (string?)req["name"]),
            "inlineField" => await InlineField(doc, position),
            "pullUp" => await PullUp(doc, position),
            "pushDown" => await PushDown(doc, position),
            "extractSuperclass" => await ExtractSuperclass(doc, position, (string?)req["name"]),
            "moveStatic" => await MoveStatic(doc, position, (string)req["target"]!),
            "factory" => await Factory(doc, position, replace: (bool?)req["replace"] ?? false),
            _ => throw new InvalidOperationException($"Unknown refactoring {kind}."),
        };
        return new { title, changes = await ChangedFiles(before, after) };
    }

    /// <summary>The documents `after` changes (their full new text), with added documents.</summary>
    async Task<List<object>> ChangedFiles(Solution before, Solution after)
    {
        var list = new List<object>();
        foreach (var p in after.GetChanges(before).GetProjectChanges())
            foreach (var id in p.GetChangedDocuments().Concat(p.GetAddedDocuments()))
            {
                var d = after.GetDocument(id)!;
                if (d.FilePath == null) continue;
                var formatted = await Formatter.FormatAsync(d, Formatter.Annotation);
                var old = before.GetDocument(id) is { } o ? (await o.GetTextAsync()).ToString() : "\n";
                list.Add(new { file = Rel(d.FilePath), text = MatchEol(old, (await formatted.GetTextAsync()).ToString()), added = before.GetDocument(id) == null });
            }
        return list;
    }

    // ------------------------------------------------------------------ change signature (61, 98, 99)
    /// <summary>The parameters of the method at the caret, for the Change Signature dialog.</summary>
    async Task<object> SignatureInfo(Document doc, int position)
    {
        var m = await MethodAt(doc, position);
        var unused = await UnusedParameters(m);
        return new { name = m.ToDisplayString(SymbolDisplayFormat.CSharpShortErrorMessageFormat), parameters = m.Parameters.Select((p, i) => new { index = i, name = p.Name, type = p.Type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat), optional = p.HasExplicitDefaultValue, @params = p.IsParams, unused = unused.Contains(p.Name) }).ToList() };
    }
    async Task<IMethodSymbol> MethodAt(Document doc, int position)
    {
        var s = await SymbolAt(doc, position);
        if (s is IMethodSymbol m && m.MethodKind is MethodKind.Ordinary or MethodKind.Constructor && m.Locations.Any(InRepo)) return m;
        // The caret anywhere in a method's header or body.
        var root = (await doc.GetSyntaxRootAsync())!;
        var node = root.FindToken(position).Parent?.AncestorsAndSelf().FirstOrDefault(n => n is BaseMethodDeclarationSyntax);
        if (node != null && (await doc.GetSemanticModelAsync())!.GetDeclaredSymbol(node) is IMethodSymbol dm) return dm;
        throw new InvalidOperationException("Put the caret on a method or constructor declared in this repository.");
    }
    /// <summary>Parameters the method's body never reads (and overrides / implementations do not either).</summary>
    async Task<HashSet<string>> UnusedParameters(IMethodSymbol m)
    {
        var used = new HashSet<string>();
        foreach (var r in m.DeclaringSyntaxReferences)
        {
            var node = await r.GetSyntaxAsync();
            var body = (SyntaxNode?)(node as BaseMethodDeclarationSyntax)?.Body ?? (node as BaseMethodDeclarationSyntax)?.ExpressionBody;
            if (body == null) return [];
            foreach (var id in body.DescendantNodes().OfType<IdentifierNameSyntax>()) used.Add(id.Identifier.Text);
        }
        if (m.IsAbstract || m.IsVirtual || m.IsOverride || m.ContainingType.TypeKind == TypeKind.Interface || m.ExplicitInterfaceImplementations.Length > 0) return [];
        return m.Parameters.Select(p => p.Name).Where(n => !used.Contains(n)).ToHashSet();
    }
    async Task<(string, Solution)> RemoveUnusedParameters(Document doc, int position)
    {
        var m = await MethodAt(doc, position);
        var unused = await UnusedParameters(m);
        if (unused.Count == 0) throw new InvalidOperationException($"{m.Name} has no unused parameters (or it is virtual, abstract or an interface member).");
        var keep = m.Parameters.Select((p, i) => (i, (string?)null)).Where(x => !unused.Contains(m.Parameters[x.i].Name)).ToList();
        var (_, after) = await ChangeSignature(doc, position, keep);
        return ($"Remove unused parameters of {m.Name}: {string.Join(", ", unused)}", after);
    }
    /// <summary>
    /// New parameter list: each entry is an index into the old parameters (order = new order; missing = removed) and an
    /// optional new name. The declaration (and overrides / implementations) and every call are updated.
    /// </summary>
    async Task<(string, Solution)> ChangeSignature(Document doc, int position, List<(int Index, string? Name)> spec)
    {
        var method = await MethodAt(doc, position);
        var solution = doc.Project.Solution;
        // Renames first (Roslyn's renamer updates the parameter's uses and named arguments).
        foreach (var (i, name) in spec.Where(s => !string.IsNullOrWhiteSpace(s.Name) && s.Name != method.Parameters[s.Index].Name))
        {
            var current = (IMethodSymbol)(await SymbolFinder.FindSourceDefinitionAsync(method, solution) ?? method);
            current = await Refind(solution, method) ?? current;
            solution = await Renamer.RenameSymbolAsync(solution, current.Parameters[i], new SymbolRenameOptions(), name!);
        }
        method = await Refind(solution, method) ?? method;
        var family = new List<IMethodSymbol> { method };
        if (method.MethodKind == MethodKind.Ordinary)
        {
            foreach (var o in await SymbolFinder.FindOverridesAsync(method, solution)) if (o is IMethodSymbol om) family.Add(om);
            foreach (var o in await SymbolFinder.FindImplementationsAsync(method, solution)) if (o is IMethodSymbol im) family.Add(im);
        }
        var order = spec.Select(s => s.Index).ToList();
        var oldNames = method.Parameters.Select(p => p.Name).ToList();
        var edits = new Dictionary<DocumentId, List<(SyntaxNode Old, SyntaxNode New)>>();
        void Add(Document d, SyntaxNode o, SyntaxNode n) { if (!edits.TryGetValue(d.Id, out var l)) edits[d.Id] = l = []; l.Add((o, n)); }
        foreach (var m in family.Distinct<IMethodSymbol>(SymbolEqualityComparer.Default))
        {
            foreach (var r in m.DeclaringSyntaxReferences)
            {
                var node = await r.GetSyntaxAsync();
                var d = solution.GetDocument(r.SyntaxTree);
                if (d == null || node is not BaseMethodDeclarationSyntax decl) continue;
                var ps = decl.ParameterList.Parameters;
                Add(d, decl.ParameterList, decl.ParameterList.WithParameters(Spaced(order.Where(i => i < ps.Count).Select(i => ps[i].WithoutLeadingTrivia()))).WithAdditionalAnnotations(Formatter.Annotation));
            }
            foreach (var refd in await SymbolFinder.FindReferencesAsync(m, solution))
                foreach (var loc in refd.Locations)
                {
                    var d = loc.Document;
                    var root = await d.GetSyntaxRootAsync();
                    var at = root!.FindNode(loc.Location.SourceSpan, getInnermostNodeForTie: true);
                    var args = at.AncestorsAndSelf().Select(n => n switch { InvocationExpressionSyntax inv => inv.ArgumentList, BaseObjectCreationExpressionSyntax oc => oc.ArgumentList, ConstructorInitializerSyntax ci => ci.ArgumentList, _ => null }).FirstOrDefault(a => a != null);
                    if (args == null) continue;
                    // Each argument's parameter: named ones by name, positional ones by place (extra params values to the last).
                    var byIndex = new Dictionary<int, ArgumentSyntax>();
                    for (var k = 0; k < args.Arguments.Count; k++)
                    {
                        var a = args.Arguments[k];
                        var ix = a.NameColon != null ? oldNames.IndexOf(a.NameColon.Name.Identifier.Text) : Math.Min(k, oldNames.Count - 1);
                        if (ix >= 0 && !byIndex.ContainsKey(ix)) byIndex[ix] = a;
                    }
                    // New order; after an omitted (optional) argument the rest must name their parameter.
                    var next = new List<ArgumentSyntax>();
                    var gap = false;
                    foreach (var i in order)
                    {
                        if (!byIndex.TryGetValue(i, out var a)) { gap = true; continue; }
                        next.Add(gap && a.NameColon == null ? a.WithNameColon(NameColon(IdentifierName(oldNames[i]))) : a);
                    }
                    Add(d, args, args.WithArguments(Spaced(next.Select(x => x.WithoutLeadingTrivia()))).WithAdditionalAnnotations(Formatter.Annotation));
                }
        }
        foreach (var (id, list) in edits)
        {
            var d = solution.GetDocument(id)!;
            var root = (await d.GetSyntaxRootAsync())!;
            var distinct = list.GroupBy(e => e.Old.Span).Select(g => g.First()).ToList();
            root = root.ReplaceNodes(distinct.Select(e => e.Old), (o, _) => distinct.First(e => e.Old == o).New);
            solution = solution.WithDocumentSyntaxRoot(id, root);
        }
        return ($"Change signature of {method.Name}", solution);
    }
    /// <summary>A comma-separated list with a space after each comma.</summary>
    static SeparatedSyntaxList<T> Spaced<T>(IEnumerable<T> nodes) where T : SyntaxNode { var l = nodes.ToList(); return SeparatedList(l, Enumerable.Repeat(Token(SyntaxKind.CommaToken).WithTrailingTrivia(Space), Math.Max(0, l.Count - 1))); }
    static async Task<IMethodSymbol?> Refind(Solution solution, IMethodSymbol m)
    {
        var r = m.DeclaringSyntaxReferences.FirstOrDefault();
        var d = r == null ? null : solution.GetDocument(r.SyntaxTree) ?? solution.Projects.SelectMany(p => p.Documents).FirstOrDefault(x => x.FilePath == r.SyntaxTree.FilePath);
        if (d == null) return null;
        var root = await d.GetSyntaxRootAsync();
        var model = await d.GetSemanticModelAsync();
        var node = root!.DescendantNodes().OfType<BaseMethodDeclarationSyntax>().FirstOrDefault(n => n.SpanStart >= r!.Span.Start - 64 && (model!.GetDeclaredSymbol(n)?.Name == m.Name));
        return node == null ? null : model!.GetDeclaredSymbol(node) as IMethodSymbol;
    }

    // ------------------------------------------------------------------ LINQ to loops (85)
    async Task<(string, Solution)> LinqToLoop(Document doc, int position)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var statement = root.FindToken(position).Parent?.AncestorsAndSelf().FirstOrDefault(n => n is LocalDeclarationStatementSyntax or ReturnStatementSyntax) as StatementSyntax
            ?? throw new InvalidOperationException("Put the caret in `var x = source.Where(…).Select(…).ToList();` or `return source….;`.");
        var expr = statement switch { LocalDeclarationStatementSyntax l when l.Declaration.Variables.Count == 1 => l.Declaration.Variables[0].Initializer?.Value, ReturnStatementSyntax r => r.Expression, _ => null } ?? throw new InvalidOperationException("Nothing to convert here.");
        // The chain, from the source to the terminal operator.
        var calls = new List<(string Name, InvocationExpressionSyntax Call)>();
        var e = expr;
        while (e is InvocationExpressionSyntax inv && inv.Expression is MemberAccessExpressionSyntax ma) { calls.Insert(0, (ma.Name.Identifier.Text, inv)); e = ma.Expression; }
        var source = e;
        if (calls.Count == 0) throw new InvalidOperationException("This is not a LINQ method chain.");
        var supported = new HashSet<string> { "Where", "Select", "ToList", "ToArray", "Count", "Any", "First", "FirstOrDefault", "Sum" };
        if (calls.Any(c => !supported.Contains(c.Name))) throw new InvalidOperationException($"Only Where, Select and ToList / ToArray / Count / Any / First / FirstOrDefault / Sum chains convert (this one uses {string.Join(", ", calls.Select(c => c.Name).Where(n => !supported.Contains(n)).Distinct())}).");
        var terminal = calls[^1].Name is "ToList" or "ToArray" or "Count" or "Any" or "First" or "FirstOrDefault" or "Sum" ? calls[^1] : default;
        var steps = terminal == default ? calls : calls.Take(calls.Count - 1).ToList();
        if (terminal.Call != null && terminal.Call.ArgumentList.Arguments.Count > 0) throw new InvalidOperationException($"{terminal.Name} with a condition: put the condition in a Where first.");
        var element = model.GetTypeInfo(terminal.Call != null ? ((MemberAccessExpressionSyntax)terminal.Call.Expression).Expression : expr).Type is INamedTypeSymbol seq
            ? (seq.AllInterfaces.Concat([seq]).FirstOrDefault(i => i.OriginalDefinition.SpecialType == SpecialType.System_Collections_Generic_IEnumerable_T)?.TypeArguments[0]) : null;
        var elementType = element?.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat) ?? "var";
        string target = statement is LocalDeclarationStatementSyntax ld ? ld.Declaration.Variables[0].Identifier.Text : "result";
        var cur = "item";
        var body = new List<string>();
        var sourceItem = "item";
        foreach (var (name, call) in steps)
        {
            var lambda = call.ArgumentList.Arguments.FirstOrDefault()?.Expression as SimpleLambdaExpressionSyntax ?? throw new InvalidOperationException($"{name} needs a lambda like x => …");
            var p = lambda.Parameter.Identifier.Text;
            if (body.Count == 0 && cur == "item") { cur = p; sourceItem = p; }
            var part = Rewrite(lambda.ExpressionBody ?? throw new InvalidOperationException("Use expression lambdas."), p, cur);
            if (name == "Where") body.Add($"if (!({part})) continue;");
            else { var nv = p == cur ? $"{p}2" : p; body.Add($"var {nv} = {part};"); cur = nv; }
        }
        string Rewrite(ExpressionSyntax x, string from, string to) => from == to ? x.ToString() : x.ReplaceNodes(x.DescendantNodesAndSelf().OfType<IdentifierNameSyntax>().Where(i => i.Identifier.Text == from), (_, _) => IdentifierName(to)).ToString();
        var lines = new List<string>();
        var name0 = terminal.Name ?? "ToList";
        var resultVar = name0 == "ToArray" ? $"{target}List" : target;
        lines.Add(name0 switch
        {
            "ToList" or "ToArray" => $"var {resultVar} = new List<{elementType}>();",
            "Count" => $"var {target} = 0;",
            "Any" => $"var {target} = false;",
            "Sum" => $"{elementType} {target} = 0;",
            _ => $"{elementType}{(name0 == "FirstOrDefault" && elementType != "var" && !(element?.IsValueType ?? false) ? "?" : "")} {target} = default;",
        });
        if (terminal == default && statement is LocalDeclarationStatementSyntax) lines[0] = $"var {target} = new List<{elementType}>();";
        lines.Add($"foreach (var {sourceItem} in {source})");
        lines.Add("{");
        lines.AddRange(body.Select(b => "    " + b));
        lines.Add("    " + (name0 switch { "ToList" or "ToArray" => $"{resultVar}.Add({cur});", "Count" => $"{target}++;", "Any" => $"{target} = true; break;", "Sum" => $"{target} += {cur};", _ => $"{target} = {cur}; break;" }));
        lines.Add("}");
        if (name0 == "ToArray") lines.Add($"var {target} = {resultVar}.ToArray();");
        if (name0 == "First") lines.Insert(lines.Count, $"// First(): throws when nothing matches; here {target} stays default.");
        if (statement is ReturnStatementSyntax) lines.Add($"return {target};");
        var indent = statement.GetLeadingTrivia().ToString().Split('\n').Last();
        var text = string.Join("\n", lines.Select((l, i) => (i == 0 ? "" : indent) + l));
        var newStatements = ParseStatement("{" + text + "}") is BlockSyntax block ? block.Statements : default;
        var newRoot = root.ReplaceNode(statement, newStatements.Select((s, i) => i == 0 ? s.WithLeadingTrivia(statement.GetLeadingTrivia()) : s.WithLeadingTrivia(ParseLeadingTrivia(indent)).WithAdditionalAnnotations(Formatter.Annotation)).Select(s => s.WithTrailingTrivia(ParseTrailingTrivia("\n"))));
        return ("Convert LINQ to loop", doc.Project.Solution.WithDocumentSyntaxRoot(doc.Id, newRoot));
    }

    // ------------------------------------------------------------------ method to local function (88)
    async Task<(string, Solution)> ToLocalFunction(Document doc, int position)
    {
        var m = await MethodAt(doc, position);
        if (m.MethodKind != MethodKind.Ordinary || m.DeclaredAccessibility != Accessibility.Private || m.IsAbstract || m.IsVirtual || m.IsOverride) throw new InvalidOperationException("Only a private, non-virtual method becomes a local function.");
        var solution = doc.Project.Solution;
        var refs = (await SymbolFinder.FindReferencesAsync(m, solution)).SelectMany(r => r.Locations).ToList();
        var callers = new HashSet<SyntaxNode>();
        foreach (var r in refs)
        {
            var root2 = await r.Document.GetSyntaxRootAsync();
            var caller = root2!.FindNode(r.Location.SourceSpan).AncestorsAndSelf().OfType<BaseMethodDeclarationSyntax>().FirstOrDefault();
            if (caller == null || r.Document.Id != doc.Id) throw new InvalidOperationException($"{m.Name} is used outside a method of this file.");
            callers.Add(caller);
        }
        if (callers.Count != 1) throw new InvalidOperationException($"{m.Name} is used by {callers.Count} methods; a local function belongs to one.");
        var root = (await doc.GetSyntaxRootAsync())!;
        var decl = (MethodDeclarationSyntax)(await m.DeclaringSyntaxReferences[0].GetSyntaxAsync());
        var target = (BaseMethodDeclarationSyntax)callers.First();
        if (target.Body == null) throw new InvalidOperationException("The calling method has an expression body: give it a block body first.");
        var modifiers = TokenList(decl.Modifiers.Where(t => !t.IsKind(SyntaxKind.PrivateKeyword) && !t.IsKind(SyntaxKind.ProtectedKeyword) && !t.IsKind(SyntaxKind.InternalKeyword) && !t.IsKind(SyntaxKind.PublicKeyword) && !t.IsKind(SyntaxKind.NewKeyword) && !t.IsKind(SyntaxKind.PartialKeyword)));
        var local = LocalFunctionStatement(modifiers, decl.ReturnType, decl.Identifier, decl.TypeParameterList, decl.ParameterList, decl.ConstraintClauses, decl.Body, decl.ExpressionBody, decl.ExpressionBody != null ? Token(SyntaxKind.SemicolonToken) : default).WithAdditionalAnnotations(Formatter.Annotation);
        var newRoot = root.TrackNodes(decl, target);
        newRoot = newRoot.RemoveNode(newRoot.GetCurrentNode(decl)!, SyntaxRemoveOptions.KeepNoTrivia)!;
        var t = newRoot.GetCurrentNode(target)!;
        newRoot = newRoot.ReplaceNode(t, t.WithBody(t.Body!.AddStatements(local)).WithAdditionalAnnotations(Formatter.Annotation));
        return ($"Convert {m.Name} to a local function", solution.WithDocumentSyntaxRoot(doc.Id, newRoot));
    }

    // ------------------------------------------------------------------ introduce field / property (67, 68)
    async Task<(string, Solution)> IntroduceMember(Document doc, int start, int end, bool property, string? name)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var span = TextSpan.FromBounds(Math.Min(start, end), Math.Max(start, end));
        var expr = root.FindNode(span, getInnermostNodeForTie: true).AncestorsAndSelf().OfType<ExpressionSyntax>().FirstOrDefault(x => x.Span.Contains(span) && x is not IdentifierNameSyntax { Parent: MemberAccessExpressionSyntax }) ?? throw new InvalidOperationException("Select an expression.");
        var type = model.GetTypeInfo(expr).ConvertedType ?? throw new InvalidOperationException("The expression has no type.");
        var typeName = type.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat);
        var cls = expr.FirstAncestorOrSelf<TypeDeclarationSyntax>() ?? throw new InvalidOperationException("The expression is not in a class.");
        var member = expr.FirstAncestorOrSelf<MemberDeclarationSyntax>()!;
        // Does it read locals or parameters (then the value is assigned where it is), or only fields / constants?
        var df = model.AnalyzeDataFlow(expr);
        var local = df != null && df.ReadInside.Any(s => s is ILocalSymbol || s is IParameterSymbol { IsThis: false });
        var isStatic = member is BaseMethodDeclarationSyntax bm && bm.Modifiers.Any(SyntaxKind.StaticKeyword);
        var baseName = string.IsNullOrWhiteSpace(name) ? Suggest(expr) : name!.Trim();
        if (property)
        {
            if (local) throw new InvalidOperationException("The expression uses locals or parameters: a property cannot see them (use Introduce Field).");
            var pname = char.ToUpperInvariant(baseName[0]) + baseName[1..];
            var prop = ParseMemberDeclaration($"private {(isStatic ? "static " : "")}{typeName} {pname} => {expr};\n")!.WithAdditionalAnnotations(Formatter.Annotation);
            var r1 = root.TrackNodes(expr, cls);
            r1 = r1.ReplaceNode(r1.GetCurrentNode(expr)!, IdentifierName(pname).WithTriviaFrom(expr));
            var c1 = r1.GetCurrentNode(cls)!;
            r1 = r1.ReplaceNode(c1, c1.WithMembers(c1.Members.Insert(0, prop)));
            return ($"Introduce property {pname}", doc.Project.Solution.WithDocumentSyntaxRoot(doc.Id, r1));
        }
        var fname = "_" + char.ToLowerInvariant(baseName[0]) + baseName[1..];
        var field = ParseMemberDeclaration($"private {(isStatic ? "static " : "")}{(local ? "" : "readonly ")}{typeName} {fname}{(local ? "" : $" = {expr}")};\n")!.WithAdditionalAnnotations(Formatter.Annotation);
        var statement = expr.FirstAncestorOrSelf<StatementSyntax>();
        if (local && statement == null) throw new InvalidOperationException("The expression uses locals or parameters in an expression-bodied member: give the member a block body first.");
        var r = statement == null ? root.TrackNodes(expr, cls) : root.TrackNodes(expr, cls, statement);
        if (local)
        {
            // Assigned just before the statement that uses it.
            var st = r.GetCurrentNode(statement!)!;
            var assign = ParseStatement($"{fname} = {expr};").WithLeadingTrivia(st.GetLeadingTrivia()).WithTrailingTrivia(ParseTrailingTrivia("\n"));
            r = r.InsertNodesBefore(st, [assign]);
        }
        r = r.ReplaceNode(r.GetCurrentNode(expr)!, IdentifierName(fname).WithTriviaFrom(expr));
        var c = r.GetCurrentNode(cls)!;
        r = r.ReplaceNode(c, c.WithMembers(c.Members.Insert(0, field)));
        return ($"Introduce field {fname}", doc.Project.Solution.WithDocumentSyntaxRoot(doc.Id, r));
    }
    static string Suggest(ExpressionSyntax e) => e switch
    {
        InvocationExpressionSyntax { Expression: MemberAccessExpressionSyntax m } => Clean(m.Name.Identifier.Text),
        InvocationExpressionSyntax { Expression: IdentifierNameSyntax i } => Clean(i.Identifier.Text),
        MemberAccessExpressionSyntax m => m.Name.Identifier.Text,
        ObjectCreationExpressionSyntax o => o.Type.ToString().Split('.', '<')[^1],
        LiteralExpressionSyntax l when l.IsKind(SyntaxKind.StringLiteralExpression) => "text",
        LiteralExpressionSyntax => "value",
        _ => "value",
    };
    static string Clean(string n) => n.StartsWith("Get") && n.Length > 3 && char.IsUpper(n[3]) ? n[3..] : n;

    // ------------------------------------------------------------------ inline field (72)
    async Task<(string, Solution)> InlineField(Document doc, int position)
    {
        var s = await SymbolAt(doc, position) as IFieldSymbol ?? throw new InvalidOperationException("Put the caret on a field.");
        var declRef = s.DeclaringSyntaxReferences.FirstOrDefault() ?? throw new InvalidOperationException("The field has no source.");
        var v = (VariableDeclaratorSyntax)await declRef.GetSyntaxAsync();
        var init = v.Initializer?.Value ?? throw new InvalidOperationException($"{s.Name} has no initializer to inline.");
        var solution = doc.Project.Solution;
        var refs = (await SymbolFinder.FindReferencesAsync(s, solution)).SelectMany(r => r.Locations).ToList();
        var replacements = new Dictionary<DocumentId, List<SyntaxNode>>();
        foreach (var r in refs)
        {
            var rr = await r.Document.GetSyntaxRootAsync();
            var node = rr!.FindNode(r.Location.SourceSpan, getInnermostNodeForTie: true);
            var target = node.Parent is MemberAccessExpressionSyntax ma && ma.Name == node && ma.Expression is ThisExpressionSyntax or IdentifierNameSyntax ? ma : node;
            if (target.Parent is AssignmentExpressionSyntax a && a.Left == target || target.Parent is PrefixUnaryExpressionSyntax or PostfixUnaryExpressionSyntax || target.Parent is ArgumentSyntax { RefKindKeyword.RawKind: not 0 })
                throw new InvalidOperationException($"{s.Name} is assigned after its declaration: it cannot be inlined.");
            if (!replacements.TryGetValue(r.Document.Id, out var l)) replacements[r.Document.Id] = l = [];
            l.Add(target);
        }
        var needsParens = init is not (LiteralExpressionSyntax or IdentifierNameSyntax or MemberAccessExpressionSyntax or InvocationExpressionSyntax or ObjectCreationExpressionSyntax or ParenthesizedExpressionSyntax);
        var replacement = needsParens ? (ExpressionSyntax)ParenthesizedExpression(init.WithoutTrivia()) : init.WithoutTrivia();
        var declDoc = solution.GetDocument(declRef.SyntaxTree)!;
        foreach (var (id, nodes) in replacements)
        {
            var rr = (await solution.GetDocument(id)!.GetSyntaxRootAsync())!;
            rr = rr.ReplaceNodes(nodes, (o, _) => replacement.WithTriviaFrom(o));
            solution = solution.WithDocumentSyntaxRoot(id, rr);
        }
        // Remove the declaration (or just this variable of it).
        var droot = (await solution.GetDocument(declDoc.Id)!.GetSyntaxRootAsync())!;
        var dv = droot.DescendantNodes().OfType<VariableDeclaratorSyntax>().First(x => x.Identifier.Text == s.Name && x.Span.Start <= v.Span.Start + 400 && x.Parent?.Parent is FieldDeclarationSyntax);
        var fd = (FieldDeclarationSyntax)dv.Parent!.Parent!;
        droot = fd.Declaration.Variables.Count == 1 ? droot.RemoveNode(fd, SyntaxRemoveOptions.KeepNoTrivia)! : droot.RemoveNode(dv, SyntaxRemoveOptions.KeepNoTrivia)!;
        solution = solution.WithDocumentSyntaxRoot(declDoc.Id, droot);
        return ($"Inline field {s.Name}", solution);
    }

    // ------------------------------------------------------------------ pull up / push down / extract superclass / move static (75, 76, 64, 74)
    async Task<(MemberDeclarationSyntax Decl, ISymbol Symbol, Document Doc)> MemberAt(Document doc, int position)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var decl = root.FindToken(position).Parent?.AncestorsAndSelf().OfType<MemberDeclarationSyntax>().FirstOrDefault(m => m is MethodDeclarationSyntax or PropertyDeclarationSyntax or FieldDeclarationSyntax or EventFieldDeclarationSyntax)
            ?? throw new InvalidOperationException("Put the caret on a method, property or field.");
        ISymbol? sym = decl is FieldDeclarationSyntax f ? model.GetDeclaredSymbol(f.Declaration.Variables[0]) : model.GetDeclaredSymbol(decl);
        return (decl, sym ?? throw new InvalidOperationException("No member here."), doc);
    }
    async Task<(string, Solution)> PullUp(Document doc, int position)
    {
        var (decl, sym, _) = await MemberAt(doc, position);
        var baseType = sym.ContainingType.BaseType;
        var baseRef = baseType?.DeclaringSyntaxReferences.FirstOrDefault(r => r.SyntaxTree.FilePath != null && Path.GetFullPath(r.SyntaxTree.FilePath).StartsWith(root, StringComparison.OrdinalIgnoreCase))
            ?? throw new InvalidOperationException($"{sym.ContainingType.Name} has no base class in this repository.");
        if (sym.IsOverride) throw new InvalidOperationException($"{sym.Name} overrides a member of the base already.");
        return ($"Pull {sym.Name} up to {baseType!.Name}", await MoveMember(doc.Project.Solution, decl, doc, [baseRef]));
    }
    async Task<(string, Solution)> PushDown(Document doc, int position)
    {
        var (decl, sym, _) = await MemberAt(doc, position);
        var solution = doc.Project.Solution;
        var derived = (await SymbolFinder.FindDerivedClassesAsync(sym.ContainingType, solution, transitive: false)).ToList();
        var refs = derived.Select(d => d.DeclaringSyntaxReferences.FirstOrDefault(r => r.SyntaxTree.FilePath != null)).OfType<SyntaxReference>().ToList();
        if (refs.Count == 0) throw new InvalidOperationException($"{sym.ContainingType.Name} has no derived classes in this repository.");
        return ($"Push {sym.Name} down to {string.Join(", ", derived.Select(d => d.Name))}", await MoveMember(solution, decl, doc, refs));
    }
    /// <summary>Removes the member from its class and adds a copy to each target class (by syntax reference).</summary>
    async Task<Solution> MoveMember(Solution solution, MemberDeclarationSyntax decl, Document from, List<SyntaxReference> targets)
    {
        var text = decl.WithoutLeadingTrivia().ToFullString().TrimEnd();
        var lead = decl.GetLeadingTrivia().Where(t => t.IsKind(SyntaxKind.SingleLineDocumentationCommentTrivia) || t.IsKind(SyntaxKind.MultiLineDocumentationCommentTrivia)).Select(t => t.ToFullString()).ToList();
        var copy = ParseMemberDeclaration(string.Concat(lead) + text + "\n")!.WithAdditionalAnnotations(Formatter.Annotation);
        // Private members become protected so the code that stays can still use them.
        if (copy.Modifiers.Any(SyntaxKind.PrivateKeyword) || !copy.Modifiers.Any(m => m.Kind() is SyntaxKind.PublicKeyword or SyntaxKind.ProtectedKeyword or SyntaxKind.InternalKeyword))
            copy = copy.WithModifiers(TokenList(copy.Modifiers.Where(m => !m.IsKind(SyntaxKind.PrivateKeyword)).Prepend(Token(SyntaxKind.ProtectedKeyword).WithTrailingTrivia(Space))));
        var fromRoot = (await from.GetSyntaxRootAsync())!;
        solution = solution.WithDocumentSyntaxRoot(from.Id, fromRoot.RemoveNode(fromRoot.FindNode(decl.Span) is MemberDeclarationSyntax m ? m : decl, SyntaxRemoveOptions.KeepNoTrivia)!);
        foreach (var t in targets)
        {
            var d = solution.GetDocument(t.SyntaxTree) ?? solution.Projects.SelectMany(p => p.Documents).First(x => x.FilePath == t.SyntaxTree.FilePath);
            var r = (await d.GetSyntaxRootAsync())!;
            var cls = r.DescendantNodes().OfType<TypeDeclarationSyntax>().First(c => c.Identifier.Text == ((TypeDeclarationSyntax)t.GetSyntax()).Identifier.Text);
            r = r.ReplaceNode(cls, cls.AddMembers(copy));
            solution = solution.WithDocumentSyntaxRoot(d.Id, r);
        }
        return solution;
    }
    async Task<(string, Solution)> ExtractSuperclass(Document doc, int position, string? name)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var cls = root.FindToken(position).Parent?.AncestorsAndSelf().OfType<ClassDeclarationSyntax>().FirstOrDefault() ?? throw new InvalidOperationException("Put the caret in a class.");
        if (cls.BaseList?.Types.FirstOrDefault() is { } first && (await doc.GetSemanticModelAsync())!.GetTypeInfo(first.Type).Type?.TypeKind == TypeKind.Class) throw new InvalidOperationException($"{cls.Identifier.Text} already has a base class.");
        var baseName = string.IsNullOrWhiteSpace(name) ? $"{cls.Identifier.Text}Base" : name!.Trim();
        // Public instance members move up; constructors, static and private members stay.
        var moving = cls.Members.Where(m => m is MethodDeclarationSyntax or PropertyDeclarationSyntax && m.Modifiers.Any(SyntaxKind.PublicKeyword) && !m.Modifiers.Any(SyntaxKind.StaticKeyword) && !m.Modifiers.Any(SyntaxKind.OverrideKeyword)).ToList();
        if (moving.Count == 0) throw new InvalidOperationException($"{cls.Identifier.Text} has no public instance methods or properties to move.");
        var abstractBase = ClassDeclaration(baseName).WithModifiers(TokenList(Token(SyntaxKind.PublicKeyword), Token(SyntaxKind.AbstractKeyword))).WithMembers(List(moving.Select(m => m.WithoutLeadingTrivia().WithLeadingTrivia(m.GetLeadingTrivia())))).WithAdditionalAnnotations(Formatter.Annotation).NormalizeWhitespace();
        var newCls = cls.RemoveNodes(moving, SyntaxRemoveOptions.KeepNoTrivia)!;
        var baseType = SimpleBaseType(IdentifierName(baseName));
        newCls = newCls.BaseList == null ? newCls.WithIdentifier(newCls.Identifier.WithTrailingTrivia()).WithBaseList(BaseList(SingletonSeparatedList<BaseTypeSyntax>(baseType)).WithTrailingTrivia(ParseTrailingTrivia("\n"))) : newCls.WithBaseList(newCls.BaseList.WithTypes(newCls.BaseList.Types.Insert(0, baseType)));
        var r = root.ReplaceNode(cls, newCls.WithAdditionalAnnotations(Formatter.Annotation));
        var placed = r.DescendantNodes().OfType<ClassDeclarationSyntax>().First(c => c.Identifier.Text == cls.Identifier.Text);
        r = r.InsertNodesBefore(placed, [abstractBase.WithTrailingTrivia(ParseTrailingTrivia("\n\n"))]);
        return ($"Extract superclass {baseName}", doc.Project.Solution.WithDocumentSyntaxRoot(doc.Id, r));
    }
    async Task<(string, Solution)> MoveStatic(Document doc, int position, string targetName)
    {
        var (decl, sym, _) = await MemberAt(doc, position);
        if (!sym.IsStatic) throw new InvalidOperationException("Move Members moves static members (methods, properties, fields).");
        var solution = doc.Project.Solution;
        var target = (await SymbolFinder.FindSourceDeclarationsAsync(solution, targetName, ignoreCase: false, SymbolFilter.Type)).OfType<INamedTypeSymbol>().FirstOrDefault(t => t.DeclaringSyntaxReferences.Length > 0)
            ?? throw new InvalidOperationException($"No class {targetName} in the solution.");
        // Calls through the old class name now go through the new one.
        var refs = (await SymbolFinder.FindReferencesAsync(sym, solution)).SelectMany(r => r.Locations).ToList();
        var byDoc = refs.GroupBy(r => r.Document.Id);
        foreach (var g in byDoc)
        {
            var d = solution.GetDocument(g.Key)!;
            var rr = (await d.GetSyntaxRootAsync())!;
            var nodes = g.Select(r => rr.FindNode(r.Location.SourceSpan, getInnermostNodeForTie: true)).ToList();
            rr = rr.ReplaceNodes(nodes, (o, _) => o.Parent is MemberAccessExpressionSyntax ma && ma.Name == o ? o : ParseExpression($"{target.Name}.{o}").WithTriviaFrom(o));
            rr = rr.ReplaceNodes(rr.DescendantNodes().OfType<MemberAccessExpressionSyntax>().Where(ma => ma.Name.Identifier.Text == sym.Name && ma.Expression.ToString() == sym.ContainingType.Name), (o, _) => o.WithExpression(IdentifierName(target.Name).WithTriviaFrom(o.Expression)));
            solution = solution.WithDocumentSyntaxRoot(d.Id, rr);
        }
        var fromDoc = solution.GetDocument(doc.Id)!;
        var fresh = (await fromDoc.GetSyntaxRootAsync())!.DescendantNodes().OfType<MemberDeclarationSyntax>().First(m => m.GetType() == decl.GetType() && (m is FieldDeclarationSyntax fd ? fd.Declaration.Variables.Any(v => v.Identifier.Text == sym.Name) : (m is MethodDeclarationSyntax md ? md.Identifier.Text : (m as PropertyDeclarationSyntax)?.Identifier.Text) == sym.Name));
        solution = await MoveMember(solution, fresh, fromDoc, [target.DeclaringSyntaxReferences[0]]);
        return ($"Move {sym.Name} to {target.Name}", solution);
    }

    // ------------------------------------------------------------------ factory method (82, 83)
    async Task<(string, Solution)> Factory(Document doc, int position, bool replace)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var ctor = root.FindToken(position).Parent?.AncestorsAndSelf().OfType<ConstructorDeclarationSyntax>().FirstOrDefault() ?? throw new InvalidOperationException("Put the caret on a constructor.");
        var ctorSym = model.GetDeclaredSymbol(ctor)!;
        var type = ctorSym.ContainingType;
        var ps = string.Join(", ", ctor.ParameterList.Parameters.Select(p => p.ToString()));
        var args = string.Join(", ", ctor.ParameterList.Parameters.Select(p => p.Identifier.Text));
        var factory = ParseMemberDeclaration($"public static {type.Name} Create({ps}) => new {type.Name}({args});\n")!.WithAdditionalAnnotations(Formatter.Annotation);
        var solution = doc.Project.Solution;
        if (replace)
        {
            var refs = (await SymbolFinder.FindReferencesAsync(ctorSym, solution)).SelectMany(r => r.Locations).ToList();
            foreach (var g in refs.GroupBy(r => r.Document.Id))
            {
                var d = solution.GetDocument(g.Key)!;
                var rr = (await d.GetSyntaxRootAsync())!;
                var creations = g.Select(r => rr.FindNode(r.Location.SourceSpan, getInnermostNodeForTie: true).AncestorsAndSelf().OfType<BaseObjectCreationExpressionSyntax>().FirstOrDefault()).OfType<BaseObjectCreationExpressionSyntax>().Where(c => c.FirstAncestorOrSelf<TypeDeclarationSyntax>()?.Identifier.Text != type.Name || g.Key != doc.Id).ToList();
                rr = rr.ReplaceNodes(creations, (o, _) => ParseExpression($"{type.Name}.Create{(o.ArgumentList ?? ArgumentList())}").WithTriviaFrom(o));
                solution = solution.WithDocumentSyntaxRoot(d.Id, rr);
            }
        }
        var r2 = (await solution.GetDocument(doc.Id)!.GetSyntaxRootAsync())!;
        var c2 = r2.DescendantNodes().OfType<ConstructorDeclarationSyntax>().First(c => c.Identifier.Text == type.Name && c.ParameterList.Parameters.Count == ctor.ParameterList.Parameters.Count && c.ParameterList.ToString() == ctor.ParameterList.ToString());
        var cls = c2.FirstAncestorOrSelf<TypeDeclarationSyntax>()!;
        var newCtor = replace ? c2.WithModifiers(TokenList(c2.Modifiers.Select(m => m.IsKind(SyntaxKind.PublicKeyword) || m.IsKind(SyntaxKind.InternalKeyword) || m.IsKind(SyntaxKind.ProtectedKeyword) ? Token(m.LeadingTrivia, SyntaxKind.PrivateKeyword, m.TrailingTrivia) : m))) : c2;
        var newCls = cls.ReplaceNode(c2, newCtor);
        var idx = newCls.Members.IndexOf(m => m is ConstructorDeclarationSyntax cc && cc.ParameterList.ToString() == ctor.ParameterList.ToString());
        newCls = newCls.WithMembers(newCls.Members.Insert(idx + 1, factory));
        r2 = r2.ReplaceNode(cls, newCls);
        solution = solution.WithDocumentSyntaxRoot(doc.Id, r2);
        return (replace ? $"Replace constructor of {type.Name} with factory method Create" : $"Introduce factory method {type.Name}.Create", solution);
    }
}
