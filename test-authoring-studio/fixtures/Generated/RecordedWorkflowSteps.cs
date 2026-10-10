using System;
using System.Threading.Tasks;
using Microsoft.Playwright;
using TechTalk.SpecFlow;

namespace GeneratedAutomation;

// Review IPage registration and repository conventions before use.
[Binding]
public sealed class RecordedWorkflowSteps
{
    private readonly RecordedWorkflowPage page;
    public RecordedWorkflowSteps(IPage page) => this.page = new(page);

    [When("^the user opens first search result$")]
    public Task RecordedInteraction() => page.RecordedInteraction();
}

public sealed class RecordedWorkflowPage
{
    private IPage Page { get; }
    public RecordedWorkflowPage(IPage page) => Page = page;

    public async Task RecordedInteraction()
    {
        throw new NotImplementedException("Select a repository method or a verified locator before executing.");
    }
}
