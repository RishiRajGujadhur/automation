import type { Action, Index } from '../src/types.js';
const literal = (value: string) => JSON.stringify(value).replace(/\\u([0-9a-f]{4})/gi, '\\u$1');
export function proposeCode(action: Action, wording: string, index: Index) {
  const target = action.target;
  const role = target?.role ? target.role[0].toUpperCase() + target.role.slice(1) : undefined;
  const validRoles = [
    'Button',
    'Link',
    'Textbox',
    'Combobox',
    'Checkbox',
    'Radio',
    'Option',
    'Menuitem',
    'Tab',
  ];
  let locator = target?.testId
    ? `Page.GetByTestId(${literal(target.testId)})`
    : role && validRoles.includes(role) && target?.name
      ? `Page.GetByRole(AriaRole.${role}, new() { Name = ${literal(target.name)}, Exact = true })`
      : target?.name
        ? `Page.GetByText(${literal(target.name)}, new() { Exact = true })`
        : undefined;
  const existing = index.selectors.find(
    (s) =>
      s.resolution === 'Static' &&
      ((target?.testId && s.type === 'GetByTestId' && s.value.includes(literal(target.testId))) ||
        (target?.name &&
          role &&
          s.type === 'GetByRole' &&
          s.value.includes(`AriaRole.${role}`) &&
          s.value.includes(literal(target.name)))),
  );
  const methodCandidates = index.methods.filter((m) =>
    index.callEdges.some(
      (e) =>
        e.from === m.id &&
        e.resolution === 'Resolved' &&
        existing &&
        e.to.includes(existing.member),
    ),
  );
  const notes = [
    'Scaffold: review namespace and IPage dependency injection against your repository before execution.',
  ];
  if (existing) {
    notes.push(
      `Existing selector: ${existing.owner}.${existing.member} (${existing.file}:${existing.line}). Reuse this member where accessible.`,
    );
    locator = existing.value;
  }
  if (methodCandidates.length)
    notes.push(`Review reusable methods first: ${methodCandidates.map((m) => m.id).join(', ')}`);
  let statement =
    'throw new NotImplementedException("Select a repository method or a verified locator before executing.");';
  if (action.action === 'goto' && action.url)
    statement = `await Page.GotoAsync(${literal(action.url)});`;
  else if (locator) {
    statement =
      action.action === 'click'
        ? `await Target.ClickAsync();`
        : action.action === 'fill'
          ? `await Target.FillAsync(${literal(action.sensitive ? '[REDACTED]' : (action.value ?? ''))});`
          : `await Target.PressAsync(${literal(action.key ?? 'Enter')});`;
  } else
    notes.push(
      'No verified accessible target was recorded. The scaffold intentionally throws until implemented.',
    );
  const pattern = '^' + wording.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$';
  const source = `using System;\nusing System.Threading.Tasks;\nusing Microsoft.Playwright;\nusing TechTalk.SpecFlow;\n\nnamespace GeneratedAutomation;\n\n// Review IPage registration and repository conventions before use.\n[Binding]\npublic sealed class RecordedWorkflowSteps\n{\n    private readonly RecordedWorkflowPage page;\n    public RecordedWorkflowSteps(IPage page) => this.page = new(page);\n\n    [When(${literal(pattern)})]\n    public Task RecordedInteraction() => page.RecordedInteraction();\n}\n\npublic sealed class RecordedWorkflowPage\n{\n    private IPage Page { get; }\n    public RecordedWorkflowPage(IPage page) => Page = page;\n${locator ? `    private ILocator Target => ${locator};\n` : ''}\n    public async Task RecordedInteraction()\n    {\n        ${statement}\n    }\n}\n`;
  return { source, notes, existingSelector: existing ?? null, methodCandidates };
}
const pascal = (s: string) =>
  s.replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('') || 'Recorded';
/**
 * Page object whose members resolve through the XML dictionary (Section/Field XRefCodes) instead of
 * inline locators. If the repository already has a dictionary resolver, the notes point to it.
 */
export function proposeDictionaryPageObject(
  page: string,
  dictionaryFile: string,
  members: { action: Action; section: string; field: string }[],
  index: Index,
) {
  const cls = pascal(page).replace(/Page$/, '') + 'Page';
  const resolvers = index.methods.filter(
    (m) => /dictionar|selector|xref/i.test(m.owner) && /resolve|locator|field|find|get/i.test(m.name),
  );
  const notes = [
    `Locators resolve from ${dictionaryFile}; no selector is hardcoded in C#.`,
    'Copy the dictionary to the output directory (CopyToOutputDirectory) or the resolver cannot load it.',
  ];
  if (resolvers.length)
    notes.unshift(
      `Repository resolver candidates: ${resolvers.slice(0, 5).map((m) => `${m.owner}.${m.name} (${m.file}:${m.line})`).join(', ')}. Replace DictionaryFieldResolver with it.`,
    );
  const body = members
    .map(({ action, section, field }) => {
      const name = pascal(field);
      const call = `Field(${literal(section)}, ${literal(field)})`;
      const stmt =
        action.action === 'click'
          ? `await ${call}.ClickAsync();`
          : action.action === 'fill'
            ? `await ${call}.FillAsync(value);`
            : `await ${call}.PressAsync(${literal(action.key ?? 'Enter')});`;
      const verb = action.action === 'fill' ? 'Enter' : action.action === 'press' ? 'Press' : 'Click';
      return `    public async Task ${verb}${name}Async(${action.action === 'fill' ? 'string value' : ''})\n    {\n        ${stmt}\n    }`;
    })
    .join('\n\n');
  const source = `using System;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Playwright;

namespace GeneratedAutomation;

// Review namespace, DI registration, and whether the repository already provides a dictionary resolver.
public sealed class ${cls}
{
    private const string DictionaryPath = ${literal(dictionaryFile)};
    private readonly IPage Page;
    public ${cls}(IPage page) => Page = page;

    private ILocator Field(string section, string field) => DictionaryFieldResolver.Resolve(Page, DictionaryPath, section, field);

${body}
}

/// Tries a field's selectors in document order and returns the first one that matches the page.
public static class DictionaryFieldResolver
{
    private static string Normalize(string s) => new string(s.Where(c => !char.IsWhiteSpace(c) && c != '/' && c != '(' && c != ')').ToArray()).ToLowerInvariant();

    public static ILocator Resolve(IPage page, string dictionaryPath, string section, string field)
    {
        var doc = XDocument.Load(Path.Combine(AppContext.BaseDirectory, dictionaryPath));
        var node = doc.Descendants("Section").Where(s => Normalize((string?)s.Attribute("XRefCode") ?? "") == Normalize(section))
            .SelectMany(s => s.Elements("Field")).FirstOrDefault(f => Normalize((string?)f.Attribute("XRefCode") ?? "") == Normalize(field))
            ?? throw new InvalidOperationException($"Dictionary field {section}/{field} not found in {dictionaryPath}.");
        ILocator? fallback = null;
        foreach (var selector in node.Elements("Selector"))
        {
            var type = ((string?)selector.Attribute("Type") ?? "").ToLowerInvariant();
            var value = selector.Value.Trim();
            ILocator? locator = type switch
            {
                "testid" => page.GetByTestId(value),
                "text" => page.GetByText(value, new() { Exact = true }),
                "css" => page.Locator(value),
                "xpath" => page.Locator("xpath=" + value),
                _ when type.StartsWith("ariarole.") && Enum.TryParse<AriaRole>(type[9..], true, out var role) => page.GetByRole(role, new() { Name = value, Exact = true }),
                _ => null,
            };
            if (locator is null) continue;
            fallback ??= locator;
            if (locator.CountAsync().GetAwaiter().GetResult() > 0) return locator;
        }
        return fallback ?? throw new InvalidOperationException($"No supported selector for {section}/{field}.");
    }
}
`;
  return { source, notes, className: cls, resolvers };
}
