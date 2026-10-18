/**
 * New File from Template (Rider's Add ▸ New from Template): file kinds with their starter text. $NAME$ is the file
 * name without extension, $NAMESPACE$ the project's namespace plus the folder path.
 */
export type FileTemplate = { id: string; label: string; ext: string; body: string };
export const FILE_TEMPLATES: FileTemplate[] = [
  { id: 'class', label: 'C# Class', ext: 'cs', body: 'namespace $NAMESPACE$;\n\npublic class $NAME$\n{\n}\n' },
  { id: 'interface', label: 'C# Interface', ext: 'cs', body: 'namespace $NAMESPACE$;\n\npublic interface $NAME$\n{\n}\n' },
  { id: 'record', label: 'C# Record', ext: 'cs', body: 'namespace $NAMESPACE$;\n\npublic record $NAME$();\n' },
  { id: 'enum', label: 'C# Enum', ext: 'cs', body: 'namespace $NAMESPACE$;\n\npublic enum $NAME$\n{\n}\n' },
  { id: 'nunit', label: 'NUnit Test Fixture', ext: 'cs', body: 'using NUnit.Framework;\n\nnamespace $NAMESPACE$;\n\n[TestFixture]\npublic class $NAME$\n{\n    [Test]\n    public void Test1()\n    {\n        Assert.Pass();\n    }\n}\n' },
  { id: 'steps', label: 'Step Definitions (Reqnroll / SpecFlow)', ext: 'cs', body: 'using $BINDINGS$;\n\nnamespace $NAMESPACE$;\n\n[Binding]\npublic class $NAME$\n{\n    [Given(@"a precondition")]\n    public void GivenAPrecondition()\n    {\n    }\n}\n' },
  { id: 'page', label: 'Page Object (Playwright)', ext: 'cs', body: 'using Microsoft.Playwright;\n\nnamespace $NAMESPACE$;\n\npublic class $NAME$(IPage page)\n{\n    private readonly IPage page = page;\n\n    public Task OpenAsync(string url) => page.GotoAsync(url);\n}\n' },
  { id: 'feature', label: 'Feature File', ext: 'feature', body: 'Feature: $TITLE$\n\n  Scenario: First scenario\n    Given a precondition\n' },
  { id: 'http', label: 'HTTP Requests', ext: 'http', body: '@host = https://localhost:5001\n\n### Example\nGET {{host}}/\nAccept: application/json\n' },
  { id: 'md', label: 'Markdown', ext: 'md', body: '# $TITLE$\n\n' },
  { id: 'json', label: 'JSON', ext: 'json', body: '{\n}\n' },
];

/** File name → $TITLE$ ("CheckoutFlow" → "Checkout flow"). */
const title = (name: string) => name.replace(/[-_]+/g, ' ').replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ (\w)/g, (_m, c: string) => ` ${c.toLowerCase()}`);

export function renderTemplate(t: FileTemplate, file: string, namespace: string, reqnroll: boolean) {
  const name = (file.split('/').pop() ?? '').replace(/\.[^.]*$/, '');
  return t.body.replace(/\$NAME\$/g, name.replace(/[^\w]/g, '_')).replace(/\$TITLE\$/g, title(name)).replace(/\$NAMESPACE\$/g, namespace || 'Tests').replace(/\$BINDINGS\$/g, reqnroll ? 'Reqnroll' : 'TechTalk.SpecFlow');
}
