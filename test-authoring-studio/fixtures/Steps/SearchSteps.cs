using TechTalk.SpecFlow;
using Microsoft.Playwright;
namespace Demo;
[Binding]
public class SearchSteps {
  private readonly SearchPage page = new();
  [Given(@"the browser is started")]
  public void BrowserStarted() { }
  [Given(@"the user opens Google")]
  public async Task OpenGoogle() { await page.Open(); }
  [When(@"the user searches for ""(.*)""")]
  [When(@"searches using ""(.*)""")]
  public async Task Search(string searchText) { await page.Search(searchText); }
  [Then(@"search results should appear")]
  public async Task Results() { await page.Results(); }
}
public class SearchPage {
  public IPage Page { get; set; } = null!;
  private ILocator SearchBox => Page.GetByRole(AriaRole.Combobox, new() { Name = "Search" });
  private ILocator Result => Page.GetByTestId("search-result");
  public async Task Open() { await Page.GotoAsync("https://www.google.com/"); }
  public async Task Search(string text) { await SearchBox.FillAsync(text); await SearchBox.PressAsync("Enter"); }
  public async Task Results() { await Result.WaitForAsync(); }
}
