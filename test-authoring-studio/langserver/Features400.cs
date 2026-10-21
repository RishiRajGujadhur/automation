using System.Collections.Immutable;
using System.Text;
using System.Xml.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.Classification;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.FindSymbols;
using Microsoft.CodeAnalysis.Text;
using ICSharpCode.Decompiler;
using ICSharpCode.Decompiler.CSharp;

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
            // The type's own header: accessibility, modifiers, kind and name (the display format leaves them out for types).
            var access = t.DeclaredAccessibility switch { Accessibility.Public => "public ", Accessibility.Internal => "internal ", Accessibility.Protected => "protected ", Accessibility.Private => "private ", _ => "" };
            var mods = t.TypeKind == TypeKind.Class ? (t.IsStatic ? "static " : t.IsAbstract ? "abstract " : t.IsSealed ? "sealed " : "") : "";
            var kind = t.IsRecord ? (t.TypeKind == TypeKind.Struct ? "record struct" : "record") : t.TypeKind switch { TypeKind.Struct => (t.IsReadOnly ? "readonly struct" : "struct"), TypeKind.Interface => "interface", TypeKind.Enum => "enum", TypeKind.Delegate => "delegate", _ => "class" };
            sb.AppendLine($"{indent}{access}{mods}{kind} {t.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat)}{(bases.Count > 0 ? " : " + string.Join(", ", bases) : "")}");
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
    // ------------------------------------------------------------------ decompiled sources (59)
    /// <summary>The type of the symbol at the caret decompiled to C# (ILSpy's decompiler), at the member's line.</summary>
    async Task<object> DecompileAt(Document doc, int position)
    {
        var symbol = await SymbolAt(doc, position) ?? throw new InvalidOperationException("No symbol at the cursor.");
        var type = symbol as INamedTypeSymbol ?? symbol.ContainingType ?? throw new InvalidOperationException("Put the caret on a type or a member.");
        while (type.ContainingType != null) type = type.ContainingType;
        type = type.OriginalDefinition;
        if (type.Locations.Any(l => l.IsInSource)) throw new InvalidOperationException($"{type.Name} has source in this repository: use Go to Definition (F12).");
        var comp = (await doc.Project.GetCompilationAsync())!;
        var path = (comp.GetMetadataReference(type.ContainingAssembly) as PortableExecutableReference)?.FilePath ?? throw new InvalidOperationException($"The assembly of {type.Name} is not on disk.");
        var decompiler = new CSharpDecompiler(path, new DecompilerSettings { ThrowOnAssemblyResolveErrors = false });
        var reflectionName = type.ContainingNamespace.IsGlobalNamespace ? type.MetadataName : $"{type.ContainingNamespace.ToDisplayString()}.{type.MetadataName}";
        var text = decompiler.DecompileTypeAsString(new ICSharpCode.Decompiler.TypeSystem.FullTypeName(reflectionName));
        var lines = text.Split('\n');
        var line = 1;
        if (!SymbolEqualityComparer.Default.Equals(symbol, type))
        {
            // The member's declaration: its name followed by ( < { = ; — not a call or an assignment.
            var name = symbol is IMethodSymbol { MethodKind: MethodKind.Constructor } ? type.Name : symbol.Name;
            var i = Array.FindIndex(lines, l => System.Text.RegularExpressions.Regex.IsMatch(l, $@"\b{System.Text.RegularExpressions.Regex.Escape(name)}\s*[(<{{=;]") && !l.TrimStart().StartsWith("//") && !l.Contains(" return ") && !l.Contains(" = " + name) && !l.Contains("." + name));
            if (i >= 0) line = i + 1;
        }
        else line = Math.Max(1, Array.FindIndex(lines, l => System.Text.RegularExpressions.Regex.IsMatch(l, $@"\b(class|struct|interface|enum|record)\s+{System.Text.RegularExpressions.Regex.Escape(type.Name)}\b")) + 1);
        return new { name = type.ToDisplayString(), assembly = Path.GetFileName(path), text = $"// Decompiled from {Path.GetFileName(path)} (ILSpy)\n{text}", line = line + 1 };
    }
    // ------------------------------------------------------------------ semantic code search (47)
    /// <summary>
    /// Symbols of the solution by what they are, not by their text: `kind:method returns:Task attr:Given name:*Login*
    /// static:false async:true params:1 in:Fixtures.Steps type:string`. Words without a key match the name.
    /// </summary>
    async Task<object> SemanticSearch(string query)
    {
        var terms = query.Split(' ', StringSplitOptions.RemoveEmptyEntries).Select(t => t.Split(':', 2)).Select(t => t.Length == 2 ? (Key: t[0].ToLowerInvariant(), Value: t[1]) : (Key: "name", Value: t[0])).ToList();
        System.Text.RegularExpressions.Regex Glob(string g) => new("^" + System.Text.RegularExpressions.Regex.Escape(g).Replace(@"\*", ".*").Replace(@"\?", ".") + "$", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        bool Has(string key) => terms.Any(t => t.Key == key);
        string Kind(ISymbol s) => s switch { INamedTypeSymbol t => t.TypeKind.ToString().ToLowerInvariant(), IMethodSymbol { MethodKind: MethodKind.Constructor } => "constructor", IMethodSymbol => "method", IPropertySymbol => "property", IFieldSymbol => "field", IEventSymbol => "event", _ => s.Kind.ToString().ToLowerInvariant() };
        ITypeSymbol? TypeOf(ISymbol s) => s switch { IMethodSymbol m => m.ReturnType, IPropertySymbol p => p.Type, IFieldSymbol f => f.Type, IEventSymbol e => e.Type, _ => null };
        bool TypeMatches(ITypeSymbol? t, string want)
        {
            if (t == null) return false;
            var names = new[] { t.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat), t.Name, t.ToDisplayString() };
            var g = Glob(want);
            return names.Any(n => g.IsMatch(n)) || (t is INamedTypeSymbol nt && nt.IsGenericType && g.IsMatch(nt.Name));
        }
        bool Match(ISymbol s) => terms.All(t => t.Key switch
        {
            "name" => Glob(t.Value.Contains('*') || t.Value.Contains('?') ? t.Value : $"*{t.Value}*").IsMatch(s.Name),
            "kind" => Kind(s).StartsWith(t.Value.ToLowerInvariant()) || (t.Value.ToLowerInvariant() is "type" && s is INamedTypeSymbol),
            "returns" or "type" => TypeMatches(TypeOf(s), t.Value),
            "attr" or "attribute" => s.GetAttributes().Any(a => a.AttributeClass is { } c && (Glob(t.Value).IsMatch(c.Name) || Glob(t.Value + "Attribute").IsMatch(c.Name))),
            "static" => s.IsStatic == (t.Value.ToLowerInvariant() is "true" or "yes"),
            "async" => s is IMethodSymbol m && m.IsAsync == (t.Value.ToLowerInvariant() is "true" or "yes"),
            "abstract" => s.IsAbstract == (t.Value.ToLowerInvariant() is "true" or "yes"),
            "params" => s is IMethodSymbol pm && int.TryParse(t.Value, out var n) && pm.Parameters.Length == n,
            "param" => s is IMethodSymbol pp && pp.Parameters.Any(p => TypeMatches(p.Type, t.Value)),
            "in" => Glob(t.Value.Contains('*') ? t.Value : $"{t.Value}*").IsMatch(s.ContainingNamespace?.ToDisplayString() ?? "") || (s.ContainingType != null && Glob(t.Value).IsMatch(s.ContainingType.Name)),
            "access" => s.DeclaredAccessibility.ToString().StartsWith(t.Value, StringComparison.OrdinalIgnoreCase),
            "implements" => s is INamedTypeSymbol it && it.AllInterfaces.Any(i => Glob(t.Value).IsMatch(i.Name)),
            "inherits" or "extends" => s is INamedTypeSymbol bt && Bases(bt).Any(b => Glob(t.Value).IsMatch(b.Name)),
            _ => true,
        });
        static IEnumerable<INamedTypeSymbol> Bases(INamedTypeSymbol t) { for (var b = t.BaseType; b != null; b = b.BaseType) yield return b; }
        var found = new List<ISymbol>();
        foreach (var p in workspace!.CurrentSolution.Projects)
        {
            var c = await p.GetCompilationAsync();
            if (c == null) continue;
            foreach (var s in c.GetSymbolsWithName(_ => true, SymbolFilter.TypeAndMember))
                if (!s.IsImplicitlyDeclared && s.Locations.Any(InRepo) && s is not IMethodSymbol { MethodKind: MethodKind.PropertyGet or MethodKind.PropertySet or MethodKind.EventAdd or MethodKind.EventRemove } && Match(s)) found.Add(s);
            if (found.Count > 400) break;
        }
        return found.Distinct<ISymbol>(SymbolEqualityComparer.Default).Take(300).Select(s =>
        {
            var l = s.Locations.First(InRepo).GetLineSpan();
            return new { name = s.ToDisplayString(SymbolDisplayFormat.CSharpShortErrorMessageFormat), kind = Kind(s), type = TypeOf(s)?.ToDisplayString(SymbolDisplayFormat.MinimallyQualifiedFormat), file = Rel(l.Path), line = l.StartLinePosition.Line + 1 };
        }).ToList();
    }
}
