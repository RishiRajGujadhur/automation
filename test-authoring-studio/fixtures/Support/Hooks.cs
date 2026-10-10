using System.Threading.Tasks;
using Microsoft.Playwright;
using TechTalk.SpecFlow;

namespace Fixtures.Support;

[Binding]
public sealed class Hooks
{
    private readonly ScenarioContext context;
    public Hooks(ScenarioContext context) => this.context = context;

    [BeforeScenario]
    public async Task StartBrowser()
    {
        var playwright = await Playwright.CreateAsync();
        IBrowser browser = await playwright.Chromium.LaunchAsync(new() { Headless = true });
        context.Set(await browser.NewPageAsync());
    }

    [AfterScenario]
    public async Task StopBrowser() => await context.Get<IPage>().Context.Browser!.CloseAsync();
}
