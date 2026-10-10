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
