using System.Collections.Immutable;
using System.Text;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Classification;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Text;

/// <summary>Language service operations of RIDER-VSCODE-FEATURES.md (analysis, navigation, highlighting).</summary>
sealed partial class LanguageService
{
    // ------------------------------------------------------------------ preprocessor symbols (259)
    /// <summary>The symbols a project compiles with: DEBUG and TRACE (Debug), the target framework's, and DefineConstants.</summary>
    static ImmutableArray<string> PreprocessorSymbols(XDocument? xml)
    {
        var symbols = new List<string> { "DEBUG", "TRACE" };
        var tfm = (xml?.Descendants().FirstOrDefault(e => e.Name.LocalName is "TargetFramework")?.Value
                   ?? xml?.Descendants().FirstOrDefault(e => e.Name.LocalName is "TargetFrameworks")?.Value.Split(';')[0])?.Trim();
        if (tfm != null && System.Text.RegularExpressions.Regex.Match(tfm, @"^net(\d+)\.(\d+)$") is { Success: true } m)
        {
            symbols.Add("NET");
            symbols.Add($"NET{m.Groups[1].Value}_{m.Groups[2].Value}");
            for (var v = 5; v <= int.Parse(m.Groups[1].Value); v++) symbols.Add($"NET{v}_0_OR_GREATER");
            symbols.Add("NETCOREAPP");
        }
        else if (tfm != null && tfm.StartsWith("net4")) { symbols.Add("NETFRAMEWORK"); symbols.Add(tfm.ToUpperInvariant()); }
        foreach (var d in xml?.Descendants().Where(e => e.Name.LocalName == "DefineConstants" && (e.Parent?.Attribute("Condition")?.Value ?? "").IndexOf("Release", StringComparison.OrdinalIgnoreCase) < 0) ?? [])
            foreach (var s in d.Value.Split(';', ',', ' ').Select(x => x.Trim()).Where(x => x.Length > 0 && x != "$(DefineConstants)"))
                symbols.Add(s);
        return symbols.Distinct().ToImmutableArray();
    }

    /// <summary>The lines of the document that #if / #elif / #else leave out (Visual Studio greys them).</summary>
    async Task<object> InactiveRegions(Document doc)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var text = await doc.GetTextAsync();
        var spans = root.DescendantTrivia(descendIntoTrivia: true).Where(t => t.IsKind(SyntaxKind.DisabledTextTrivia)).Select(t => t.Span).Where(s => s.Length > 0)
            .Select(s => new { from = s.Start, to = s.End, line = text.Lines.GetLineFromPosition(s.Start).LineNumber + 1, endLine = text.Lines.GetLineFromPosition(Math.Max(s.Start, s.End - 1)).LineNumber + 1 })
            .ToList();
        return new { symbols = ((CSharpParseOptions)doc.Project.ParseOptions!).PreprocessorSymbolNames, spans };
    }

    // ------------------------------------------------------------------ control flow / data flow (104, 105)
    /// <summary>Roslyn's control-flow and data-flow analysis of the statements (or expression) in the selection.</summary>
    async Task<object> Flow(Document doc, int start, int end)
    {
        var root = (await doc.GetSyntaxRootAsync())!;
        var model = (await doc.GetSemanticModelAsync())!;
        var span = TextSpan.FromBounds(Math.Min(start, end), Math.Max(start, end));
        string Names(IEnumerable<ISymbol> s) => string.Join(", ", s.Select(x => x.Name).Distinct());
        // The statements wholly inside the selection, within one block.
        var statements = root.DescendantNodes(span).OfType<StatementSyntax>().Where(s => span.Contains(s.Span) && s.Parent is BlockSyntax or SwitchSectionSyntax).ToList();
        var first = statements.FirstOrDefault();
        var siblings = first == null ? [] : statements.Where(s => s.Parent == first.Parent).ToList();
        if (siblings.Count > 0)
        {
            var cf = model.AnalyzeControlFlow(siblings[0], siblings[^1])!;
            var df = model.AnalyzeDataFlow(siblings[0], siblings[^1])!;
            return new
            {
                kind = "statements", count = siblings.Count,
                control = cf.Succeeded ? new { startReachable = cf.StartPointIsReachable, endReachable = cf.EndPointIsReachable, returns = cf.ReturnStatements.Length, entryPoints = cf.EntryPoints.Length, exitPoints = cf.ExitPoints.Length } : null,
                data = df.Succeeded ? new { readInside = Names(df.ReadInside), writtenInside = Names(df.WrittenInside), dataFlowsIn = Names(df.DataFlowsIn), dataFlowsOut = Names(df.DataFlowsOut), alwaysAssigned = Names(df.AlwaysAssigned), declared = Names(df.VariablesDeclared), captured = Names(df.Captured), unsafeAddressTaken = Names(df.UnsafeAddressTaken) } : null,
            };
        }
        var expr = root.FindNode(span, getInnermostNodeForTie: true).FirstAncestorOrSelf<ExpressionSyntax>() ?? throw new InvalidOperationException("Select whole statements or an expression.");
        var edf = model.AnalyzeDataFlow(expr)!;
        return new { kind = "expression", count = 1, control = (object?)null, data = new { readInside = Names(edf.ReadInside), writtenInside = Names(edf.WrittenInside), dataFlowsIn = Names(edf.DataFlowsIn), dataFlowsOut = Names(edf.DataFlowsOut), alwaysAssigned = Names(edf.AlwaysAssigned), declared = Names(edf.VariablesDeclared), captured = Names(edf.Captured), unsafeAddressTaken = Names(edf.UnsafeAddressTaken) } };
    }

    // ------------------------------------------------------------------ method hierarchy (33)
    /// <summary>The method at the caret: the members it overrides or implements (up) and every override below it.</summary>
    async Task<object> MethodHierarchy(Document doc, int position)
    {
        var symbol = await SymbolAt(doc, position);
        if (symbol is not (IMethodSymbol or IPropertySymbol or IEventSymbol)) throw new InvalidOperationException("Put the caret on a method, property or event.");
        var solution = doc.Project.Solution;
        var items = new List<object>();
        object Item(ISymbol s, int depth, string relation)
        {
            var l = s.Locations.FirstOrDefault(InRepo);
            var span = l?.GetLineSpan();
            return new { name = s.ToDisplayString(SymbolDisplayFormat.CSharpShortErrorMessageFormat), container = s.ContainingType?.ToDisplayString(), depth, relation, file = l == null ? null : Rel(span!.Value.Path), line = span == null ? 0 : span.Value.StartLinePosition.Line + 1, external = l == null ? s.ContainingAssembly?.Name : null };
        }
        // Up: overridden members, then interface members.
        var ups = new List<ISymbol>();
        for (var s = symbol; s != null;)
        {
            var o = s switch { IMethodSymbol m => (ISymbol?)m.OverriddenMethod, IPropertySymbol p => p.OverriddenProperty, IEventSymbol e => e.OverriddenEvent, _ => null };
            if (o == null) break;
            ups.Insert(0, o);
            s = o;
        }
        // Interface members implemented by the member or by one it overrides (the interface slot belongs to the base).
        var chain = ups.Append(symbol).ToList();
        var ifaces = chain.SelectMany(c => c.ContainingType.AllInterfaces.SelectMany(i => i.GetMembers()).Where(i => SymbolEqualityComparer.Default.Equals(c.ContainingType.FindImplementationForInterfaceMember(i), c)))
            .Distinct<ISymbol>(SymbolEqualityComparer.Default).ToList();
        foreach (var i in ifaces) items.Add(Item(i, 0, "interface"));
        for (var k = 0; k < ups.Count; k++) items.Add(Item(ups[k], k, "base"));
        var self = ups.Count;
        items.Add(Item(symbol, self, "this"));
        // Down: overrides, depth by depth (and implementations when the member is in an interface).
        async Task Down(ISymbol s, int depth)
        {
            if (depth > 12) return;
            var below = symbol.ContainingType.TypeKind == TypeKind.Interface && depth == self + 1
                ? (await SymbolFinder.FindImplementationsAsync(s, solution)).ToList()
                : (await SymbolFinder.FindOverridesAsync(s, solution)).Where(o => o switch { IMethodSymbol m => SymbolEqualityComparer.Default.Equals(m.OverriddenMethod?.OriginalDefinition, s.OriginalDefinition), IPropertySymbol p => SymbolEqualityComparer.Default.Equals(p.OverriddenProperty?.OriginalDefinition, s.OriginalDefinition), _ => true }).ToList();
            foreach (var o in below.OrderBy(x => x.ContainingType?.Name))
            {
                items.Add(Item(o, depth, symbol.ContainingType.TypeKind == TypeKind.Interface ? "implementation" : "override"));
                await Down(o, depth + 1);
            }
        }
        await Down(symbol, self + 1);
        return new { name = symbol.ToDisplayString(SymbolDisplayFormat.CSharpShortErrorMessageFormat), items };
    }

    // ------------------------------------------------------------------ semantic highlighting (179)
    /// <summary>Roslyn's semantic classifications in a range (types, members, locals, parameters, static symbols…).</summary>
    async Task<object> Classify(Document doc, int from, int to)
    {
        var text = await doc.GetTextAsync();
        var span = TextSpan.FromBounds(Math.Clamp(from, 0, text.Length), Math.Clamp(to, 0, text.Length));
        var spans = await Classifier.GetClassifiedSpansAsync(doc, span);
        var keep = new HashSet<string> { ClassificationTypeNames.ClassName, ClassificationTypeNames.RecordClassName, ClassificationTypeNames.InterfaceName, ClassificationTypeNames.StructName, ClassificationTypeNames.RecordStructName, ClassificationTypeNames.EnumName, ClassificationTypeNames.DelegateName, ClassificationTypeNames.TypeParameterName, ClassificationTypeNames.MethodName, ClassificationTypeNames.ExtensionMethodName, ClassificationTypeNames.PropertyName, ClassificationTypeNames.FieldName, ClassificationTypeNames.ConstantName, ClassificationTypeNames.EnumMemberName, ClassificationTypeNames.EventName, ClassificationTypeNames.LocalName, ClassificationTypeNames.ParameterName, ClassificationTypeNames.NamespaceName, ClassificationTypeNames.StaticSymbol, ClassificationTypeNames.LabelName };
        return spans.Where(s => keep.Contains(s.ClassificationType)).Select(s => new { from = s.TextSpan.Start, to = s.TextSpan.End, kind = s.ClassificationType }).ToList();
    }

    // ------------------------------------------------------------------ metadata / decompiled sources (59, 60)
    /// <summary>
    /// A symbol outside the repository (a framework or NuGet type): its declaration as C# without bodies, with the XML
    /// documentation (Visual Studio's metadata as source), and the line of the member asked for.
    /// </summary>
    async Task<object> MetadataSource(Document doc, int position)
    {
        var symbol = await SymbolAt(doc, position) ?? throw new InvalidOperationException("No symbol at the cursor.");
        var type = symbol as INamedTypeSymbol ?? symbol.ContainingType ?? throw new InvalidOperationException("Put the caret on a type or a member.");
        while (type.ContainingType != null) type = type.ContainingType;
        var sb = new StringBuilder();
        var memberLine = 0;
        sb.AppendLine($"// {type.ContainingAssembly?.Identity.GetDisplayName()}");
        sb.AppendLine("// Generated from metadata: declarations only.");
        sb.AppendLine();
        if (!type.ContainingNamespace.IsGlobalNamespace) { sb.AppendLine($"namespace {type.ContainingNamespace.ToDisplayString()};"); sb.AppendLine(); }
        var decl = new SymbolDisplayFormat(
            globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted, typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameOnly,
            genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters | SymbolDisplayGenericsOptions.IncludeTypeConstraints | SymbolDisplayGenericsOptions.IncludeVariance,
            memberOptions: SymbolDisplayMemberOptions.IncludeAccessibility | SymbolDisplayMemberOptions.IncludeModifiers | SymbolDisplayMemberOptions.IncludeType | SymbolDisplayMemberOptions.IncludeParameters | SymbolDisplayMemberOptions.IncludeConstantValue | SymbolDisplayMemberOptions.IncludeRef,
            kindOptions: SymbolDisplayKindOptions.IncludeTypeKeyword | SymbolDisplayKindOptions.IncludeMemberKeyword,
            propertyStyle: SymbolDisplayPropertyStyle.ShowReadWriteDescriptor,
            parameterOptions: SymbolDisplayParameterOptions.IncludeType | SymbolDisplayParameterOptions.IncludeName | SymbolDisplayParameterOptions.IncludeDefaultValue | SymbolDisplayParameterOptions.IncludeParamsRefOut | SymbolDisplayParameterOptions.IncludeExtensionThis,
            miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes | SymbolDisplayMiscellaneousOptions.EscapeKeywordIdentifiers | SymbolDisplayMiscellaneousOptions.IncludeNullableReferenceTypeModifier);
        int Lines() => sb.ToString().Split('\n').Length;
        void Doc(ISymbol s, string indent)
        {
            var xml = s.GetDocumentationCommentXml();
            if (string.IsNullOrWhiteSpace(xml)) return;
            try
            {
                var summary = XElement.Parse(xml).Element("summary")?.Value.Trim();
                if (!string.IsNullOrEmpty(summary)) foreach (var l in summary.Split('\n')) sb.AppendLine($"{indent}/// {l.Trim()}");
            }
            catch { }
        }
        void Write(INamedTypeSymbol t, string indent)
        {
            Doc(t, indent);
            if (SymbolEqualityComparer.Default.Equals(t, symbol)) memberLine = Lines();
            var bases = new[] { t.BaseType }.Where(b => b != null && b.SpecialType is not (SpecialType.System_Object or SpecialType.System_ValueType or SpecialType.System_Enum)).Concat(t.Interfaces).Select(b => b!.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)).ToList();
            sb.AppendLine($"{indent}{t.ToDisplayString(decl)}{(bases.Count > 0 ? " : " + string.Join(", ", bases) : "")}");
            sb.AppendLine($"{indent}{{");
            foreach (var m in t.GetMembers().Where(m => !m.IsImplicitlyDeclared && m.DeclaredAccessibility is Accessibility.Public or Accessibility.Protected or Accessibility.ProtectedOrInternal && m is not IMethodSymbol { MethodKind: MethodKind.PropertyGet or MethodKind.PropertySet or MethodKind.EventAdd or MethodKind.EventRemove or MethodKind.EventRaise }))
            {
                if (m is INamedTypeSymbol nested) { Write(nested, indent + "    "); continue; }
                Doc(m, indent + "    ");
                if (SymbolEqualityComparer.Default.Equals(m, symbol) || SymbolEqualityComparer.Default.Equals(m, symbol.OriginalDefinition)) memberLine = Lines();
                var line = m.ToDisplayString(decl);
                sb.AppendLine($"{indent}    {line}{(m is IPropertySymbol || m is IEventSymbol || t.TypeKind == TypeKind.Enum ? (t.TypeKind == TypeKind.Enum ? "," : "") : ";")}");
            }
            sb.AppendLine($"{indent}}}");
        }
        Write(type, "");
        if (memberLine == 0) memberLine = 1;
        return new { name = type.ToDisplayString(), assembly = type.ContainingAssembly?.Name, text = sb.ToString(), line = memberLine };
    }
}
