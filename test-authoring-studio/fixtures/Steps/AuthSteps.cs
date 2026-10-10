using TechTalk.SpecFlow;
namespace Demo;
[Binding]
public class AuthSteps {
 [Given("the login page is open")] public void OpenLogin() { }
 [When(@"the user signs in as ""(.*)""")] public void SignIn(string userName) { }
 [Then("the dashboard is displayed")] public void Dashboard() { }
}
