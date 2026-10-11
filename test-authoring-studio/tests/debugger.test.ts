import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { featureFilter, owningProject } from '../server/debugger';
import { DapClient } from '../server/dap';

let root: string;
beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'tas-debug-'));
  await fs.mkdir(path.join(root, 'Tests/Features/Auth'), { recursive: true });
  await fs.writeFile(path.join(root, 'Tests/Tests.csproj'), '<Project Sdk="Microsoft.NET.Sdk" />');
  await fs.writeFile(path.join(root, 'Tests/Features/Auth/Login.feature'), 'Feature: Sign in to the portal\n  Scenario: Valid "admin" login\n    Given x\n');
  await fs.writeFile(path.join(root, 'Tests/Features/Auth/Login.feature.cs'), [
    'namespace Demo.Tests.Features.Auth',
    '{',
    '    public partial class SignInToThePortalFeature',
    '    {',
    '        [NUnit.Framework.TestAttribute()]',
    '        [NUnit.Framework.DescriptionAttribute("Valid \\"admin\\" login")]',
    '        public virtual async System.Threading.Tasks.Task ValidAdminLogin()',
    '        { }',
    '    }',
    '}',
  ].join('\n'));
  await fs.writeFile(path.join(root, 'Tests/Features/Auth/NoCodeBehind.feature'), 'Feature: place an order\n');
});
afterAll(() => fs.rm(root, { recursive: true, force: true }));

describe('debugger targets', () => {
  it('finds the project that owns a feature', async () => {
    expect(await owningProject(root, 'Tests/Features/Auth/Login.feature')).toBe('Tests/Tests.csproj');
  });
  it('filters a feature by the generated class, and a scenario by its test method', async () => {
    expect(await featureFilter(root, 'Tests/Features/Auth/Login.feature')).toBe('FullyQualifiedName~Demo.Tests.Features.Auth.SignInToThePortalFeature');
    expect(await featureFilter(root, 'Tests/Features/Auth/Login.feature', 'Valid "admin" login')).toBe('FullyQualifiedName~Demo.Tests.Features.Auth.SignInToThePortalFeature.ValidAdminLogin');
  });
  it('falls back to the SpecFlow class naming when the code-behind has not been generated', async () => {
    expect(await featureFilter(root, 'Tests/Features/Auth/NoCodeBehind.feature')).toBe('FullyQualifiedName~PlaceAnOrderFeature');
  });
});

describe('DapClient', () => {
  it('frames requests and matches responses and events (split across chunks)', async () => {
    // A tiny adapter: answers each request, and emits an event first, writing frames byte-by-byte halves.
    const script = `
      let buf = Buffer.alloc(0);
      const out = (m) => { const j = JSON.stringify(m); const f = 'Content-Length: ' + Buffer.byteLength(j) + '\\r\\n\\r\\n' + j; const h = f.length >> 1; process.stdout.write(f.slice(0, h)); setTimeout(() => process.stdout.write(f.slice(h)), 5); };
      process.stdin.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        for (;;) {
          const i = buf.indexOf('\\r\\n\\r\\n'); if (i < 0) return;
          const n = +/Content-Length: (\\d+)/.exec(buf.slice(0, i).toString())[1];
          if (buf.length < i + 4 + n) return;
          const req = JSON.parse(buf.slice(i + 4, i + 4 + n).toString()); buf = buf.slice(i + 4 + n);
          if (req.command === 'fail') { out({ type: 'response', request_seq: req.seq, success: false, message: 'nope' }); continue; }
          out({ type: 'event', event: 'stopped', body: { reason: 'step', threadId: 7 } });
          setTimeout(() => out({ type: 'response', request_seq: req.seq, success: true, body: { echo: req.arguments } }), 20);
        }
      });`;
    const dap = new DapClient(process.execPath, ['-e', script]);
    const events: unknown[] = [];
    dap.on('event', (e, b) => events.push([e, b]));
    try {
      expect(await dap.request('next', { threadId: 7 })).toEqual({ echo: { threadId: 7 } });
      expect(events).toContainEqual(['stopped', { reason: 'step', threadId: 7 }]);
      await expect(dap.request('fail')).rejects.toThrow('nope');
    } finally {
      dap.kill();
    }
  });
});

describe('hit count conditions', async () => {
  const { hitMatches } = await import('../server/debugger');
  it('equal, at least, multiple of; empty or unknown always breaks', () => {
    expect([1, 2, 3].map((n) => hitMatches(n, '2'))).toEqual([false, true, false]);
    expect([1, 2, 3].map((n) => hitMatches(n, '= 2'))).toEqual([false, true, false]);
    expect([1, 2, 3].map((n) => hitMatches(n, '>= 2'))).toEqual([false, true, true]);
    expect([1, 2, 3, 4, 6].map((n) => hitMatches(n, '% 2'))).toEqual([false, true, false, true, true]);
    expect(hitMatches(7, '')).toBe(true);
    expect(hitMatches(7, 'when x')).toBe(true);
  });
});
