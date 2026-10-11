using NUnit.Framework;
using TechTalk.SpecFlow;

namespace Calculator;

[Binding]
public class CalculatorSteps
{
    private readonly Calculator calculator = new();
    private int result;

    [Given(@"the first number is (.*)")]
    public void GivenTheFirstNumberIs(int number)
    {
        calculator.First = number;
    }

    [Given(@"the second number is (.*)")]
    public void GivenTheSecondNumberIs(int number)
    {
        calculator.Second = number;
    }

    [When(@"the two numbers are added")]
    public void WhenTheTwoNumbersAreAdded()
    {
        result = calculator.Add();
    }

    [Then(@"the result should be (.*)")]
    public void ThenTheResultShouldBe(int expected)
    {
        Assert.That(result, Is.EqualTo(expected));
    }
}

public class Calculator
{
    public int First { get; set; }
    public int Second { get; set; }

    public int Add()
    {
        var sum = First + Second;
        return sum;
    }
}
