import { describe, it, expect } from 'vitest';
import { parseTrx } from '../server/testRunner';

const trx = `<?xml version="1.0" encoding="utf-8"?>
<TestRun xmlns="http://microsoft.com/schemas/VisualStudio/TeamTest/2010">
  <Results>
    <UnitTestResult testId="a" testName="AddsTwoNumbers" outcome="Passed" duration="00:00:00.0123000" />
    <UnitTestResult testId="b" testName="AddsCases(1,1,3)" outcome="Failed" duration="00:00:01.5000000">
      <Output><ErrorInfo><Message>  Expected: 3
  But was:  2
</Message><StackTrace>   at Calculator.Tests.CalculatorTests.AddsCases(Int32 first) in C:\repo\Tests\CalculatorTests.cs:line 19
</StackTrace></ErrorInfo></Output>
    </UnitTestResult>
    <UnitTestResult testId="c" testName="AddTwoNumbers" outcome="NotExecuted" duration="00:00:00" />
  </Results>
  <TestDefinitions>
    <UnitTest name="AddsTwoNumbers" id="a"><TestMethod codeBase="x.dll" className="Calculator.Tests.CalculatorTests" name="AddsTwoNumbers" /></UnitTest>
    <UnitTest name="AddsCases(1,1,3)" id="b"><TestMethod codeBase="x.dll" className="Calculator.Tests.CalculatorTests, Calculator" name="AddsCases(1,1,3)" /></UnitTest>
    <UnitTest name="AddTwoNumbers" id="c"><TestMethod codeBase="x.dll" className="Calculator.Features.AddNumbersFeature" name="AddTwoNumbers" /></UnitTest>
  </TestDefinitions>
</TestRun>`;

describe('TRX results', () => {
  it('reads outcome, duration, class, method, message and stack trace', () => {
    const r = parseTrx(trx);
    expect(r.map((x) => [x.className, x.method, x.outcome, x.durationMs])).toEqual([
      ['Calculator.Tests.CalculatorTests', 'AddsTwoNumbers', 'passed', 12],
      ['Calculator.Tests.CalculatorTests', 'AddsCases(1,1,3)', 'failed', 1500],
      ['Calculator.Features.AddNumbersFeature', 'AddTwoNumbers', 'skipped', 0],
    ]);
    expect(r[1].message).toContain('But was:  2');
    expect(r[1].stackTrace).toContain('CalculatorTests.cs:line 19');
  });
});
