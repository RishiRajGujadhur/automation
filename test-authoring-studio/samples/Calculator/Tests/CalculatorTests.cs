using NUnit.Framework;

namespace Calculator.Tests;

public class CalculatorTests
{
    [Test]
    public void AddsTwoNumbers()
    {
        var calculator = new Calculator { First = 2, Second = 3 };
        Assert.That(calculator.Add(), Is.EqualTo(5));
    }

    [TestCase(1, 1, 2)]
    [TestCase(-4, 4, 0)]
    public void AddsCases(int first, int second, int expected)
    {
        var calculator = new Calculator { First = first, Second = second };
        Assert.That(calculator.Add(), Is.EqualTo(expected));
    }
}
