/**
 * Step definitions for the steps the recorder drafts (`the user opens / enters … into … field / clicks / presses`).
 * One generic class makes every recorded scenario runnable: fields are looked up in the XML selector dictionaries
 * (copied to the build output), falling back to label / role / text; `<secret>` values come from environment
 * variables, never from the feature file. The page comes from ScenarioContext, as the repository's hooks register it.
 */
export function recordedStepsSource(opts: { namespace: string; reqnroll: boolean }) {
  const using = opts.reqnroll ? 'Reqnroll' : 'TechTalk.SpecFlow';
  return `using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using System.Xml.Linq;
using Microsoft.Playwright;
using ${using};

namespace ${opts.namespace};

/// <summary>
/// Steps written by TestAuthoring Studio's recorder. Elements are found through the XML selector dictionaries
/// (Page → Section → Field → Selector, by the field's XRefCode, case-insensitive); a value of "&lt;secret&gt;" is read
/// from the environment variable TEST_SECRET_&lt;FIELD&gt; (e.g. TEST_SECRET_PASSWORD).
/// </summary>
[Binding]
public sealed class RecordedSteps
{
    private readonly ScenarioContext context;
    public RecordedSteps(ScenarioContext context) => this.context = context;

    private IPage Page => context.TryGetValue(out IPage page) ? page
        : throw new InvalidOperationException("No IPage in the ScenarioContext: register one in a [BeforeScenario] hook (context.Set(page)).");

    [Given(@"the user opens ""(.*)""")]
    [When(@"the user opens ""(.*)""")]
    public async Task Open(string url) => await Page.GotoAsync(url);

    [Given(@"the user enters ""(.*)"" into the ""(.*)"" field")]
    [When(@"the user enters ""(.*)"" into the ""(.*)"" field")]
    public async Task Enter(string value, string field) => await Find(field, AriaRole.Textbox).FillAsync(Secret(value, field));

    [Given(@"the user clicks ""(.*)""")]
    [When(@"the user clicks ""(.*)""")]
    public async Task Click(string field) => await Find(field, AriaRole.Button).ClickAsync();

    [Given(@"the user presses ""(.*)""")]
    [When(@"the user presses ""(.*)""")]
    public async Task Press(string key) => await Page.Keyboard.PressAsync(key);

    private static string Secret(string value, string field)
    {
        if (value != "<secret>") return value;
        var name = "TEST_SECRET_" + new string(field.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        return Environment.GetEnvironmentVariable(name) ?? throw new InvalidOperationException($"Set the environment variable {name} for the {field} field.");
    }

    private ILocator Find(string field, AriaRole fallbackRole)
    {
        if (Dictionary.Value.TryGetValue(Key(field), out var selectors))
            foreach (var (type, value) in selectors)
                if (Locate(type, value) is { } locator) return locator;
        // Not in a dictionary: the accessible name the recorder captured.
        return Page.GetByLabel(field).Or(Page.GetByRole(fallbackRole, new() { Name = field })).Or(Page.GetByText(field, new() { Exact = true })).First;
    }

    private ILocator? Locate(string type, string value)
    {
        var t = type.ToLowerInvariant();
        if (t == "testid") return Page.GetByTestId(value);
        if (t == "text") return Page.GetByText(value, new() { Exact = true });
        if (t == "css") return Page.Locator(value);
        if (t == "xpath") return Page.Locator("xpath=" + value);
        if (t.StartsWith("ariarole.") && Enum.TryParse<AriaRole>(t["ariarole.".Length..], true, out var role)) return Page.GetByRole(role, new() { Name = value, Exact = true });
        return null;
    }

    private static string Key(string field) => new string(field.Where(char.IsLetterOrDigit).ToArray()).ToLowerInvariant();

    // XRefCode → selectors in file order, from every dictionary copied next to the test assembly.
    private static readonly Lazy<Dictionary<string, List<(string Type, string Value)>>> Dictionary = new(() =>
    {
        var map = new Dictionary<string, List<(string, string)>>();
        foreach (var file in Directory.EnumerateFiles(AppContext.BaseDirectory, "*.xml", SearchOption.AllDirectories))
        {
            XDocument doc;
            try { doc = XDocument.Load(file); } catch { continue; }
            if (doc.Root?.Name.LocalName != "Page") continue;
            foreach (var f in doc.Descendants().Where(e => e.Name.LocalName == "Field"))
            {
                var key = Key((string?)f.Attribute("XRefCode") ?? "");
                if (key.Length == 0 || map.ContainsKey(key)) continue;
                map[key] = f.Elements().Where(e => e.Name.LocalName == "Selector").Select(e => ((string?)e.Attribute("Type") ?? "", e.Value.Trim())).ToList();
            }
        }
        return map;
    });
}
`;
}
